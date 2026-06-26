// tests/integration/mcp/tool-execution.test.ts
// Integration tests for MCP tool execution.
// Uses InMemoryTransport to run a real MCP server in-process,
// then executes tools via the TanStack AI MCP client.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createMCPClientFromTransport } from '#/lib/ai/mcp'

// ─── Mock ClickHouse MCP Server ────────────────────────────────────────────────

function createClickHouseMCPServer() {
  const server = new Server(
    { name: 'clickhouse-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'run_select_query',
        description: 'Run a SELECT SQL query on ClickHouse',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The SQL SELECT query to run' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_tables',
        description: 'List all tables in the database',
        inputSchema: {
          type: 'object',
          properties: {
            database: { type: 'string' },
          },
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params

    if (name === 'run_select_query') {
      const query = (args as { query: string }).query

      // Simulate invalid SQL — return isError so the client throws
      if (!query || query.includes('INVALID')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Code: 62. Syntax error: INVALID SQL', code: 62 }),
          }],
          isError: true,
        }
      }

      // Simulate "SELECT 1 as num, 'hello' as greeting"
      if (query.includes('SELECT 1') || query.includes('select 1')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              rows: [{ num: 1, greeting: 'hello' }],
              meta: [
                { name: 'num', type: 'UInt32' },
                { name: 'greeting', type: 'String' },
              ],
              statistics: { elapsed: 0.001, rows_read: 1, bytes_read: 10 },
            }),
          }],
        }
      }

      // Generic response for other queries (LIMIT 0 → empty rows)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ rows: [], statistics: { elapsed: 0.002, rows_read: 0, bytes_read: 0 } }),
        }],
      }
    }

    if (name === 'list_tables') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ rows: [{ name: 'orders' }, { name: 'products' }, { name: 'customers' }] }),
        }],
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    }
  })

  return server
}

// ─── Helper: setupClientAndExecuteTool ────────────────────────────────────────
//
// KEY: @tanstack/ai-mcp's execute() returns the TEXT CONTENT from the MCP
// response as a string (not a parsed object). When isError=true, it THROWS.
// This helper wraps that behaviour.

async function setupClientAndExecuteTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ rows?: Array<Record<string, unknown>>; error?: string; [key: string]: unknown }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createClickHouseMCPServer()

  await server.connect(serverTransport)
  const client = await createMCPClientFromTransport(clientTransport)

  try {
    const tools = await client.tools()
    const tool = tools.find((t: { name: string }) => t.name === toolName) as
      | { name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }
      | undefined

    if (!tool) {
      throw new Error(`Tool '${toolName}' not found. Available: ${tools.map((t: { name: string }) => t.name).join(', ')}`)
    }

    // execute() returns a plain string (the text content from the MCP response).
    // Parse it as JSON to get structured data.
    const rawResult = await tool.execute(args) as string

    try {
      return JSON.parse(rawResult) as Record<string, unknown>
    } catch {
      // If not JSON, return as-is
      return { text: rawResult }
    }
  } finally {
    await client.close()
    await server.close()
    await serverTransport.close()
    await clientTransport.close()
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MCP tool execution', () => {
  it('run_select_query returns parsed rows', async () => {
    const result = await setupClientAndExecuteTool('run_select_query', {
      query: "SELECT 1 as num, 'hello' as greeting",
    })

    expect(result.rows).toBeDefined()
    expect(result.rows).toHaveLength(1)
    expect(result.rows![0]).toEqual({ num: 1, greeting: 'hello' })
  })

  it('run_select_query result has metadata', async () => {
    const result = await setupClientAndExecuteTool('run_select_query', {
      query: "SELECT 1 as num, 'hello' as greeting",
    })

    expect(result.meta).toBeDefined()
    expect(Array.isArray(result.meta)).toBe(true)
    expect(result.statistics).toBeDefined()
  })

  it('list_tables returns table names', async () => {
    const result = await setupClientAndExecuteTool('list_tables', {})

    expect(result.rows).toBeDefined()
    expect(Array.isArray(result.rows)).toBe(true)
    expect(result.rows!.length).toBeGreaterThan(0)

    const tableNames = result.rows!.map((r) => r['name'])
    expect(tableNames).toContain('orders')
  })

  it('tool call error is caught — MCP client throws on isError=true', async () => {
    // @tanstack/ai-mcp throws when isError=true, so we test that behaviour.
    await expect(
      setupClientAndExecuteTool('run_select_query', {
        query: 'INVALID SQL HERE',
      }),
    ).rejects.toThrow(/MCP tool.*returned an error/i)
  })

  it('unknown tool raises an error with descriptive message', async () => {
    await expect(
      setupClientAndExecuteTool('nonexistent_tool', {}),
    ).rejects.toThrow(/not found/i)
  })

  it('empty query returns empty rows', async () => {
    const result = await setupClientAndExecuteTool('run_select_query', {
      query: 'SELECT * FROM orders LIMIT 0',
    })

    expect(result.rows).toBeDefined()
    expect(result.rows).toHaveLength(0)
  })
})

// ─── Agent Loop Integration ───────────────────────────────────────────────────
//
// @tanstack/ai strategies are plain functions: (ctx) => boolean.
// They do NOT have a .shouldContinue method.
// ctx shape: { iterationCount: number, finishReason?: string, messages: [], usage: {} }

describe('Agent loop max iterations guard', () => {
  it('maxIterations strategy is a function', async () => {
    const { maxIterations } = await import('@tanstack/ai')
    const strategy = maxIterations(3)
    expect(typeof strategy).toBe('function')
  })

  it('maxIterations returns false after limit is exceeded', async () => {
    const { maxIterations } = await import('@tanstack/ai')
    const strategy = maxIterations(3)

    // Strategy returns false when iterationCount >= max
    expect(strategy({ iterationCount: 3, finishReason: 'tool_calls', messages: [], usage: { inputTokens: 0, outputTokens: 0 } })).toBe(false)
    expect(strategy({ iterationCount: 4, finishReason: 'tool_calls', messages: [], usage: { inputTokens: 0, outputTokens: 0 } })).toBe(false)
    expect(strategy({ iterationCount: 2, finishReason: 'tool_calls', messages: [], usage: { inputTokens: 0, outputTokens: 0 } })).toBe(true)
  })

  it('respects max iterations via combineStrategies', async () => {
    const { maxIterations, untilFinishReason, combineStrategies } = await import('@tanstack/ai')

    const limit = 3
    let iterationCount = 0

    const strategy = combineStrategies([
      maxIterations(limit),
      untilFinishReason(['stop']),
    ])

    // Simulate the strategy being called for each iteration
    // Strategy is called after each LLM response: returns true to continue
    const mockCtx = (count: number) => ({
      finishReason: 'tool_calls' as const,
      iterationCount: count,
      messages: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    let shouldContinue = true
    while (shouldContinue && iterationCount < 10) {
      iterationCount++
      shouldContinue = strategy(mockCtx(iterationCount))
    }

    // Should have stopped at or before limit
    expect(iterationCount).toBeLessThanOrEqual(limit + 1)
  })

  it('createMaxIterationsGuard creates a working strategy function', async () => {
    const { createMaxIterationsGuard } = await import('#/lib/ai/agent-loop')
    const strategy = createMaxIterationsGuard(5)

    // Strategy is a function (from @tanstack/ai)
    expect(strategy).toBeDefined()
    expect(typeof strategy).toBe('function')

    // Should return false after 5 iterations (iterationCount >= max)
    const result = strategy({
      iterationCount: 5,
      finishReason: 'tool_calls',
      messages: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    })

    // After 5 iterations with limit 5, should stop
    expect(result).toBe(false)
  })

  it('createProductionStrategy combines max iterations and finish reason', async () => {
    const { createProductionStrategy } = await import('#/lib/ai/agent-loop')
    const strategy = createProductionStrategy(3)

    expect(strategy).toBeDefined()
    expect(typeof strategy).toBe('function')

    // Should stop on 'stop' finish reason (even at iteration 1)
    const stopResult = strategy({
      iterationCount: 1,
      finishReason: 'stop',
      messages: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    expect(stopResult).toBe(false)

    // Should stop when max iterations exceeded (iterationCount >= 3)
    const maxIterResult = strategy({
      iterationCount: 3,
      finishReason: 'tool_calls',
      messages: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    expect(maxIterResult).toBe(false)

    // Should continue when under limit with tool_calls
    const continueResult = strategy({
      iterationCount: 2,
      finishReason: 'tool_calls',
      messages: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    expect(continueResult).toBe(true)
  })

  it('untilFinishReason stops loop on matching reason', async () => {
    const { untilFinishReason } = await import('@tanstack/ai')
    const strategy = untilFinishReason(['stop', 'length'])

    // Iteration 0 always continues (first call)
    expect(strategy({ iterationCount: 0, finishReason: 'stop', messages: [], usage: {} })).toBe(true)

    // After iteration 0, 'stop' should return false
    expect(strategy({ iterationCount: 1, finishReason: 'stop', messages: [], usage: {} })).toBe(false)
    expect(strategy({ iterationCount: 1, finishReason: 'length', messages: [], usage: {} })).toBe(false)
    expect(strategy({ iterationCount: 1, finishReason: 'tool_calls', messages: [], usage: {} })).toBe(true)
  })
})
