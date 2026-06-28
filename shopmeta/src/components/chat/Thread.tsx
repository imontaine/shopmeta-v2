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
import { ThinkingBar } from '@/components/ui/thinking-bar'
import { RefreshCw, Copy } from 'lucide-react'
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

// ─── Streaming Thinking Bar ─────────────────────────────────────────────────
// Replaces MessagePrimitive.InProgress which doesn't exist in @assistant-ui/react v0.10.50.
// Uses useThread to detect if the thread is actively running.

function StreamingThinkingBar() {
  const isRunning = useThread((state) => state.isRunning)
  if (!isRunning) return null
  return <ThinkingBar text="Searching" className="py-1" />
}

// ─── User Message ───────────────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="user-message"
        role="article"
        aria-label="Your message"
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
        role="article"
        aria-label="ShopMeta response"
        className="group/message mb-6 scroll-mt-[60vh]"
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
              <StreamingThinkingBar />
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
              <MessageActions className="text-muted-foreground flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100">
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
            </MessagePrimitive.If>
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
