// src/lib/mcp-servers.ts
// Server functions for org-level MCP Server Catalog CRUD.
//
// Design:
//   - The "catalog" stores reusable MCP server configs per org (displayed on /mcp-servers page).
//   - Agents reference catalog entries via the agent_mcp_servers join table.
//   - authType controls how the server is authenticated:
//       'none'   → no auth (or auto-detect)
//       'apikey' → Bearer/Basic/Custom header with API key
//       'oauth'  → OAuth 2.0 flow
//   - authConfig is stored as JSONB (should be encrypted-at-rest in prod).
//   - transport: 'streamable-http' | 'sse'
//   - All operations are scoped to orgId (tenant isolation).

import { createServerFn } from '@tanstack/react-start'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { mcpServers, agentMcpServers } from '#/lib/db/schema'
import { requireOrgSession } from '#/lib/auth/require-org-session'

// ─── Auth config schemas ──────────────────────────────────────────────────────

export const ApiKeyAuthSchema = z.object({
  key: z.string().min(1, 'API Key is required'),
  headerFormat: z.enum(['bearer', 'basic', 'custom']).default('bearer'),
  customHeader: z.string().optional(), // Used when headerFormat = 'custom'
})

export const OAuthAuthSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().optional(),
  authUrl: z.string().url('Authorization URL must be valid').optional().or(z.literal('')),
  tokenUrl: z.string().url('Token URL must be valid').optional().or(z.literal('')),
  scope: z.string().optional(),
})

export type ApiKeyAuth = z.infer<typeof ApiKeyAuthSchema>
export type OAuthAuth = z.infer<typeof OAuthAuthSchema>

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpServerRow {
  id: string
  orgId: string
  name: string
  serverName: string
  url: string
  transport: string
  description: string | null
  iconUrl: string | null
  authType: string
  authConfig: Record<string, unknown> | null
  trusted: boolean
  createdAt: string | null
  updatedAt: string | null
}

function serializeMcpServer(s: typeof mcpServers.$inferSelect): McpServerRow {
  return {
    id: s.id,
    orgId: s.orgId,
    name: s.name,
    serverName: s.serverName,
    url: s.url,
    transport: s.transport,
    description: s.description,
    iconUrl: s.iconUrl ?? null,
    authType: s.authType,
    authConfig: s.authConfig as Record<string, unknown> | null,
    trusted: s.trusted,
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  }
}

// ─── Zod Input Schemas ────────────────────────────────────────────────────────

const CreateMcpServerInput = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  // serverName is optional — if blank the server derives it from name
  serverName: z
    .string()
    .max(100)
    .regex(/^[a-z0-9_-]*$/, 'Server name must be lowercase alphanumeric with dashes/underscores')
    .optional()
    .or(z.literal('')),
  url: z.string().url('Must be a valid URL'),
  transport: z.enum(['streamable-http', 'sse']).default('streamable-http'),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().optional().or(z.literal('')),
  authType: z.enum(['none', 'apikey', 'oauth']).default('none'),
  authConfig: z.record(z.unknown()).optional(),
  trusted: z.boolean().default(false),
})

const UpdateMcpServerInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  serverName: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/).optional(),
  url: z.string().url().optional(),
  transport: z.enum(['streamable-http', 'sse']).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().url().optional().or(z.literal('')),
  authType: z.enum(['none', 'apikey', 'oauth']).optional(),
  authConfig: z.record(z.unknown()).optional().nullable(),
  trusted: z.boolean().optional(),
})

const DeleteMcpServerInput = z.object({
  id: z.string().uuid(),
})

const SetAgentMcpServersInput = z.object({
  agentId: z.string().uuid(),
  mcpServerIds: z.array(z.string().uuid()),
})

const GetAgentMcpServerIdsInput = z.object({
  agentId: z.string().uuid(),
})

// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * Lists all MCP servers in the org catalog.
 * Note: authConfig is returned but API keys/secrets should be masked in the UI.
 */
export const listMcpServers = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = getDb()
    try {
      const rows = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.orgId, orgId))
        .orderBy(mcpServers.name)
      return rows.map(serializeMcpServer)
    } catch (err) {
      // Log the real error server-side so it's visible in production logs
      // without crashing the UI with an error banner.
      //
      // Common causes:
      //   PostgreSQL 42P01 — table "mcp_servers" does not exist (migration pending)
      //   PostgreSQL 42703 — column does not exist (0003 ran but 0004 partial)
      //   postgres.js wraps these as PostgresError with .code, but the code format
      //   may differ across drivers. We catch all DB errors here since there are
      //   legitimately 0 MCP servers on a fresh install.
      const code = (err as { code?: string; routine?: string }).code
      const msg = err instanceof Error ? err.message : String(err)
      const isSchemaError =
        code === '42P01' ||   // undefined_table
        code === '42703' ||   // undefined_column
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('column')
      if (isSchemaError) {
        console.error('[listMcpServers] Schema error (migration may be pending):', code, msg)
        return []
      }
      // For all other DB errors (connection failures, permissions, etc.), re-throw
      // so the server returns a proper 500 and we can investigate via logs.
      console.error('[listMcpServers] Unexpected DB error:', code, msg)
      throw err
    }
  })


/**
 * Creates a new MCP server entry in the org catalog.
 */
export const createMcpServer = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateMcpServerInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Derive serverName from name if not provided (slugify: lowercase, dashes for spaces)
    const derivedServerName = (data.serverName && data.serverName.trim())
      ? data.serverName.trim()
      : data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)

    const [created] = await db
      .insert(mcpServers)
      .values({
        orgId,
        name: data.name,
        serverName: derivedServerName,
        url: data.url,
        transport: data.transport,
        description: data.description || null,
        iconUrl: data.iconUrl || null,
        authType: data.authType,
        authConfig: data.authConfig ?? null,
        trusted: data.trusted,
      })
      .returning()
    return serializeMcpServer(created!)
  })

/**
 * Updates an existing MCP server entry.
 */
export const updateMcpServer = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateMcpServerInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [existing] = await db
      .select()
      .from(mcpServers)
      .where(and(eq(mcpServers.id, data.id), eq(mcpServers.orgId, orgId)))

    if (!existing) throw new Error(`MCP server not found: ${data.id}`)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (data.name !== undefined) updates['name'] = data.name
    if (data.serverName !== undefined) updates['serverName'] = data.serverName
    if (data.url !== undefined) updates['url'] = data.url
    if (data.transport !== undefined) updates['transport'] = data.transport
    if (data.description !== undefined) updates['description'] = data.description || null
    if (data.iconUrl !== undefined) updates['iconUrl'] = data.iconUrl || null
    if (data.authType !== undefined) updates['authType'] = data.authType
    if (data.authConfig !== undefined) updates['authConfig'] = data.authConfig
    if (data.trusted !== undefined) updates['trusted'] = data.trusted

    const [updated] = await db
      .update(mcpServers)
      .set(updates)
      .where(and(eq(mcpServers.id, data.id), eq(mcpServers.orgId, orgId)))
      .returning()
    return serializeMcpServer(updated!)
  })

/**
 * Deletes an MCP server from the catalog.
 * agent_mcp_servers rows cascade-delete via FK.
 */
export const deleteMcpServer = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteMcpServerInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [existing] = await db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(and(eq(mcpServers.id, data.id), eq(mcpServers.orgId, orgId)))

    if (!existing) throw new Error(`MCP server not found or not authorized: ${data.id}`)

    await db.delete(mcpServers).where(eq(mcpServers.id, data.id))
    return { deleted: true, id: data.id }
  })

/**
 * Replaces all catalog MCP server attachments for an agent (delete-all + insert).
 */
export const setAgentMcpServers = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetAgentMcpServersInput.parse(data))
  .handler(async ({ data }) => {
    await requireOrgSession()
    const db = getDb()

    await db.delete(agentMcpServers).where(eq(agentMcpServers.agentId, data.agentId))

    if (data.mcpServerIds.length > 0) {
      await db.insert(agentMcpServers).values(
        data.mcpServerIds.map((mcpServerId) => ({
          agentId: data.agentId,
          mcpServerId,
        })),
      )
    }

    return { agentId: data.agentId, mcpServerIds: data.mcpServerIds }
  })

/**
 * Gets IDs of catalog MCP servers currently attached to an agent.
 */
export const getAgentMcpServerIds = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetAgentMcpServerIdsInput.parse(data))
  .handler(async ({ data }) => {
    await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select({ mcpServerId: agentMcpServers.mcpServerId })
      .from(agentMcpServers)
      .where(eq(agentMcpServers.agentId, data.agentId))
    return rows.map((r) => r.mcpServerId)
  })

/**
 * Gets full McpServerRow entries attached to an agent (for AI runtime).
 */
export const getAgentMcpServers = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetAgentMcpServerIdsInput.parse(data))
  .handler(async ({ data }) => {
    await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select({
        id: mcpServers.id,
        orgId: mcpServers.orgId,
        name: mcpServers.name,
        serverName: mcpServers.serverName,
        url: mcpServers.url,
        transport: mcpServers.transport,
        description: mcpServers.description,
        iconUrl: mcpServers.iconUrl,
        authType: mcpServers.authType,
        authConfig: mcpServers.authConfig,
        trusted: mcpServers.trusted,
        createdAt: mcpServers.createdAt,
        updatedAt: mcpServers.updatedAt,
      })
      .from(agentMcpServers)
      .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
      .where(eq(agentMcpServers.agentId, data.agentId))
    return rows.map(serializeMcpServer)
  })
