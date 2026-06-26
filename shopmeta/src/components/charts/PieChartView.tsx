// src/components/charts/PieChartView.tsx
// Pie / Doughnut chart for proportional data using Recharts.

import React, { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  Sector,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import { ChartWrapper } from './ChartWrapper'

export interface PieChartViewProps {
  data: Array<Record<string, unknown>>
  /** Key for the slice label (category column) */
  nameKey: string
  /** Key for the slice value (numeric column) */
  valueKey: string
  title?: string
  height?: number
  className?: string
  /** If true, renders a doughnut (inner radius = 60) */
  doughnut?: boolean
}

const COLORS = [
  '#21808D', // Perplexity teal
  '#1a6b76', // Perplexity teal hover
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal alt
  '#898989', // mid gray
]

// Custom label renderer
function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: PieLabelRenderProps & { name?: string; percent?: number }) {
  if (!percent || percent < 0.05) return null // Hide tiny slices
  const RADIAN = Math.PI / 180
  const cxNum = Number(cx)
  const cyNum = Number(cy)
  const innerR = Number(innerRadius)
  const outerR = Number(outerRadius)
  const midA = Number(midAngle)

  const radius = innerR + (outerR - innerR) * 0.5
  const x = cxNum + radius * Math.cos(-midA * RADIAN)
  const y = cyNum + radius * Math.sin(-midA * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
    >
      {`${((percent) * 100).toFixed(0)}%`}
    </text>
  )
}

export function PieChartView({
  data,
  nameKey,
  valueKey,
  title,
  height = 300,
  className,
  doughnut = false,
}: PieChartViewProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  // Normalise data for Recharts Pie
  const pieData = data.map((row) => ({
    name: String(row[nameKey] ?? ''),
    value: Number(row[valueKey] ?? 0),
  }))

  const innerRadius = doughnut ? '40%' : 0
  const outerRadius = '70%'

  return (
    <ChartWrapper
      title={title}
      height={height}
      className={className}
      testId="pie-chart-wrapper"
    >
      <PieChart data-testid="pie-chart">
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          labelLine={false}
          label={renderCustomLabel}
          activeIndex={activeIndex}
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(undefined)}
        >
          {pieData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
              opacity={activeIndex === undefined || activeIndex === index ? 1 : 0.6}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--background, 240 10% 3.9%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '6px',
            fontSize: '0.8rem',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: '0.8rem', paddingTop: '8px' }}
          formatter={(value) => (
            <span style={{ color: 'hsl(var(--foreground, 0 0% 98%))' }}>{value}</span>
          )}
        />
      </PieChart>
    </ChartWrapper>
  )
}
