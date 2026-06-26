// src/components/chat/ChatLayout.tsx
// Full chat layout combining Thread + Composer with Perplexity-style UX.
// Integrates assistant-ui's AssistantRuntimeProvider with our custom adapter.
// On mount, reads the org's default agent and uses its model/provider.
//
// Empty state: centered input with heading + suggestion chips.
// Conversation state: messages on top, input pinned to bottom.

import { useState, useEffect, useCallback } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useThreadRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { Thread } from '#/components/chat/Thread'
import { Composer } from '#/components/chat/Composer'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '#/lib/ai/providers'
import { listAgents } from '#/lib/agents'
import { PromptSuggestion } from '@/components/ui/prompt-suggestion'
import { cn } from '@/lib/utils'

// ─── Suggestion chips for empty state ─────────────────────────────────────────

const SUGGESTIONS = [
  'What were my top-selling products this month?',
  'Show me revenue trends for Q2',
  'How many orders did I get today?',
  'Compare this month vs last month',
]

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

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  provider: string
  model: string
  onModelChange: (provider: string, model: string) => void
  onSuggestionClick: (text: string) => void
}

function EmptyState({ provider, model, onModelChange, onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="w-full max-w-[640px] space-y-6">
        {/* Heading */}
        <div className="text-center">
          <h1
            data-testid="thread-empty"
            className="text-foreground text-2xl font-semibold tracking-tight"
          >
            Ask anything.
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Get insights about your Magento store
          </p>
        </div>

        {/* Composer — centered */}
        <Composer
          provider={provider}
          model={model}
          onModelChange={onModelChange}
        />

        {/* Suggestion chips */}
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <PromptSuggestion
              key={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
              className="text-muted-foreground hover:text-foreground border-border text-xs"
            >
              {suggestion}
            </PromptSuggestion>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Conversation State ───────────────────────────────────────────────────────

interface ConversationStateProps {
  provider: string
  model: string
  onModelChange: (provider: string, model: string) => void
}

function ConversationState({ provider, model, onModelChange }: ConversationStateProps) {
  return (
    <>
      <Thread />
      <Composer
        provider={provider}
        model={model}
        onModelChange={onModelChange}
      />
    </>
  )
}

// ─── Chat Content ─────────────────────────────────────────────────────────────
// Detects empty state and switches between empty state and conversation view.

function ChatContent({ conversationId }: { conversationId?: string }) {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [hasMessages, setHasMessages] = useState(false)

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
      <ChatContentInner
        provider={provider}
        model={model}
        onModelChange={handleModelChange}
        onHasMessagesChange={setHasMessages}
        hasMessages={hasMessages}
      />
    </AssistantRuntimeProvider>
  )
}

// Inner component that can access the thread runtime
interface ChatContentInnerProps {
  provider: string
  model: string
  onModelChange: (provider: string, model: string) => void
  onHasMessagesChange: (hasMessages: boolean) => void
  hasMessages: boolean
}

function ChatContentInner({
  provider,
  model,
  onModelChange,
  onHasMessagesChange,
  hasMessages,
}: ChatContentInnerProps) {
  const threadRuntime = useThreadRuntime()

  // Track whether the thread has any messages
  useEffect(() => {
    const unsubscribe = threadRuntime.subscribe(() => {
      const messages = threadRuntime.getState().messages
      onHasMessagesChange(messages.length > 0)
    })
    return unsubscribe
  }, [threadRuntime, onHasMessagesChange])

  // Handle suggestion click — send the suggestion as a message
  const handleSuggestionClick = useCallback(
    (text: string) => {
      threadRuntime.composer.setText(text)
      threadRuntime.composer.send()
    },
    [threadRuntime],
  )

  return (
    <div
      data-testid="chat-layout"
      className="mx-auto flex h-full w-full max-w-[720px] flex-col overflow-hidden"
    >
      {hasMessages ? (
        <ConversationState
          provider={provider}
          model={model}
          onModelChange={onModelChange}
        />
      ) : (
        <EmptyState
          provider={provider}
          model={model}
          onModelChange={onModelChange}
          onSuggestionClick={handleSuggestionClick}
        />
      )}
    </div>
  )
}

// ─── Chat Layout ──────────────────────────────────────────────────────────────

interface ChatLayoutProps {
  conversationId?: string
  className?: string
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
    <div className={cn('flex h-full w-full overflow-hidden', className)}>
      {mounted && <ChatContent conversationId={conversationId} />}
    </div>
  )
}
