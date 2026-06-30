// tests/unit/agents/mcp-catalog.test.ts
// Unit tests for the MCP Server Catalog feature in the agent builder.
// Tests validation logic, schema parsing, and server selection logic.
// Mirrors the patterns in form-validation.test.ts.
//
// WHY THE ERROR-HANDLING BUG WASN'T CAUGHT BY THESE TESTS
// ────────────────────────────────────────────────────────
// This file tests UI validation logic (form errors, server name format, etc.)
// but never calls the real listMcpServers server function or simulates what
// happens when the DB throws an error. The tests here copy schema logic inline
// rather than importing it, so schema changes (like serverName becoming optional)
// don't fail here even when the real code changes.
//
// The missing coverage: tests/unit/mcp/list-servers-error-handling.test.ts
// Added after the production bug was found. It simulates DB errors using the
// exact error format that postgres.js produces ("Failed query: SELECT ...").

import { describe, test, expect } from 'vitest'
import { z } from 'zod'

// ─── Mirror the server-name validation logic ──────────────────────────────────

const SERVER_NAME_REGEX = /^[a-z0-9_-]+$/

function validateServerName(serverName: string): string | null {
  if (!serverName.trim()) return 'Server name is required'
  if (!SERVER_NAME_REGEX.test(serverName)) {
    return 'Server name must be lowercase alphanumeric with dashes/underscores'
  }
  return null
}

function validateAddMcpForm(form: {
  name: string
  serverName: string
  url: string
}): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors['name'] = 'Name is required'
  if (!form.serverName.trim()) {
    errors['serverName'] = 'Server name is required'
  } else if (!SERVER_NAME_REGEX.test(form.serverName)) {
    errors['serverName'] = 'Server name must be lowercase alphanumeric with dashes/underscores'
  }
  if (!form.url.trim()) {
    errors['url'] = 'URL is required'
  } else {
    try {
      new URL(form.url)
    } catch {
      errors['url'] = 'URL must be valid'
    }
  }
  return errors
}

// ─── Mirror the mcp-servers.ts Zod schema ────────────────────────────────────
// NOTE: Keep this in sync with CreateMcpServerInput in src/lib/mcp-servers.ts
// If the real schema changes and these tests still pass, they are LYING.
// Prefer importing the real schema in future tests — see list-servers-error-handling.test.ts
// for the pattern of testing the handler logic directly.

const CreateMcpServerInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  // serverName is optional — server derives it from name via slugify if blank
  serverName: z
    .string()
    .max(100)
    .regex(/^[a-z0-9_-]*$/, 'Server name must be lowercase alphanumeric with dashes/underscores')
    .optional()
    .or(z.literal('')),
  url: z.string().url('Must be a valid URL'),
  transport: z.enum(['streamable-http', 'sse']).optional().default('streamable-http'),
  description: z.string().max(1000).optional(),
})

// ─── Server name validation tests ────────────────────────────────────────────

describe('MCP server name validation', () => {
  test('valid lowercase alphanumeric name → no error', () => {
    expect(validateServerName('clickhouse')).toBeNull()
  })

  test('valid name with dashes → no error', () => {
    expect(validateServerName('my-mcp-server')).toBeNull()
  })

  test('valid name with underscores → no error', () => {
    expect(validateServerName('mcp_server_1')).toBeNull()
  })

  test('empty string → error', () => {
    expect(validateServerName('')).toBe('Server name is required')
  })

  test('whitespace-only → error', () => {
    expect(validateServerName('  ')).toBe('Server name is required')
  })

  test('uppercase letters → invalid', () => {
    expect(validateServerName('ClickHouse')).toBeTruthy()
    expect(validateServerName('ClickHouse')).toContain('lowercase')
  })

  test('spaces → invalid', () => {
    expect(validateServerName('my server')).toBeTruthy()
  })

  test('special chars → invalid', () => {
    expect(validateServerName('server!@#')).toBeTruthy()
  })

  test('dots → invalid (dots not allowed)', () => {
    expect(validateServerName('my.server')).toBeTruthy()
  })
})

// ─── Add MCP form validation tests ───────────────────────────────────────────

describe('Add MCP Server form validation', () => {
  const validForm = {
    name: 'ClickHouse Prod',
    serverName: 'clickhouse',
    url: 'https://mcp.example.com',
  }

  test('valid form → no errors', () => {
    const errors = validateAddMcpForm(validForm)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  test('missing name → error', () => {
    const errors = validateAddMcpForm({ ...validForm, name: '' })
    expect(errors['name']).toBeDefined()
    expect(errors['serverName']).toBeUndefined()
    expect(errors['url']).toBeUndefined()
  })

  test('missing serverName → error', () => {
    const errors = validateAddMcpForm({ ...validForm, serverName: '' })
    expect(errors['serverName']).toBeDefined()
  })

  test('invalid serverName (uppercase) → error', () => {
    const errors = validateAddMcpForm({ ...validForm, serverName: 'ClickHouse' })
    expect(errors['serverName']).toBeDefined()
    expect(errors['serverName']).toContain('lowercase')
  })

  test('missing URL → error', () => {
    const errors = validateAddMcpForm({ ...validForm, url: '' })
    expect(errors['url']).toBeDefined()
  })

  test('invalid URL format → error', () => {
    const errors = validateAddMcpForm({ ...validForm, url: 'not-a-url' })
    expect(errors['url']).toBeDefined()
    expect(errors['url']).toContain('valid')
  })

  test('http URL → valid', () => {
    const errors = validateAddMcpForm({ ...validForm, url: 'http://localhost:8080' })
    expect(errors['url']).toBeUndefined()
  })

  test('multiple errors returned simultaneously', () => {
    const errors = validateAddMcpForm({ name: '', serverName: '', url: '' })
    expect(errors['name']).toBeDefined()
    expect(errors['serverName']).toBeDefined()
    expect(errors['url']).toBeDefined()
    expect(Object.keys(errors)).toHaveLength(3)
  })
})

// ─── Create MCP Server Zod schema tests ──────────────────────────────────────

describe('CreateMcpServer Zod schema', () => {
  test('minimal valid input passes', () => {
    const result = CreateMcpServerInputSchema.parse({
      name: 'ClickHouse Prod',
      serverName: 'clickhouse',
      url: 'https://mcp.example.com',
    })
    expect(result.name).toBe('ClickHouse Prod')
    expect(result.transport).toBe('streamable-http') // default
    expect(result.description).toBeUndefined()
  })

  test('all fields parse correctly', () => {
    const result = CreateMcpServerInputSchema.parse({
      name: 'Postgres Staging',
      serverName: 'postgres',
      url: 'https://pg-mcp.staging.io',
      transport: 'sse',
      description: 'Staging Postgres MCP',
    })
    expect(result.serverName).toBe('postgres')
    expect(result.transport).toBe('sse')
    expect(result.description).toBe('Staging Postgres MCP')
  })

  test('stdio transport is NOT valid (only streamable-http and sse are supported)', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: 'Local Dev',
        serverName: 'local',
        url: 'https://localhost:3001',
        transport: 'stdio',
      }),
    ).toThrow()
  })

  test('invalid transport → throws', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: 'Test',
        serverName: 'test',
        url: 'https://example.com',
        transport: 'websocket',
      }),
    ).toThrow()
  })

  test('invalid URL → throws', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: 'Test',
        serverName: 'test',
        url: 'not-a-url',
      }),
    ).toThrow()
  })

  test('empty name → throws', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: '',
        serverName: 'test',
        url: 'https://example.com',
      }),
    ).toThrow()
  })

  test('uppercase serverName → throws (regex fails)', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: 'Test',
        serverName: 'ClickHouse',
        url: 'https://example.com',
      }),
    ).toThrow()
  })

  test('serverName with spaces → throws', () => {
    expect(() =>
      CreateMcpServerInputSchema.parse({
        name: 'Test',
        serverName: 'my server',
        url: 'https://example.com',
      }),
    ).toThrow()
  })
})

// ─── Catalog toggle logic (mirrors AgentMcpSection.toggleServer) ──────────────

describe('MCP server catalog selection toggle', () => {
  function toggleServer(selected: string[], id: string): string[] {
    if (selected.includes(id)) {
      return selected.filter((sid) => sid !== id)
    }
    return [...selected, id]
  }

  test('selecting a server adds its ID', () => {
    const result = toggleServer([], 'server-1')
    expect(result).toContain('server-1')
    expect(result).toHaveLength(1)
  })

  test('selecting an already-selected server deselects it', () => {
    const result = toggleServer(['server-1', 'server-2'], 'server-1')
    expect(result).not.toContain('server-1')
    expect(result).toContain('server-2')
    expect(result).toHaveLength(1)
  })

  test('multiple servers can be selected simultaneously', () => {
    let selected: string[] = []
    selected = toggleServer(selected, 'server-a')
    selected = toggleServer(selected, 'server-b')
    selected = toggleServer(selected, 'server-c')
    expect(selected).toHaveLength(3)
    expect(selected).toContain('server-a')
    expect(selected).toContain('server-b')
    expect(selected).toContain('server-c')
  })

  test('deselecting all servers results in empty array', () => {
    let selected = ['server-1', 'server-2']
    selected = toggleServer(selected, 'server-1')
    selected = toggleServer(selected, 'server-2')
    expect(selected).toHaveLength(0)
  })

  test('toggling preserves order of remaining items', () => {
    const result = toggleServer(['a', 'b', 'c', 'd'], 'b')
    expect(result).toEqual(['a', 'c', 'd'])
  })
})

// ─── Deselect-on-delete logic ──────────────────────────────────────────────────

describe('Deselect catalog server when deleted', () => {
  function deselectOnDelete(selected: string[], deletedId: string): string[] {
    return selected.filter((sid) => sid !== deletedId)
  }

  test('deleting a selected server removes it from selection', () => {
    const result = deselectOnDelete(['a', 'b', 'c'], 'b')
    expect(result).toEqual(['a', 'c'])
  })

  test('deleting a non-selected server leaves selection unchanged', () => {
    const result = deselectOnDelete(['a', 'c'], 'b')
    expect(result).toEqual(['a', 'c'])
  })

  test('deleting from empty selection returns empty', () => {
    const result = deselectOnDelete([], 'any-id')
    expect(result).toHaveLength(0)
  })
})
