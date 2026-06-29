// src/components/chat/Composer.tsx
// Message composer component using prompt-kit's PromptInput.
// Enter sends, Shift+Enter inserts newline.
// Shows a stop button during streaming.
//
// Architecture: ComposerPrimitive.Root provides the ComposerContext required by
// useComposerRuntime(). Inside it, we use PromptInput with a controlled value
// and manually call composerRuntime.setText/send for assistant-ui integration.

import { useState, useCallback } from 'react'
import {
  ComposerPrimitive,
  ThreadPrimitive,
  useComposerRuntime,
} from '@assistant-ui/react'
import { ArrowUp, Square } from 'lucide-react'
import { ModelSelector } from '#/components/chat/ModelSelector'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/components/ui/prompt-input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// SSR guard — the assistant-ui runtime is client-only.
const isClient = typeof window !== 'undefined'

interface ComposerProps {
  onSend?: (message: { content: string }) => void
  provider?: string
  model?: string
  onModelChange?: (provider: string, model: string) => void
  disabled?: boolean
  placeholder?: string
}

// ─── Inner composer — must be inside ComposerPrimitive.Root ──────────────────

function ComposerInner({
  onSend,
  provider = 'openai',
  model = 'gpt-4o',
  onModelChange,
  disabled = false,
  placeholder = 'Ask anything…',
}: ComposerProps) {
  const [text, setText] = useState('')
  const composerRuntime = useComposerRuntime()

  const canSend = text.trim().length > 0 && !disabled

  const handleSend = useCallback(() => {
    if (!canSend) return
    const message = text.trim()
    if (onSend) {
      setText('')
      onSend({ content: message })
    } else {
      composerRuntime.setText(message)
      composerRuntime.send()
      setText('')
    }
  }, [canSend, text, onSend, composerRuntime])

  return (
    <div
      data-testid="composer"
      className="px-4 pb-4"
    >
      <PromptInput
        value={text}
        onValueChange={setText}
        isLoading={disabled}
        onSubmit={handleSend}
        className={cn(
          'w-full shadow-xs',
          'transition-all duration-200',
        )}
      >
        <PromptInputTextarea
          data-testid="composer-input"
          placeholder={placeholder}
          className="min-h-[44px] text-base"
          autoFocus
        />
        <PromptInputActions className="flex items-center justify-between gap-2 px-2 pt-2 pb-2">
          <div className="flex items-center gap-x-1.5">
            {/* Model selector */}
            {onModelChange && (
              <ModelSelector
                currentProvider={provider}
                currentModel={model}
                onModelChange={onModelChange}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Stop button — visible during streaming */}
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel asChild>
                <PromptInputAction tooltip="Stop generation">
                  <Button
                    data-testid="stop-generation-btn"
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                  >
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                  </Button>
                </PromptInputAction>
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>

            {/* Send button — visible when not streaming */}
            <ThreadPrimitive.If running={false}>
              <PromptInputAction tooltip="Send message">
                <Button
                  data-testid="send-message-btn"
                  variant={canSend ? 'default' : 'ghost'}
                  size="icon"
                  disabled={!canSend}
                  onClick={handleSend}
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    canSend
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'text-muted-foreground',
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </PromptInputAction>
            </ThreadPrimitive.If>
          </div>
        </PromptInputActions>
      </PromptInput>
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────────────────────
// ComposerPrimitive.Root provides the ComposerContext needed by useComposerRuntime().
// We guard with isClient to prevent SSR hydration mismatches.

export function Composer(props: ComposerProps) {
  if (!isClient) return null
  return (
    <ComposerPrimitive.Root>
      <ComposerInner {...props} />
    </ComposerPrimitive.Root>
  )
}
