// src/routes/api/chat/stream.ts
// Chat streaming API route — handles POST /api/chat/stream.
// Returns SSE response with AI-generated text chunks.
// Compatible with assistant-ui's ChatModelAdapter streaming format.

import { createFileRoute } from '@tanstack/react-router'
import { getAdapter } from '#/lib/ai/providers'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { z } from 'zod'

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.union([
        z.string(),
        z.array(z.object({ type: z.string(), text: z.string().optional() })),
      ]),
    }),
  ).min(1),
  model: z.string().default('gpt-4o'),
  provider: z.string().default('openai'),
  conversationId: z.string().uuid().optional(),
  systemInstructions: z.string().optional(),
})

export const Route = createFileRoute('/api/chat/stream')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let parsed: z.infer<typeof ChatRequestSchema>
        try {
          parsed = ChatRequestSchema.parse(body)
        } catch (err) {
          return new Response(JSON.stringify({ error: 'Invalid request', details: String(err) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let adapter: ReturnType<typeof getAdapter>
        try {
          adapter = getAdapter(parsed.provider, parsed.model)
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Split out system messages vs conversation messages
        const systemMessages = parsed.messages.filter((m) => m.role === 'system')
        const conversationMessages = parsed.messages.filter((m) => m.role !== 'system')
        const systemPrompt = systemMessages.map((m) =>
          typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join('')
        ).join('\n') || parsed.systemInstructions

        const messages = conversationMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string'
            ? [{ type: 'text' as const, text: m.content }]
            : m.content.map((p) => ({ type: 'text' as const, text: p.text ?? '' })),
        }))

        const stream = chat({
          adapter,
          messages,
          system: systemPrompt,
          agentLoopStrategy: combineStrategies([
            maxIterations(15),
            untilFinishReason(['stop', 'length']),
          ]),
        })

        const sseResponse = toServerSentEventsResponse(stream)

        return new Response(sseResponse.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      },
    },
  },
})
