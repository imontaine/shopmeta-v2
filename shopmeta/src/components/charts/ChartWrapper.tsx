// src/components/charts/ChartWrapper.tsx
// Shared wrapper for all chart components. Provides a responsive container
// and a consistent dark-themed chart surface.

import React from 'react'
import { ResponsiveContainer } from 'recharts'

export interface ChartWrapperProps {
  /** The chart's accessible title */
  title?: string
  /** Width override (default: '100%') */
  width?: string | number
  /** Height in pixels. Default: 300 */
  height?: number
  children: React.ReactNode
  /** Optional extra className for the outer div */
  className?: string
  /** data-testid for the outer wrapper */
  testId?: string
}

export function ChartWrapper({
  title,
  width = '100%',
  height = 300,
  children,
  className,
  testId = 'chart-wrapper',
}: ChartWrapperProps) {
  return (
    <figure
      data-testid={testId}
      className={className}
      aria-label={title ?? 'Chart'}
      style={{ width: '100%', margin: 0 }}
    >
      {title && (
        <figcaption
          data-testid="chart-title"
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground, 0 0% 98%))',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          {title}
        </figcaption>
      )}
      <ResponsiveContainer width={width} height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </figure>
  )
}
