// src/components/chat/Thread.tsx
// Thread component — renders the list of messages in a conversation.
// Uses assistant-ui primitives for runtime integration.
// Uses prompt-kit's ChatContainer, Message, and Markdown for the view layer.
// Includes: Regenerate button on the last assistant message.

import {
  ThreadPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
} from '@assistant-ui/react'
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container'
import { ScrollButton } from '@/components/ui/scroll-button'
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageActions,
  MessageAction,
} from '@/components/ui/message'
import { ThinkingBar } from '@/components/ui/thinking-bar'
import { RefreshCw, Copy, Check } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

// ─── Markdown wrapper for assistant messages ────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  return (
    <Markdown
      className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed break-words"
    >
      {text}
    </Markdown>
  )
}

// ─── Copy Button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <MessageAction tooltip={copied ? 'Copied' : 'Copy'}>
      <button
        onClick={handleCopy}
        className="hover:text-foreground cursor-pointer rounded-md p-1 transition-colors"
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </MessageAction>
  )
}

// ─── User Message ───────────────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="user-message"
        className="mb-6 flex justify-end"
      >
        <Message className="max-w-[75%] flex-row-reverse">
          <MessageContent
            className="bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5"
            data-testid="user-message-content"
          >
            <MessagePrimitive.Content />
          </MessageContent>
        </Message>
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── Assistant Message ──────────────────────────────────────────────────────

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="assistant-message"
        className="group/message mb-6"
      >
        <Message>
          <MessageAvatar
            src=""
            alt="ShopMeta"
            fallback="S"
            className="bg-primary/10 text-primary border-border mt-0.5 h-7 w-7 border text-xs"
          />
          <div className="min-w-0 flex-1 space-y-2">
            {/* ThinkingBar — shown while streaming on the last message */}
            <MessagePrimitive.If last>
              <MessagePrimitive.InProgress>
                <ThinkingBar text="Searching" className="py-1" />
              </MessagePrimitive.InProgress>
            </MessagePrimitive.If>

            <MessageContent className="bg-transparent p-0 text-foreground">
              <MessagePrimitive.Content
                components={{
                  Text: ({ text }) => <MarkdownText text={text} />,
                }}
              />
            </MessageContent>

            {/* Actions — visible on hover or on last message */}
            <MessagePrimitive.If last={true}>
              <MessageActions className="opacity-0 transition-opacity group-hover/message:opacity-100">
                <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
                  <ActionBarPrimitive.Reload asChild>
                    <MessageAction tooltip="Regenerate">
                      <button
                        data-testid="regenerate-btn"
                        aria-label="Regenerate response"
                        className="hover:bg-muted hover:text-foreground cursor-pointer rounded-md p-1.5 transition-colors"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </MessageAction>
                  </ActionBarPrimitive.Reload>
                </ActionBarPrimitive.Root>
              </MessageActions>
            </MessagePrimitive.If>
          </div>
        </Message>
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── Loading Indicator (unused — ThinkingBar is embedded in AssistantMessage) ─

// ─── Thread ─────────────────────────────────────────────────────────────────

interface ThreadProps {
  className?: string
  isEmpty?: boolean
}

export function Thread({ className, isEmpty }: ThreadProps) {
  return (
    <ThreadPrimitive.Root
      data-testid="thread"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
    >
      {/* Hide message area when no messages and empty state is handled by ChatLayout */}
      {isEmpty ? null : (
        <ChatContainerRoot className="flex-1">
          <ChatContainerContent className="gap-0 px-4 py-6">
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          </ChatContainerContent>
          <ChatContainerScrollAnchor />
        </ChatContainerRoot>
      )}
    </ThreadPrimitive.Root>
  )
}
