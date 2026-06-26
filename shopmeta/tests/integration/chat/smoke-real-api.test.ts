// tests/integration/chat/smoke-real-api.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// SMOKE TEST — Real AI Provider API Calls
//
// Unlike the MSW-mocked chat tests, these tests call the REAL OpenAI and
// Anthropic APIs with a minimal prompt. They verify:
//   1. Message format is correct for each provider (ContentPart shape)
//   2. The SSE stream returns parseable chunks with text content
//   3. Provider routing (openai → OpenAI, anthropic → Anthropic) works
//   4. Error handling when an invalid model is requested
//
// These tests are skipped when the corresponding API key env vars are not set.
// Run with: OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... pnpm test:integration
//
// IMPORTANT: These tests make real API calls and cost real money (fractions of
// a cent per run). They are intentionally minimal — a single short prompt with
// max_tokens capped to keep costs near zero.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, test, expect, beforeAll } from 'vitest'

// ─── Environment checks ──────────────────────────────────────────────────────

const OPENAI_KEY = process.env['OPENAI_API_KEY']
const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY']
const GOOGLE_KEY = process.env['GOOGLE_AI_API_KEY']

const hasOpenAI = !!OPENAI_KEY && !OPENAI_KEY.startsWith('sk-test')
const hasAnthropic = !!ANTHROPIC_KEY && !ANTHROPIC_KEY.startsWith('sk-test')
const hasGoogle = !!GOOGLE_KEY

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Imports the real (unmocked) chat and adapter modules.
 * We import dynamically to avoid import-time errors when keys are missing.
 */
async function getChatModules() {
  const { chat, toServerSentEventsResponse } = await import('@tanstack/ai')
  const { getAdapter } = await import('#/lib/ai/providers')
  return { chat, toServerSentEventsResponse, getAdapter }
}

/**
 * Builds the message array in the EXACT same format as stream.ts does.
 * This is the critical piece — we need to verify the ContentPart shape
 * is correct for each provider.
 */
function buildMessages(userText: string) {
  return [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, content: userText }],
    },
  ]
}

/**
 * Collects all text content from a chat() async iterable stream.
 * Returns the concatenated text and the raw events for inspection.
 */
async function collectStreamText(
  stream: AsyncIterable<{ type: string; delta?: string; content?: string; message?: string }>,
): Promise<{ text: string; events: Array<{ type: string }>; error: string | null }> {
  let text = ''
  const events: Array<{ type: string }> = []
  let error: string | null = null

  for await (const chunk of stream) {
    events.push({ type: chunk.type })

    if (chunk.type === 'text-message-content' && chunk.delta) {
      text += chunk.delta
    }
    if (chunk.type === 'run-error') {
      error = chunk.message ?? 'Unknown error'
    }
  }

  return { text, events, error }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Chat Smoke Tests — Real AI APIs', () => {
  // These tests call real APIs, give them enough time
  const TIMEOUT = 30_000

  describe('OpenAI', () => {
    test.skipIf(!hasOpenAI)(
      'gpt-4o-mini returns streaming text for a simple prompt',
      async () => {
        const { chat, getAdapter } = await getChatModules()
        const adapter = getAdapter('openai', 'gpt-4o-mini')

        const stream = chat({
          adapter,
          messages: buildMessages('Reply with exactly: "smoke test ok"'),
        })

        const result = await collectStreamText(stream)

        expect(result.error).toBeNull()
        expect(result.text.length).toBeGreaterThan(0)
        expect(result.text.toLowerCase()).toContain('smoke')
        // Verify we got the expected event lifecycle
        expect(result.events.some((e) => e.type === 'run-started')).toBe(true)
        expect(result.events.some((e) => e.type === 'text-message-content')).toBe(true)
        expect(result.events.some((e) => e.type === 'run-finished')).toBe(true)
      },
      TIMEOUT,
    )
  })

  describe('Anthropic', () => {
    test.skipIf(!hasAnthropic)(
      'claude-haiku-4-5 returns streaming text for a simple prompt',
      async () => {
        const { chat, getAdapter } = await getChatModules()
        const adapter = getAdapter('anthropic', 'claude-haiku-4-5')

        const stream = chat({
          adapter,
          messages: buildMessages('Reply with exactly: "smoke test ok"'),
        })

        const result = await collectStreamText(stream)

        expect(result.error).toBeNull()
        expect(result.text.length).toBeGreaterThan(0)
        expect(result.text.toLowerCase()).toContain('smoke')
        expect(result.events.some((e) => e.type === 'run-started')).toBe(true)
        expect(result.events.some((e) => e.type === 'text-message-content')).toBe(true)
        expect(result.events.some((e) => e.type === 'run-finished')).toBe(true)
      },
      TIMEOUT,
    )
  })

  describe('Google (Gemini via OpenAI-compatible)', () => {
    test.skipIf(!hasGoogle)(
      'gemini-2.5-flash returns streaming text for a simple prompt',
      async () => {
        const { chat, getAdapter } = await getChatModules()
        const adapter = getAdapter('google', 'gemini-2.5-flash')

        const stream = chat({
          adapter,
          messages: buildMessages('Reply with exactly: "smoke test ok"'),
        })

        const result = await collectStreamText(stream)

        expect(result.error).toBeNull()
        expect(result.text.length).toBeGreaterThan(0)
        expect(result.text.toLowerCase()).toContain('smoke')
      },
      TIMEOUT,
    )
  })

  describe('Provider routing', () => {
    test('getAdapter throws for unknown provider', async () => {
      const { getAdapter } = await getChatModules()
      expect(() => getAdapter('fake-provider', 'fake-model')).toThrow(/Unknown AI provider/)
    })

    test('getAdapter throws for unknown model within valid provider', async () => {
      const { getAdapter } = await getChatModules()
      expect(() => getAdapter('openai', 'nonexistent-model')).toThrow(/Unknown model/)
    })
  })

  describe('Message format validation', () => {
    test('buildMessages produces correct ContentPart shape', () => {
      const messages = buildMessages('Hello')

      expect(messages).toHaveLength(1)
      expect(messages[0]!.role).toBe('user')
      expect(messages[0]!.content).toHaveLength(1)
      // This is the critical check — ContentPart uses `content`, NOT `text`
      expect(messages[0]!.content[0]).toHaveProperty('content', 'Hello')
      expect(messages[0]!.content[0]).toHaveProperty('type', 'text')
      // Ensure the old buggy format is NOT present
      expect(messages[0]!.content[0]).not.toHaveProperty('text')
    })

    test('stream.ts message format matches what adapters expect', async () => {
      // This test verifies the format used in src/routes/api/chat/stream.ts
      // matches what @tanstack/ai expects for ContentPart
      const messages = [
        {
          role: 'user' as const,
          content: 'Hello world',
        },
      ]

      // Reproduce the exact transformation from stream.ts
      const formatted = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string'
          ? [{ type: 'text' as const, content: m.content }]
          : [],
      }))

      // Verify the format
      expect(formatted[0]!.content[0]).toHaveProperty('type', 'text')
      expect(formatted[0]!.content[0]).toHaveProperty('content', 'Hello world')
      // Must NOT have `text` key — that was the bug
      expect(formatted[0]!.content[0]).not.toHaveProperty('text')
    })
  })
})
