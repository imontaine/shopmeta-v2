// src/components/dashboard/WidgetEditModal.tsx
// Modal for editing a widget's name, SQL query, chart config, and type.
// Used from Widget.tsx's edit button (onEdit callback).

import React, { useState, useCallback } from 'react'
import type { WidgetType, ChartConfig } from '#/lib/widgets'

export interface WidgetEditValues {
  name: string
  type: WidgetType
  sql: string
  chartConfig: ChartConfig | null
}

export interface WidgetEditModalProps {
  /** Initial values to populate the form */
  initialValues: WidgetEditValues
  /** Called when the user submits the form with the new values */
  onSave: (values: WidgetEditValues) => void | Promise<void>
  /** Called when the modal is closed (cancel or backdrop click) */
  onClose: () => void
  /** Whether the save is in progress */
  saving?: boolean
}

const WIDGET_TYPES: { value: WidgetType; label: string; icon: string }[] = [
  { value: 'chart', label: 'Chart', icon: '📊' },
  { value: 'table', label: 'Table', icon: '📋' },
  { value: 'kpi', label: 'KPI', icon: '🔢' },
]

const CHART_TYPES = ['line', 'bar', 'area', 'pie'] as const

export function WidgetEditModal({ initialValues, onSave, onClose, saving = false }: WidgetEditModalProps) {
  const [name, setName] = useState(initialValues.name)
  const [type, setType] = useState<WidgetType>(initialValues.type)
  const [sql, setSql] = useState(initialValues.sql)
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(
    initialValues.chartConfig ?? {
      chartType: 'bar',
      xAxis: '',
      yAxis: [''],
      title: '',
    },
  )

  const handleSave = useCallback(async () => {
    await onSave({
      name,
      type,
      sql,
      chartConfig: type === 'chart' ? chartConfig : null,
    })
  }, [name, type, sql, chartConfig, onSave])

  const updateChartConfig = (updates: Partial<ChartConfig>) => {
    setChartConfig((prev) => ({ ...(prev ?? { chartType: 'bar', xAxis: '', yAxis: [''] }), ...updates }))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'hsl(var(--muted, 240 4.8% 15.88%))',
    border: '1px solid hsl(var(--border, 240 3.7% 25%))',
    borderRadius: '4px',
    color: 'hsl(var(--foreground, 0 0% 98%))',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  return (
    <div
      data-testid="widget-edit-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'hsl(0 0% 0% / 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        data-testid="widget-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit widget"
        style={{
          background: 'hsl(var(--background, 240 10% 3.9%))',
          border: '1px solid hsl(var(--border, 240 3.7% 25%))',
          borderRadius: '10px',
          padding: '24px',
          width: '520px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Edit Widget</h2>
          <button
            data-testid="widget-edit-close"
            onClick={onClose}
            aria-label="Close edit modal"
            style={{
              padding: '4px 8px',
              border: '1px solid hsl(var(--border, 240 3.7% 25%))',
              borderRadius: '4px',
              background: 'transparent',
              color: 'hsl(var(--foreground, 0 0% 98%))',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Widget Name */}
        <div>
          <label htmlFor="widget-edit-name" style={labelStyle}>Widget Name</label>
          <input
            id="widget-edit-name"
            data-testid="widget-edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Monthly Revenue"
            style={inputStyle}
          />
        </div>

        {/* Widget Type */}
        <div>
          <label style={labelStyle}>Widget Type</label>
          <div
            data-testid="widget-type-selector"
            role="group"
            aria-label="Widget type"
            style={{ display: 'flex', gap: '8px' }}
          >
            {WIDGET_TYPES.map((t) => (
              <button
                key={t.value}
                data-testid={`widget-type-btn-${t.value}`}
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${type === t.value ? 'hsl(220 70% 65%)' : 'hsl(var(--border, 240 3.7% 25%))'}`,
                  borderRadius: '5px',
                  background: type === t.value ? 'hsl(220 70% 65% / 0.15)' : 'transparent',
                  color: type === t.value ? 'hsl(220 70% 75%)' : 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* SQL */}
        <div>
          <label htmlFor="widget-edit-sql" style={labelStyle}>SQL Query</label>
          <textarea
            id="widget-edit-sql"
            data-testid="widget-edit-sql"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT ..."
            rows={5}
            style={{
              ...inputStyle,
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: '0.78rem',
              resize: 'vertical',
              minHeight: '80px',
            }}
          />
        </div>

        {/* Chart Config (only when type === 'chart') */}
        {type === 'chart' && (
          <div
            data-testid="chart-config-section"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '12px',
              background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.4)',
              borderRadius: '6px',
              border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
              CHART SETTINGS
            </span>

            {/* Chart type */}
            <div>
              <label htmlFor="chart-type-select" style={labelStyle}>Chart Type</label>
              <select
                id="chart-type-select"
                data-testid="chart-type-select"
                value={chartConfig?.chartType ?? 'bar'}
                onChange={(e) => updateChartConfig({ chartType: e.target.value as ChartConfig['chartType'] })}
                style={inputStyle}
              >
                {CHART_TYPES.map((ct) => (
                  <option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* X Axis */}
            <div>
              <label htmlFor="x-axis-input" style={labelStyle}>X Axis Column</label>
              <input
                id="x-axis-input"
                data-testid="x-axis-input"
                type="text"
                value={chartConfig?.xAxis ?? ''}
                onChange={(e) => updateChartConfig({ xAxis: e.target.value })}
                placeholder="e.g. date"
                style={inputStyle}
              />
            </div>

            {/* Y Axis */}
            <div>
              <label htmlFor="y-axis-input" style={labelStyle}>Y Axis Column</label>
              <input
                id="y-axis-input"
                data-testid="y-axis-input"
                type="text"
                value={chartConfig?.yAxis[0] ?? ''}
                onChange={(e) => updateChartConfig({ yAxis: [e.target.value] })}
                placeholder="e.g. revenue"
                style={inputStyle}
              />
            </div>

            {/* Title */}
            <div>
              <label htmlFor="chart-title-input" style={labelStyle}>Chart Title (optional)</label>
              <input
                id="chart-title-input"
                data-testid="chart-title-input"
                type="text"
                value={chartConfig?.title ?? ''}
                onChange={(e) => updateChartConfig({ title: e.target.value })}
                placeholder="e.g. Monthly Revenue"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button
            data-testid="widget-edit-cancel"
            onClick={onClose}
            style={{
              padding: '7px 16px',
              border: '1px solid hsl(var(--border, 240 3.7% 25%))',
              borderRadius: '5px',
              background: 'transparent',
              color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="widget-edit-save"
            onClick={handleSave}
            disabled={saving || !name.trim() || !sql.trim()}
            style={{
              padding: '7px 16px',
              border: 'none',
              borderRadius: '5px',
              background: saving ? 'hsl(220 70% 50%)' : 'hsl(220 70% 60%)',
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : 'Save Widget'}
          </button>
        </div>
      </div>
    </div>
  )
}
