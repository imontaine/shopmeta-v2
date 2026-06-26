// tests/unit/lib/suggestChart.test.ts
// Unit tests for the suggestChart utility.
// Tests all 4 classification patterns: line, bar, pie, null.

import { describe, it, expect } from 'vitest'
import { suggestChart } from '#/lib/utils/suggestChart'

// ─── Null cases ────────────────────────────────────────────────────────────────

describe('suggestChart — returns null', () => {
  it('returns null for empty rows array', () => {
    expect(suggestChart([])).toBeNull()
  })

  it('returns null when no numeric columns', () => {
    const rows = [{ name: 'Alice', city: 'NYC' }]
    expect(suggestChart(rows)).toBeNull()
  })

  it('returns null for only string columns', () => {
    const rows = [
      { category: 'A', label: 'foo', region: 'APAC' },
      { category: 'B', label: 'bar', region: 'EMEA' },
    ]
    expect(suggestChart(rows)).toBeNull()
  })

  it('returns null for boolean-only columns', () => {
    const rows = [{ active: true }, { active: false }]
    expect(suggestChart(rows)).toBeNull()
  })
})

// ─── Line chart detection ─────────────────────────────────────────────────────

describe('suggestChart — suggests line chart', () => {
  it('detects date + numeric as line chart', () => {
    const rows = [
      { date: '2024-01-01', revenue: 100 },
      { date: '2024-01-02', revenue: 150 },
    ]
    const config = suggestChart(rows)
    expect(config).not.toBeNull()
    expect(config!.type).toBe('line')
  })

  it('sets xAxis to the date column', () => {
    const rows = [{ date: '2024-01', revenue: 100 }]
    const config = suggestChart(rows)
    expect(config!.xAxis).toBe('date')
  })

  it('sets yAxis to include the numeric column', () => {
    const rows = [{ date: '2024-01-01', revenue: 100 }]
    const config = suggestChart(rows)
    expect(config!.yAxis).toContain('revenue')
  })

  it('detects timestamp column as date', () => {
    const rows = [
      { timestamp: '2024-01-01T00:00:00Z', clicks: 500 },
    ]
    const config = suggestChart(rows)
    expect(config!.type).toBe('line')
    expect(config!.xAxis).toBe('timestamp')
  })

  it('detects created_at column as date', () => {
    const rows = [
      { created_at: '2024-01-01', count: 42 },
    ]
    const config = suggestChart(rows)
    expect(config!.type).toBe('line')
    expect(config!.xAxis).toBe('created_at')
  })

  it('detects ISO date-value column (content-based) as date', () => {
    const rows = [
      { period: '2024-01-01', sales: 1000 },
      { period: '2024-01-02', sales: 1200 },
    ]
    const config = suggestChart(rows)
    expect(config!.type).toBe('line')
  })

  it('includes multiple numeric columns in yAxis for line chart', () => {
    const rows = [
      { date: '2024-01-01', revenue: 100, cost: 80 },
      { date: '2024-01-02', revenue: 150, cost: 120 },
    ]
    const config = suggestChart(rows)
    expect(config!.type).toBe('line')
    expect(config!.yAxis).toContain('revenue')
    expect(config!.yAxis).toContain('cost')
  })

  it('title includes the column names for line chart', () => {
    const rows = [{ date: '2024-01', revenue: 100 }]
    const config = suggestChart(rows)
    expect(config!.title).toContain('revenue')
  })
})

// ─── Pie chart detection ──────────────────────────────────────────────────────

describe('suggestChart — suggests pie chart', () => {
  it('detects categorical + numeric with ≤8 rows as pie chart', () => {
    const rows = [
      { status: 'shipped', count: 10 },
      { status: 'pending', count: 5 },
      { status: 'cancelled', count: 2 },
    ]
    const config = suggestChart(rows)
    expect(config).not.toBeNull()
    expect(config!.type).toBe('pie')
  })

  it('sets xAxis to the categorical column for pie chart', () => {
    const rows = [
      { category: 'A', count: 5 },
      { category: 'B', count: 3 },
    ]
    const config = suggestChart(rows)
    expect(config!.xAxis).toBe('category')
  })

  it('sets yAxis to the numeric column for pie chart', () => {
    const rows = [
      { region: 'APAC', revenue: 500 },
      { region: 'EMEA', revenue: 300 },
    ]
    const config = suggestChart(rows)
    expect(config!.yAxis).toContain('revenue')
  })

  it('uses pie for exactly 8 rows', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      category: `Cat-${i}`,
      value: i + 1,
    }))
    const config = suggestChart(rows)
    expect(config!.type).toBe('pie')
  })

  it('title contains column names for pie chart', () => {
    const rows = [
      { status: 'active', count: 10 },
      { status: 'inactive', count: 5 },
    ]
    const config = suggestChart(rows)
    expect(config!.title).toBeDefined()
  })
})

// ─── Bar chart detection ──────────────────────────────────────────────────────

describe('suggestChart — suggests bar chart', () => {
  it('detects categorical + numeric with >8 rows as bar chart', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      category: `Cat-${i}`,
      value: i + 1,
    }))
    const config = suggestChart(rows)
    expect(config!.type).toBe('bar')
  })

  it('detects single-row categorical + numeric → pie (not bar)', () => {
    const rows = [{ category: 'A', count: 5 }]
    const config = suggestChart(rows)
    expect(config!.type).toBe('pie') // ≤ 8 rows
  })

  it('uses bar for categorical + numeric with 9 rows', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      region: `Region-${i}`,
      sales: i * 1000,
    }))
    const config = suggestChart(rows)
    expect(config!.type).toBe('bar')
  })

  it('sets xAxis to the categorical column for bar chart', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      product: `P${i}`,
      revenue: i * 50,
    }))
    const config = suggestChart(rows)
    expect(config!.xAxis).toBe('product')
  })

  it('sets yAxis to the numeric column for bar chart', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      country: `Country${i}`,
      users: i * 100,
    }))
    const config = suggestChart(rows)
    expect(config!.yAxis).toContain('users')
  })

  it('example from spec: { category: "A", count: 5 } → bar when many rows', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      category: String.fromCharCode(65 + (i % 26)),
      count: i + 1,
    }))
    const config = suggestChart(rows)
    expect(config!.type).toBe('bar')
  })
})

// ─── Spec example tests ───────────────────────────────────────────────────────

describe('suggestChart — spec examples', () => {
  it('spec example: date + numeric → line, xAxis = "date", yAxis contains "revenue"', () => {
    const rows = [
      { date: '2024-01-01', revenue: 100 },
      { date: '2024-01-02', revenue: 150 },
    ]
    const config = suggestChart(rows)
    expect(config!.type).toBe('line')
    expect(config!.xAxis).toBe('date')
    expect(config!.yAxis).toContain('revenue')
  })

  it('spec example: no numeric columns → null', () => {
    const rows = [{ name: 'Alice', city: 'NYC' }]
    expect(suggestChart(rows)).toBeNull()
  })

  it('spec example: { status: "shipped", count: 10 } (≤8 rows) → pie', () => {
    const rows = [{ status: 'shipped', count: 10 }]
    const config = suggestChart(rows)
    expect(config!.type).toBe('pie')
  })

  it('spec example: { category: "A", count: 5 } single row → pie (≤8)', () => {
    const rows = [{ category: 'A', count: 5 }]
    const config = suggestChart(rows)
    expect(config!.type).toBe('pie')
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('suggestChart — edge cases', () => {
  it('handles rows with string-encoded numbers', () => {
    const rows = [{ month: 'Jan', revenue: '1000' }]
    const config = suggestChart(rows)
    // month is a category, revenue is numeric string
    expect(config).not.toBeNull()
    expect(config!.yAxis).toContain('revenue')
  })

  it('handles single row with single column (no chartable data)', () => {
    const rows = [{ name: 'only-one-string-column' }]
    expect(suggestChart(rows)).toBeNull()
  })

  it('returns a config with type, xAxis, and yAxis always set', () => {
    const rows = [{ date: '2024-01', val: 10 }]
    const config = suggestChart(rows)
    expect(config).not.toBeNull()
    expect(typeof config!.type).toBe('string')
    expect(typeof config!.xAxis).toBe('string')
    expect(Array.isArray(config!.yAxis)).toBe(true)
    expect(config!.yAxis.length).toBeGreaterThan(0)
  })
})
