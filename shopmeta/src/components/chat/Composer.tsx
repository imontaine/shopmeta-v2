// src/components/chat/Composer.tsx
// Message composer component with send button and stop generation support.
// Enter sends, Shift+Enter inserts newline.
// Shows a stop button during streaming.
//
// Architecture: ComposerPrimitive.Root provides the ComposerContext required by
// useComposerRuntime(). Inside it, we use a plain controlled <textarea> instead
// of ComposerPrimitive.Input, so Playwright's fill() correctly updates React
// state and enables the send button (ComposerPrimitive.Input uses an internal
// store that doesn't respond to DOM fill events in E2E tests).

import { useState, useRef, useCallback } from 'react'
import type { KeyboardEvent, ChangeEvent } from 'react'
import {
  ComposerPrimitive,
  ThreadPrimitive,
  useComposerRuntime,
} from '@assistant-ui/react'
import { Send, Square } from 'lucide-react'
import { ModelSelector } from '#/components/chat/ModelSelector'

// SSR guard — the assistant-ui runtime is client-only.
// typeof window check prevents useComposerRuntime() from throwing during SSR,
// which would cause a hydration mismatch and prevent React effects from running.
const isClient = typeof window !== 'undefined'


interface ComposerProps {
  onSend?: (message: { content: string }) => void
  provider?: string
  model?: string
  onModelChange?: (provider: string, model: string) => void
  disabled?: boolean
  placeholder?: string
}

// ─── Stop Button ──────────────────────────────────────────────────────────────
// Must be inside ComposerPrimitive.Root → AssistantRuntimeProvider context.

function StopButton() {
  return (
    <ThreadPrimitive.If running>
      <ComposerPrimitive.Cancel asChild>
        <button
          data-testid="stop-generation-btn"
          aria-label="Stop generation"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.45rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)',
            color: 'hsl(0 90% 72%)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
        >
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      </ComposerPrimitive.Cancel>
    </ThreadPrimitive.If>
  )
}

// ─── Inner composer — must be inside ComposerPrimitive.Root ──────────────────

interface ComposerInnerProps {
  onSend?: (message: { content: string }) => void
  provider?: string
  model?: string
  onModelChange?: (provider: string, model: string) => void
  disabled?: boolean
  placeholder?: string
}

function ComposerInner({
  onSend,
  provider = 'openai',
  model = 'gpt-4o',
  onModelChange,
  disabled = false,
  placeholder = 'Ask anything…',
}: ComposerInnerProps) {
  const [text, setText] = useState('')
  const composerRuntime = useComposerRuntime()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = text.trim().length > 0 && !disabled

  const handleSend = useCallback(() => {
    if (!canSend) return
    const message = text.trim()
    if (onSend) {
      // External handler — clear local state before calling so onSend sees a clean composer
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      onSend({ content: message })
    } else {
      // Push text into the assistant-ui runtime and dispatch send FIRST,
      // THEN clear local state. This prevents React from batching setText('')
      // together with composerRuntime.setText(message), which could cause
      // send() to read empty text from the runtime.
      composerRuntime.setText(message)
      composerRuntime.send()
      // Clear local textarea after sending
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }, [canSend, text, onSend, composerRuntime])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    setText(el.value)
    el.style.height = 'auto'
    const maxHeight = 8 * 24
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [])

  return (
    <div
      data-testid="composer"
      style={{
        padding: '0.75rem',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      {/* Toolbar row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        {onModelChange && (
          <ModelSelector
            currentProvider={provider}
            currentModel={model}
            onModelChange={onModelChange}
          />
        )}
        <div style={{ flex: 1 }} />
        <StopButton />
      </div>

      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.5rem',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '0.75rem',
          border: '1px solid rgba(255,255,255,0.10)',
          padding: '0.5rem 0.75rem',
          transition: 'border-color 0.15s ease',
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(62,207,142,0.5)'
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.10)'
        }}
      >
        {/* Plain controlled textarea — responds to Playwright fill() correctly.
            ComposerPrimitive.Input uses an internal store that bypasses DOM events,
            keeping the send button disabled in E2E tests. */}
        <textarea
          ref={textareaRef}
          data-testid="composer-input"
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
            fontSize: '0.9rem',
            lineHeight: '1.5',
            resize: 'none',
            fontFamily: 'inherit',
            overflow: 'hidden',
          }}
        />

        {/* Send button — shown only when not streaming */}
        <ThreadPrimitive.If running={false}>
          <button
            data-testid="send-message-btn"
            aria-label="Send message"
            disabled={!canSend}
            onClick={handleSend}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2.5rem',
              height: '2.5rem',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '0.5rem',
              border: 'none',
              background: canSend ? '#3ecf8e' : 'rgba(255,255,255,0.08)',
              color: canSend ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            <Send size={14} />
          </button>
        </ThreadPrimitive.If>
      </div>

      {/* Hint */}
      <div
        style={{
          fontSize: '0.7rem',
          opacity: 0.3,
          marginTop: '0.4rem',
          textAlign: 'center',
        }}
      >
        Enter to send · Shift+Enter for newline
      </div>
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────────────────────
// ComposerPrimitive.Root provides the ComposerContext needed by useComposerRuntime().
// We guard with isClient to prevent SSR hydration mismatches.

export function Composer(props: ComposerProps) {
  // Return nothing on SSR — the assistant-ui runtime is client-only.
  // This avoids hydration mismatches that prevent React effects from running.
  if (!isClient) return null
  return (
    <ComposerPrimitive.Root>
      <ComposerInner {...props} />
    </ComposerPrimitive.Root>
  )
}
