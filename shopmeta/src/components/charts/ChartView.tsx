// src/components/charts/ChartView.tsx
// Unified chart component that:
//  1. Takes rows + optional initial config
//  2. Renders ChartTypeSwitcher + ChartConfigEditor (collapsible)
//  3. Renders the correct chart type (Line/Bar/Area/Pie)
//  4. Falls back to a "no chart suggestion" message when suggestChart returns null

import React, { useState } from 'react'
import { suggestChart } from '#/lib/utils/suggestChart'
import type { ChartConfig, ChartType } from '#/lib/utils/suggestChart'
import { ChartTypeSwitcher } from './ChartTypeSwitcher'
import { ChartConfigEditor } from './ChartConfigEditor'
import { LineChartView } from './LineChartView'
import { BarChartView } from './BarChartView'
import { AreaChartView } from './AreaChartView'
import { PieChartView } from './PieChartView'

export type RowData = Record<string, unknown>

export interface ChartViewProps {
  /** The query result rows */
  rows: RowData[]
  /** Initial chart config (overrides suggestChart result) */
  initialConfig?: ChartConfig
  /** Chart height in pixels. Default: 300 */
  height?: number
  /** Whether to show the config editor panel */
  showEditor?: boolean
  className?: string
}

function ChartRenderer({
  config,
  data,
  height,
}: {
  config: ChartConfig
  data: RowData[]
  height: number
}) {
  switch (config.type) {
    case 'line':
      return (
        <LineChartView
          data={data}
          xKey={config.xAxis}
          yKeys={config.yAxis}
          title={config.title}
          height={height}
        />
      )
    case 'bar':
      return (
        <BarChartView
          data={data}
          xKey={config.xAxis}
          yKeys={config.yAxis}
          title={config.title}
          height={height}
        />
      )
    case 'area':
      return (
        <AreaChartView
          data={data}
          xKey={config.xAxis}
          yKeys={config.yAxis}
          title={config.title}
          height={height}
        />
      )
    case 'pie': {
      const yKey = config.yAxis[0] ?? ''
      return (
        <PieChartView
          data={data}
          nameKey={config.xAxis}
          valueKey={yKey}
          title={config.title}
          height={height}
        />
      )
    }
    default:
      return null
  }
}

export function ChartView({
  rows,
  initialConfig,
  height = 300,
  showEditor = false,
  className,
}: ChartViewProps) {
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : []

  const autoConfig = initialConfig ?? suggestChart(rows)

  const [config, setConfig] = useState<ChartConfig | null>(autoConfig)
  const [editorOpen, setEditorOpen] = useState(showEditor)

  if (!config) {
    return (
      <div
        data-testid="chart-view-no-suggestion"
        style={{
          padding: '16px',
          textAlign: 'center',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          fontSize: '0.85rem',
        }}
      >
        Cannot suggest a chart for this data shape
      </div>
    )
  }

  function handleTypeChange(type: ChartType) {
    if (!config) return
    setConfig({ ...config, type })
  }

  return (
    <div
      data-testid="chart-view"
      className={className}
      style={{ width: '100%' }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <ChartTypeSwitcher current={config.type} onChange={handleTypeChange} />

        <button
          data-testid="chart-edit-toggle"
          onClick={() => setEditorOpen((v) => !v)}
          aria-expanded={editorOpen}
          aria-label="Toggle chart configuration editor"
          style={{
            padding: '4px 10px',
            fontSize: '0.78rem',
            borderRadius: '4px',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            background: 'transparent',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            cursor: 'pointer',
          }}
        >
          Configure
        </button>
      </div>

      {/* Config Editor (collapsible) */}
      {editorOpen && (
        <div style={{ marginBottom: '12px' }}>
          <ChartConfigEditor
            config={config}
            columns={columns}
            onChange={setConfig}
          />
        </div>
      )}

      {/* Chart Renderer */}
      <ChartRenderer config={config} data={rows} height={height} />
    </div>
  )
}
