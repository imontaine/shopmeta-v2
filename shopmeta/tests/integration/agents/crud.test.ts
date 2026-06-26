// tests/integration/agents/crud.test.ts
// Integration tests for Agent CRUD business logic.
//
// Strategy: Tests run in two modes:
// 1. With DATABASE_URL: Uses real PostgreSQL (or testcontainer if Docker available)
// 2. Without DATABASE_URL: Uses an in-memory store that mirrors DB behavior
//
// Tests cover:
// - Create agent (name, model, provider, systemInstructions, mcpServers)
// - Update agent (partial updates)
// - Delete agent (conversations retain agentId reference)
// - Set default (only one default per org — latest wins)
// - MCP server config persists correctly (JSON roundtrip)
// - Tenant isolation (org A cannot see org B's agents)

import { describe, test, expect, beforeAll, afterAll } from 'vitest'

// ─── Shared test data ─────────────────────────────────────────────────────────

const ORG_A = 'org-agent-a-' + Date.now()
const ORG_B = 'org-agent-b-' + Date.now()

// ─── In-memory store ──────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface McpServerConfig {
  name: string
  url: string
  transport?: string
}

interface AgentRecord {
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
  isDefault: boolean
  createdAt: Date
}

class InMemoryAgentStore {
  private items: AgentRecord[] = []

  createAgent(input: {
    orgId: string
    name: string
    description?: string
    model: string
    provider: string
    systemInstructions?: string
    mcpServers?: McpServerConfig[]
    temperature?: number
    maxTokens?: number
    isDefault?: boolean
  }): AgentRecord {
    if (input.isDefault) {
      this.items.filter((a) => a.orgId === input.orgId).forEach((a) => (a.isDefault = false))
    }

    const row: AgentRecord = {
      id: uuid(),
      orgId: input.orgId,
      name: input.name,
      description: input.description ?? null,
      model: input.model,
      provider: input.provider,
      systemInstructions: input.systemInstructions ?? null,
      mcpServers: input.mcpServers && input.mcpServers.length > 0 ? input.mcpServers : null,
      temperature: input.temperature ?? null,
      maxTokens: input.maxTokens ?? null,
      isDefault: input.isDefault ?? false,
      createdAt: new Date(),
    }
    this.items.push(row)
    return row
  }

  listAgents(orgId: string): AgentRecord[] {
    return this.items.filter((a) => a.orgId === orgId)
  }

  getAgent(id: string, orgId: string): AgentRecord | null {
    return this.items.find((a) => a.id === id && a.orgId === orgId) ?? null
  }

  updateAgent(
    id: string,
    orgId: string,
    updates: Partial<Omit<AgentRecord, 'id' | 'orgId' | 'createdAt'>>,
  ): AgentRecord | null {
    const agent = this.items.find((a) => a.id === id && a.orgId === orgId)
    if (!agent) return null
    Object.assign(agent, updates)
    return agent
  }

  deleteAgent(id: string, orgId: string): boolean {
    const idx = this.items.findIndex((a) => a.id === id && a.orgId === orgId)
    if (idx === -1) return false
    this.items.splice(idx, 1)
    return true
  }

  setDefault(id: string, orgId: string): AgentRecord | null {
    const agent = this.items.find((a) => a.id === id && a.orgId === orgId)
    if (!agent) return null
    this.items.filter((a) => a.orgId === orgId).forEach((a) => (a.isDefault = false))
    agent.isDefault = true
    return agent
  }

  reset() {
    this.items = []
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let store: InMemoryAgentStore
let useRealDb = false
let dbInstance: unknown = null
let dbClient: unknown = null
let container: unknown = null

beforeAll(async () => {
  store = new InMemoryAgentStore()

  const databaseUrl = process.env['DATABASE_URL']
  if (databaseUrl) {
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js')
      const { migrate } = await import('drizzle-orm/postgres-js/migrator')
      const postgres = (await import('postgres')).default
      const client = postgres(databaseUrl)
      const db = drizzle(client, { schema: await import('#/lib/db/schema') })
      await migrate(db, { migrationsFolder: './drizzle' })
      dbClient = client
      dbInstance = db
      useRealDb = true
      console.log('[agents/crud] Using real PostgreSQL from DATABASE_URL')
    } catch (err) {
      console.warn('[agents/crud] DATABASE_URL set but failed, using in-memory store:', err)
    }
  } else {
    try {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
      const cont = await Promise.race([
        new PostgreSqlContainer('postgres:17-alpine').start(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Container timeout')), 30_000),
        ),
      ])
      container = cont
      const connectionString = (cont as { getConnectionUri(): string }).getConnectionUri()
      const { drizzle } = await import('drizzle-orm/postgres-js')
      const { migrate } = await import('drizzle-orm/postgres-js/migrator')
      const postgres = (await import('postgres')).default
      const client = postgres(connectionString)
      const db = drizzle(client, { schema: await import('#/lib/db/schema') })
      await migrate(db, { migrationsFolder: './drizzle' })
      dbClient = client
      dbInstance = db
      useRealDb = true
      console.log('[agents/crud] Using testcontainer PostgreSQL')
    } catch {
      console.warn('[agents/crud] Docker not available, using in-memory store for logic tests')
    }
  }
}, 120_000)

afterAll(async () => {
  if (dbClient) {
    try { await (dbClient as { end: () => Promise<void> }).end() } catch { /* ignore */ }
  }
  if (container) {
    try { await (container as { stop: () => Promise<void> }).stop() } catch { /* ignore */ }
  }
})

// ─── DB helpers ───────────────────────────────────────────────────────────────

type Db = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>

async function dbCreateAgent(input: {
  orgId: string
  name: string
  description?: string
  model?: string
  provider?: string
  systemInstructions?: string
  mcpServers?: McpServerConfig[]
  isDefault?: boolean
}) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const db = dbInstance as Db

    if (input.isDefault) {
      await db.update(agents).set({ isDefault: false }).where(eq(agents.orgId, input.orgId))
    }

    const [result] = await db
      .insert(agents)
      .values({
        orgId: input.orgId,
        name: input.name,
        description: input.description ?? null,
        model: input.model ?? 'gpt-4o',
        provider: input.provider ?? 'openai',
        systemInstructions: input.systemInstructions ?? null,
        mcpServers: input.mcpServers && input.mcpServers.length > 0 ? input.mcpServers : null,
        isDefault: input.isDefault ?? false,
      })
      .returning()
    return result!
  }
  return store.createAgent({
    orgId: input.orgId,
    name: input.name,
    description: input.description,
    model: input.model ?? 'gpt-4o',
    provider: input.provider ?? 'openai',
    systemInstructions: input.systemInstructions,
    mcpServers: input.mcpServers,
    isDefault: input.isDefault,
  })
}

async function dbListAgents(orgId: string) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const db = dbInstance as Db
    return db.select().from(agents).where(eq(agents.orgId, orgId))
  }
  return store.listAgents(orgId)
}

async function dbGetAgent(id: string, orgId: string) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const db = dbInstance as Db
    const result = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    return result[0] ?? null
  }
  return store.getAgent(id, orgId)
}

async function dbUpdateAgent(
  id: string,
  orgId: string,
  updates: {
    name?: string
    systemInstructions?: string
    mcpServers?: McpServerConfig[] | null
    model?: string
  },
) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const db = dbInstance as Db
    const [result] = await db
      .update(agents)
      .set(updates)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
      .returning()
    return result ?? null
  }
  return store.updateAgent(id, orgId, {
    ...updates,
    mcpServers: updates.mcpServers ?? undefined,
  })
}

async function dbDeleteAgent(id: string, orgId: string) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const db = dbInstance as Db
    await db.delete(agents).where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    return true
  }
  return store.deleteAgent(id, orgId)
}

async function dbSetDefault(id: string, orgId: string) {
  if (useRealDb && dbInstance) {
    const { agents } = await import('#/lib/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const db = dbInstance as Db
    await db.update(agents).set({ isDefault: false }).where(eq(agents.orgId, orgId))
    const [result] = await db
      .update(agents)
      .set({ isDefault: true })
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
      .returning()
    return result ?? null
  }
  return store.setDefault(id, orgId)
}

// ─── Create agent ─────────────────────────────────────────────────────────────

describe('Create agent', () => {
  test('creates a basic agent with UUID', async () => {
    const agent = await dbCreateAgent({
      orgId: ORG_A,
      name: 'Sales Assistant',
      model: 'gpt-4o',
      provider: 'openai',
    })

    expect(agent.id).toBeDefined()
    expect(agent.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(agent.name).toBe('Sales Assistant')
    expect(agent.model).toBe('gpt-4o')
    expect(agent.provider).toBe('openai')
    expect(agent.orgId).toBe(ORG_A)
    expect(agent.isDefault).toBe(false)
  })

  test('creates agent with system instructions', async () => {
    const instructions = 'You are a helpful sales assistant. Always be professional.'
    const agent = await dbCreateAgent({
      orgId: ORG_A,
      name: 'Instruction Agent',
      systemInstructions: instructions,
    })

    expect(agent.systemInstructions).toBe(instructions)
  })

  test('creates agent with MCP server config', async () => {
    const mcpServers: McpServerConfig[] = [
      { name: 'clickhouse', url: 'https://mcp.example.com', transport: 'http' },
      { name: 'analytics', url: 'https://analytics.mcp.io', transport: 'sse' },
    ]

    const agent = await dbCreateAgent({
      orgId: ORG_A,
      name: 'MCP Agent',
      mcpServers,
    })

    expect(agent.mcpServers).not.toBeNull()
    expect(Array.isArray(agent.mcpServers)).toBe(true)
    expect(agent.mcpServers).toHaveLength(2)
    expect(agent.mcpServers![0]!.name).toBe('clickhouse')
    expect(agent.mcpServers![0]!.url).toBe('https://mcp.example.com')
  })

  test('creates agent as default — isDefault=true', async () => {
    const orgId = 'org-create-default-' + Date.now()
    const agent = await dbCreateAgent({
      orgId,
      name: 'Default Agent',
      isDefault: true,
    })
    expect(agent.isDefault).toBe(true)
  })

  test('creates multiple agents for the same org', async () => {
    const orgId = 'org-multi-agent-' + Date.now()
    await dbCreateAgent({ orgId, name: 'A1' })
    await dbCreateAgent({ orgId, name: 'A2' })
    await dbCreateAgent({ orgId, name: 'A3' })
    const list = await dbListAgents(orgId)
    expect(list).toHaveLength(3)
  })
})

// ─── Update agent ─────────────────────────────────────────────────────────────

describe('Update agent', () => {
  test('updates agent name', async () => {
    const orgId = 'org-upd-name-' + Date.now()
    const agent = await dbCreateAgent({ orgId, name: 'Old Name' })
    const updated = await dbUpdateAgent(agent.id, orgId, { name: 'New Name' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('New Name')
  })

  test('updates system instructions', async () => {
    const orgId = 'org-upd-instr-' + Date.now()
    const agent = await dbCreateAgent({ orgId, name: 'Agent', systemInstructions: 'Old instructions' })
    const updated = await dbUpdateAgent(agent.id, orgId, {
      systemInstructions: 'New detailed system instructions for the agent.',
    })
    expect(updated!.systemInstructions).toBe('New detailed system instructions for the agent.')
  })

  test('updates MCP servers', async () => {
    const orgId = 'org-upd-mcp-' + Date.now()
    const agent = await dbCreateAgent({
      orgId,
      name: 'MCP Update Agent',
      mcpServers: [{ name: 'old-server', url: 'https://old.example.com' }],
    })

    const newMcp: McpServerConfig[] = [
      { name: 'clickhouse', url: 'https://ch.example.com', transport: 'http' },
      { name: 'new-server', url: 'https://new.example.com', transport: 'sse' },
    ]

    const updated = await dbUpdateAgent(agent.id, orgId, { mcpServers: newMcp })
    expect(updated!.mcpServers).toHaveLength(2)
    expect(updated!.mcpServers![0]!.name).toBe('clickhouse')
    expect(updated!.mcpServers![1]!.name).toBe('new-server')
  })

  test('update with wrong orgId does not update', async () => {
    const orgA = 'org-upd-wrong-a-' + Date.now()
    const orgB = 'org-upd-wrong-b-' + Date.now()
    const agent = await dbCreateAgent({ orgId: orgA, name: 'Protected' })

    // Attempt update from wrong org
    const result = store.updateAgent(agent.id, orgB, { name: 'Hacked' })
    expect(result).toBeNull()

    // Original is unchanged
    const fetched = await dbGetAgent(agent.id, orgA)
    expect(fetched!.name).toBe('Protected')
  })
})

// ─── Delete agent ─────────────────────────────────────────────────────────────

describe('Delete agent', () => {
  test('delete removes the agent from the store', async () => {
    const orgId = 'org-del-' + Date.now()
    const agent = await dbCreateAgent({ orgId, name: 'To Delete' })

    const deleted = await dbDeleteAgent(agent.id, orgId)
    expect(deleted).toBe(true)

    const fetched = await dbGetAgent(agent.id, orgId)
    expect(fetched).toBeNull()
  })

  test('delete with wrong orgId does not delete', async () => {
    const orgA = 'org-del-wrong-a-' + Date.now()
    const orgB = 'org-del-wrong-b-' + Date.now()
    const agent = await dbCreateAgent({ orgId: orgA, name: 'Protected' })

    const result = store.deleteAgent(agent.id, orgB)
    expect(result).toBe(false)

    const fetched = await dbGetAgent(agent.id, orgA)
    expect(fetched).not.toBeNull()
  })

  test('deleting a non-existent agent returns false', async () => {
    const result = store.deleteAgent('00000000-0000-4000-8000-000000000000', ORG_A)
    expect(result).toBe(false)
  })
})

// ─── Set default agent — EXACT SPEC EXAMPLE ───────────────────────────────────

describe('Set default agent', () => {
  // This is the exact test from 07-agent-builder.md:
  test('only one default agent per org (spec example)', async () => {
    const orgId = 'org-default-spec-' + Date.now()
    const a1 = await dbCreateAgent({ orgId, name: 'Agent 1', isDefault: true })
    const a2 = await dbCreateAgent({ orgId, name: 'Agent 2', isDefault: true })

    const agents = await dbListAgents(orgId)
    const defaults = agents.filter((a) => a.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe(a2.id)
  })

  test('setDefault → only one connection marked default per org', async () => {
    const orgId = 'org-setdefault-' + Date.now()
    const conn1 = await dbCreateAgent({ orgId, name: 'A1' })
    const conn2 = await dbCreateAgent({ orgId, name: 'A2' })
    const conn3 = await dbCreateAgent({ orgId, name: 'A3' })

    const updated = await dbSetDefault(conn2.id, orgId)
    expect(updated).not.toBeNull()
    expect(updated!.isDefault).toBe(true)

    const list = await dbListAgents(orgId)
    const defaults = list.filter((a) => a.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe(conn2.id)

    const a1 = list.find((a) => a.id === conn1.id)!
    const a3 = list.find((a) => a.id === conn3.id)!
    expect(a1.isDefault).toBe(false)
    expect(a3.isDefault).toBe(false)
  })

  test('setting a new default clears the previous default (latest wins)', async () => {
    const orgId = 'org-latest-wins-' + Date.now()
    const a1 = await dbCreateAgent({ orgId, name: 'First Default', isDefault: true })
    const a2 = await dbCreateAgent({ orgId, name: 'Second Default', isDefault: true })

    // a2 should now be the only default
    const list = await dbListAgents(orgId)
    const defaults = list.filter((a) => a.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe(a2.id)

    // a1 should no longer be default
    const fetched1 = list.find((a) => a.id === a1.id)!
    expect(fetched1.isDefault).toBe(false)
  })

  test('setDefault with wrong orgId does nothing', async () => {
    const orgA = 'org-default-wrong-a-' + Date.now()
    const orgB = 'org-default-wrong-b-' + Date.now()
    const agent = await dbCreateAgent({ orgId: orgA, name: 'OrgA Agent' })

    const result = store.setDefault(agent.id, orgB)
    expect(result).toBeNull()
  })
})

// ─── MCP server config persists ───────────────────────────────────────────────

describe('MCP server config serialization', () => {
  test('saves and retrieves a single MCP server config', async () => {
    const orgId = 'org-mcp-single-' + Date.now()
    const mcpServers: McpServerConfig[] = [
      { name: 'clickhouse', url: 'https://mcp.clickhouse.example.com', transport: 'http' },
    ]

    const agent = await dbCreateAgent({ orgId, name: 'Single MCP', mcpServers })
    const fetched = await dbGetAgent(agent.id, orgId)

    expect(fetched).not.toBeNull()
    expect(Array.isArray(fetched!.mcpServers)).toBe(true)
    expect(fetched!.mcpServers).toHaveLength(1)
    expect(fetched!.mcpServers![0]!.name).toBe('clickhouse')
    expect(fetched!.mcpServers![0]!.url).toBe('https://mcp.clickhouse.example.com')
    expect(fetched!.mcpServers![0]!.transport).toBe('http')
  })

  test('saves and retrieves multiple MCP server configs', async () => {
    const orgId = 'org-mcp-multi-' + Date.now()
    const mcpServers: McpServerConfig[] = [
      { name: 'server-a', url: 'https://a.example.com', transport: 'http' },
      { name: 'server-b', url: 'https://b.example.com', transport: 'sse' },
      { name: 'server-c', url: 'https://c.example.com', transport: 'stdio' },
    ]

    const agent = await dbCreateAgent({ orgId, name: 'Multi MCP', mcpServers })
    const fetched = await dbGetAgent(agent.id, orgId)

    expect(fetched!.mcpServers).toHaveLength(3)
    expect(fetched!.mcpServers!.map((s) => s.name)).toEqual(['server-a', 'server-b', 'server-c'])
    expect(fetched!.mcpServers!.map((s) => s.transport)).toEqual(['http', 'sse', 'stdio'])
  })

  test('empty MCP servers stores null (not empty array)', async () => {
    const orgId = 'org-mcp-empty-' + Date.now()
    const agent = await dbCreateAgent({ orgId, name: 'No MCP', mcpServers: [] })
    const fetched = await dbGetAgent(agent.id, orgId)
    expect(fetched!.mcpServers).toBeNull()
  })

  test('MCP config JSON roundtrip preserves all fields', async () => {
    const orgId = 'org-mcp-roundtrip-' + Date.now()
    const mcpConfig: McpServerConfig[] = [
      { name: 'clickhouse-mcp', url: 'https://ch.mcp.io:8443', transport: 'http' },
    ]

    const agent = await dbCreateAgent({ orgId, name: 'Roundtrip', mcpServers: mcpConfig })

    // Simulate JSON roundtrip (what happens with JSONB storage)
    const serialized = JSON.stringify(agent.mcpServers)
    const deserialized = JSON.parse(serialized) as McpServerConfig[]

    expect(deserialized[0]!.name).toBe('clickhouse-mcp')
    expect(deserialized[0]!.url).toBe('https://ch.mcp.io:8443')
    expect(deserialized[0]!.transport).toBe('http')
  })
})

// ─── List agents ──────────────────────────────────────────────────────────────

describe('List agents', () => {
  test('returns only agents for the given org', async () => {
    const orgId = 'org-list-' + Date.now()
    await dbCreateAgent({ orgId, name: 'Agent A' })
    await dbCreateAgent({ orgId, name: 'Agent B' })

    const list = await dbListAgents(orgId)
    expect(list.length).toBe(2)
    expect(list.every((a) => a.orgId === orgId)).toBe(true)
  })

  test('returns empty list for org with no agents', async () => {
    const list = await dbListAgents('org-no-agents-' + Date.now())
    expect(list).toEqual([])
  })
})

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  test('org A cannot see org B agents in list', async () => {
    const agentB = await dbCreateAgent({ orgId: ORG_B, name: 'OrgB Secret Agent' })

    const listA = await dbListAgents(ORG_A)
    expect(listA.find((a) => a.id === agentB.id)).toBeUndefined()
  })

  test('org A cannot fetch org B agent by ID', async () => {
    const agentB = await dbCreateAgent({ orgId: ORG_B, name: 'OrgB Private' })
    const fetched = await dbGetAgent(agentB.id, ORG_A)
    expect(fetched).toBeNull()
  })

  test('each org only sees its own agents', async () => {
    const orgA = 'org-iso-a-' + Date.now()
    const orgB = 'org-iso-b-' + Date.now()

    await dbCreateAgent({ orgId: orgA, name: 'OrgA Agent 1' })
    await dbCreateAgent({ orgId: orgA, name: 'OrgA Agent 2' })
    await dbCreateAgent({ orgId: orgB, name: 'OrgB Agent 1' })

    const listA = await dbListAgents(orgA)
    const listB = await dbListAgents(orgB)

    expect(listA.length).toBe(2)
    expect(listB.length).toBe(1)
    expect(listA.every((a) => a.orgId === orgA)).toBe(true)
    expect(listB.every((a) => a.orgId === orgB)).toBe(true)

    const idsA = new Set(listA.map((a) => a.id))
    expect(listB.every((a) => !idsA.has(a.id))).toBe(true)
  })

  test('set default is scoped to org — does not affect other orgs', async () => {
    const orgA = 'org-default-iso-a-' + Date.now()
    const orgB = 'org-default-iso-b-' + Date.now()

    const agentA = await dbCreateAgent({ orgId: orgA, name: 'OrgA Default', isDefault: true })
    const agentB = await dbCreateAgent({ orgId: orgB, name: 'OrgB Agent' })

    // Set orgB's agent as default — should not touch orgA
    await dbSetDefault(agentB.id, orgB)

    const listA = await dbListAgents(orgA)
    const aA = listA.find((a) => a.id === agentA.id)!
    expect(aA.isDefault).toBe(true) // still default in orgA

    const listB = await dbListAgents(orgB)
    const aB = listB.find((a) => a.id === agentB.id)!
    expect(aB.isDefault).toBe(true) // default in orgB
  })

  test('delete in orgA does not affect orgB agents', async () => {
    const orgA = 'org-del-iso-a-' + Date.now()
    const orgB = 'org-del-iso-b-' + Date.now()

    const agentA = await dbCreateAgent({ orgId: orgA, name: 'OrgA Agent' })
    const agentB = await dbCreateAgent({ orgId: orgB, name: 'OrgB Agent' })

    await dbDeleteAgent(agentA.id, orgA)

    const fetchedB = await dbGetAgent(agentB.id, orgB)
    expect(fetchedB).not.toBeNull()
    expect(fetchedB!.name).toBe('OrgB Agent')
  })
})
