// src/lib/ai/useChat.ts
// React hook for AI chat with streaming, abort, and regenerate support.
// Uses assistant-ui's useLocalRuntime with a custom ChatModelAdapter.

import { useCallback, useState } from 'react'
import type { ChatModelAdapter, ChatModelRunOptions } from '@assistant-ui/react'
import { useLocalRuntime } from '@assistant-ui/react'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '#/lib/ai/providers'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessagePart {
  type: 'text'
  text: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: MessagePart[]
  createdAt?: Date
}

export interface UseChatOptions {
  conversationId?: string
  initialMessages?: ChatMessage[]
  onMessage?: (msg: ChatMessage) => void
  onError?: (err: Error) => void
}

// ─── Chat Model Adapter ───────────────────────────────────────────────────────

/**
 * Creates a ChatModelAdapter that connects assistant-ui to our chat endpoint.
 * The adapter streams SSE chunks from /api/chat and yields updates.
 */
function createShopmetaChatAdapter(
  provider: string,
  model: string,
  conversationId?: string,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
      // Build the request payload
      const payload = {
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content
            .map((p) => ('text' in p ? p.text : ''))
            .join(''),
        })),
        model,
        provider,
        conversationId,
      }

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortSignal,
      })

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response body from chat API')
      }

      // Stream SSE chunks
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break

            try {
              const parsed = JSON.parse(data) as { type: string; text?: string; delta?: string }
              const chunk = parsed.delta ?? parsed.text ?? ''
              if (chunk) {
                fullText += chunk
                yield {
                  content: [{ type: 'text' as const, text: fullText }],
                }
              }
            } catch {
              // Skip unparseable SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    },
  }
}

// ─── useChat Hook ─────────────────────────────────────────────────────────────

export interface UseChatReturn {
  provider: string
  model: string
  setModel: (provider: string, model: string) => void
  runtime: ReturnType<typeof useLocalRuntime>
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER)
  const [model, setModelState] = useState(DEFAULT_MODEL)

  const adapter = createShopmetaChatAdapter(provider, model, options.conversationId)

  const runtime = useLocalRuntime(adapter)

  const setModel = useCallback((newProvider: string, newModel: string) => {
    setProvider(newProvider)
    setModelState(newModel)
  }, [])

  return {
    provider,
    model,
    setModel,
    runtime,
  }
}
