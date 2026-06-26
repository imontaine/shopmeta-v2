// src/components/charts/ChartTypeSwitcher.tsx
// A tab-style switcher for chart type selection.
// Shows icon buttons for Line / Bar / Area / Pie and highlights the active type.

import React from 'react'
import type { ChartType } from '#/lib/utils/suggestChart'

export interface ChartTypeSwitcherProps {
  current: ChartType
  onChange: (type: ChartType) => void
  className?: string
}

interface TypeOption {
  type: ChartType
  label: string
  /** Unicode symbol that works well in plain text */
  icon: string
}

const TYPES: TypeOption[] = [
  { type: 'line', label: 'Line', icon: '\u2014' },
  { type: 'bar', label: 'Bar', icon: '\u2503' },
  { type: 'area', label: 'Area', icon: '\u25E2' },
  { type: 'pie', label: 'Pie', icon: '\u25CB' },
]

export function ChartTypeSwitcher({ current, onChange, className }: ChartTypeSwitcherProps) {
  return (
    <div
      data-testid="chart-type-switcher"
      role="tablist"
      aria-label="Chart type"
      className={className}
      style={{
        display: 'inline-flex',
        gap: '2px',
        padding: '3px',
        borderRadius: '6px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%))',
      }}
    >
      {TYPES.map(({ type, label, icon }) => {
        const isActive = current === type
        return (
          <button
            key={type}
            role="tab"
            data-testid={`chart-type-btn-${type}`}
            aria-selected={isActive}
            aria-label={`Switch to ${label} chart`}
            onClick={() => onChange(type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '4px',
              border: 'none',
              background: isActive
                ? 'hsl(var(--background, 240 10% 3.9%))'
                : 'transparent',
              color: isActive
                ? 'hsl(var(--foreground, 0 0% 98%))'
                : 'hsl(var(--muted-foreground, 240 5% 64.9%))',
              fontWeight: isActive ? 600 : 400,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}
