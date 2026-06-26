// tests/mocks/handlers/mcp.ts
// MSW handlers that simulate MCP (Model Context Protocol) server endpoints.
// These handlers intercept HTTP requests that createMCPClient would send,
// returning valid JSON-RPC MCP responses.
//
// MCP uses JSON-RPC 2.0 over HTTP (or SSE). The flow:
//   1. POST /mcp → { method: 'initialize' }         → capabilities response
//   2. POST /mcp → { method: 'tools/list' }          → tool list
//   3. POST /mcp → { method: 'tools/call', params }  → tool result

import { http, HttpResponse } from 'msw'

// ─── Mock Tool Definitions ─────────────────────────────────────────────────────

export const MOCK_CLICKHOUSE_TOOLS = [
  {
    name: 'run_select_query',
    description: 'Run a SELECT SQL query on ClickHouse and return results as JSON rows.',
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
    description: 'List all tables in the connected ClickHouse database.',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Database name (optional)' },
      },
    },
  },
  {
    name: 'describe_table',
    description: 'Describe the columns of a ClickHouse table.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
      },
      required: ['table'],
    },
  },
]

export const MOCK_POSTGRES_TOOLS = [
  {
    name: 'list_tables',
    description: 'List all tables in the PostgreSQL database.',
    inputSchema: {
      type: 'object',
      properties: {
        schema: { type: 'string', description: 'Schema name (default: public)' },
      },
    },
  },
  {
    name: 'run_query',
    description: 'Run a SQL query on PostgreSQL.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
]

// ─── Mock Query Results ────────────────────────────────────────────────────────

export const MOCK_SELECT_RESULT = {
  rows: [
    { num: 1, greeting: 'hello' },
  ],
  meta: [
    { name: 'num', type: 'UInt32' },
    { name: 'greeting', type: 'String' },
  ],
  statistics: {
    elapsed: 0.001,
    rows_read: 1,
    bytes_read: 16,
  },
}

export const MOCK_TABLES_RESULT = {
  rows: [
    { name: 'orders' },
    { name: 'products' },
    { name: 'customers' },
  ],
}

// ─── JSON-RPC 2.0 Helpers ─────────────────────────────────────────────────────

function jsonRpcResult(id: unknown, result: unknown) {
  return HttpResponse.json({ jsonrpc: '2.0', id, result })
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return HttpResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })
}

// ─── Clickhouse MCP Server Mock ────────────────────────────────────────────────

export function createClickHouseMCPHandlers(baseUrl = 'http://mcp.clickhouse.test') {
  return [
    http.post(`${baseUrl}/mcp`, async ({ request }) => {
      const body = await request.json() as { jsonrpc: string; method: string; id: unknown; params?: Record<string, unknown> }

      if (body.method === 'initialize') {
        return jsonRpcResult(body.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'clickhouse-mcp', version: '1.0.0' },
        })
      }

      if (body.method === 'notifications/initialized') {
        return new HttpResponse(null, { status: 200 })
      }

      if (body.method === 'tools/list') {
        return jsonRpcResult(body.id, { tools: MOCK_CLICKHOUSE_TOOLS })
      }

      if (body.method === 'tools/call') {
        const params = body.params as { name: string; arguments?: Record<string, unknown> }
        const toolName = params?.name
        const args = params?.arguments ?? {}

        if (toolName === 'run_select_query') {
          const query = (args as { query?: string }).query ?? ''

          // Simulate invalid SQL error
          if (query.includes('INVALID_SQL')) {
            return jsonRpcResult(body.id, {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Syntax error in SQL: INVALID_SQL', code: 'DB_PARSE_ERROR' }),
              }],
              isError: true,
            })
          }

          // Return mock rows for valid queries
          return jsonRpcResult(body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify(MOCK_SELECT_RESULT),
            }],
          })
        }

        if (toolName === 'list_tables') {
          return jsonRpcResult(body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify(MOCK_TABLES_RESULT),
            }],
          })
        }

        if (toolName === 'describe_table') {
          return jsonRpcResult(body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify({
                rows: [
                  { name: 'id', type: 'UInt64', default_kind: '' },
                  { name: 'created_at', type: 'DateTime', default_kind: '' },
                ],
              }),
            }],
          })
        }

        return jsonRpcError(body.id, -32601, `Unknown tool: ${toolName}`)
      }

      return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`)
    }),
  ]
}

// ─── Postgres MCP Server Mock ──────────────────────────────────────────────────

export function createPostgresMCPHandlers(baseUrl = 'http://mcp.postgres.test') {
  return [
    http.post(`${baseUrl}/mcp`, async ({ request }) => {
      const body = await request.json() as { jsonrpc: string; method: string; id: unknown; params?: Record<string, unknown> }

      if (body.method === 'initialize') {
        return jsonRpcResult(body.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'postgres-mcp', version: '1.0.0' },
        })
      }

      if (body.method === 'notifications/initialized') {
        return new HttpResponse(null, { status: 200 })
      }

      if (body.method === 'tools/list') {
        return jsonRpcResult(body.id, { tools: MOCK_POSTGRES_TOOLS })
      }

      if (body.method === 'tools/call') {
        const params = body.params as { name: string; arguments?: Record<string, unknown> }
        const toolName = params?.name

        if (toolName === 'list_tables') {
          return jsonRpcResult(body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify({ tables: ['users', 'orders', 'sessions'] }),
            }],
          })
        }

        if (toolName === 'run_query') {
          return jsonRpcResult(body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify({ rows: [], rowCount: 0 }),
            }],
          })
        }

        return jsonRpcError(body.id, -32601, `Unknown tool: ${toolName}`)
      }

      return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`)
    }),
  ]
}

// ─── Combined MCP Handlers ─────────────────────────────────────────────────────

export const mcpHandlers = [
  ...createClickHouseMCPHandlers(),
  ...createPostgresMCPHandlers(),
]
