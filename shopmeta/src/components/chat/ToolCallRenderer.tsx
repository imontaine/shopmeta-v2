// src/components/chat/ToolCallRenderer.tsx
// Tabbed tool result renderer for run_select_query results.
// Combines DataTableView (Unit 9) + ChartView (Unit 10) + SQL display + stats bar.
//
// Tab structure:
//   📊 Chart   — auto-suggested chart (only shown when suggestChart returns non-null)
//   📋 Result  — DataTableView of query rows
//   🔍 Query   — SQL with syntax highlighting + copy button
//
// Stats bar: elapsed time, row count, bytes scanned, status badge.

import React, { useState, useRef, useCallback } from 'react'
import { DataTableView } from '#/components/chat/DataTableView'
import { ChartView } from '#/components/charts/ChartView'
import { suggestChart } from '#/lib/utils/suggestChart'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueryMetrics {
  /** Query elapsed time in seconds */
  elapsed?: number
  /** Number of rows read by ClickHouse */
  rows_read?: number
  /** Bytes read by ClickHouse */
  bytes_read?: number
  /** Number of rows returned in the result */
  row_count?: number
}

export type ToolResultStatus =
  | { type: 'complete' }
  | { type: 'error'; message: string }
  | { type: 'running' }

export interface QueryToolResult {
  /** The result rows from the query */
  rows: Array<Record<string, unknown>>
  /** Query execution metrics */
  metrics?: QueryMetrics
  /** Optional raw SQL query string */
  query?: string
  /** Error message (when the tool call errored) */
  error?: string
}

export interface ToolCallRendererProps {
  /** Parsed tool result from run_select_query */
  result: QueryToolResult
  /** The tool call arguments (contains the original SQL query) */
  args?: { query?: string; [key: string]: unknown }
  /** Current status of the tool call */
  status: ToolResultStatus
  className?: string
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'chart' | 'result' | 'query'

interface Tab {
  id: TabId
  label: string
  icon: string
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatElapsed(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  return `${seconds.toFixed(2)}s`
}

interface StatsBarProps {
  metrics: QueryMetrics
  status: ToolResultStatus
  rowCount: number
}

function StatsBar({ metrics, status, rowCount }: StatsBarProps) {
  const isError = status.type === 'error'
  const isRunning = status.type === 'running'

  const statStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.72rem',
    color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'hsl(var(--muted-foreground, 240 5% 64.9%) / 0.7)',
  }

  return (
    <div
      data-testid="stats-bar"
      role="status"
      aria-label="Query metrics"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '6px 12px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.5)',
        borderRadius: '6px',
        borderBottom: '1px solid hsl(var(--border, 240 3.7% 25%))',
        flexWrap: 'wrap',
      }}
    >
      {/* Status badge */}
      <span
        data-testid="stats-status"
        style={{
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '0.68rem',
          fontWeight: 600,
          background: isError
            ? 'hsl(0 72% 51% / 0.15)'
            : isRunning
            ? 'hsl(38 92% 50% / 0.15)'
            : 'hsl(142 76% 36% / 0.15)',
          color: isError
            ? 'hsl(0 72% 70%)'
            : isRunning
            ? 'hsl(38 92% 60%)'
            : 'hsl(142 76% 56%)',
          border: `1px solid ${
            isError
              ? 'hsl(0 72% 51% / 0.4)'
              : isRunning
              ? 'hsl(38 92% 50% / 0.4)'
              : 'hsl(142 76% 36% / 0.4)'
          }`,
        }}
      >
        {isError ? 'Error' : isRunning ? 'Running…' : 'Complete'}
      </span>

      {/* Row count */}
      <div style={statStyle} data-testid="stats-rows">
        <span style={labelStyle}>Rows</span>
        <span>{rowCount.toLocaleString('en-US')}</span>
      </div>

      {/* Elapsed */}
      {metrics.elapsed !== undefined && (
        <div style={statStyle} data-testid="stats-elapsed">
          <span style={labelStyle}>Time</span>
          <span>{formatElapsed(metrics.elapsed)}</span>
        </div>
      )}

      {/* Bytes scanned */}
      {metrics.bytes_read !== undefined && (
        <div style={statStyle} data-testid="stats-bytes">
          <span style={labelStyle}>Scanned</span>
          <span>{formatBytes(metrics.bytes_read)}</span>
        </div>
      )}

      {/* Rows read (ClickHouse specific) */}
      {metrics.rows_read !== undefined && (
        <div style={statStyle} data-testid="stats-rows-read">
          <span style={labelStyle}>Read</span>
          <span>{metrics.rows_read.toLocaleString('en-US')} rows</span>
        </div>
      )}
    </div>
  )
}

// ─── QueryDisplay ─────────────────────────────────────────────────────────────

interface QueryDisplayProps {
  sql: string
}

function QueryDisplay({ sql }: QueryDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
    }
  }, [sql])

  // Simple SQL keyword highlighting using spans
  // Avoids a full syntax highlighter dependency
  const highlighted = highlightSQL(sql)

  return (
    <div
      data-testid="query-display"
      style={{ position: 'relative' }}
    >
      <button
        data-testid="copy-sql-button"
        onClick={handleCopy}
        aria-label="Copy SQL to clipboard"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '3px 10px',
          fontSize: '0.72rem',
          borderRadius: '4px',
          border: '1px solid hsl(var(--border, 240 3.7% 25%))',
          background: 'hsl(var(--muted, 240 4.8% 15.88%))',
          color: copied
            ? 'hsl(142 76% 56%)'
            : 'hsl(var(--foreground, 0 0% 98%))',
          cursor: 'pointer',
          transition: 'color 0.15s ease',
        }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>

      <pre
        data-testid="sql-code-block"
        style={{
          margin: 0,
          padding: '12px',
          paddingRight: '80px',
          background: 'hsl(var(--muted, 240 4.8% 15.88%))',
          borderRadius: '6px',
          fontSize: '0.8rem',
          fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
          overflowX: 'auto',
          lineHeight: 1.6,
          color: 'hsl(var(--foreground, 0 0% 98%))',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}

// ─── SQL Syntax Highlighter (lightweight, no deps) ────────────────────────────

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'CROSS JOIN',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN',
  'DISTINCT', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'WITH', 'UNION', 'INTERSECT', 'EXCEPT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CREATE', 'TABLE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER',
  'ARRAY', 'TUPLE', 'toDate', 'toString', 'toUInt64', 'formatDateTime',
]

function highlightSQL(sql: string): string {
  // Escape HTML first
  let result = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Highlight strings (single-quoted)
  result = result.replace(/'([^']*)'/g, '<span style="color:hsl(160 60% 60%)">&apos;$1&apos;</span>')

  // Highlight numbers
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color:hsl(35 90% 65%)">$1</span>')

  // Highlight keywords (case-insensitive)
  for (const kw of SQL_KEYWORDS) {
    const pattern = new RegExp(`\\b(${kw})\\b`, 'gi')
    result = result.replace(
      pattern,
      '<span style="color:hsl(220 70% 75%);font-weight:600">$1</span>',
    )
  }

  // Highlight comments
  result = result.replace(/(--[^\n]*)/g, '<span style="color:hsl(240 5% 50%)">$1</span>')

  return result
}

// ─── ToolCallRenderer ─────────────────────────────────────────────────────────

export function ToolCallRenderer({
  result,
  args,
  status,
  className,
}: ToolCallRendererProps) {
  const { rows = [], metrics = {}, query: resultQuery, error } = result

  // The SQL is either in result.query or in args.query
  const sql = resultQuery ?? args?.query ?? ''

  // Determine if data is chartable (used to decide Chart tab visibility)
  const chartConfig = rows.length > 0 ? suggestChart(rows) : null
  const isChartable = chartConfig !== null

  // Build tab list
  const tabs: Tab[] = [
    ...(isChartable ? [{ id: 'chart' as TabId, label: 'Chart', icon: '📊' }] : []),
    { id: 'result', label: 'Result', icon: '📋' },
    { id: 'query', label: 'Query', icon: '🔍' },
  ]

  // Default: Chart if chartable, otherwise Result
  const defaultTab: TabId = isChartable ? 'chart' : 'result'
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  const rowCount = rows.length

  // ─── Error State ────────────────────────────────────────────────────────────

  if (status.type === 'error' || error) {
    const errorMessage = status.type === 'error'
      ? status.message
      : error ?? 'Unknown error'

    return (
      <div
        data-testid="tool-call-renderer-error"
        className={className}
        style={{
          borderRadius: '8px',
          border: '1px solid hsl(0 72% 51% / 0.4)',
          overflow: 'hidden',
        }}
      >
        <StatsBar metrics={metrics} status={status} rowCount={rowCount} />
        <div
          style={{
            padding: '12px',
            color: 'hsl(0 72% 70%)',
            fontSize: '0.85rem',
          }}
        >
          {errorMessage}
        </div>
        {sql && (
          <div style={{ padding: '0 12px 12px' }}>
            <QueryDisplay sql={sql} />
          </div>
        )}
      </div>
    )
  }

  // ─── Main Tabbed UI ─────────────────────────────────────────────────────────

  return (
    <div
      data-testid="tool-call-renderer"
      className={className}
      style={{
        borderRadius: '8px',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        overflow: 'hidden',
        background: 'hsl(var(--background, 240 10% 3.9%))',
      }}
    >
      {/* Stats Bar */}
      <StatsBar metrics={metrics} status={status} rowCount={rowCount} />

      {/* Tab Bar */}
      <div
        data-testid="tab-bar"
        role="tablist"
        aria-label="Query result tabs"
        style={{
          display: 'flex',
          borderBottom: '1px solid hsl(var(--border, 240 3.7% 25%))',
          background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.3)',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              data-testid={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-label={`${tab.label} tab`}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 14px',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid hsl(220 70% 65%)'
                  : '2px solid transparent',
                background: 'transparent',
                color: isActive
                  ? 'hsl(var(--foreground, 0 0% 98%))'
                  : 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      <div
        id={`tabpanel-chart`}
        role="tabpanel"
        data-testid="tabpanel-chart"
        aria-label="Chart"
        hidden={activeTab !== 'chart'}
        style={{ padding: '12px' }}
      >
        {isChartable && (
          <ChartView rows={rows} initialConfig={chartConfig ?? undefined} height={280} />
        )}
      </div>

      <div
        id={`tabpanel-result`}
        role="tabpanel"
        data-testid="tabpanel-result"
        aria-label="Result"
        hidden={activeTab !== 'result'}
        style={{ padding: '12px' }}
      >
        <DataTableView rows={rows} pageSize={25} />
      </div>

      <div
        id={`tabpanel-query`}
        role="tabpanel"
        data-testid="tabpanel-query"
        aria-label="Query"
        hidden={activeTab !== 'query'}
        style={{ padding: '12px' }}
      >
        {sql ? (
          <QueryDisplay sql={sql} />
        ) : (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
              fontSize: '0.85rem',
            }}
          >
            No SQL query available
          </div>
        )}
      </div>
    </div>
  )
}
