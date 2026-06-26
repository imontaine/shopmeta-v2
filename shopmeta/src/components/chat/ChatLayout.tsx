// src/components/chat/ChatLayout.tsx
// Full chat layout combining ThreadList + Thread + Composer.
// Integrates assistant-ui's AssistantRuntimeProvider with our custom adapter.
// On mount, reads the org's default agent and uses its model/provider.

import { useState, useEffect, useCallback } from 'react'
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react'
import { Thread } from '#/components/chat/Thread'
import { Composer } from '#/components/chat/Composer'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '#/lib/ai/providers'
import { listAgents } from '#/lib/agents'

// ─── Chat Adapter Factory ─────────────────────────────────────────────────────

function createAdapter(provider: string, model: string, conversationId?: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content
              .map((p) => {
                if ('text' in p) return p.text
                return ''
              })
              .join(''),
          })),
          model,
          provider,
          conversationId,
        }),
        signal: abortSignal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Chat API error: ${response.status}`)
      }

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
              const parsed = JSON.parse(data) as { delta?: string; text?: string }
              const chunk = parsed.delta ?? parsed.text ?? ''
              if (chunk) {
                fullText += chunk
                yield {
                  content: [{ type: 'text' as const, text: fullText }],
                }
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    },
  }
}

// ─── Chat Layout ──────────────────────────────────────────────────────────────

interface ChatLayoutProps {
  conversationId?: string
  className?: string
}

function ChatContent({ conversationId }: { conversationId?: string }) {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const [model, setModel] = useState(DEFAULT_MODEL)

  // On mount, load the org's default agent and apply its model/provider.
  // If no default agent is set, use the app defaults.
  useEffect(() => {
    listAgents({ data: {} })
      .then((agents) => {
        const defaultAgent = agents.find((a) => a.isDefault)
        if (defaultAgent) {
          setProvider(defaultAgent.provider)
          setModel(defaultAgent.model)
        }
      })
      .catch(() => {
        // Silently fall back to app defaults if the agent list can't be fetched
      })
  }, [])

  const adapter = createAdapter(provider, model, conversationId)
  const runtime = useLocalRuntime(adapter)

  const handleModelChange = useCallback((newProvider: string, newModel: string) => {
    setProvider(newProvider)
    setModel(newModel)
  }, [])

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        data-testid="chat-layout"
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: '720px',
          margin: '0 auto',
          height: '100%',
          overflow: 'hidden',
          flexDirection: 'column',
        }}
      >
        <Thread />
        <Composer
          provider={provider}
          model={model}
          onModelChange={handleModelChange}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}

/**
 * ChatLayout — renders the assistant-ui chat interface.
 *
 * IMPORTANT: Rendered client-only via a mount gate.
 * `useLocalRuntime` requires browser APIs and causes SSR hydration mismatches
 * when rendered on the server — this would prevent React effects (including the
 * `data-hydrated` signal) from ever running on the client.
 */
export function ChatLayout({ conversationId, className }: ChatLayoutProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={className}
      style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {mounted && <ChatContent conversationId={conversationId} />}
    </div>
  )
}
