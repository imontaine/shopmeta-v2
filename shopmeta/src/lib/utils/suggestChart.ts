// src/lib/utils/suggestChart.ts
// Analyzes an array of row objects and suggests the most appropriate chart type.
//
// Detection rules:
//  1. No rows / no numeric columns → null
//  2. Date/time column + numeric column → 'line'  (time-series)
//  3. Categorical + numeric, row count ≤ 8 → 'pie'  (proportion)
//  4. Categorical + numeric, row count > 8 → 'bar'  (comparison)
//  5. Only numeric columns → 'bar' (with first column as x-axis)

export type ChartType = 'line' | 'bar' | 'area' | 'pie'

export interface ChartConfig {
  /** Suggested chart type */
  type: ChartType
  /** Column name for the X-axis (category or date) */
  xAxis: string
  /** Column name(s) for the Y-axis (numeric values) */
  yAxis: string[]
  /** Human-readable title suggestion */
  title?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the string looks like a date or datetime value.
 */
function isDateLike(value: unknown): boolean {
  if (typeof value !== 'string') return false
  // ISO date: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true
  // Year-month: 2024-01
  if (/^\d{4}-\d{2}$/.test(value)) return true
  // Year only: 2024
  if (/^\d{4}$/.test(value)) return false // too ambiguous
  return false
}

/**
 * Returns true if the column key looks like it holds dates based on its name.
 */
function isDateColumnName(key: string): boolean {
  return /^(date|time|timestamp|created_at|updated_at|period|month|week|year|day)\b/i.test(key)
}

/**
 * Returns true if the value is numeric (number type or numeric-looking string).
 */
function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return isFinite(value)
  if (typeof value === 'string') {
    const n = Number(value)
    return value.trim() !== '' && isFinite(n)
  }
  return false
}

/**
 * Classifies each column as 'date', 'numeric', or 'string' based on the
 * values in the first (up to 5) rows.
 */
function classifyColumns(
  rows: Array<Record<string, unknown>>,
  keys: string[],
): Map<string, 'date' | 'numeric' | 'string'> {
  const map = new Map<string, 'date' | 'numeric' | 'string'>()
  const sample = rows.slice(0, 5)

  for (const key of keys) {
    if (isDateColumnName(key)) {
      map.set(key, 'date')
      continue
    }

    let numericCount = 0
    let dateCount = 0

    for (const row of sample) {
      const val = row[key]
      if (isNumeric(val)) numericCount++
      else if (isDateLike(val)) dateCount++
    }

    if (dateCount > numericCount && dateCount > 0) {
      map.set(key, 'date')
    } else if (numericCount >= sample.length / 2) {
      map.set(key, 'numeric')
    } else {
      map.set(key, 'string')
    }
  }

  return map
}

// ─── suggestChart ─────────────────────────────────────────────────────────────

/**
 * Analyzes row data and suggests the most appropriate chart configuration.
 *
 * @param rows - Array of row objects from a database query
 * @returns ChartConfig suggestion or null if data is not chartable
 *
 * @example
 * suggestChart([{ date: '2024-01', revenue: 100 }])
 * // → { type: 'line', xAxis: 'date', yAxis: ['revenue'] }
 *
 * suggestChart([{ region: 'APAC', sales: 500 }])
 * // → { type: 'bar', xAxis: 'region', yAxis: ['sales'] }
 *
 * suggestChart([{ status: 'active', count: 10 }])
 * // → { type: 'pie', xAxis: 'status', yAxis: ['count'] }
 *
 * suggestChart([{ name: 'Alice', city: 'NYC' }])
 * // → null
 */
export function suggestChart(rows: Array<Record<string, unknown>>): ChartConfig | null {
  if (!rows || rows.length === 0) return null

  const keys = Object.keys(rows[0]!)
  if (keys.length === 0) return null

  const colTypes = classifyColumns(rows, keys)

  const dateColumns = keys.filter((k) => colTypes.get(k) === 'date')
  const numericColumns = keys.filter((k) => colTypes.get(k) === 'numeric')
  const stringColumns = keys.filter((k) => colTypes.get(k) === 'string')

  // No numeric data → not chartable
  if (numericColumns.length === 0) return null

  // ── Rule 1: Date + numeric → Line chart (time series) ────────────────────
  if (dateColumns.length > 0) {
    const xAxis = dateColumns[0]!
    return {
      type: 'line',
      xAxis,
      yAxis: numericColumns,
      title: `${numericColumns.join(', ')} over ${xAxis}`,
    }
  }

  // ── Rule 2: Categorical + numeric with ≤ 8 rows → Pie chart ──────────────
  const categoricalAxis = stringColumns[0] ?? keys.find((k) => colTypes.get(k) !== 'numeric')

  if (categoricalAxis && rows.length <= 8) {
    return {
      type: 'pie',
      xAxis: categoricalAxis,
      yAxis: numericColumns,
      title: `${numericColumns[0]} by ${categoricalAxis}`,
    }
  }

  // ── Rule 3: Categorical + numeric with > 8 rows → Bar chart ──────────────
  if (categoricalAxis) {
    return {
      type: 'bar',
      xAxis: categoricalAxis,
      yAxis: numericColumns,
      title: `${numericColumns.join(', ')} by ${categoricalAxis}`,
    }
  }

  // ── Rule 4: Only numeric columns → Bar chart with first column as x-axis ─
  const [xAxis, ...rest] = keys
  if (rest.length > 0) {
    return {
      type: 'bar',
      xAxis: xAxis!,
      yAxis: rest.filter((k) => colTypes.get(k) === 'numeric'),
      title: `${rest.join(', ')} by ${xAxis}`,
    }
  }

  return null
}
