// src/components/chat/Thread.tsx
// Thread component — renders the list of messages in a conversation.
// Uses assistant-ui primitives with auto-scroll during streaming.
// Wraps messages with MarkdownRenderer for rich content display.
// Includes: Regenerate button on the last assistant message.

import { useEffect, useRef } from 'react'
import {
  ThreadPrimitive,
  MessagePrimitive,
  useThreadRuntime,
  ActionBarPrimitive,
} from '@assistant-ui/react'
import { MarkdownRenderer } from '#/components/chat/MarkdownRenderer'
import { RefreshCw } from 'lucide-react'

// ─── Message Bubble ───────────────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="user-message"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: '75%',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            color: 'var(--text-primary)',
          }}
        >
          <MessagePrimitive.Content />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="assistant-message"
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          marginBottom: '1rem',
          gap: '0.5rem',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: '50%',
            background: 'var(--accent-subtle)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            flexShrink: 0,
            marginTop: '0.1rem',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <div style={{ maxWidth: '80%' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.25rem 1rem 1rem 1rem',
              padding: '0.75rem 1rem',
            }}
          >
            <MessagePrimitive.Content
              components={{
                Text: ({ text }) => <MarkdownRenderer content={text} />,
              }}
            />
          </div>

          {/* Regenerate button — only shown on the last assistant message */}
          <MessagePrimitive.If last={true}>
            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.25rem' }}>
              <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
                <ActionBarPrimitive.Reload asChild>
                  <button
                    data-testid="regenerate-btn"
                    aria-label="Regenerate response"
                    title="Regenerate response"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.5rem 0.75rem',
                      minHeight: '44px',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.375rem',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      opacity: 0.5,
                      transition: 'opacity 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.5'
                    }}
                  >
                    <RefreshCw size={11} />
                    Regenerate
                  </button>
                </ActionBarPrimitive.Reload>
              </ActionBarPrimitive.Root>
            </div>
          </MessagePrimitive.If>
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── Thread ───────────────────────────────────────────────────────────────────

interface ThreadProps {
  className?: string
}

export function Thread({ className }: ThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const runtime = useThreadRuntime()

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    const unsubscribe = runtime.subscribe(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })
    return unsubscribe
  }, [runtime])

  return (
    <ThreadPrimitive.Root
      data-testid="thread"
      className={className}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Scrollable message list */}
      <div
        ref={scrollRef}
        data-testid="thread-messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          scrollBehavior: 'smooth',
        }}
      >
        <ThreadPrimitive.Empty>
          <div
            data-testid="thread-empty"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '0.5rem',
              userSelect: 'none',
            }}
          >
            <p style={{ fontSize: '1.25rem', fontWeight: 500, color: 'var(--text-primary)', opacity: 0.6 }}>Ask anything.</p>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </div>
    </ThreadPrimitive.Root>
  )
}
