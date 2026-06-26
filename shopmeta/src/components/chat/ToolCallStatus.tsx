// src/components/chat/ToolCallStatus.tsx
// Tool call status display components for the chat UI.
// Shows spinner (running), success result, or error with retry button.
// Designed to be used with @assistant-ui/react's makeToolUI() or standalone.
// Restyled with Tailwind classes (prompt-kit migration).

import React from 'react'
import { Loader } from '@/components/ui/loader'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolCallState =
  | { type: 'running' }
  | { type: 'success'; result?: unknown }
  | { type: 'error'; error: string; onRetry?: () => void }

export interface ToolCallStatusProps {
  /** Current state of the tool call */
  status: ToolCallState
  /** Tool name (e.g. "clickhouse__run_select_query") */
  toolName?: string
  /** Args passed to the tool */
  args?: unknown
  /** Optional custom class name */
  className?: string
}

// ─── Running State ────────────────────────────────────────────────────────────

export function ToolCallRunning({ toolName }: { toolName?: string }) {
  return (
    <div
      data-testid="tool-call-running"
      role="status"
      aria-label={toolName ? `Running tool: ${toolName}` : 'Running tool'}
      className="bg-muted border-border text-muted-foreground flex max-w-[480px] items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm"
    >
      <Loader variant="dots" size="sm" />
      <span>
        {toolName
          ? <>Running <code className="font-mono text-xs">{toolName}</code>…</>
          : 'Running tool…'}
      </span>
    </div>
  )
}

// ─── Success State ────────────────────────────────────────────────────────────

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return '(no result)'
  if (typeof result === 'string') return result
  if (typeof result === 'number' || typeof result === 'boolean') return String(result)
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export function ToolCallSuccess({
  toolName,
  result,
}: {
  toolName?: string
  result?: unknown
}) {
  return (
    <div
      data-testid="tool-call-success"
      role="region"
      aria-label={toolName ? `Tool result: ${toolName}` : 'Tool result'}
      className="bg-muted max-w-[640px] rounded-lg border border-green-500/30 px-3.5 py-2.5"
    >
      {/* Header */}
      <div className={cn(
        'flex items-center gap-1.5 text-xs font-semibold text-green-500',
        result !== undefined && 'mb-2',
      )}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{toolName ? `${toolName} succeeded` : 'Tool succeeded'}</span>
      </div>

      {/* Result body */}
      {result !== undefined && (
        <pre
          data-testid="tool-result-content"
          className="bg-background text-foreground m-0 overflow-x-auto whitespace-pre-wrap break-words rounded p-2 font-mono text-xs"
        >
          {formatResult(result)}
        </pre>
      )}
    </div>
  )
}

// ─── Error State ──────────────────────────────────────────────────────────────

export function ToolCallError({
  toolName,
  error,
  onRetry,
}: {
  toolName?: string
  error: string
  onRetry?: () => void
}) {
  return (
    <div
      data-testid="tool-call-error"
      role="alert"
      aria-label={toolName ? `Tool error: ${toolName}` : 'Tool error'}
      className="bg-muted max-w-[640px] rounded-lg border border-destructive/40 px-3.5 py-2.5"
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-destructive flex items-center gap-1.5 text-xs font-semibold">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx={12} cy={12} r={10} />
            <line x1={15} y1={9} x2={9} y2={15} />
            <line x1={9} y1={9} x2={15} y2={15} />
          </svg>
          <span>{toolName ? `${toolName} failed` : 'Tool failed'}</span>
        </div>

        {onRetry && (
          <button
            data-testid="tool-retry-button"
            onClick={onRetry}
            aria-label="Retry tool call"
            className="text-destructive border-destructive/50 cursor-pointer rounded border bg-transparent px-2.5 py-1 text-xs font-medium transition-colors hover:bg-destructive/10"
          >
            Retry
          </button>
        )}
      </div>

      {/* Error message */}
      <pre
        data-testid="tool-error-message"
        className="m-0 overflow-x-auto whitespace-pre-wrap break-words rounded bg-destructive/[0.08] p-2 font-mono text-xs text-red-400"
      >
        {error}
      </pre>
    </div>
  )
}

// ─── Main Component (unified) ─────────────────────────────────────────────────

/**
 * Unified tool call status display.
 * Renders the appropriate sub-component based on `status.type`.
 */
export function ToolCallStatus({ status, toolName, className }: ToolCallStatusProps) {
  return (
    <div className={className} data-tool-name={toolName}>
      {status.type === 'running' && <ToolCallRunning toolName={toolName} />}
      {status.type === 'success' && <ToolCallSuccess toolName={toolName} result={status.result} />}
      {status.type === 'error' && (
        <ToolCallError
          toolName={toolName}
          error={status.error}
          onRetry={status.onRetry}
        />
      )}
    </div>
  )
}
