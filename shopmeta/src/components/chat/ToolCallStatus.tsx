// src/components/chat/ToolCallStatus.tsx
// Tool call status display components for the chat UI.
// Shows spinner (running), success result, or error with retry button.
// Designed to be used with @assistant-ui/react's makeToolUI() or standalone.

import React from 'react'

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

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      data-testid="tool-spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: 'spin 1s linear infinite',
        display: 'inline-block',
      }}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// ─── Running State ────────────────────────────────────────────────────────────

export function ToolCallRunning({ toolName }: { toolName?: string }) {
  return (
    <div
      data-testid="tool-call-running"
      role="status"
      aria-label={toolName ? `Running tool: ${toolName}` : 'Running tool'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%))',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
        fontSize: '0.875rem',
        maxWidth: '480px',
      }}
    >
      <Spinner size={14} />
      <span>
        {toolName
          ? <>Running <code style={{ fontFamily: 'monospace', fontSize: '0.8em' }}>{toolName}</code>…</>
          : 'Running tool…'}
      </span>

      {/* Inline keyframes via a style tag for portability */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%))',
        border: '1px solid hsl(142 71% 45% / 0.3)',
        maxWidth: '640px',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: result !== undefined ? '8px' : 0,
        fontSize: '0.8rem',
        color: 'hsl(142 71% 45%)',
        fontWeight: 600,
      }}>
        {/* checkmark icon */}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{toolName ? `${toolName} succeeded` : 'Tool succeeded'}</span>
      </div>

      {/* Result body */}
      {result !== undefined && (
        <pre
          data-testid="tool-result-content"
          style={{
            margin: 0,
            padding: '8px',
            borderRadius: '4px',
            background: 'hsl(var(--background, 240 10% 3.9%))',
            fontSize: '0.78rem',
            overflowX: 'auto',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
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
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%))',
        border: '1px solid hsl(0 84.2% 60.2% / 0.4)',
        maxWidth: '640px',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        marginBottom: '8px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.8rem',
          color: 'hsl(0 84.2% 60.2%)',
          fontWeight: 600,
        }}>
          {/* X icon */}
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
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid hsl(0 84.2% 60.2% / 0.5)',
              background: 'transparent',
              color: 'hsl(0 84.2% 60.2%)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        )}
      </div>

      {/* Error message */}
      <pre
        data-testid="tool-error-message"
        style={{
          margin: 0,
          padding: '8px',
          borderRadius: '4px',
          background: 'hsl(0 84.2% 60.2% / 0.08)',
          fontSize: '0.78rem',
          color: 'hsl(0 84.2% 70%)',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
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
 *
 * @example
 * <ToolCallStatus status={{ type: 'running' }} toolName="clickhouse__run_select_query" />
 * <ToolCallStatus status={{ type: 'success', result: { rows: [...] } }} toolName="clickhouse__run_select_query" />
 * <ToolCallStatus status={{ type: 'error', error: 'Query failed', onRetry: handleRetry }} toolName="clickhouse__run_select_query" />
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
