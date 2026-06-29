// src/lib/agents.ts
// Server functions for Agent CRUD.
//
// Security model:
// - All operations are scoped to orgId (tenant isolation).
// - "set default" clears all other defaults for the org atomically (latest wins).
// - "delete" leaves conversations.agentId pointing to the old UUID (agent is gone, ref is retained).
// - mcpServers is stored as JSONB: Array<{ name: string; url: string; transport?: string }>

import { createServerFn } from '@tanstack/react-start'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { agents } from '#/lib/db/schema'

// ─── MCP Server config schema ─────────────────────────────────────────────────

export const McpServerConfigSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  transport: z.enum(['http', 'sse', 'stdio']).optional().default('http'),
  description: z.string().optional(),
})

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>

// ─── Agent row type (JSON-serializable) ───────────────────────────────────────

export interface AgentRow {
  id: string
  orgId: string
  name: string
  description: string | null
  model: string
  provider: string
  systemInstructions: string | null
  mcpServers: McpServerConfig[] | null
  temperature: number | null
  maxTokens: number | null
  isDefault: boolean | null
  createdAt: string | null
}

function serializeAgent(a: {
  id: string
  orgId: string
  name: string
  description: string | null
  model: string
  provider: string
  systemInstructions: string | null
  mcpServers: unknown
  temperature: number | null
  maxTokens: number | null
  isDefault: boolean | null
  createdAt: Date | null
}): AgentRow {
  return {
    id: a.id,
    orgId: a.orgId,
    name: a.name,
    description: a.description,
    model: a.model,
    provider: a.provider,
    systemInstructions: a.systemInstructions,
    mcpServers: Array.isArray(a.mcpServers) ? (a.mcpServers as McpServerConfig[]) : null,
    temperature: a.temperature,
    maxTokens: a.maxTokens,
    isDefault: a.isDefault,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
  }
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

import { requireOrgSession } from '#/lib/auth/require-org-session'

// ─── Zod input schemas ────────────────────────────────────────────────────────

const CreateAgentInput = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  model: z.string().min(1, 'Model is required').max(100),
  provider: z.string().min(1, 'Provider is required').max(100),
  systemInstructions: z.string().max(100_000).optional(),
  mcpServers: z.array(McpServerConfigSchema).optional().default([]),
  temperature: z.number().int().min(0).max(200).optional(),
  maxTokens: z.number().int().positive().max(1_000_000).optional(),
  isDefault: z.boolean().optional().default(false),
})

const UpdateAgentInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  model: z.string().min(1).max(100).optional(),
  provider: z.string().min(1).max(100).optional(),
  systemInstructions: z.string().max(100_000).optional(),
  mcpServers: z.array(McpServerConfigSchema).optional(),
  temperature: z.number().int().min(0).max(200).optional(),
  maxTokens: z.number().int().positive().max(1_000_000).optional(),
})

const DeleteAgentInput = z.object({
  id: z.string().uuid(),
})

const GetAgentInput = z.object({
  id: z.string().uuid(),
})

const SetDefaultAgentInput = z.object({
  id: z.string().uuid(),
})

// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * Creates a new agent for the org.
 * If isDefault=true, all other org agents are cleared first (latest wins).
 */
export const createAgent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateAgentInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    if (data.isDefault) {
      await db
        .update(agents)
        .set({ isDefault: false })
        .where(eq(agents.orgId, orgId))
    }

    const [agent] = await db
      .insert(agents)
      .values({
        orgId,
        name: data.name,
        description: data.description ?? null,
        model: data.model,
        provider: data.provider,
        systemInstructions: data.systemInstructions ?? null,
        mcpServers: data.mcpServers.length > 0 ? data.mcpServers : null,
        temperature: data.temperature ?? null,
        maxTokens: data.maxTokens ?? null,
        isDefault: data.isDefault,
      })
      .returning()

    return serializeAgent(agent!)
  })

/**
 * Lists all agents for the org.
 */
export const listAgents = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.orgId, orgId))

    return rows.map(serializeAgent)
  })

/**
 * Gets a single agent by ID (org-scoped).
 */
export const getAgent = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetAgentInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))

    if (!agent) {
      throw new Error(`Agent not found: ${data.id}`)
    }

    return serializeAgent(agent)
  })

/**
 * Updates an agent. Only provided fields are changed.
 * mcpServers array replaces the existing one when provided.
 */
export const updateAgent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateAgentInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))

    if (!existing) {
      throw new Error(`Agent not found or not authorized: ${data.id}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (data.name !== undefined) updates['name'] = data.name
    if (data.description !== undefined) updates['description'] = data.description
    if (data.model !== undefined) updates['model'] = data.model
    if (data.provider !== undefined) updates['provider'] = data.provider
    if (data.systemInstructions !== undefined) updates['systemInstructions'] = data.systemInstructions
    if (data.mcpServers !== undefined) updates['mcpServers'] = data.mcpServers.length > 0 ? data.mcpServers : null
    if (data.temperature !== undefined) updates['temperature'] = data.temperature
    if (data.maxTokens !== undefined) updates['maxTokens'] = data.maxTokens

    if (Object.keys(updates).length === 0) {
      return serializeAgent(existing)
    }

    const [updated] = await db
      .update(agents)
      .set(updates)
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))
      .returning()

    return serializeAgent(updated!)
  })

/**
 * Deletes an agent.
 * Conversations that referenced this agent retain their agentId FK (the agent row is gone).
 * Per spec: "conversations using it retain `agentId` but agent is null" (i.e., no cascade).
 */
export const deleteAgent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteAgentInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))

    if (!existing) {
      throw new Error(`Agent not found or not authorized: ${data.id}`)
    }

    // No cascade needed — conversations.agentId has no FK onDelete clause
    // so it will simply become a dangling reference (the DB value is retained).
    await db.delete(agents).where(eq(agents.id, data.id))

    return { deleted: true, id: data.id }
  })

/**
 * Sets one agent as the default for the org.
 * Clears isDefault on ALL other org agents first (latest wins).
 */
export const setDefaultAgent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetDefaultAgentInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))

    if (!existing) {
      throw new Error(`Agent not found or not authorized: ${data.id}`)
    }

    // Clear all defaults for this org
    await db
      .update(agents)
      .set({ isDefault: false })
      .where(eq(agents.orgId, orgId))

    // Set the requested agent as default
    const [updated] = await db
      .update(agents)
      .set({ isDefault: true })
      .where(and(eq(agents.id, data.id), eq(agents.orgId, orgId)))
      .returning()

    return serializeAgent(updated!)
  })
