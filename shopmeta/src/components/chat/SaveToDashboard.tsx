// src/components/chat/SaveToDashboard.tsx
// "Save to Dashboard" button + dashboard picker shown below tool results in chat.
// Creates a widget from the current ToolCallRenderer result via saveToDashboard server fn.
// Restyled with Tailwind classes (prompt-kit migration).

import React, { useState, useCallback } from 'react'
import { suggestChart } from '#/lib/utils/suggestChart'
import type { WidgetType, ChartConfig } from '#/lib/widgets'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaveToDashboardProps {
  sql: string
  rows: Array<Record<string, unknown>>
  dashboards?: Array<{ id: string; name: string }>
  onSaved?: (widgetId: string) => void
  className?: string
}

export interface DashboardOption {
  id: string
  name: string
}

// ─── SaveToDashboard ──────────────────────────────────────────────────────────

export function SaveToDashboard({ sql, rows, dashboards = [], onSaved, className }: SaveToDashboardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDashboardId, setSelectedDashboardId] = useState(dashboards[0]?.id ?? '')
  const [widgetName, setWidgetName] = useState('')
  const [widgetType, setWidgetType] = useState<WidgetType>(() => {
    const suggestion = rows.length > 0 ? suggestChart(rows) : null
    return suggestion ? 'chart' : rows.length === 1 ? 'kpi' : 'table'
  })
  const [saving, setSaving] = useState(false)
  const [savedWidgetId, setSavedWidgetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const suggestedChart = rows.length > 0 ? suggestChart(rows) : null

  const handleSave = useCallback(async () => {
    if (!selectedDashboardId) {
      setError('Please select a dashboard')
      return
    }
    const name = widgetName.trim() || 'Unnamed Widget'
    setError(null)
    setSaving(true)

    try {
      const { saveToDashboard } = await import('#/lib/widgets')

      let chartConfig: ChartConfig | undefined
      if (widgetType === 'chart' && suggestedChart) {
        chartConfig = {
          chartType: suggestedChart.type as ChartConfig['chartType'],
          xAxis: suggestedChart.xAxis,
          yAxis: [suggestedChart.yAxis],
          title: name,
        }
      }

      const widget = await saveToDashboard({
        dashboardId: selectedDashboardId,
        name,
        type: widgetType,
        sql,
        chartConfig,
        cachedRows: rows.slice(0, 1000),
      })

      setSavedWidgetId(widget.id)
      onSaved?.(widget.id)
      setIsOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save widget')
    } finally {
      setSaving(false)
    }
  }, [selectedDashboardId, widgetName, widgetType, sql, rows, suggestedChart, onSaved])

  // ── Saved confirmation ──────────────────────────────────────────────────────

  if (savedWidgetId) {
    return (
      <div
        data-testid="save-to-dashboard-saved"
        className="inline-flex items-center gap-1.5 rounded border border-green-500/40 bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-400"
      >
        Saved to dashboard
      </div>
    )
  }

  // ── Save button (collapsed) ─────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <button
        data-testid="save-to-dashboard"
        onClick={() => setIsOpen(true)}
        className={cn(
          'border-border text-muted-foreground inline-flex cursor-pointer items-center gap-1.5 rounded border bg-transparent px-2.5 py-1 text-xs transition-colors hover:text-foreground',
          className,
        )}
      >
        <span aria-hidden="true">+</span>
        Save to Dashboard
      </button>
    )
  }

  // ── Expanded picker form ────────────────────────────────────────────────────

  return (
    <div
      data-testid="save-to-dashboard-form"
      className="bg-muted/50 border-border flex flex-col gap-2.5 rounded-md border p-3 text-[0.82rem]"
    >
      <div className="text-[0.82rem] font-semibold">Save to Dashboard</div>

      {/* Dashboard picker */}
      {dashboards.length > 0 ? (
        <div>
          <label htmlFor="dashboard-picker" className="text-muted-foreground text-xs">
            Dashboard
          </label>
          <select
            id="dashboard-picker"
            data-testid="dashboard-picker"
            value={selectedDashboardId}
            onChange={(e) => setSelectedDashboardId(e.target.value)}
            className="bg-muted border-border text-foreground mt-1 w-full rounded border px-2 py-1.5 text-[0.82rem]"
          >
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-muted-foreground">
          No dashboards found. <a href="/dashboard" className="text-primary hover:underline">Create one</a>
        </div>
      )}

      {/* Widget name */}
      <div>
        <label htmlFor="save-widget-name" className="text-muted-foreground text-xs">
          Widget Name
        </label>
        <input
          id="save-widget-name"
          data-testid="save-widget-name"
          type="text"
          value={widgetName}
          onChange={(e) => setWidgetName(e.target.value)}
          placeholder="e.g. Monthly Revenue"
          className="bg-muted border-border text-foreground mt-1 box-border w-full rounded border px-2 py-1.5 text-[0.82rem]"
        />
      </div>

      {/* Widget type */}
      <div>
        <span className="text-muted-foreground text-xs">Type</span>
        <div className="mt-1 flex gap-1.5">
          {(['chart', 'table', 'kpi'] as WidgetType[]).map((t) => (
            <button
              key={t}
              data-testid={`save-type-${t}`}
              onClick={() => setWidgetType(t)}
              className={cn(
                'cursor-pointer rounded border px-2.5 py-1 text-xs capitalize',
                widgetType === t
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground bg-transparent hover:bg-muted',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          data-testid="save-to-dashboard-error"
          className="text-xs text-red-400"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <button
          data-testid="save-widget-cancel"
          onClick={() => setIsOpen(false)}
          className="border-border text-muted-foreground cursor-pointer rounded border bg-transparent px-3 py-1.5 text-xs transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <button
          data-testid="save-widget"
          onClick={handleSave}
          disabled={saving || !selectedDashboardId}
          className={cn(
            'rounded border-none px-3.5 py-1.5 text-xs font-semibold text-white',
            saving
              ? 'bg-primary/70 cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 cursor-pointer',
          )}
        >
          {saving ? 'Saving…' : 'Save Widget'}
        </button>
      </div>
    </div>
  )
}
