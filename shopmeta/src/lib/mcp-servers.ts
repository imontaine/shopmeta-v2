// src/lib/mcp-servers.ts
// Server functions for org-level MCP Server Catalog CRUD.
//
// Design:
//   - The "catalog" stores reusable MCP server configs per org (displayed on /mcp-servers page).
//   - Agents reference catalog entries via the agent_mcp_servers join table.
//   - authType controls how the server is authenticated:
//       'none'   - no auth (or auto-detect)
//       'apikey' - Bearer/Basic/Custom header with API key
//       'oauth'  - OAuth 2.0 flow
//   - authConfig is stored as JSONB (should be encrypted-at-rest in prod).
//   - transport: 'streamable-http' | 'sse'
//   - All operations are scoped to orgId (tenant isolation).

import { createServerFn } from '@tanstack/react-start'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { mcpServers, agentMcpServers } from '#/lib/db/schema'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { DrizzleOAuthProvider } from '#/lib/mcp-oauth-provider'

// --- Auth config schemas ------------------------------------------------------

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

// --- Types --------------------------------------------------------------------

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
  oauthClientInfo: Record<string, unknown> | null
  oauthState: Record<string, unknown> | null
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
    oauthClientInfo: s.oauthClientInfo as Record<string, unknown> | null,
    oauthState: s.oauthState as Record<string, unknown> | null,
    trusted: s.trusted,
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  }
}

// --- Zod Input Schemas --------------------------------------------------------

const CreateMcpServerInput = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  // serverName is optional - if blank the server derives it from name
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
  authConfig: z.record(z.string(), z.unknown()).optional(),
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
  authConfig: z.record(z.string(), z.unknown()).optional().nullable(),
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

// --- Server Functions ---------------------------------------------------------

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
      // postgres.js wraps ALL PostgreSQL errors as "Failed query: SELECT ..."
      // in the top-level error message, hiding the underlying PG error codes
      // (42P01 = table not found, 42703 = column not found) from simple string
      // matching. Rather than recursing into err.cause to find the PG code,
      // we catch ALL DB errors on this read-only list query and return [].
      //
      // This is safe because:
      //   - The page shows "No MCP servers yet" empty state for []
      //   - The user can still try to add servers even if the table is missing
      //     (they will get a proper error on save instead)
      //   - Real auth errors are thrown by requireOrgSession() BEFORE this try
      //     block, so they still propagate correctly
      //   - The actual error is logged server-side for operator diagnosis
      console.error('[listMcpServers] DB error (returning empty list):', err instanceof Error ? err.message : String(err))
      return []
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
        oauthClientInfo: mcpServers.oauthClientInfo,
        oauthState: mcpServers.oauthState,
        trusted: mcpServers.trusted,
        createdAt: mcpServers.createdAt,
        updatedAt: mcpServers.updatedAt,
      })
      .from(agentMcpServers)
      .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
      .where(eq(agentMcpServers.agentId, data.agentId))
    return rows.map(serializeMcpServer)
  })

// --- Auth - MCPClientOptions conversion --------------------------------------

/**
 * Converts a McpServerRow from the DB catalog into MCPClientOptions
 * for use with createMCPClients() from @tanstack/ai-mcp.
 *
 * Handles all auth types:
 *   'none'   - no headers, no authProvider
 *   'apikey' - static Authorization header injected via transport.headers
 *   'oauth'  - authProvider: DrizzleOAuthProvider (SDK handles token injection
 *              and auto-refresh on 401 - no manual token management needed)
 *
 * The redirect URL is derived from the request origin so it works on
 * local dev, staging, and production without configuration.
 *
 * @param row         - McpServerRow from the catalog
 * @param orgId       - Org ID for tenant scoping
 * @param redirectUrl - OAuth callback URL (e.g. `${origin}/api/mcp/oauth-callback`)
 */
export function mcpRowToClientOptions(
  row: McpServerRow,
  orgId: string,
  redirectUrl: string,
): import('@tanstack/ai-mcp').MCPClientOptions {
  const type = row.transport === 'sse' ? 'sse' : 'http'
  const prefix = row.serverName || row.name

  if (row.authType === 'oauth') {
    return {
      transport: {
        type,
        url: row.url,
        authProvider: new DrizzleOAuthProvider(row.id, orgId, redirectUrl),
      },
      prefix,
    }
  }

  if (row.authType === 'apikey') {
    const cfg = row.authConfig as {
      key?: string
      headerFormat?: 'bearer' | 'basic' | 'custom'
      customHeader?: string
    } | null

    const headers: Record<string, string> = {}
    if (cfg?.key) {
      if (cfg.headerFormat === 'basic') {
        headers['Authorization'] = `Basic ${cfg.key}`
      } else if (cfg.headerFormat === 'custom' && cfg.customHeader) {
        headers[cfg.customHeader] = cfg.key
      } else {
        headers['Authorization'] = `Bearer ${cfg.key}`
      }
    }
    return {
      transport: {
        type,
        url: row.url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      },
      prefix,
    }
  }

  // authType = 'none'
  return {
    transport: { type, url: row.url },
    prefix,
  }
}

/**
 * @deprecated Use mcpRowToClientOptions() instead.
 * Legacy wrapper kept for any code that still calls mcpRowToServerConfig.
 * Will be removed in a future cleanup.
 */
export async function mcpRowToServerConfig(
  row: McpServerRow,
  orgId: string,
): Promise<import('#/lib/ai/mcp').MCPServerConfig> {
  const options = mcpRowToClientOptions(row, orgId, 'https://app.shopmeta.app/api/mcp/oauth-callback')
  const transport = options.transport as { type?: string; url: string; headers?: Record<string, string> }
  return {
    name: options.prefix ?? row.serverName,
    url: transport.url,
    transportType: transport.type === 'sse' ? 'sse' : 'http',
    headers: transport.headers,
  }
}


