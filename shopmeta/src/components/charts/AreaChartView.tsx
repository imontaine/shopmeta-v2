// src/components/charts/AreaChartView.tsx
// Area chart for time-series data with filled area using Recharts.

import React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper'

export interface AreaChartViewProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKeys: string[]
  title?: string
  height?: number
  className?: string
  /** If true, stacks the areas on top of each other */
  stacked?: boolean
}

const COLORS = [
  '#000000', // ink
  '#47484f', // ink-soft
  '#707070', // ink-muted
  '#ef4444', // red
  '#3b82f6', // blue
  '#f59e0b', // amber
]

export function AreaChartView({
  data,
  xKey,
  yKeys,
  title,
  height = 300,
  className,
  stacked = false,
}: AreaChartViewProps) {
  return (
    <ChartWrapper
      title={title}
      height={height}
      className={className}
      testId="area-chart-wrapper"
    >
      <AreaChart data={data} data-testid="area-chart">
        <defs>
          {yKeys.map((key, i) => (
            <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
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
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            fill={`url(#gradient-${key})`}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </AreaChart>
    </ChartWrapper>
  )
}
