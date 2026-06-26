// src/lib/dashboards.ts
// Server functions for dashboard CRUD with tenant isolation.
// All functions enforce orgId scoping — users can only access their own org's dashboards.
// Widgets are cascade-deleted when their parent dashboard is deleted (DB constraint).

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { dashboards, widgets } from '#/lib/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

// react-grid-layout item format
export interface GridItem {
  /** Widget ID */
  i: string
  /** Column position (0-indexed) */
  x: number
  /** Row position (0-indexed) */
  y: number
  /** Width in grid columns */
  w: number
  /** Height in grid rows */
  h: number
  /** Minimum width */
  minW?: number
  /** Minimum height */
  minH?: number
  /** Whether the item is static (not draggable/resizable) */
  static?: boolean
}

export type DashboardLayout = GridItem[]

export interface DashboardRow {
  id: string
  orgId: string
  createdBy: string
  name: string
  description: string | null
  layout: DashboardLayout | null
  isDefault: boolean | null
  sharedWith: unknown | null
  createdAt: string | null
  updatedAt: string | null
}

export interface WidgetRow {
  id: string
  dashboardId: string
  name: string
  type: string
  sql: string
  chartConfig: unknown | null
  refreshInterval: number | null
  connectionId: string | null
  cachedData: unknown | null
  lastRefreshed: string | null
  createdAt: string | null
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeDashboard(d: {
  id: string
  orgId: string
  createdBy: string
  name: string
  description: string | null
  layout: unknown
  isDefault: boolean | null
  sharedWith: unknown
  createdAt: Date | null
  updatedAt: Date | null
}): DashboardRow {
  return {
    id: d.id,
    orgId: d.orgId,
    createdBy: d.createdBy,
    name: d.name,
    description: d.description,
    layout: (d.layout as DashboardLayout | null) ?? null,
    isDefault: d.isDefault,
    sharedWith: d.sharedWith,
    createdAt: d.createdAt ? d.createdAt.toISOString() : null,
    updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
  }
}

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
    type: w.type,
    sql: w.sql,
    chartConfig: w.chartConfig ?? null,
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
  if (!session?.user) {
    throw new Error('Unauthorized: no active session')
  }
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
    } catch {
      // DB unavailable
    }
  }

  if (!orgId) {
    throw new Error('No active organization. Please join or create an organization.')
  }

  return { userId: session.user.id, orgId, user: session.user }
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreateDashboardInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

const RenameDashboardInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
})

const DeleteDashboardInput = z.object({
  id: z.string().uuid(),
})

const GetDashboardInput = z.object({
  id: z.string().uuid(),
})

const GridItemSchema = z.object({
  i: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  minW: z.number().int().optional(),
  minH: z.number().int().optional(),
  static: z.boolean().optional(),
})

const UpdateLayoutInput = z.object({
  id: z.string().uuid(),
  layout: z.array(GridItemSchema),
})

const SetDefaultDashboardInput = z.object({
  id: z.string().uuid(),
})

// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * Create a new dashboard with an empty layout for the current org.
 */
export const createDashboard = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { userId, orgId } = await requireOrgSession()
    const db = await getDb()

    const [created] = await db
      .insert(dashboards)
      .values({
        orgId,
        createdBy: userId,
        name: data.name,
        description: data.description ?? null,
        layout: [], // empty layout on creation
        isDefault: false,
      })
      .returning()

    if (!created) throw new Error('Failed to create dashboard')
    return serializeDashboard(created)
  })

/**
 * List all dashboards for the current org (newest first).
 */
export const listDashboards = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const rows = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.orgId, orgId))
      .orderBy(desc(dashboards.createdAt))

    return rows.map(serializeDashboard)
  })

/**
 * Get a single dashboard by ID (must belong to the current org).
 */
export const getDashboard = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const [row] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error(`Dashboard not found: ${data.id}`)
    return serializeDashboard(row)
  })

/**
 * Rename a dashboard (must belong to the current org).
 */
export const renameDashboard = createServerFn({ method: 'POST' })
  .validator((data: unknown) => RenameDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const [updated] = await db
      .update(dashboards)
      .set({ name: data.name, updatedAt: new Date() })
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .returning()

    if (!updated) throw new Error(`Dashboard not found or not authorized: ${data.id}`)
    return serializeDashboard(updated)
  })

/**
 * Delete a dashboard (and cascade-delete all its widgets).
 * The cascade is enforced by the DB FK constraint: widgets.dashboard_id → dashboards.id ON DELETE CASCADE.
 */
export const deleteDashboard = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const [deleted] = await db
      .delete(dashboards)
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .returning({ id: dashboards.id })

    if (!deleted) throw new Error(`Dashboard not found or not authorized: ${data.id}`)
    return { success: true, id: deleted.id }
  })

/**
 * Set a dashboard as the org's default (clears any existing default first).
 * Enforces "only one default per org" invariant.
 */
export const setDefaultDashboard = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetDefaultDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Clear existing default for this org
    await db
      .update(dashboards)
      .set({ isDefault: false })
      .where(and(eq(dashboards.orgId, orgId), eq(dashboards.isDefault, true)))

    // Set the new default
    const [updated] = await db
      .update(dashboards)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .returning()

    if (!updated) throw new Error(`Dashboard not found or not authorized: ${data.id}`)
    return serializeDashboard(updated)
  })

/**
 * Persist the grid layout for a dashboard.
 * Layout format: react-grid-layout item array [{ i, x, y, w, h, ... }]
 */
export const updateDashboardLayout = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateLayoutInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const [updated] = await db
      .update(dashboards)
      .set({ layout: data.layout as unknown as typeof dashboards.$inferInsert['layout'], updatedAt: new Date() })
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .returning()

    if (!updated) throw new Error(`Dashboard not found or not authorized: ${data.id}`)
    return serializeDashboard(updated)
  })

/**
 * Get all widgets for a dashboard (must belong to the current org's dashboard).
 */
export const getDashboardWidgets = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetDashboardInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Verify dashboard belongs to org first
    const [dashboard] = await db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.id, data.id), eq(dashboards.orgId, orgId)))
      .limit(1)

    if (!dashboard) throw new Error(`Dashboard not found: ${data.id}`)

    const rows = await db
      .select()
      .from(widgets)
      .where(eq(widgets.dashboardId, data.id))

    return rows.map(serializeWidget)
  })
