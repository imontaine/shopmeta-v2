// src/components/chat/Thread.tsx
// Thread component — renders the list of messages in a conversation.
// Uses assistant-ui primitives for runtime integration.
// Uses prompt-kit's ChatContainer, Message, and Markdown for the view layer.
//
// Streaming UX features:
//  - ScrollButton with streaming indicator (pulsing "New content" when scrolled up)
//  - scroll-margin-top on assistant messages (new turn appears near viewport top)
//  - Interaction-aware scroll (text selection + keyboard stop auto-scroll)
//  - aria-live region for streaming status announcements
//  - Keyboard navigation between messages (Alt+↑/↓)

import {
  ThreadPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  useThread,
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
import { DotsLoader } from '@/components/ui/loader'
import { RefreshCw, Copy } from 'lucide-react'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

// ─── Markdown wrapper for assistant messages ────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  return (
    <Markdown
      className="prose prose-neutral dark:prose-invert max-w-none leading-relaxed break-words"
    >
      {text}
    </Markdown>
  )
}

// ─── Streaming Dots Loader ──────────────────────────────────────────────────
// Shows animated dots ONLY while waiting for the first token.
// Once content starts streaming in, this disappears — no layout shift.

function StreamingDotsLoader() {
  const isRunning = useThread((state) => state.isRunning)
  const hasContent = useThread((state) => {
    const msgs = state.messages
    if (msgs.length === 0) return false
    const last = msgs[msgs.length - 1]
    return (
      last?.content?.some(
        (p: { type: string; text?: string }) =>
          p.type === 'text' && (p.text?.length ?? 0) > 0,
      ) ?? false
    )
  })

  if (!isRunning || hasContent) return null
  return <DotsLoader size="sm" className="py-2" />
}

// ─── User Message ───────────────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="user-message"
        role="article"
        aria-label="Your message"
        className="mb-6 flex justify-end animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
      >
        <Message className="max-w-[75%] flex-row-reverse">
          <MessageContent
            className="bg-muted text-primary rounded-3xl px-5 py-2.5"
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
        role="article"
        aria-label="ShopMeta response"
        className="group/message mb-6 scroll-mt-[60vh] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
      >
        <Message>
          <MessageAvatar
            src=""
            alt="ShopMeta"
            fallback="S"
            className="bg-primary/10 text-primary border-border mt-0.5 h-7 w-7 border text-xs"
          />
          <div className="min-w-0 flex-1 space-y-2">
            {/* Dots loader — shown only while waiting for first token */}
            <MessagePrimitive.If last>
              <StreamingDotsLoader />
            </MessagePrimitive.If>

            <MessageContent className="bg-transparent p-0 text-foreground">
              <MessagePrimitive.Content
                components={{
                  Text: ({ text }) => <MarkdownText text={text} />,
                }}
              />
            </MessageContent>

            {/* Actions — always visible on last message, hover on others */}
            <MessageActions className="text-muted-foreground flex items-center gap-1 transition-opacity duration-150">
              <ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
                {/* Copy */}
                <ActionBarPrimitive.Copy asChild>
                  <MessageAction tooltip="Copy">
                    <button
                      data-testid="copy-message-btn"
                      aria-label="Copy message"
                      className="hover:bg-muted hover:text-foreground cursor-pointer rounded-md p-1.5 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </MessageAction>
                </ActionBarPrimitive.Copy>

                {/* Regenerate */}
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
          </div>
        </Message>
      </div>
    </MessagePrimitive.Root>
  )
}



// ─── Thread ─────────────────────────────────────────────────────────────────

interface ThreadProps {
  className?: string
  isEmpty?: boolean
  conversationId?: string
}

export function Thread({ className, isEmpty }: ThreadProps) {
  const isRunning = useThread((state) => state.isRunning)

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

          {/* Streaming-aware scroll button */}
          <ScrollButton isStreaming={isRunning} />

          <ChatContainerScrollAnchor />

          {/* Accessibility: announce streaming status changes */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {isRunning ? 'Response is being generated' : ''}
          </div>
        </ChatContainerRoot>
      )}
    </ThreadPrimitive.Root>
  )
}
