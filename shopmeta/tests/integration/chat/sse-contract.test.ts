// tests/integration/chat/sse-contract.test.ts
// ═══════════════════════════════════════════════════════════════════════════════
// SSE Wire Format Contract Test
//
// Validates the AG-UI event protocol produced by @tanstack/ai's
// toServerSentEventsResponse(). Uses a mock adapter (no real API calls)
// to verify the SSE stream matches what assistant-ui expects on the client.
//
// This catches breaking changes in @tanstack/ai upgrades before they
// reach production.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, test, expect } from 'vitest'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'

// ─── Mock Adapter ────────────────────────────────────────────────────────────

/**
 * Creates a minimal text adapter that yields pre-defined chunks.
 * This matches the interface that @tanstack/ai's chat() expects.
 */
function createMockAdapter(responseText: string) {
  const words = responseText.split(' ')

  return {
    kind: 'text' as const,
    name: 'mock',
    model: 'mock-model',
    async *chatStream() {
      // Emit RUN_STARTED
      yield {
        type: 'run-started',
        runId: 'test-run',
        threadId: 'test-thread',
        model: 'mock-model',
        timestamp: Date.now(),
      }

      // Emit TEXT_MESSAGE_START
      yield {
        type: 'text-message-start',
        messageId: 'test-msg',
        model: 'mock-model',
        timestamp: Date.now(),
        role: 'assistant' as const,
      }

      // Emit text chunks
      let accumulated = ''
      for (const word of words) {
        const delta = accumulated ? ` ${word}` : word
        accumulated += delta
        yield {
          type: 'text-message-content',
          messageId: 'test-msg',
          model: 'mock-model',
          timestamp: Date.now(),
          delta,
          content: accumulated,
        }
      }

      // Emit TEXT_MESSAGE_END
      yield {
        type: 'text-message-end',
        messageId: 'test-msg',
        model: 'mock-model',
        timestamp: Date.now(),
      }

      // Emit RUN_FINISHED
      yield {
        type: 'run-finished',
        runId: 'test-run',
        threadId: 'test-thread',
        model: 'mock-model',
        timestamp: Date.now(),
        finishReason: 'stop',
      }
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses SSE text into individual events.
 * Each event is a line starting with "data: " followed by JSON or [DONE].
 */
function parseSSEEvents(raw: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = []
  const lines = raw.split('\n')

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        events.push(JSON.parse(data) as Record<string, unknown>)
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  return events
}

/**
 * Reads a Response body fully as text.
 */
async function readResponseText(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SSE Wire Format Contract', () => {
  test('toServerSentEventsResponse produces valid SSE with Content-Type', async () => {
    const adapter = createMockAdapter('Hello world')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(response.headers.get('Cache-Control')).toContain('no-cache')
  })

  test('SSE stream contains required AG-UI lifecycle events', async () => {
    const adapter = createMockAdapter('The answer is 42')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)
    const raw = await readResponseText(response)
    const events = parseSSEEvents(raw)

    const eventTypes = events.map((e) => e.type)

    // Must have the full lifecycle
    expect(eventTypes).toContain('run-started')
    expect(eventTypes).toContain('text-message-start')
    expect(eventTypes).toContain('text-message-content')
    expect(eventTypes).toContain('text-message-end')
    expect(eventTypes).toContain('run-finished')
  })

  test('text-message-content events contain delta and accumulated content', async () => {
    const adapter = createMockAdapter('Hello world')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)
    const raw = await readResponseText(response)
    const events = parseSSEEvents(raw)

    const contentEvents = events.filter((e) => e.type === 'text-message-content')
    expect(contentEvents.length).toBeGreaterThan(0)

    for (const event of contentEvents) {
      expect(event).toHaveProperty('delta')
      expect(typeof event.delta).toBe('string')
      expect((event.delta as string).length).toBeGreaterThan(0)
    }
  })

  test('run-finished has finishReason', async () => {
    const adapter = createMockAdapter('done')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)
    const raw = await readResponseText(response)
    const events = parseSSEEvents(raw)

    const runFinished = events.find((e) => e.type === 'run-finished')
    expect(runFinished).toBeDefined()
    expect(runFinished!.finishReason).toBe('stop')
  })

  test('events are ordered correctly: run-started → message-start → content → message-end → run-finished', async () => {
    const adapter = createMockAdapter('test')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)
    const raw = await readResponseText(response)
    const events = parseSSEEvents(raw)

    const types = events.map((e) => e.type)
    const runStarted = types.indexOf('run-started')
    const msgStart = types.indexOf('text-message-start')
    const msgContent = types.indexOf('text-message-content')
    const msgEnd = types.indexOf('text-message-end')
    const runFinished = types.indexOf('run-finished')

    expect(runStarted).toBeLessThan(msgStart)
    expect(msgStart).toBeLessThan(msgContent)
    expect(msgContent).toBeLessThan(msgEnd)
    expect(msgEnd).toBeLessThan(runFinished)
  })

  test('each SSE line follows "data: <json>\\n\\n" format', async () => {
    const adapter = createMockAdapter('Hello')
    const stream = chat({
      adapter: adapter as any,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, content: 'test' }] }],
    })

    const response = toServerSentEventsResponse(stream)
    const raw = await readResponseText(response)

    // Split by double newline (SSE event boundary)
    const segments = raw.split('\n\n').filter((s) => s.trim())
    for (const segment of segments) {
      const lines = segment.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        // Every non-empty line must start with "data: " or be a comment
        expect(line.startsWith('data: ') || line.startsWith(':')).toBe(true)
      }
    }
  })
})
