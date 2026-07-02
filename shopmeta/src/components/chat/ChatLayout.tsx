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

// ─── TanStack AI SSE event types ─────────────────────────────────────────────

interface SseEvent {
  type: string
  delta?: string
  error?: { message?: string }
  toolCallId?: string
  toolName?: string
  toolCallName?: string
  input?: Record<string, unknown>
  content?: string
  role?: string
}

// In-flight tool call state accumulated across ARGS delta events
interface InFlightTool {
  toolCallId: string
  toolName: string
  argsText: string
}

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

      // Tool call state — keyed by toolCallId
      const tools = new Map<string, InFlightTool>()
      // Finalized tool calls (after TOOL_CALL_END)
      const finishedTools = new Map<string, InFlightTool & { result?: string }>()

      function buildContent() {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'tool-call'; toolCallId: string; toolName: string; argsText: string; args: Record<string, unknown>; result?: unknown }
        > = []
        // Emit finished tool calls before the text
        for (const [, t] of finishedTools) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(t.argsText || '{}') } catch { /* ignore */ }
          parts.push({
            type: 'tool-call' as const,
            toolCallId: t.toolCallId,
            toolName: t.toolName,
            argsText: t.argsText,
            args,
            result: t.result,
          })
        }
        if (fullText) {
          parts.push({ type: 'text' as const, text: fullText })
        }
        return parts
      }

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

            let parsed: SseEvent
            try {
              parsed = JSON.parse(data) as SseEvent
            } catch {
              continue
            }

            switch (parsed.type) {
              case 'RUN_ERROR': {
                const msg = parsed.error?.message ?? 'Unknown server error'
                console.error('[ChatAdapter] RUN_ERROR:', msg)
                throw new Error(msg)
              }

              case 'TEXT_MESSAGE_START': {
                // If there's already text from a previous run, add a paragraph break
                if (fullText) fullText += '\n\n'
                break
              }

              case 'TEXT_MESSAGE_CONTENT': {
                // ONLY this event type feeds the text content
                if (parsed.delta) {
                  fullText += parsed.delta
                  yield { content: buildContent() }
                }
                break
              }

              case 'TOOL_CALL_START': {
                const id = parsed.toolCallId ?? ''
                const name = parsed.toolCallName ?? parsed.toolName ?? ''
                tools.set(id, { toolCallId: id, toolName: name, argsText: '' })
                break
              }

              case 'TOOL_CALL_ARGS': {
                const id = parsed.toolCallId ?? ''
                const tool = tools.get(id)
                if (tool && parsed.delta) {
                  tool.argsText += parsed.delta
                }
                break
              }

              case 'TOOL_CALL_END': {
                const id = parsed.toolCallId ?? ''
                const tool = tools.get(id)
                if (tool) {
                  // Use the final input from END event if available
                  if (parsed.input) {
                    tool.argsText = JSON.stringify(parsed.input)
                  }
                  finishedTools.set(id, { ...tool })
                  tools.delete(id)
                  yield { content: buildContent() }
                }
                break
              }

              case 'TOOL_CALL_RESULT': {
                const id = parsed.toolCallId ?? ''
                const existing = finishedTools.get(id)
                if (existing) {
                  existing.result = parsed.content
                  yield { content: buildContent() }
                }
                break
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Final yield with complete status
      const finalContent = buildContent()
      if (finalContent.length > 0) {
        yield {
          content: finalContent,
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
