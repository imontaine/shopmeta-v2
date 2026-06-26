// tests/unit/agents/form-validation.test.ts
// Component/unit tests for Agent form validation logic.
// Tests the validation rules without rendering the full component.
// Covers: empty name error, model required, valid data passes.

import { describe, test, expect } from 'vitest'

// ─── Mirror the validation logic from AgentBuilder.tsx ────────────────────────

interface AgentFormData {
  name: string
  description: string
  model: string
  provider: string
  systemInstructions: string
  mcpServers: unknown[]
  isDefault: boolean
}

interface ValidationErrors {
  name?: string
  model?: string
  provider?: string
}

function validate(form: AgentFormData): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.model.trim()) errors.model = 'Model is required'
  if (!form.provider.trim()) errors.provider = 'Provider is required'
  return errors
}

const validForm: AgentFormData = {
  name: 'Sales Assistant',
  description: '',
  model: 'gpt-4o',
  provider: 'openai',
  systemInstructions: '',
  mcpServers: [],
  isDefault: false,
}

// ─── MCP config schema (mirrors McpServerConfigSchema from agents.ts) ─────────

import { z } from 'zod'

const McpServerConfigSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  transport: z.enum(['http', 'sse', 'stdio']).optional().default('http'),
  description: z.string().optional(),
})

const McpServersSchema = z.array(McpServerConfigSchema)

// ─── Form validation tests ────────────────────────────────────────────────────

describe('Agent form validation', () => {
  describe('Name field', () => {
    test('empty name → error shown', () => {
      const errors = validate({ ...validForm, name: '' })
      expect(errors.name).toBe('Name is required')
    })

    test('whitespace-only name → error shown', () => {
      const errors = validate({ ...validForm, name: '   ' })
      expect(errors.name).toBe('Name is required')
    })

    test('valid name → no error', () => {
      const errors = validate({ ...validForm, name: 'My Agent' })
      expect(errors.name).toBeUndefined()
    })

    test('single character name → no error', () => {
      const errors = validate({ ...validForm, name: 'A' })
      expect(errors.name).toBeUndefined()
    })
  })

  describe('Model field', () => {
    test('empty model → error shown', () => {
      const errors = validate({ ...validForm, model: '' })
      expect(errors.model).toBe('Model is required')
    })

    test('model required — whitespace only fails', () => {
      const errors = validate({ ...validForm, model: '  ' })
      expect(errors.model).toBe('Model is required')
    })

    test('valid model → no error', () => {
      const errors = validate({ ...validForm, model: 'gpt-4o' })
      expect(errors.model).toBeUndefined()
    })

    test('claude model → no error', () => {
      const errors = validate({ ...validForm, model: 'claude-sonnet-4', provider: 'anthropic' })
      expect(errors.model).toBeUndefined()
    })
  })

  describe('Provider field', () => {
    test('empty provider → error', () => {
      const errors = validate({ ...validForm, provider: '' })
      expect(errors.provider).toBe('Provider is required')
    })

    test('valid provider → no error', () => {
      const errors = validate({ ...validForm, provider: 'openai' })
      expect(errors.provider).toBeUndefined()
    })
  })

  describe('Valid form', () => {
    test('all required fields present → no errors', () => {
      const errors = validate(validForm)
      expect(Object.keys(errors)).toHaveLength(0)
    })

    test('optional fields can be empty', () => {
      const errors = validate({
        name: 'Agent',
        description: '',
        model: 'gpt-4o',
        provider: 'openai',
        systemInstructions: '',
        mcpServers: [],
        isDefault: false,
      })
      expect(Object.keys(errors)).toHaveLength(0)
    })

    test('multiple errors when both name and model are empty', () => {
      const errors = validate({ ...validForm, name: '', model: '' })
      expect(errors.name).toBeDefined()
      expect(errors.model).toBeDefined()
    })
  })
})

// ─── MCP config schema validation tests ──────────────────────────────────────

describe('MCP server config schema', () => {
  test('valid single server config parses correctly', () => {
    const config = [{ name: 'clickhouse', url: 'https://mcp.example.com', transport: 'http' }]
    const result = McpServersSchema.parse(config)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('clickhouse')
    expect(result[0]!.transport).toBe('http')
  })

  test('default transport is "http" when not specified', () => {
    const config = [{ name: 'my-server', url: 'https://example.com' }]
    const result = McpServersSchema.parse(config)
    expect(result[0]!.transport).toBe('http')
  })

  test('all transport types are valid', () => {
    const configs = [
      { name: 'http-server', url: 'https://example.com', transport: 'http' as const },
      { name: 'sse-server', url: 'https://example.com', transport: 'sse' as const },
      { name: 'stdio-server', url: 'https://example.com', transport: 'stdio' as const },
    ]
    const result = McpServersSchema.parse(configs)
    expect(result.map((s) => s.transport)).toEqual(['http', 'sse', 'stdio'])
  })

  test('invalid URL throws validation error', () => {
    const config = [{ name: 'bad', url: 'not-a-url' }]
    expect(() => McpServersSchema.parse(config)).toThrow()
  })

  test('empty name throws validation error', () => {
    const config = [{ name: '', url: 'https://example.com' }]
    expect(() => McpServersSchema.parse(config)).toThrow()
  })

  test('invalid transport type throws', () => {
    const config = [{ name: 'server', url: 'https://example.com', transport: 'websocket' }]
    expect(() => McpServersSchema.parse(config)).toThrow()
  })

  test('empty array is valid', () => {
    const result = McpServersSchema.parse([])
    expect(result).toEqual([])
  })

  test('multiple servers parse correctly', () => {
    const config = [
      { name: 'server-a', url: 'https://a.example.com' },
      { name: 'server-b', url: 'https://b.example.com', transport: 'sse' as const },
    ]
    const result = McpServersSchema.parse(config)
    expect(result).toHaveLength(2)
    expect(result[0]!.name).toBe('server-a')
    expect(result[1]!.name).toBe('server-b')
    expect(result[1]!.transport).toBe('sse')
  })

  test('MCP config JSON roundtrip preserves data', () => {
    const original = [
      { name: 'clickhouse', url: 'https://ch.mcp.io:8443', transport: 'http' as const },
    ]
    const serialized = JSON.stringify(original)
    const deserialized = JSON.parse(serialized)
    const result = McpServersSchema.parse(deserialized)
    expect(result[0]!.name).toBe('clickhouse')
    expect(result[0]!.url).toBe('https://ch.mcp.io:8443')
    expect(result[0]!.transport).toBe('http')
  })
})

// ─── Agent server function Zod schemas ───────────────────────────────────────

const CreateAgentInputSchema = z.object({
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

describe('CreateAgent Zod schema', () => {
  test('valid minimal input passes', () => {
    const result = CreateAgentInputSchema.parse({
      name: 'My Agent',
      model: 'gpt-4o',
      provider: 'openai',
    })
    expect(result.name).toBe('My Agent')
    expect(result.isDefault).toBe(false)
    expect(result.mcpServers).toEqual([])
  })

  test('full input with all fields passes', () => {
    const result = CreateAgentInputSchema.parse({
      name: 'Full Agent',
      description: 'A comprehensive agent',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      systemInstructions: 'You are helpful.',
      mcpServers: [{ name: 'ch', url: 'https://ch.example.com' }],
      temperature: 70,
      maxTokens: 4096,
      isDefault: true,
    })
    expect(result.name).toBe('Full Agent')
    expect(result.isDefault).toBe(true)
    expect(result.mcpServers).toHaveLength(1)
  })

  test('empty name fails validation', () => {
    expect(() =>
      CreateAgentInputSchema.parse({ name: '', model: 'gpt-4o', provider: 'openai' }),
    ).toThrow()
  })

  test('temperature out of range (> 200) fails', () => {
    expect(() =>
      CreateAgentInputSchema.parse({ name: 'A', model: 'm', provider: 'p', temperature: 201 }),
    ).toThrow()
  })

  test('negative temperature fails', () => {
    expect(() =>
      CreateAgentInputSchema.parse({ name: 'A', model: 'm', provider: 'p', temperature: -1 }),
    ).toThrow()
  })
})
