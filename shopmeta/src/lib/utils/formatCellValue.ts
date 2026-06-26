// src/lib/utils/formatCellValue.ts
// Formats raw cell values from query results for human-readable display.
// Used by DataTableView and any other component that renders table data.

/**
 * Formats a raw cell value from a database query result into a
 * human-readable string.
 *
 * Rules:
 *  - null / undefined → '' (empty string)
 *  - boolean → 'true' | 'false'
 *  - number: integer → comma-formatted (1,234,567); float → 4 decimal places max, no trailing zeros
 *  - ISO date strings (YYYY-MM-DD or full ISO 8601) → locale date string
 *  - strings > maxLength → truncated with '…'
 *  - everything else → String(value)
 */
export function formatCellValue(
  value: unknown,
  options: { maxLength?: number } = {},
): string {
  const { maxLength = 200 } = options

  if (value === null || value === undefined) return ''

  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (typeof value === 'number') {
    if (!isFinite(value)) return String(value)
    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US')
    }
    // Float — up to 4 decimal places, no trailing zeros
    return parseFloat(value.toFixed(4)).toLocaleString('en-US', {
      maximumFractionDigits: 4,
    })
  }

  if (typeof value === 'string') {
    // Detect ISO date-like strings
    if (isDateString(value)) {
      try {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          // If it's a date-only string (YYYY-MM-DD), show just the date
          if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return date.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            })
          }
          // Full datetime — show date + time
          return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
          })
        }
      } catch {
        // Fall through to string handling
      }
    }

    // Truncate long strings
    if (value.length > maxLength) {
      return value.slice(0, maxLength) + '…'
    }
    return value
  }

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      if (json.length > maxLength) {
        return json.slice(0, maxLength) + '…'
      }
      return json
    } catch {
      return '[object]'
    }
  }

  return String(value)
}

/**
 * Checks whether a string looks like an ISO date or datetime.
 */
function isDateString(s: string): boolean {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return true
  // ISO 8601 datetime: YYYY-MM-DDTHH:mm...
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return true
  // ClickHouse datetime: YYYY-MM-DD HH:mm:ss
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return true
  return false
}
