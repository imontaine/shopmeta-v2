// tests/unit/chat/providers.test.ts
// Unit tests for the AI provider configuration.
// Tests that getAdapter returns the correct adapter and throws for unknown models.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the actual TanStack AI packages to avoid network calls and API key requirements
vi.mock('@tanstack/ai-openai', () => ({
  openaiText: vi.fn((model: string, config?: Record<string, unknown>) => ({
    __type: 'openai-text-adapter',
    model,
    config,
  })),
}))

vi.mock('@tanstack/ai-anthropic', () => ({
  anthropicText: vi.fn((model: string) => ({
    __type: 'anthropic-text-adapter',
    model,
  })),
}))

// Import after mocking
const { getAdapter, providers, modelList, DEFAULT_MODEL, DEFAULT_PROVIDER } = await import('#/lib/ai/providers')

describe('AI Provider Configuration', () => {
  describe('providers object', () => {
    test('has openai provider with expected models', () => {
      expect(providers).toHaveProperty('openai')
      expect(providers.openai).toHaveProperty('gpt-4o')
      expect(providers.openai).toHaveProperty('gpt-4o-mini')
      expect(providers.openai).toHaveProperty('o3')
    })

    test('has anthropic provider with expected models', () => {
      expect(providers).toHaveProperty('anthropic')
      expect(providers.anthropic).toHaveProperty('claude-sonnet-4')
      expect(providers.anthropic).toHaveProperty('claude-haiku-4-5')
    })

    test('has google provider with expected models', () => {
      expect(providers).toHaveProperty('google')
      expect(providers.google).toHaveProperty('gemini-2.5-pro')
      expect(providers.google).toHaveProperty('gemini-2.5-flash')
    })

    test('each model entry is a factory function', () => {
      for (const [_provider, models] of Object.entries(providers)) {
        for (const factory of Object.values(models)) {
          expect(typeof factory).toBe('function')
        }
      }
    })
  })

  describe('getAdapter()', () => {
    test('returns openai adapter for gpt-4o', () => {
      const adapter = getAdapter('openai', 'gpt-4o')
      expect(adapter).toBeTruthy()
      expect((adapter as Record<string, unknown>).__type).toBe('openai-text-adapter')
      expect((adapter as Record<string, unknown>).model).toBe('gpt-4o')
    })

    test('returns openai adapter for gpt-4o-mini', () => {
      const adapter = getAdapter('openai', 'gpt-4o-mini')
      expect((adapter as Record<string, unknown>).model).toBe('gpt-4o-mini')
    })

    test('returns anthropic adapter for claude-sonnet-4', () => {
      const adapter = getAdapter('anthropic', 'claude-sonnet-4')
      expect(adapter).toBeTruthy()
      expect((adapter as Record<string, unknown>).__type).toBe('anthropic-text-adapter')
    })

    test('returns google adapter for gemini-2.5-pro', () => {
      const adapter = getAdapter('google', 'gemini-2.5-pro')
      expect(adapter).toBeTruthy()
    })

    test('throws for unknown provider', () => {
      expect(() => getAdapter('fake-provider', 'gpt-4o')).toThrow(
        'Unknown AI provider: "fake-provider"',
      )
    })

    test('throws for unknown model within valid provider', () => {
      expect(() => getAdapter('openai', 'fake-model')).toThrow(
        'Unknown model: "fake-model" for provider "openai"',
      )
    })

    test('throws for unknown provider with openai model name', () => {
      expect(() => getAdapter('openai', 'claude-sonnet-4')).toThrow(
        'Unknown model: "claude-sonnet-4"',
      )
    })

    test('error message lists valid models', () => {
      try {
        getAdapter('openai', 'gpt-5')
      } catch (err) {
        expect(String(err)).toContain('gpt-4o')
        expect(String(err)).toContain('gpt-4o-mini')
      }
    })

    test('error message lists valid providers', () => {
      try {
        getAdapter('mistral', 'mistral-large')
      } catch (err) {
        expect(String(err)).toContain('openai')
        expect(String(err)).toContain('anthropic')
        expect(String(err)).toContain('google')
      }
    })
  })

  describe('modelList', () => {
    test('contains entries for all providers', () => {
      const providerNames = [...new Set(modelList.map((m) => m.provider))]
      expect(providerNames).toContain('openai')
      expect(providerNames).toContain('anthropic')
      expect(providerNames).toContain('google')
    })

    test('each entry has required fields', () => {
      for (const entry of modelList) {
        expect(entry).toHaveProperty('provider')
        expect(entry).toHaveProperty('model')
        expect(entry).toHaveProperty('label')
      }
    })

    test('gpt-4o label is human-readable', () => {
      const gpt4o = modelList.find((m) => m.model === 'gpt-4o')
      expect(gpt4o?.label).toBe('GPT-4o')
    })
  })

  describe('defaults', () => {
    test('DEFAULT_PROVIDER is openai', () => {
      expect(DEFAULT_PROVIDER).toBe('openai')
    })

    test('DEFAULT_MODEL is gpt-4o', () => {
      expect(DEFAULT_MODEL).toBe('gpt-4o')
    })
  })
})
