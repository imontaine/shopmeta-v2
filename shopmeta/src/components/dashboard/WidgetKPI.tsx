// src/components/dashboard/WidgetKPI.tsx
// KPI widget: displays a single large number with a title.
// Number is formatted with commas (en-US locale).
// Handles: integer, float, null/undefined (shows "—").

import React from 'react'

export interface WidgetKPIProps {
  /** The KPI title shown above the number */
  title: string
  /** The row data. Uses the first numeric value found. */
  rows: Array<Record<string, unknown>>
  /** Optional prefix (e.g. "$") */
  prefix?: string
  /** Optional suffix (e.g. "%") */
  suffix?: string
  /** Background accent color (CSS color) */
  accentColor?: string
}

function formatKPIValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (isNaN(num)) return String(value)

  // Large number abbreviation for display
  if (Math.abs(num) >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B'
  }
  if (Math.abs(num) >= 1_000_000) {
    return (num / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  }

  // Format with commas
  return num.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })
}

function extractKPIValue(rows: Array<Record<string, unknown>>): unknown {
  if (!rows || rows.length === 0) return null
  const row = rows[0]
  if (!row) return null

  // Find the first numeric value
  for (const key of Object.keys(row)) {
    const v = row[key]
    if (typeof v === 'number') return v
    if (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(Number(v))) return parseFloat(v)
  }

  // Fall back to first value
  return Object.values(row)[0] ?? null
}

export function WidgetKPI({ title, rows, prefix = '', suffix = '', accentColor }: WidgetKPIProps) {
  const rawValue = extractKPIValue(rows)
  const formattedValue = formatKPIValue(rawValue)

  return (
    <div
      data-testid="widget-kpi"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '16px',
        gap: '8px',
        textAlign: 'center',
      }}
    >
      <span
        data-testid="kpi-title"
        style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
        }}
      >
        {title}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
        {prefix && (
          <span
            data-testid="kpi-prefix"
            style={{
              fontSize: '1.4rem',
              color: accentColor ?? 'hsl(220 70% 65%)',
              fontWeight: 600,
            }}
          >
            {prefix}
          </span>
        )}
        <span
          data-testid="kpi-value"
          style={{
            fontSize: '2.4rem',
            fontWeight: 700,
            color: accentColor ?? 'hsl(var(--foreground, 0 0% 98%))',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {formattedValue}
        </span>
        {suffix && (
          <span
            data-testid="kpi-suffix"
            style={{
              fontSize: '1.2rem',
              color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
              marginLeft: '2px',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// Export the formatKPIValue utility for tests
export { formatKPIValue, extractKPIValue }
