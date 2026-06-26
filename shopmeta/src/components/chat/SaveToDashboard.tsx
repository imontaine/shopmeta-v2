// src/components/chat/SaveToDashboard.tsx
// "Save to Dashboard" button + dashboard picker shown below tool results in chat.
// Creates a widget from the current ToolCallRenderer result via saveToDashboard server fn.
//
// Usage: place below a ToolCallRenderer when the tool call is run_select_query.
// Props: the tool result rows, SQL query, and optional chart config.

import React, { useState, useCallback } from 'react'
import { suggestChart } from '#/lib/utils/suggestChart'
import type { WidgetType, ChartConfig } from '#/lib/widgets'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaveToDashboardProps {
  /** The SQL query that produced the result */
  sql: string
  /** The result rows */
  rows: Array<Record<string, unknown>>
  /** Optional override: list of dashboards the user can pick from */
  dashboards?: Array<{ id: string; name: string }>
  /** Called after the widget is successfully saved. Receives the created widget ID. */
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

  // Auto-suggest chart config from rows
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
        cachedRows: rows.slice(0, 1000), // seed with first 1000 rows
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '4px',
          background: 'hsl(142 76% 36% / 0.15)',
          border: '1px solid hsl(142 76% 36% / 0.4)',
          color: 'hsl(142 76% 56%)',
          fontSize: '0.78rem',
          fontWeight: 600,
        }}
      >
        ✓ Saved to dashboard
      </div>
    )
  }

  // ── Save button (collapsed) ─────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <button
        data-testid="save-to-dashboard"
        onClick={() => setIsOpen(true)}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          fontSize: '0.78rem',
          border: '1px solid hsl(var(--border, 240 3.7% 25%))',
          borderRadius: '4px',
          background: 'transparent',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span aria-hidden="true">📌</span>
        Save to Dashboard
      </button>
    )
  }

  // ── Expanded picker form ────────────────────────────────────────────────────

  return (
    <div
      data-testid="save-to-dashboard-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.5)',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        borderRadius: '6px',
        fontSize: '0.82rem',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>📌 Save to Dashboard</div>

      {/* Dashboard picker */}
      {dashboards.length > 0 ? (
        <div>
          <label htmlFor="dashboard-picker" style={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
            Dashboard
          </label>
          <select
            id="dashboard-picker"
            data-testid="dashboard-picker"
            value={selectedDashboardId}
            onChange={(e) => setSelectedDashboardId(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px',
              marginTop: '3px',
              background: 'hsl(var(--muted, 240 4.8% 15.88%))',
              border: '1px solid hsl(var(--border, 240 3.7% 25%))',
              borderRadius: '4px',
              color: 'hsl(var(--foreground, 0 0% 98%))',
              fontSize: '0.82rem',
            }}
          >
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
          No dashboards found. <a href="/dashboard" style={{ color: 'hsl(220 70% 65%)' }}>Create one</a>
        </div>
      )}

      {/* Widget name */}
      <div>
        <label htmlFor="save-widget-name" style={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
          Widget Name
        </label>
        <input
          id="save-widget-name"
          data-testid="save-widget-name"
          type="text"
          value={widgetName}
          onChange={(e) => setWidgetName(e.target.value)}
          placeholder="e.g. Monthly Revenue"
          style={{
            width: '100%',
            marginTop: '3px',
            padding: '5px 8px',
            background: 'hsl(var(--muted, 240 4.8% 15.88%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '4px',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            fontSize: '0.82rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Widget type */}
      <div>
        <span style={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>Type</span>
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          {(['chart', 'table', 'kpi'] as WidgetType[]).map((t) => (
            <button
              key={t}
              data-testid={`save-type-${t}`}
              onClick={() => setWidgetType(t)}
              style={{
                padding: '3px 10px',
                border: `1px solid ${widgetType === t ? 'hsl(220 70% 65%)' : 'hsl(var(--border, 240 3.7% 25%))'}`,
                borderRadius: '4px',
                background: widgetType === t ? 'hsl(220 70% 65% / 0.15)' : 'transparent',
                color: widgetType === t ? 'hsl(220 70% 75%)' : 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                cursor: 'pointer',
                fontSize: '0.75rem',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          data-testid="save-to-dashboard-error"
          style={{ color: 'hsl(0 72% 70%)', fontSize: '0.78rem' }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          data-testid="save-widget-cancel"
          onClick={() => setIsOpen(false)}
          style={{
            padding: '5px 12px',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '4px',
            background: 'transparent',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
            cursor: 'pointer',
            fontSize: '0.78rem',
          }}
        >
          Cancel
        </button>
        <button
          data-testid="save-widget"
          onClick={handleSave}
          disabled={saving || !selectedDashboardId}
          style={{
            padding: '5px 14px',
            border: 'none',
            borderRadius: '4px',
            background: saving ? 'hsl(220 70% 50%)' : 'hsl(220 70% 60%)',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving…' : 'Save Widget'}
        </button>
      </div>
    </div>
  )
}
