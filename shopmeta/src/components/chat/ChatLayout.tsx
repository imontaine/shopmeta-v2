// src/components/chat/ChatLayout.tsx
// Full chat layout combining Thread + Composer with Perplexity-style UX.
// Integrates assistant-ui's AssistantRuntimeProvider with our custom adapter.
// On mount, reads the org's default agent and uses its model/provider.
//
// Empty state: centered input with heading + suggestion chips.
// Conversation state: messages on top, input pinned to bottom.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useThreadRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { Thread } from '#/components/chat/Thread'
import { Composer } from '#/components/chat/Composer'
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '#/lib/ai/providers'
import { listAgents, type AgentRow } from '#/lib/agents'
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

function createAdapter(provider: string, model: string, conversationId?: string, agentId?: string, orgId?: string): ChatModelAdapter {
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
          agentId,
          orgId,
        }),
        signal: abortSignal,
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error')
        console.error('[ChatAdapter] API error:', response.status, errorBody)
        throw new Error(`Chat API error: ${response.status} — ${errorBody}`)
      }

      if (!response.body) {
        throw new Error('Chat API returned no body')
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
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data) as {
                type?: string
                delta?: string
                text?: string
                error?: { message?: string }
              }

              // Handle @tanstack/ai RUN_ERROR events
              if (parsed.type === 'RUN_ERROR') {
                const msg = parsed.error?.message ?? 'Unknown server error'
                console.error('[ChatAdapter] RUN_ERROR:', msg)
                throw new Error(msg)
              }

              // Only process TEXT_MESSAGE_CONTENT chunks (which carry delta)
              // Also handle generic delta/text for compatibility
              const chunk = parsed.delta ?? parsed.text ?? ''
              if (chunk) {
                fullText += chunk
                yield {
                  content: [{ type: 'text' as const, text: fullText }],
                }
              }
            } catch (e) {
              // Re-throw RUN_ERROR, skip parse errors
              if (e instanceof Error && e.message !== 'Unknown server error') {
                if (!(e instanceof SyntaxError)) throw e
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // If we got text, yield a final result with complete status
      if (fullText) {
        yield {
          content: [{ type: 'text' as const, text: fullText }],
          status: { type: 'complete' as const, reason: 'stop' as const },
        }
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
  agents: AgentRow[]
  selectedAgentId: string | undefined
  onAgentChange: (agentId: string | undefined) => void
}

function EmptyState({ provider, model, onModelChange, onSuggestionClick, agents, selectedAgentId, onAgentChange }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 animate-in fade-in duration-300">
      <div className="w-full max-w-[640px] space-y-6">
        {/* Heading */}
        <div className="text-center">
          <h1
            data-testid="thread-empty"
            className="text-foreground text-2xl font-semibold tracking-tight"
          >
            Ask anything.
          </h1>
          <p className="text-muted-foreground mt-1 text-base">
            Get insights about your Magento store
          </p>
        </div>

        {/* Agent selector */}
        {agents.length > 0 && (
          <AgentSelector agents={agents} selectedAgentId={selectedAgentId} onAgentChange={onAgentChange} />
        )}

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
              className="text-muted-foreground hover:text-foreground border-border text-sm"
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
  agents: AgentRow[]
  selectedAgentId: string | undefined
  onAgentChange: (agentId: string | undefined) => void
}

function ConversationState({ provider, model, onModelChange, agents, selectedAgentId, onAgentChange }: ConversationStateProps) {
  return (
    <>
      <Thread />
      {agents.length > 0 && (
        <div className="px-4 pb-1 flex justify-start">
          <AgentSelector agents={agents} selectedAgentId={selectedAgentId} onAgentChange={onAgentChange} compact />
        </div>
      )}
      <Composer
        provider={provider}
        model={model}
        onModelChange={onModelChange}
      />
    </>
  )
}

// ─── Agent Selector ───────────────────────────────────────────────────────────

interface AgentSelectorProps {
  agents: AgentRow[]
  selectedAgentId: string | undefined
  onAgentChange: (agentId: string | undefined) => void
  compact?: boolean
}

function AgentSelector({ agents, selectedAgentId, onAgentChange, compact = false }: AgentSelectorProps) {
  const selected = agents.find((a) => a.id === selectedAgentId)
  return (
    <div className={compact ? 'flex items-center gap-1' : 'flex justify-center'}>
      <label className="text-muted-foreground text-xs mr-1 shrink-0">Agent:</label>
      <select
        value={selectedAgentId ?? ''}
        onChange={(e) => onAgentChange(e.target.value || undefined)}
        className="chat-agent-select"
        aria-label="Select agent"
        data-testid="agent-selector"
      >
        <option value="">Default settings</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}{a.isDefault ? ' ★' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── Chat Content ─────────────────────────────────────────────────────────────
// Detects empty state and switches between empty state and conversation view.

function ChatContent({ conversationId }: { conversationId?: string }) {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [agentId, setAgentId] = useState<string | undefined>(undefined)
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [agents, setAgents] = useState<AgentRow[]>([])

  // On mount, load all org agents. Auto-select the default agent.
  useEffect(() => {
    listAgents({ data: {} })
      .then((agentList) => {
        setAgents(agentList)
        const defaultAgent = agentList.find((a) => a.isDefault)
        if (defaultAgent) {
          setProvider(defaultAgent.provider)
          setModel(defaultAgent.model)
          setAgentId(defaultAgent.id)
          setOrgId(defaultAgent.orgId)
        } else if (agentList.length > 0) {
          // At least capture orgId from any agent
          setOrgId(agentList[0]!.orgId)
        }
      })
      .catch(() => {
        // Silently fall back to app defaults if the agent list can't be fetched
      })
  }, [])

  // When user picks a different agent, apply its model/provider/agentId.
  const handleAgentChange = useCallback((newAgentId: string | undefined) => {
    if (!newAgentId) {
      // Reset to app defaults
      setAgentId(undefined)
      setProvider(DEFAULT_PROVIDER)
      setModel(DEFAULT_MODEL)
      return
    }
    const agent = agents.find((a) => a.id === newAgentId)
    if (agent) {
      setAgentId(agent.id)
      setProvider(agent.provider)
      setModel(agent.model)
      setOrgId(agent.orgId)
    }
  }, [agents])

  // Memoize the adapter so its reference remains stable across renders.
  // This prevents useLocalRuntime from resetting messages/re-initializing on every render.
  const adapter = useMemo(() => {
    return createAdapter(provider, model, conversationId, agentId, orgId)
  }, [provider, model, conversationId, agentId, orgId])
  
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
        agents={agents}
        selectedAgentId={agentId}
        onAgentChange={handleAgentChange}
      />
    </AssistantRuntimeProvider>
  )
}

// Inner component that can access the thread runtime
interface ChatContentInnerProps {
  provider: string
  model: string
  onModelChange: (provider: string, model: string) => void
  agents: AgentRow[]
  selectedAgentId: string | undefined
  onAgentChange: (agentId: string | undefined) => void
}

function ChatContentInner({
  provider,
  model,
  onModelChange,
  agents,
  selectedAgentId,
  onAgentChange,
}: ChatContentInnerProps) {
  const threadRuntime = useThreadRuntime()
  const [hasMessages, setHasMessages] = useState(false)

  // Track whether the thread has any messages.
  // State is local to ChatContentInner so changes do not re-render ChatContent,
  // keeping the local runtime reference stable.
  useEffect(() => {
    const unsubscribe = threadRuntime.subscribe(() => {
      const messages = threadRuntime.getState().messages
      setHasMessages(messages.length > 0)
    })
    return unsubscribe
  }, [threadRuntime])

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  // Ctrl+/ (or Cmd+/) → focus the composer input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl/Cmd + / → focus composer
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        const textarea = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="composer-input"]',
        )
        textarea?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden"
    >
      {hasMessages ? (
        <ConversationState
          provider={provider}
          model={model}
          onModelChange={onModelChange}
          agents={agents}
          selectedAgentId={selectedAgentId}
          onAgentChange={onAgentChange}
        />
      ) : (
        <EmptyState
          provider={provider}
          model={model}
          onModelChange={onModelChange}
          onSuggestionClick={handleSuggestionClick}
          agents={agents}
          selectedAgentId={selectedAgentId}
          onAgentChange={onAgentChange}
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
