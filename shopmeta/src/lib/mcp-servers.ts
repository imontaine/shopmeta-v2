// src/lib/mcp-servers.ts
// Server functions for org-level MCP Server Catalog CRUD.
//
// Design:
//   - The "catalog" stores reusable MCP server configs per org (like skills).
//   - Agents reference catalog entries via the agent_mcp_servers join table.
//   - When building an agent's McpServerConfig[], we merge:
//       1. Catalog-selected servers  (fetched from this table)
//       2. Legacy inline mcpServers JSON on the agent row (backwards compat)
//   - All operations are scoped to orgId (tenant isolation).
//   - The server_name field is the MCP tool-prefix identifier (e.g. "clickhouse").
//   - The name field is the human-readable label (e.g. "ClickHouse Prod").

import { createServerFn } from '@tanstack/react-start'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { mcpServers, agentMcpServers } from '#/lib/db/schema'
import { requireOrgSession } from '#/lib/auth/require-org-session'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpServerRow {
  id: string
  orgId: string
  name: string
  serverName: string
  url: string
  transport: string
  description: string | null
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
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  }
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateMcpServerInput = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  serverName: z
    .string()
    .min(1, 'Server name is required')
    .max(100)
    .regex(/^[a-z0-9_-]+$/, 'Server name must be lowercase alphanumeric with dashes/underscores'),
  url: z.string().url('Must be a valid URL'),
  transport: z.enum(['http', 'sse', 'stdio']).optional().default('http'),
  description: z.string().max(1000).optional(),
})

const UpdateMcpServerInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  serverName: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  url: z.string().url().optional(),
  transport: z.enum(['http', 'sse', 'stdio']).optional(),
  description: z.string().max(1000).optional(),
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
 */
export const listMcpServers = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.orgId, orgId))
      .orderBy(mcpServers.name)
    return rows.map(serializeMcpServer)
  })

/**
 * Creates a new MCP server entry in the org catalog.
 */
export const createMcpServer = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateMcpServerInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [created] = await db
      .insert(mcpServers)
      .values({
        orgId,
        name: data.name,
        serverName: data.serverName,
        url: data.url,
        transport: data.transport,
        description: data.description || null,
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

    const updates: Record<string, unknown> = {}
    if (data.name !== undefined) updates['name'] = data.name
    if (data.serverName !== undefined) updates['serverName'] = data.serverName
    if (data.url !== undefined) updates['url'] = data.url
    if (data.transport !== undefined) updates['transport'] = data.transport
    if (data.description !== undefined) updates['description'] = data.description || null
    if (Object.keys(updates).length === 0) return serializeMcpServer(existing)

    updates['updatedAt'] = new Date()
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
 * Mirrors setAgentSkills from skills.ts.
 */
export const setAgentMcpServers = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetAgentMcpServersInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId: _orgId } = await requireOrgSession()
    const db = getDb()

    // Delete existing
    await db
      .delete(agentMcpServers)
      .where(eq(agentMcpServers.agentId, data.agentId))

    // Insert new
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
 * Gets full McpServerRow entries attached to an agent.
 * Used when building the runtime McpServerConfig[] for the AI loop.
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
        createdAt: mcpServers.createdAt,
        updatedAt: mcpServers.updatedAt,
      })
      .from(agentMcpServers)
      .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
      .where(eq(agentMcpServers.agentId, data.agentId))
    return rows.map(serializeMcpServer)
  })
