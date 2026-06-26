// src/components/charts/BarChartView.tsx
// Bar chart for categorical comparison data using Recharts.

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper'

export interface BarChartViewProps {
  data: Array<Record<string, unknown>>
  xKey: string
  yKeys: string[]
  title?: string
  height?: number
  className?: string
  /** If true, shows each bar in a different color */
  multiColor?: boolean
}

const COLORS = [
  '#3ecf8e', // Supabase emerald
  '#00c573', // Supabase interactive green
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
  '#898989', // Supabase mid gray
]

export function BarChartView({
  data,
  xKey,
  yKeys,
  title,
  height = 300,
  className,
  multiColor = false,
}: BarChartViewProps) {
  return (
    <ChartWrapper
      title={title}
      height={height}
      className={className}
      testId="bar-chart-wrapper"
    >
      <BarChart data={data} data-testid="bar-chart">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border, 240 3.7% 25%))" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: 'hsl(var(--muted-foreground, 240 5% 64.9%))', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
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
          cursor={{ fill: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.3)' }}
        />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: '0.8rem' }} />}
        {yKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={COLORS[i % COLORS.length]}
            radius={[3, 3, 0, 0]}
          >
            {multiColor &&
              data.map((_, cellIdx) => (
                <Cell key={`cell-${cellIdx}`} fill={COLORS[cellIdx % COLORS.length]} />
              ))}
          </Bar>
        ))}
      </BarChart>
    </ChartWrapper>
  )
}
