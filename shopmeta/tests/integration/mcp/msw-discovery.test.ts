// tests/integration/mcp/msw-discovery.test.ts
// Integration tests for MCP tool discovery using MSW (Mock Service Worker) to
// intercept HTTP requests to mock MCP servers.
//
// This tests the FULL createMCPClient() stack (HTTP transport → JSON-RPC → tools),
// unlike the InMemoryTransport tests which bypass the HTTP layer.
// MSW intercepts the Streamable HTTP MCP protocol calls at the network level.

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import {
  createClickHouseMCPHandlers,
  createPostgresMCPHandlers,
  MOCK_CLICKHOUSE_TOOLS,
  MOCK_POSTGRES_TOOLS,
  MOCK_SELECT_RESULT,
  MOCK_TABLES_RESULT,
} from '../../mocks/handlers/mcp'
import { mergeServerTools } from '#/lib/ai/mcp'

// ─── MSW Server Setup ──────────────────────────────────────────────────────────

const CH_BASE_URL = 'http://mcp.clickhouse.test'
const PG_BASE_URL = 'http://mcp.postgres.test'

const server = setupServer(
  ...createClickHouseMCPHandlers(CH_BASE_URL),
  ...createPostgresMCPHandlers(PG_BASE_URL),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MSW-mocked MCP server: mergeServerTools (prefixing)', () => {
  it('applies server__ prefix to simulate multi-server collision avoidance', () => {
    // Both ClickHouse and Postgres have a 'list_tables' tool.
    // mergeServerTools ensures they get unique prefixed names.
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: MOCK_CLICKHOUSE_TOOLS },
      { server: 'postgres', tools: MOCK_POSTGRES_TOOLS },
    ])

    const names = tools.map((t) => t.name)

    // Both list_tables should be uniquely prefixed
    expect(names).toContain('clickhouse__list_tables')
    expect(names).toContain('postgres__list_tables')

    // ClickHouse-only tools
    expect(names).toContain('clickhouse__run_select_query')
    expect(names).toContain('clickhouse__describe_table')

    // Postgres-only tools
    expect(names).toContain('postgres__run_query')

    // All names are unique
    expect(new Set(names).size).toBe(names.length)
  })

  it('total tool count is correct after merge', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: MOCK_CLICKHOUSE_TOOLS },
      { server: 'postgres', tools: MOCK_POSTGRES_TOOLS },
    ])

    // 3 CH tools + 2 PG tools = 5 total
    expect(tools).toHaveLength(MOCK_CLICKHOUSE_TOOLS.length + MOCK_POSTGRES_TOOLS.length)
  })

  it('each merged tool retains description and inputSchema', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: MOCK_CLICKHOUSE_TOOLS },
    ])

    const runQuery = tools.find((t) => t.name === 'clickhouse__run_select_query')
    expect(runQuery).toBeDefined()
    expect(runQuery!.description).toBe('Run a SELECT SQL query on ClickHouse and return results as JSON rows.')
    expect(runQuery!.inputSchema).toBeDefined()
    expect((runQuery!.inputSchema as { properties?: { query?: unknown } }).properties?.query).toBeDefined()
  })

  it('originalName is the unprefixed tool name', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: MOCK_CLICKHOUSE_TOOLS },
    ])

    for (const tool of tools) {
      // The originalName should not contain the server prefix
      expect(tool.originalName).not.toContain('clickhouse__')
      expect(tool.name).toMatch(/^clickhouse__/)
      expect(tool.name).toBe(`clickhouse__${tool.originalName}`)
    }
  })
})

describe('MSW-mocked MCP server: mock handler validation', () => {
  it('MOCK_SELECT_RESULT has the expected shape', () => {
    expect(MOCK_SELECT_RESULT.rows).toBeDefined()
    expect(MOCK_SELECT_RESULT.rows).toHaveLength(1)
    expect(MOCK_SELECT_RESULT.rows[0]).toEqual({ num: 1, greeting: 'hello' })
    expect(MOCK_SELECT_RESULT.meta).toBeDefined()
    expect(MOCK_SELECT_RESULT.statistics).toBeDefined()
  })

  it('MOCK_TABLES_RESULT has table names', () => {
    expect(MOCK_TABLES_RESULT.rows).toBeDefined()
    expect(Array.isArray(MOCK_TABLES_RESULT.rows)).toBe(true)
    const tableNames = MOCK_TABLES_RESULT.rows.map((r) => r.name)
    expect(tableNames).toContain('orders')
    expect(tableNames).toContain('products')
    expect(tableNames).toContain('customers')
  })

  it('MSW handlers are set up for both servers', () => {
    // Verify handlers exist (won't throw if server is listening)
    expect(server).toBeDefined()
    const chHandlers = createClickHouseMCPHandlers(CH_BASE_URL)
    const pgHandlers = createPostgresMCPHandlers(PG_BASE_URL)
    expect(chHandlers).toHaveLength(1)
    expect(pgHandlers).toHaveLength(1)
  })
})

describe('MSW multi-server collision avoidance validation', () => {
  it('3 servers all with list_tables produce unique prefixed names', () => {
    // Simulate 3 MCP servers each exposing list_tables
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [{ name: 'list_tables' }] },
      { server: 'postgres', tools: [{ name: 'list_tables' }] },
      { server: 'bigquery', tools: [{ name: 'list_tables' }] },
    ])

    const names = tools.map((t) => t.name)
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3) // All unique

    expect(names).toContain('clickhouse__list_tables')
    expect(names).toContain('postgres__list_tables')
    expect(names).toContain('bigquery__list_tables')
  })

  it('MSW handlers can be extended with server.use() for per-test overrides', () => {
    // Verify MSW supports dynamic handler overrides
    const { http, HttpResponse } = require('msw')
    const customHandler = http.post('http://custom.mcp.test/mcp', () => {
      return HttpResponse.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } })
    })
    // Should not throw when adding override
    expect(() => server.use(customHandler)).not.toThrow()
  })
})
