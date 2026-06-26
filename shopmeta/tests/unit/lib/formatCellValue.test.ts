// tests/unit/lib/formatCellValue.test.ts
// Unit tests for the formatCellValue utility.
// Tests number formatting, date formatting, string truncation, null/undefined handling.

import { describe, it, expect } from 'vitest'
import { formatCellValue } from '#/lib/utils/formatCellValue'

describe('formatCellValue — null / undefined', () => {
  it('returns empty string for null', () => {
    expect(formatCellValue(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatCellValue(undefined)).toBe('')
  })
})

describe('formatCellValue — booleans', () => {
  it('formats true as "true"', () => {
    expect(formatCellValue(true)).toBe('true')
  })

  it('formats false as "false"', () => {
    expect(formatCellValue(false)).toBe('false')
  })
})

describe('formatCellValue — numbers', () => {
  it('formats integer with commas: 1234567 → 1,234,567', () => {
    expect(formatCellValue(1234567)).toBe('1,234,567')
  })

  it('formats small integer without commas: 42 → 42', () => {
    expect(formatCellValue(42)).toBe('42')
  })

  it('formats zero as "0"', () => {
    expect(formatCellValue(0)).toBe('0')
  })

  it('formats negative integer: -9999 → -9,999', () => {
    expect(formatCellValue(-9999)).toBe('-9,999')
  })

  it('formats large integer: 1000000 → 1,000,000', () => {
    expect(formatCellValue(1000000)).toBe('1,000,000')
  })

  it('formats float with up to 4 decimal places', () => {
    const result = formatCellValue(3.14159)
    expect(result).toBe('3.1416')
  })

  it('removes trailing zeros from floats', () => {
    const result = formatCellValue(3.5)
    expect(result).toContain('3.5')
    expect(result).not.toContain('3.5000')
  })

  it('formats NaN as "NaN"', () => {
    expect(formatCellValue(NaN)).toBe('NaN')
  })

  it('formats Infinity as "Infinity"', () => {
    expect(formatCellValue(Infinity)).toBe('Infinity')
  })
})

describe('formatCellValue — dates', () => {
  it('formats ISO date string (YYYY-MM-DD) to human-readable', () => {
    const result = formatCellValue('2024-01-15')
    // Should contain "Jan" and "2024" and "15"
    expect(result).toMatch(/Jan/i)
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/15/)
  })

  it('formats ISO datetime string to human-readable', () => {
    const result = formatCellValue('2024-03-20T14:30:00Z')
    expect(result).toMatch(/Mar/i)
    expect(result).toMatch(/2024/)
    expect(result).toMatch(/20/)
  })

  it('formats ClickHouse datetime format (YYYY-MM-DD HH:mm:ss)', () => {
    const result = formatCellValue('2024-06-01 09:00:00')
    expect(result).toMatch(/Jun/i)
    expect(result).toMatch(/2024/)
  })

  it('does not parse non-date strings as dates', () => {
    const result = formatCellValue('hello-world')
    expect(result).toBe('hello-world')
  })

  it('does not parse partial date-like strings', () => {
    const result = formatCellValue('2024')
    expect(result).toBe('2024')
  })
})

describe('formatCellValue — strings', () => {
  it('returns short strings as-is', () => {
    expect(formatCellValue('hello')).toBe('hello')
  })

  it('returns empty string as empty string', () => {
    expect(formatCellValue('')).toBe('')
  })

  it('truncates strings longer than maxLength', () => {
    const long = 'a'.repeat(300)
    const result = formatCellValue(long)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(201) // 200 chars + '…'
  })

  it('respects custom maxLength option', () => {
    const long = 'hello world extra content'
    const result = formatCellValue(long, { maxLength: 5 })
    expect(result).toBe('hello…')
  })

  it('does not truncate strings exactly at maxLength', () => {
    const exactly200 = 'a'.repeat(200)
    const result = formatCellValue(exactly200)
    expect(result).toBe(exactly200) // Exactly 200 chars — not truncated
    expect(result.endsWith('…')).toBe(false)
  })
})

describe('formatCellValue — objects', () => {
  it('serializes plain objects to JSON string', () => {
    const result = formatCellValue({ a: 1, b: 'hello' })
    expect(result).toBe('{"a":1,"b":"hello"}')
  })

  it('serializes arrays to JSON string', () => {
    const result = formatCellValue([1, 2, 3])
    expect(result).toBe('[1,2,3]')
  })

  it('truncates long JSON objects', () => {
    const bigObj = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`key_${i}`, `value_${i}_${'x'.repeat(20)}`]),
    )
    const result = formatCellValue(bigObj)
    expect(result.endsWith('…')).toBe(true)
  })
})
