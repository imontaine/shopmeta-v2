// tests/unit/mcp/multi-server.test.ts
// Unit tests for multi-server MCP tool prefixing and collision avoidance.
// These tests are pure / no network — they only test the mergeServerTools utility.

import { describe, it, expect } from 'vitest'
import { mergeServerTools, splitPrefixedToolName } from '#/lib/ai/mcp'

describe('mergeServerTools — multi-server prefixing', () => {
  it('applies server__toolName prefix to avoid name collisions', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [{ name: 'list_tables' }] },
      { server: 'postgres', tools: [{ name: 'list_tables' }] },
    ])

    const names = tools.map((t) => t.name)
    expect(names).toContain('clickhouse__list_tables')
    expect(names).toContain('postgres__list_tables')
  })

  it('preserves the original unprefixed tool name', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [{ name: 'run_select_query' }] },
    ])

    expect(tools[0]!.originalName).toBe('run_select_query')
  })

  it('sets the server name on each tool', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [{ name: 'list_tables' }, { name: 'describe_table' }] },
    ])

    for (const tool of tools) {
      expect(tool.server).toBe('clickhouse')
    }
  })

  it('handles multiple tools per server', () => {
    const tools = mergeServerTools([
      {
        server: 'clickhouse',
        tools: [
          { name: 'run_select_query' },
          { name: 'list_tables' },
          { name: 'describe_table' },
        ],
      },
    ])

    expect(tools).toHaveLength(3)
    expect(tools.map((t) => t.name)).toEqual([
      'clickhouse__run_select_query',
      'clickhouse__list_tables',
      'clickhouse__describe_table',
    ])
  })

  it('handles multiple servers each with unique tools', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [{ name: 'run_select_query' }] },
      { server: 'postgres', tools: [{ name: 'run_query' }] },
      { server: 'bigquery', tools: [{ name: 'run_job' }] },
    ])

    expect(tools).toHaveLength(3)
    expect(tools.map((t) => t.name)).toEqual([
      'clickhouse__run_select_query',
      'postgres__run_query',
      'bigquery__run_job',
    ])
  })

  it('preserves description and inputSchema', () => {
    const inputSchema = { type: 'object', properties: { query: { type: 'string' } } }
    const tools = mergeServerTools([
      {
        server: 'clickhouse',
        tools: [{ name: 'run_select_query', description: 'Run a query', inputSchema }],
      },
    ])

    expect(tools[0]!.description).toBe('Run a query')
    expect(tools[0]!.inputSchema).toEqual(inputSchema)
  })

  it('returns empty array for empty input', () => {
    expect(mergeServerTools([])).toEqual([])
  })

  it('handles server with no tools', () => {
    const tools = mergeServerTools([
      { server: 'clickhouse', tools: [] },
    ])
    expect(tools).toEqual([])
  })

  it('handles three servers all with list_tables — no duplicates by server', () => {
    const tools = mergeServerTools([
      { server: 'ch', tools: [{ name: 'list_tables' }] },
      { server: 'pg', tools: [{ name: 'list_tables' }] },
      { server: 'bq', tools: [{ name: 'list_tables' }] },
    ])

    const names = tools.map((t) => t.name)
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3) // All unique
    expect(names).toContain('ch__list_tables')
    expect(names).toContain('pg__list_tables')
    expect(names).toContain('bq__list_tables')
  })
})

describe('splitPrefixedToolName', () => {
  it('splits a prefixed tool name into server and toolName', () => {
    const result = splitPrefixedToolName('clickhouse__list_tables')
    expect(result).toEqual({ server: 'clickhouse', toolName: 'list_tables' })
  })

  it('handles double underscores in tool name (splits on first __)', () => {
    const result = splitPrefixedToolName('clickhouse__some__nested__name')
    expect(result).toEqual({ server: 'clickhouse', toolName: 'some__nested__name' })
  })

  it('returns null for unprefixed names', () => {
    expect(splitPrefixedToolName('list_tables')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(splitPrefixedToolName('')).toBeNull()
  })

  it('handles various server name formats', () => {
    expect(splitPrefixedToolName('my-server__run_query')).toEqual({
      server: 'my-server',
      toolName: 'run_query',
    })
  })
})
