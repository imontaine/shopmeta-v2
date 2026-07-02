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

import { useState } from 'react'
import {
  ThreadPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
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
} from '@/components/ui/message'
import { DotsLoader } from '@/components/ui/loader'
import { Tool } from '@/components/ui/tool'
import type { ToolPart } from '@/components/ui/tool'
import {
  RefreshCw,
  Copy,
  Pencil,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

// ─── Shared action button style ─────────────────────────────────────────────
const actionBtnClass =
  'hover:bg-muted hover:text-foreground cursor-pointer rounded-md p-1.5 transition-colors inline-flex items-center justify-center'

// ─── Markdown wrapper for assistant messages ────────────────────────────────
// Wrapped in .chat-block so CSS sibling selectors can add spacing between
// consecutive content blocks (text ↔ tool) without a hard-coded margin.

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="chat-block">
      <Markdown className="chat-prose">{text}</Markdown>
    </div>
  )
}

// ─── Reasoning Panel ────────────────────────────────────────────────────────
// Collapsible panel that shows the model's chain-of-thought reasoning.
// Auto-expands during streaming, auto-collapses when complete.

function ReasoningPanel({ text }: { text: string; status: { type: string } }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const isStreaming = useThread((state) => state.isRunning)

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm transition-colors"
        aria-label={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            !isExpanded && '-rotate-90',
          )}
        />
        <span className={cn(isStreaming && 'animate-pulse')}>
          {isStreaming ? 'Thinking…' : 'Thought process'}
        </span>
      </button>
      {isExpanded && (
        <div className="border-muted-foreground/20 mt-1 ml-1 border-l-2 pl-3 animate-in fade-in-0 duration-200">
          <Markdown className="prose prose-neutral dark:prose-invert text-muted-foreground max-w-none text-sm leading-relaxed">
            {text}
          </Markdown>
        </div>
      )}
    </div>
  )
}

// ─── Tool Call Panel ─────────────────────────────────────────────────────────
// Wraps prompt-kit's <Tool> component and maps assistant-ui's state to ToolPart.

interface ToolCallProps {
  toolName: string
  argsText: string
  args?: Record<string, unknown>
  result?: unknown
  status: { type: string }
}

function ToolCallPanel({ toolName, argsText, args, result, status }: ToolCallProps) {
  const isRunning = useThread((s) => s.isRunning)

  // Map to prompt-kit ToolPart state
  const toolState: ToolPart['state'] = result !== undefined
    ? 'output-available'
    : isRunning
    ? 'input-streaming'
    : 'input-available'

  // Pretty-print tool name: "clickhouse-name_list_tables" → "list_tables"
  const displayName = toolName.includes('_')
    ? toolName.split('_').slice(1).join('_')
    : toolName

  // Parse the result into an output object for the Tool component
  let output: Record<string, unknown> | undefined
  if (result !== undefined) {
    try {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result
      output = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { result: parsed }
    } catch {
      output = { result: String(result) }
    }
  }

  const toolPart: ToolPart = {
    type: displayName,
    state: toolState,
    input: args && Object.keys(args).length > 0 ? args : undefined,
    output,
    toolCallId: undefined,
  }

  // Tool component from prompt-kit always adds mt-3; override it to mt-0
  // and let the .chat-block + .chat-block CSS rule handle inter-block spacing.
  return (
    <div className="chat-block">
      <Tool toolPart={toolPart} className="mt-0" />
    </div>
  )
}

// Shows animated dots ONLY while waiting for the first token.
// Once content starts streaming in, this disappears — no layout shift.

function StreamingDotsLoader() {
  const isRunning = useThread((state) => state.isRunning)
  const hasContent = useThread((state) => {
    const msgs = state.messages
    if (msgs.length === 0) return false
    const last = msgs[msgs.length - 1]
    // Hide as soon as ANY content part appears: text OR tool-call.
    // Previously only checked for text, so loader stayed visible
    // during the entire tool-call phase before the final text.
    return (
      last?.content?.some(
        (p: { type: string; text?: string }) =>
          (p.type === 'text' && (p.text?.length ?? 0) > 0) ||
          p.type === 'tool-call',
      ) ?? false
    )
  })

  if (!isRunning || hasContent) return null
  return <DotsLoader size="sm" className="min-h-7 items-center" />
}

// ─── User Message ───────────────────────────────────────────────────────────

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <div
        data-testid="user-message"
        role="article"
        aria-label="Your message"
        className="group/message mb-6 flex justify-end animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
      >
        <Message className="max-w-[75%] flex-row-reverse">
          <div className="flex flex-col items-end gap-1">
            <MessageContent
              className="bg-muted text-primary rounded-3xl px-5 py-2.5"
              data-testid="user-message-content"
            >
              <MessagePrimitive.Content />
            </MessageContent>

            {/* Actions — edit + copy, visible on hover */}
            <MessageActions className="text-muted-foreground flex h-7 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
              <ActionBarPrimitive.Root>
                {/* Edit */}
                <ActionBarPrimitive.Edit
                  data-testid="edit-message-btn"
                  aria-label="Edit message"
                  className={actionBtnClass}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </ActionBarPrimitive.Edit>

                {/* Copy */}
                <ActionBarPrimitive.Copy
                  data-testid="copy-user-message-btn"
                  aria-label="Copy message"
                  className={actionBtnClass}
                >
                  <Copy className="h-3.5 w-3.5" />
                </ActionBarPrimitive.Copy>
              </ActionBarPrimitive.Root>
            </MessageActions>
          </div>
        </Message>
      </div>
    </MessagePrimitive.Root>
  )
}

// ─── User Edit Composer ─────────────────────────────────────────────────────
// Replaces the user message bubble with an inline textarea when editing.
// Save & Submit truncates the thread and re-runs with the updated message.

function UserEditComposer() {
  return (
    <ComposerPrimitive.Root>
      <div
        data-testid="edit-composer"
        className="mb-6 flex justify-end animate-in fade-in-0 duration-200"
      >
        <div className="w-full max-w-[75%]">
          <div className="bg-muted rounded-2xl p-3">
            <ComposerPrimitive.Input
              className="bg-transparent text-primary w-full resize-none border-none text-base outline-none focus:ring-0"
              data-testid="edit-composer-input"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <ComposerPrimitive.Cancel asChild>
                <button
                  data-testid="edit-cancel-btn"
                  aria-label="Cancel editing"
                  className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </ComposerPrimitive.Cancel>
              <ComposerPrimitive.Send asChild>
                <button
                  data-testid="edit-save-btn"
                  aria-label="Save and resubmit"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save & Submit
                </button>
              </ComposerPrimitive.Send>
            </div>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
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
            className="bg-primary/10 text-primary border-border mt-0.5 h-7 w-7 border text-sm"
          />
          <div className="min-w-0 flex-1 space-y-2">
            {/* Dots loader — shown only while waiting for first token */}
            <MessagePrimitive.If last>
              <StreamingDotsLoader />
            </MessagePrimitive.If>

            <MessageContent className="bg-transparent p-0 text-foreground">
              {/* flex-col so .chat-block children stack and sibling CSS rules apply */}
              <div className="flex flex-col">
                <MessagePrimitive.Content
                  components={{
                    Text: ({ text }) => <MarkdownText text={text} />,
                    Reasoning: ({ text, status }) => (
                      <ReasoningPanel text={text} status={status} />
                    ),
                    tools: {
                      Override: ({ toolName, argsText, args, result, status }) => (
                        <ToolCallPanel
                          toolName={toolName}
                          argsText={argsText}
                          args={args as Record<string, unknown>}
                          result={result}
                          status={status}
                        />
                      ),
                    },
                  }}
                />
              </div>
            </MessageContent>

            {/* Actions — always in DOM to reserve space (no CLS), visible on hover */}
            <MessageActions className="text-muted-foreground flex h-8 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
              <ActionBarPrimitive.Root hideWhenRunning>
                {/* Copy */}
                <ActionBarPrimitive.Copy
                  data-testid="copy-message-btn"
                  aria-label="Copy message"
                  className={actionBtnClass}
                >
                  <Copy className="h-3.5 w-3.5" />
                </ActionBarPrimitive.Copy>

                {/* Regenerate */}
                <ActionBarPrimitive.Reload
                  data-testid="regenerate-btn"
                  aria-label="Regenerate response"
                  className={actionBtnClass}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </ActionBarPrimitive.Reload>

                {/* Thumbs Up */}
                <ActionBarPrimitive.FeedbackPositive
                  data-testid="feedback-positive-btn"
                  aria-label="Mark as helpful"
                  className={cn(actionBtnClass, 'data-[pressed]:text-green-500')}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </ActionBarPrimitive.FeedbackPositive>

                {/* Thumbs Down */}
                <ActionBarPrimitive.FeedbackNegative
                  data-testid="feedback-negative-btn"
                  aria-label="Mark as not helpful"
                  className={cn(actionBtnClass, 'data-[pressed]:text-red-500')}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </ActionBarPrimitive.FeedbackNegative>
              </ActionBarPrimitive.Root>

              {/* Branch navigation — shows when multiple branches exist */}
              <BranchPickerPrimitive.Root hideWhenSingleBranch>
                <BranchPickerPrimitive.Previous
                  data-testid="branch-prev-btn"
                  aria-label="Previous branch"
                  className={actionBtnClass}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </BranchPickerPrimitive.Previous>
                <span className="text-muted-foreground text-xs tabular-nums">
                  <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
                </span>
                <BranchPickerPrimitive.Next
                  data-testid="branch-next-btn"
                  aria-label="Next branch"
                  className={actionBtnClass}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </BranchPickerPrimitive.Next>
              </BranchPickerPrimitive.Root>
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
                UserEditComposer,
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
