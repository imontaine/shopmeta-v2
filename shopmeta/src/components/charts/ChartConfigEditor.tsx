// src/components/charts/ChartConfigEditor.tsx
// Allows users to customize chart type, x-axis, y-axis columns, and title.
// Re-renders the chart preview when configuration changes.

import React, { useState } from 'react'
import type { ChartConfig, ChartType } from '#/lib/utils/suggestChart'

export interface ChartConfigEditorProps {
  /** Initial chart config (from suggestChart) */
  config: ChartConfig
  /** All available column keys from the data */
  columns: string[]
  /** Called whenever the configuration changes */
  onChange: (config: ChartConfig) => void
  className?: string
}

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
]

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid hsl(var(--border, 240 3.7% 25%))',
  background: 'hsl(var(--muted, 240 4.8% 15.88%))',
  color: 'hsl(var(--foreground, 0 0% 98%))',
  fontSize: '0.8rem',
  width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  display: 'block',
  marginBottom: '3px',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

export function ChartConfigEditor({
  config,
  columns,
  onChange,
  className,
}: ChartConfigEditorProps) {
  const [local, setLocal] = useState<ChartConfig>(config)

  function update(patch: Partial<ChartConfig>) {
    const next = { ...local, ...patch }
    setLocal(next)
    onChange(next)
  }

  // For y-axis, allow toggling multiple columns
  function toggleYAxis(col: string) {
    const current = local.yAxis
    const next = current.includes(col)
      ? current.filter((c) => c !== col)
      : [...current, col]
    if (next.length === 0) return // Keep at least one y-axis
    update({ yAxis: next })
  }

  const numericCols = columns.filter((c) => c !== local.xAxis)

  return (
    <div
      data-testid="chart-config-editor"
      className={className}
      style={{
        padding: '12px',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        borderRadius: '8px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Title */}
      <div style={fieldStyle}>
        <label htmlFor="chart-title-input" style={labelStyle}>
          Chart Title
        </label>
        <input
          id="chart-title-input"
          data-testid="chart-title-input"
          type="text"
          value={local.title ?? ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Chart title..."
          style={{ ...selectStyle, padding: '4px 8px' }}
        />
      </div>

      {/* Chart Type */}
      <div style={fieldStyle}>
        <label htmlFor="chart-type-select" style={labelStyle}>
          Chart Type
        </label>
        <select
          id="chart-type-select"
          data-testid="chart-type-select"
          value={local.type}
          onChange={(e) => update({ type: e.target.value as ChartType })}
          style={selectStyle}
        >
          {CHART_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      {/* X Axis */}
      <div style={fieldStyle}>
        <label htmlFor="chart-xaxis-select" style={labelStyle}>
          X Axis
        </label>
        <select
          id="chart-xaxis-select"
          data-testid="chart-xaxis-select"
          value={local.xAxis}
          onChange={(e) => update({ xAxis: e.target.value })}
          style={selectStyle}
        >
          {columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </div>

      {/* Y Axis (multi-select via checkboxes) */}
      <div style={fieldStyle}>
        <span style={labelStyle}>Y Axis (values)</span>
        <div
          data-testid="chart-yaxis-group"
          role="group"
          aria-label="Y axis columns"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '4px',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '4px',
          }}
        >
          {numericCols.map((col) => (
            <label
              key={col}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                color: 'hsl(var(--foreground, 0 0% 98%))',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid={`yaxis-toggle-${col}`}
                checked={local.yAxis.includes(col)}
                onChange={() => toggleYAxis(col)}
              />
              {col}
            </label>
          ))}
          {numericCols.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
              No other columns available
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
