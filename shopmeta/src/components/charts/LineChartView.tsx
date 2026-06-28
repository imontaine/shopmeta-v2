// src/components/charts/LineChartView.tsx
// Line chart for time-series data using Recharts.

import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper'

export interface LineChartViewProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKeys: string[]
  title?: string
  height?: number
  className?: string
}

// DESIGN.md-aligned color palette
const COLORS = [
  '#000000', // ink
  '#47484f', // ink-soft
  '#707070', // ink-muted
  '#ef4444', // red
  '#3b82f6', // blue
  '#f59e0b', // amber
]

export function LineChartView({
  data,
  xKey,
  yKeys,
  title,
  height = 300,
  className,
}: LineChartViewProps) {
  return (
    <ChartWrapper
      title={title}
      height={height}
      className={className}
      testId="line-chart-wrapper"
    >
      <LineChart data={data} data-testid="line-chart">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border, 240 3.7% 25%))" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: 'hsl(var(--muted-foreground, 240 5% 64.9%))', fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground, 240 5% 64.9%))', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--background, 240 10% 3.9%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '6px',
            fontSize: '0.8rem',
          }}
        />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '0.8rem' }} />}
        {yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartWrapper>
  )
}
