// src/components/dashboard/WidgetChart.tsx
// Chart widget — renders a Recharts chart based on chartConfig.
// Delegates to ChartView (Unit 10) which handles line/bar/area/pie switching.

import React from 'react'
import { ChartView } from '#/components/charts/ChartView'
import type { ChartConfig } from '#/lib/widgets'

export interface WidgetChartProps {
  /** The chart configuration (from widget.chartConfig) */
  chartConfig: ChartConfig
  /** The query result rows */
  rows: Array<Record<string, unknown>>
  /** Chart height in pixels. Default: 200 */
  height?: number
  className?: string
}

export function WidgetChart({ chartConfig, rows, height = 200, className }: WidgetChartProps) {
  if (!rows || rows.length === 0) {
    return (
      <div
        data-testid="widget-chart-empty"
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          fontSize: '0.82rem',
        }}
      >
        No data to display
      </div>
    )
  }

  return (
    <div
      data-testid="widget-chart"
      className={className}
      style={{ height, width: '100%' }}
    >
      <ChartView
        rows={rows}
        initialConfig={{
          type: chartConfig.chartType,
          xAxis: chartConfig.xAxis,
          yAxis: chartConfig.yAxis[0] ?? '',
          title: chartConfig.title,
        }}
        height={height}
      />
    </div>
  )
}
