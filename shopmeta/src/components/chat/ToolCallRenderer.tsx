// src/components/chat/ToolCallRenderer.tsx
// Tabbed tool result renderer for run_select_query results.
// Combines DataTableView + ChartView + SQL display + stats bar.
// Restyled with Tailwind classes (prompt-kit migration).

import React, { useState, useCallback } from 'react'
import { DataTableView } from '#/components/chat/DataTableView'
import { ChartView } from '#/components/charts/ChartView'
import { suggestChart } from '#/lib/utils/suggestChart'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueryMetrics {
  elapsed?: number
  rows_read?: number
  bytes_read?: number
  row_count?: number
}

export type ToolResultStatus =
  | { type: 'complete' }
  | { type: 'error'; message: string }
  | { type: 'running' }

export interface QueryToolResult {
  rows: Array<Record<string, unknown>>
  metrics?: QueryMetrics
  query?: string
  error?: string
}

export interface ToolCallRendererProps {
  result: QueryToolResult
  args?: { query?: string; [key: string]: unknown }
  status: ToolResultStatus
  className?: string
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'chart' | 'result' | 'query'

interface Tab {
  id: TabId
  label: string
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

  return (
    <div
      data-testid="stats-bar"
      role="status"
      aria-label="Query metrics"
      className="bg-muted/50 border-border flex flex-wrap items-center gap-4 rounded-md border-b px-3 py-1.5"
    >
      {/* Status badge */}
      <span
        data-testid="stats-status"
        className={cn(
          'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold',
          isError && 'border-destructive/40 bg-destructive/15 text-red-400',
          isRunning && 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400',
          !isError && !isRunning && 'border-green-500/40 bg-green-500/15 text-green-400',
        )}
      >
        {isError ? 'Error' : isRunning ? 'Running…' : 'Complete'}
      </span>

      {/* Row count */}
      <div className="text-muted-foreground flex items-center gap-1 text-xs" data-testid="stats-rows">
        <span className="text-muted-foreground/70 text-[0.68rem] uppercase tracking-wider">Rows</span>
        <span>{rowCount.toLocaleString('en-US')}</span>
      </div>

      {/* Elapsed */}
      {metrics.elapsed !== undefined && (
        <div className="text-muted-foreground flex items-center gap-1 text-xs" data-testid="stats-elapsed">
          <span className="text-muted-foreground/70 text-[0.68rem] uppercase tracking-wider">Time</span>
          <span>{formatElapsed(metrics.elapsed)}</span>
        </div>
      )}

      {/* Bytes scanned */}
      {metrics.bytes_read !== undefined && (
        <div className="text-muted-foreground flex items-center gap-1 text-xs" data-testid="stats-bytes">
          <span className="text-muted-foreground/70 text-[0.68rem] uppercase tracking-wider">Scanned</span>
          <span>{formatBytes(metrics.bytes_read)}</span>
        </div>
      )}

      {/* Rows read (ClickHouse specific) */}
      {metrics.rows_read !== undefined && (
        <div className="text-muted-foreground flex items-center gap-1 text-xs" data-testid="stats-rows-read">
          <span className="text-muted-foreground/70 text-[0.68rem] uppercase tracking-wider">Read</span>
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

  const highlighted = highlightSQL(sql)

  return (
    <div data-testid="query-display" className="relative">
      <button
        data-testid="copy-sql-button"
        onClick={handleCopy}
        aria-label="Copy SQL to clipboard"
        className={cn(
          'border-border bg-muted absolute top-2 right-2 cursor-pointer rounded border px-2.5 py-0.5 text-xs transition-colors',
          copied ? 'text-green-400' : 'text-foreground',
        )}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>

      <pre
        data-testid="sql-code-block"
        className="bg-muted text-foreground m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-md p-3 pr-20 font-mono text-[0.8rem] leading-relaxed"
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
  let result = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Highlight strings (single-quoted)
  result = result.replace(/'([^']*)'/g, '<span class="text-emerald-400">&apos;$1&apos;</span>')

  // Highlight numbers
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-amber-400">$1</span>')

  // Highlight keywords (case-insensitive)
  for (const kw of SQL_KEYWORDS) {
    const pattern = new RegExp(`\\b(${kw})\\b`, 'gi')
    result = result.replace(
      pattern,
      '<span class="text-blue-400 font-semibold">$1</span>',
    )
  }

  // Highlight comments
  result = result.replace(/(--[^\n]*)/g, '<span class="text-muted-foreground">$1</span>')

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

  const sql = resultQuery ?? args?.query ?? ''
  const chartConfig = rows.length > 0 ? suggestChart(rows) : null
  const isChartable = chartConfig !== null

  const tabs: Tab[] = [
    ...(isChartable ? [{ id: 'chart' as TabId, label: 'Chart' }] : []),
    { id: 'result', label: 'Result' },
    { id: 'query', label: 'Query' },
  ]

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
        className={cn('overflow-hidden rounded-lg border border-destructive/40', className)}
      >
        <StatsBar metrics={metrics} status={status} rowCount={rowCount} />
        <div className="p-3 text-[0.85rem] text-red-400">
          {errorMessage}
        </div>
        {sql && (
          <div className="px-3 pb-3">
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
      className={cn('bg-background border-border overflow-hidden rounded-lg border', className)}
    >
      {/* Stats Bar */}
      <StatsBar metrics={metrics} status={status} rowCount={rowCount} />

      {/* Tab Bar */}
      <div
        data-testid="tab-bar"
        role="tablist"
        aria-label="Query result tabs"
        className="bg-muted/30 border-border flex border-b"
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
              className={cn(
                'cursor-pointer whitespace-nowrap border-b-2 bg-transparent px-3.5 py-2 text-[0.8rem] transition-all',
                isActive
                  ? 'text-foreground border-primary font-semibold'
                  : 'text-muted-foreground border-transparent font-normal hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      <div
        id="tabpanel-chart"
        role="tabpanel"
        data-testid="tabpanel-chart"
        aria-label="Chart"
        hidden={activeTab !== 'chart'}
        className="p-3"
      >
        {isChartable && (
          <ChartView rows={rows} initialConfig={chartConfig ?? undefined} height={280} />
        )}
      </div>

      <div
        id="tabpanel-result"
        role="tabpanel"
        data-testid="tabpanel-result"
        aria-label="Result"
        hidden={activeTab !== 'result'}
        className="p-3"
      >
        <DataTableView rows={rows} pageSize={25} />
      </div>

      <div
        id="tabpanel-query"
        role="tabpanel"
        data-testid="tabpanel-query"
        aria-label="Query"
        hidden={activeTab !== 'query'}
        className="p-3"
      >
        {sql ? (
          <QueryDisplay sql={sql} />
        ) : (
          <div className="text-muted-foreground p-3 text-center text-[0.85rem]">
            No SQL query available
          </div>
        )}
      </div>
    </div>
  )
}
