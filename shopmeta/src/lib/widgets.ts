// src/lib/widgets.ts
// Server functions for Widget CRUD and ClickHouse query execution.
// Depends on: dashboards.ts (for org/dashboard scoping), connections.ts (for CH credentials).
//
// Security model:
//  - Widget ops are scoped to orgId (via dashboard ownership check).
//  - Query executor uses the widget's connectionId (or org default connection).
//  - ClickHouse passwords are decrypted server-side only, never sent to client.
//  - Bad SQL produces { success: false, error: string } — never crashes.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { widgets, dashboards, connections } from '#/lib/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WidgetType = 'chart' | 'table' | 'kpi'

export interface ChartConfig {
  chartType: 'line' | 'bar' | 'area' | 'pie'
  xAxis: string
  yAxis: string[]
  title?: string
}

export interface WidgetRow {
  id: string
  dashboardId: string
  name: string
  type: WidgetType
  sql: string
  chartConfig: ChartConfig | null
  refreshInterval: number | null
  connectionId: string | null
  cachedData: unknown | null
  lastRefreshed: string | null
  createdAt: string | null
}

export type QueryResult =
  | { success: true; rows: Array<Record<string, unknown>>; elapsed?: number }
  | { success: false; error: string }

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeWidget(w: {
  id: string
  dashboardId: string
  name: string
  type: string
  sql: string
  chartConfig: unknown
  refreshInterval: number | null
  connectionId: string | null
  cachedData: unknown
  lastRefreshed: Date | null
  createdAt: Date | null
}): WidgetRow {
  return {
    id: w.id,
    dashboardId: w.dashboardId,
    name: w.name,
    type: w.type as WidgetType,
    sql: w.sql,
    chartConfig: (w.chartConfig as ChartConfig | null) ?? null,
    refreshInterval: w.refreshInterval,
    connectionId: w.connectionId,
    cachedData: w.cachedData ?? null,
    lastRefreshed: w.lastRefreshed ? w.lastRefreshed.toISOString() : null,
    createdAt: w.createdAt ? w.createdAt.toISOString() : null,
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireSession() {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) throw new Error('Unauthorized: no active session')
  return session
}

async function requireOrgSession() {
  const session = await requireSession()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orgId = (session.session as any).activeOrganizationId as string | undefined | null

  if (!orgId) {
    try {
      const { member } = await import('#/lib/db/schema')
      const { db } = await import('#/lib/db/index')
      const rows = await db
        .select({ orgId: member.organizationId })
        .from(member)
        .where(eq(member.userId, session.user.id))
        .limit(1)
      orgId = rows[0]?.orgId ?? null
    } catch { /* DB unavailable */ }
  }
  if (!orgId) throw new Error('No active organization.')
  return { userId: session.user.id, orgId, user: session.user }
}

/** Verify the dashboard exists and belongs to the org, then return its id. */
async function requireDashboardOwnership(dashboardId: string, orgId: string) {
  const db = await getDb()
  const [d] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, dashboardId), eq(dashboards.orgId, orgId)))
    .limit(1)
  if (!d) throw new Error(`Dashboard not found or not authorized: ${dashboardId}`)
  return d.id
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const ChartConfigSchema = z.object({
  chartType: z.enum(['line', 'bar', 'area', 'pie']),
  xAxis: z.string(),
  yAxis: z.array(z.string()),
  title: z.string().optional(),
})

const CreateWidgetInput = z.object({
  dashboardId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.enum(['chart', 'table', 'kpi']),
  sql: z.string().min(1),
  chartConfig: ChartConfigSchema.optional(),
  refreshInterval: z.number().int().positive().optional(),
  connectionId: z.string().uuid().optional(),
})

const UpdateWidgetInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['chart', 'table', 'kpi']).optional(),
  sql: z.string().min(1).optional(),
  chartConfig: ChartConfigSchema.nullable().optional(),
  refreshInterval: z.number().int().positive().nullable().optional(),
  connectionId: z.string().uuid().nullable().optional(),
})

const DeleteWidgetInput = z.object({
  id: z.string().uuid(),
})

const GetWidgetInput = z.object({
  id: z.string().uuid(),
})

const ExecuteWidgetQueryInput = z.object({
  widgetId: z.string().uuid(),
})

const SaveToDashboardInput = z.object({
  dashboardId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.enum(['chart', 'table', 'kpi']),
  sql: z.string().min(1),
  chartConfig: ChartConfigSchema.optional(),
  connectionId: z.string().uuid().optional(),
  /** Rows from the tool result — used to seed cachedData */
  cachedRows: z.array(z.record(z.unknown())).optional(),
})

// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * Create a new widget on a dashboard.
 * Dashboard must belong to the current org (tenant isolation).
 */
export const createWidget = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateWidgetInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    await requireDashboardOwnership(data.dashboardId, orgId)
    const db = await getDb()

    const [created] = await db
      .insert(widgets)
      .values({
        dashboardId: data.dashboardId,
        name: data.name,
        type: data.type,
        sql: data.sql,
        chartConfig: data.chartConfig as typeof widgets.$inferInsert['chartConfig'] ?? null,
        refreshInterval: data.refreshInterval ?? null,
        connectionId: data.connectionId ?? null,
      })
      .returning()

    if (!created) throw new Error('Failed to create widget')
    return serializeWidget(created)
  })

/**
 * Update an existing widget.
 * Validates the widget belongs to the org via dashboard ownership.
 */
export const updateWidget = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateWidgetInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Verify widget exists and belongs to this org via dashboard
    const [existing] = await db
      .select({ id: widgets.id, dashboardId: widgets.dashboardId })
      .from(widgets)
      .innerJoin(dashboards, eq(widgets.dashboardId, dashboards.id))
      .where(and(eq(widgets.id, data.id), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!existing) throw new Error(`Widget not found or not authorized: ${data.id}`)

    const updateData: Partial<typeof widgets.$inferInsert> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.type !== undefined) updateData.type = data.type
    if (data.sql !== undefined) updateData.sql = data.sql
    if (data.chartConfig !== undefined) updateData.chartConfig = data.chartConfig as typeof widgets.$inferInsert['chartConfig']
    if (data.refreshInterval !== undefined) updateData.refreshInterval = data.refreshInterval ?? undefined
    if (data.connectionId !== undefined) updateData.connectionId = data.connectionId ?? undefined

    const [updated] = await db
      .update(widgets)
      .set(updateData)
      .where(eq(widgets.id, data.id))
      .returning()

    if (!updated) throw new Error('Failed to update widget')
    return serializeWidget(updated)
  })

/**
 * Delete a widget by ID.
 * Validates ownership via the dashboard's orgId.
 */
export const deleteWidget = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteWidgetInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Verify ownership
    const [existing] = await db
      .select({ id: widgets.id })
      .from(widgets)
      .innerJoin(dashboards, eq(widgets.dashboardId, dashboards.id))
      .where(and(eq(widgets.id, data.id), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!existing) throw new Error(`Widget not found or not authorized: ${data.id}`)

    await db.delete(widgets).where(eq(widgets.id, data.id))
    return { success: true, id: data.id }
  })

/**
 * Get a single widget by ID (org-scoped via dashboard).
 */
export const getWidget = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetWidgetInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const [row] = await db
      .select()
      .from(widgets)
      .innerJoin(dashboards, eq(widgets.dashboardId, dashboards.id))
      .where(and(eq(widgets.id, data.id), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error(`Widget not found: ${data.id}`)
    return serializeWidget(row.widgets)
  })

/**
 * Execute a widget's SQL query against its ClickHouse connection.
 * Falls back to the org's default connection if connectionId is null.
 * Returns { success: true, rows } or { success: false, error } — never crashes.
 */
export const executeWidgetQuery = createServerFn({ method: 'POST' })
  .validator((data: unknown) => ExecuteWidgetQueryInput.parse(data))
  .handler(async ({ data }): Promise<QueryResult> => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Load the widget (with org check via dashboard join)
    const [widgetRow] = await db
      .select()
      .from(widgets)
      .innerJoin(dashboards, eq(widgets.dashboardId, dashboards.id))
      .where(and(eq(widgets.id, data.widgetId), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!widgetRow) {
      return { success: false, error: 'Widget not found or not authorized' }
    }

    const widget = widgetRow.widgets
    const sql = widget.sql

    // Find the connection to use
    let connectionId = widget.connectionId
    if (!connectionId) {
      // Fall back to org default connection
      const [defaultConn] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(and(eq(connections.orgId, orgId), eq(connections.isDefault, true)))
        .limit(1)
      connectionId = defaultConn?.id ?? null
    }

    if (!connectionId) {
      return { success: false, error: 'No ClickHouse connection configured. Please add a connection in Settings.' }
    }

    // Load connection credentials
    const [conn] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.orgId, orgId)))
      .limit(1)

    if (!conn) {
      return { success: false, error: 'Connection not found' }
    }

    // Decrypt password
    let password: string
    try {
      const { decrypt, getEncryptionKey } = await import('#/lib/crypto')
      password = decrypt(conn.encryptedPassword, getEncryptionKey())
    } catch {
      return { success: false, error: 'Failed to decrypt connection credentials' }
    }

    // Execute query
    const start = Date.now()
    try {
      const { createClient } = await import('@clickhouse/client')
      const client = createClient({
        url: `https://${conn.host}:${conn.port ?? 8443}`,
        database: conn.database,
        username: conn.username,
        password,
        request_timeout: 30_000,
        compression: { response: false, request: false },
      })

      const result = await client.query({ query: sql, format: 'JSONEachRow' })
      const rows = await result.json<Array<Record<string, unknown>>>()
      await client.close()

      const elapsed = (Date.now() - start) / 1000

      // Update cached data
      await db
        .update(widgets)
        .set({ cachedData: rows as unknown as typeof widgets.$inferInsert['cachedData'], lastRefreshed: new Date() })
        .where(eq(widgets.id, data.widgetId))

      return { success: true, rows, elapsed }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const safe = message.replace(/\n[\s\S]*/m, '').slice(0, 500)
      return { success: false, error: safe }
    }
  })

/**
 * "Save to Dashboard" — creates a widget from a chat tool result.
 * This is the server function called by the SaveToDashboard UI component in the chat.
 * It creates the widget and seeds cachedData with the rows from the tool result.
 */
export const saveToDashboard = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SaveToDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    await requireDashboardOwnership(data.dashboardId, orgId)
    const db = await getDb()

    const [created] = await db
      .insert(widgets)
      .values({
        dashboardId: data.dashboardId,
        name: data.name,
        type: data.type,
        sql: data.sql,
        chartConfig: data.chartConfig as typeof widgets.$inferInsert['chartConfig'] ?? null,
        connectionId: data.connectionId ?? null,
        cachedData: (data.cachedRows ?? []) as unknown as typeof widgets.$inferInsert['cachedData'],
        lastRefreshed: data.cachedRows ? new Date() : null,
      })
      .returning()

    if (!created) throw new Error('Failed to create widget')
    return serializeWidget(created)
  })
