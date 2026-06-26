// tests/unit/mcp/discovery.test.ts
// Unit tests for MCP tool discovery using InMemoryTransport.
// Creates a real MCP server in-process and verifies that createMCPClient
// can discover its tools via the @tanstack/ai-mcp client.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createMCPClientFromTransport, mergeServerTools } from '#/lib/ai/mcp'

// ─── Helper: Create a mock MCP server ─────────────────────────────────────────

function createMockMCPServer(
  toolDefs: Array<{ name: string; description?: string; inputSchema?: object }>,
) {
  const server = new Server(
    { name: 'test-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefs.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const toolName = req.params.name
    if (toolName === 'list_tables') {
      return {
        content: [{ type: 'text', text: JSON.stringify({ tables: ['orders', 'products'] }) }],
      }
    }
    if (toolName === 'run_select_query') {
      return {
        content: [{ type: 'text', text: JSON.stringify({ rows: [{ count: 42 }] }) }],
      }
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${toolName}` }) }],
      isError: true,
    }
  })

  return server
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MCP tool discovery', () => {
  let server: Server
  let serverTransport: InMemoryTransport
  let clientTransport: InMemoryTransport

  beforeEach(() => {
    ;[clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  })

  afterEach(async () => {
    await serverTransport.close()
    await clientTransport.close()
  })

  it('discoverTools() returns a tool list from a mock MCP server', async () => {
    server = createMockMCPServer([
      { name: 'list_tables', description: 'List all tables' },
      { name: 'run_select_query', description: 'Run a SELECT query' },
    ])

    // Connect server to its transport
    await server.connect(serverTransport)

    // Create a client connected to the other end
    const client = await createMCPClientFromTransport(clientTransport, 'clickhouse')

    const tools = await client.tools()

    expect(tools).toBeDefined()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThanOrEqual(2)

    const toolNames = tools.map((t: { name: string }) => t.name)
    // The client was created with prefix 'clickhouse', so names should be prefixed
    // Note: createMCPClientFromTransport takes prefix as second arg
    expect(toolNames.some((n: string) => n.includes('list_tables'))).toBe(true)
    expect(toolNames.some((n: string) => n.includes('run_select_query'))).toBe(true)

    await client.close()
    await server.close()
  })

  it('discovers zero tools from an empty MCP server', async () => {
    server = createMockMCPServer([])
    await server.connect(serverTransport)

    const client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()

    expect(tools).toHaveLength(0)

    await client.close()
    await server.close()
  })

  it('discovers tools from multiple servers using mergeServerTools()', () => {
    // Pure utility test — no network needed
    const merged = mergeServerTools([
      {
        server: 'clickhouse',
        tools: [
          { name: 'list_tables', description: 'List tables' },
          { name: 'run_select_query', description: 'Run query' },
        ],
      },
      {
        server: 'postgres',
        tools: [
          { name: 'list_tables', description: 'List tables' },
          { name: 'run_query', description: 'Run query' },
        ],
      },
    ])

    // clickhouse + postgres each have list_tables → 2 unique prefixed names
    expect(merged).toHaveLength(4)
    expect(merged.find((t) => t.name === 'clickhouse__list_tables')).toBeDefined()
    expect(merged.find((t) => t.name === 'postgres__list_tables')).toBeDefined()
    expect(merged.find((t) => t.name === 'clickhouse__run_select_query')).toBeDefined()
    expect(merged.find((t) => t.name === 'postgres__run_query')).toBeDefined()
  })

  it('each discovered tool has required properties', async () => {
    server = createMockMCPServer([
      {
        name: 'run_select_query',
        description: 'Run a SELECT query on ClickHouse',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ])
    await server.connect(serverTransport)

    const client = await createMCPClientFromTransport(clientTransport)
    const tools = await client.tools()

    expect(tools.length).toBeGreaterThan(0)
    const tool = tools[0] as { name: string; description?: string; execute: (...args: unknown[]) => unknown }
    expect(tool).toHaveProperty('name')
    expect(tool).toHaveProperty('execute')
    expect(typeof tool.execute).toBe('function')

    await client.close()
    await server.close()
  })
})
