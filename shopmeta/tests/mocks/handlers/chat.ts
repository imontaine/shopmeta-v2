// tests/mocks/handlers/chat.ts
// MSW handlers for mocking the AI chat streaming endpoint.
// Returns a realistic SSE stream for testing.

import { http, HttpResponse } from 'msw'

/**
 * Creates a mock SSE stream with the given text chunks.
 * Simulates token-by-token streaming from the AI API.
 */
function createMockSSEStream(chunks: string[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let i = 0

      function sendNext() {
        if (i >= chunks.length) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        const chunk = chunks[i++]
        const event = `data: ${JSON.stringify({ delta: chunk })}\n\n`
        controller.enqueue(encoder.encode(event))
        // Simulate async token delivery
        setTimeout(sendNext, 5)
      }

      sendNext()
    },
  })
}

// Default mock response chunks
export const MOCK_RESPONSE_TEXT = 'Hello! I am a mock AI assistant response.'
export const MOCK_RESPONSE_CHUNKS = [
  'Hello',
  '!',
  ' I',
  ' am',
  ' a',
  ' mock',
  ' AI',
  ' assistant',
  ' response',
  '.',
]

export const chatHandlers = [
  http.post('http://localhost/api/chat/stream', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return HttpResponse.json({ error: 'Missing messages' }, { status: 400 })
    }

    // Check for test-specific overrides via special header or query
    const url = new URL(request.url)
    const scenario = url.searchParams.get('scenario') ?? 'default'

    if (scenario === 'error') {
      return HttpResponse.json({ error: 'Provider error' }, { status: 500 })
    }

    if (scenario === 'empty') {
      return HttpResponse.json({ error: 'Empty response' }, { status: 400 })
    }

    // Return streaming SSE response
    return new HttpResponse(createMockSSEStream(MOCK_RESPONSE_CHUNKS), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }),
]
