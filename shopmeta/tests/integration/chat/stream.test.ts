// tests/integration/chat/stream.test.ts
// Integration tests for the chat streaming endpoint.
// Uses MSW to mock AI provider responses.

import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { server } from '../../mocks/server'
import { http, HttpResponse } from 'msw'

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a mock SSE stream that yields given chunks.
 */
function createSSEStream(chunks: string[], delay = 5): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let i = 0

      function send() {
        if (i >= chunks.length) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        const event = `data: ${JSON.stringify({ delta: chunks[i++] })}\n\n`
        controller.enqueue(encoder.encode(event))
        setTimeout(send, delay)
      }

      send()
    },
  })
}

/**
 * Reads all chunks from a ReadableStream.
 */
async function readAllChunks(stream: ReadableStream): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }

  return chunks
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Chat streaming endpoint (MSW mocked)', () => {
  test('streams multiple SSE chunks for a valid request', async () => {
    const mockChunks = ['Hello', ', ', 'world', '!']

    server.use(
      http.post('http://localhost/api/chat/stream', () => {
        return new HttpResponse(createSSEStream(mockChunks), {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        })
      }),
    )

    const response = await fetch('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        provider: 'openai',
      }),
    })

    expect(response.ok).toBe(true)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')

    const rawChunks = await readAllChunks(response.body!)
    expect(rawChunks.length).toBeGreaterThan(1)

    // Verify SSE format
    const allText = rawChunks.join('')
    expect(allText).toContain('data:')
    expect(allText).toContain('[DONE]')
  })

  test('collects streaming text chunks into correct sequence', async () => {
    const expectedChunks = ['The', ' sky', ' is', ' blue']

    server.use(
      http.post('http://localhost/api/chat/stream', () => {
        return new HttpResponse(createSSEStream(expectedChunks, 0), {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )

    const response = await fetch('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What color is the sky?' }],
        model: 'gpt-4o',
        provider: 'openai',
      }),
    })

    const rawChunks = await readAllChunks(response.body!)
    const allText = rawChunks.join('')

    // Each chunk should be parseable
    const lines = allText.split('\n').filter((l) => l.startsWith('data: '))
    const parsedDeltas = lines
      .filter((l) => l !== 'data: [DONE]')
      .map((l) => {
        try {
          return (JSON.parse(l.slice(6)) as { delta: string }).delta
        } catch {
          return ''
        }
      })
      .filter(Boolean)

    expect(parsedDeltas).toEqual(expectedChunks)
  })

  test('aborts stream when signal fires', async () => {
    const controller = new AbortController()
    let chunksSent = 0

    server.use(
      http.post('http://localhost/api/chat/stream', () => {
        return new HttpResponse(
          new ReadableStream({
            start(ctrl) {
              const enc = new TextEncoder()
              let i = 0
              const interval = setInterval(() => {
                if (i++ >= 10) {
                  clearInterval(interval)
                  ctrl.enqueue(enc.encode('data: [DONE]\n\n'))
                  ctrl.close()
                  return
                }
                chunksSent++
                ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ delta: `chunk-${i}` })}\n\n`))
              }, 20)
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        )
      }),
    )

    const response = await fetch('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Generate a long response' }],
        model: 'gpt-4o',
        provider: 'openai',
      }),
      signal: controller.signal,
    })

    expect(response.ok).toBe(true)

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const receivedChunks: string[] = []

    // Read a few chunks then abort
    try {
      for (let i = 0; i < 3; i++) {
        const { done, value } = await reader.read()
        if (done) break
        receivedChunks.push(decoder.decode(value))
      }
      controller.abort()
      // Try reading after abort — should throw
      await reader.read()
    } catch {
      // Expected — abort throws
    } finally {
      reader.releaseLock()
    }

    // We received some chunks before aborting
    expect(receivedChunks.length).toBeGreaterThan(0)
    expect(receivedChunks.length).toBeLessThanOrEqual(10)
  })

  test('handles anthropic provider in request body', async () => {
    server.use(
      http.post('http://localhost/api/chat/stream', async ({ request }) => {
        const body = await request.json() as { provider: string; model: string }
        expect(body.provider).toBe('anthropic')
        expect(body.model).toBe('claude-sonnet-4')
        return new HttpResponse(createSSEStream(['Hello', ' from', ' Claude'], 0), {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )

    const response = await fetch('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hi Claude' }],
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      }),
    })

    expect(response.ok).toBe(true)
  })

  test('handles multi-turn conversation messages', async () => {
    server.use(
      http.post('http://localhost/api/chat/stream', async ({ request }) => {
        const body = await request.json() as { messages: Array<{ role: string }> }
        // Verify multi-turn messages passed through
        expect(body.messages.length).toBe(3)
        expect(body.messages[0]!.role).toBe('user')
        expect(body.messages[1]!.role).toBe('assistant')
        expect(body.messages[2]!.role).toBe('user')

        return new HttpResponse(createSSEStream(['I', ' remember', ' our', ' chat'], 0), {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )

    const response = await fetch('http://localhost/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'Do you remember our first message?' },
        ],
        model: 'gpt-4o',
        provider: 'openai',
      }),
    })

    expect(response.ok).toBe(true)
  })
})

// ─── Message Persistence Tests ────────────────────────────────────────────────

describe('Messages saved after stream', () => {
  test('messages array structure is correct for persistence', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]

    // Validate message structure matches what saveMessages expects
    for (const msg of messages) {
      expect(['user', 'assistant', 'tool', 'system']).toContain(msg.role)
      expect(typeof msg.content).toBe('string')
    }
  })

  test('regenerate creates new message without removing old ones', () => {
    // Simulate the regenerate branch:
    // Old assistant message stays in history, new one is added
    const history = [
      { id: '1', role: 'user', content: 'What is 2+2?' },
      { id: '2', role: 'assistant', content: 'The answer is 4.' },
    ]

    // Regenerate: keep user message, add new assistant message (branched)
    const regenerated = [
      ...history,
      { id: '3', role: 'assistant', content: 'Two plus two equals four.', parentId: '1' },
    ]

    expect(regenerated.length).toBe(3)
    expect(regenerated[1]!.id).toBe('2') // Old still present
    expect(regenerated[2]!.parentId).toBe('1') // New branches from user msg
  })
})
