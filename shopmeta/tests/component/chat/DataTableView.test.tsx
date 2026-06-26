// tests/component/chat/DataTableView.test.tsx
// Component tests for DataTableView using @tanstack/react-table v8.
// Tests: column auto-generation, sorting, pagination, column visibility,
// empty state, large dataset, and formatCellValue integration.

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTableView } from '#/components/chat/DataTableView'

// ─── Test Data ────────────────────────────────────────────────────────────────

function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `item-${i + 1}`,
    value: (i + 1) * 10,
  }))
}

// ─── Column Auto-Generation ───────────────────────────────────────────────────

describe('DataTableView — column auto-generation', () => {
  it('renders correct number of column headers from row keys', () => {
    const rows = [{ id: 1, name: 'Alice', revenue: 5000, region: 'APAC', active: true }]
    render(<DataTableView rows={rows} />)

    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(5)
  })

  it('column header text matches the object key names', () => {
    const rows = [{ id: 1, name: 'Alice', revenue: 5000, region: 'APAC', active: true }]
    render(<DataTableView rows={rows} />)

    expect(screen.getByTestId('header-id')).toBeInTheDocument()
    expect(screen.getByTestId('header-name')).toBeInTheDocument()
    expect(screen.getByTestId('header-revenue')).toBeInTheDocument()
    expect(screen.getByTestId('header-region')).toBeInTheDocument()
    expect(screen.getByTestId('header-active')).toBeInTheDocument()
  })

  it('renders cell data in the table body', () => {
    const rows = [{ product: 'Widget', quantity: 42 }]
    render(<DataTableView rows={rows} />)

    expect(screen.getByTestId('cell-0-product')).toHaveTextContent('Widget')
    expect(screen.getByTestId('cell-0-quantity')).toHaveTextContent('42')
  })

  it('renders data-table element', () => {
    render(<DataTableView rows={[{ a: 1 }]} />)
    expect(screen.getByTestId('data-table')).toBeInTheDocument()
  })
})

// ─── Empty State ──────────────────────────────────────────────────────────────

describe('DataTableView — empty state', () => {
  it('shows "No results" when rows is empty', () => {
    render(<DataTableView rows={[]} />)
    expect(screen.getByTestId('data-table-empty')).toBeInTheDocument()
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('does NOT render the table element when rows is empty', () => {
    render(<DataTableView rows={[]} />)
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument()
  })
})

// ─── Sorting ──────────────────────────────────────────────────────────────────

describe('DataTableView — sorting', () => {
  it('clicking column header sorts rows ascending', async () => {
    const user = userEvent.setup()
    const rows = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }]
    render(<DataTableView rows={rows} />)

    const nameHeader = screen.getByTestId('header-name')
    await user.click(nameHeader)

    // After ascending sort, first cell in the name column should be "apple"
    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('apple')
  })

  it('clicking column header twice sorts rows descending', async () => {
    const user = userEvent.setup()
    const rows = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }]
    render(<DataTableView rows={rows} />)

    const nameHeader = screen.getByTestId('header-name')
    await user.click(nameHeader) // ascending
    await user.click(nameHeader) // descending

    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('cherry')
  })

  it('sorting numeric column works correctly', async () => {
    const user = userEvent.setup()
    const rows = [{ value: 30 }, { value: 10 }, { value: 20 }]
    render(<DataTableView rows={rows} />)

    const header = screen.getByTestId('header-value')
    await user.click(header) // ascending

    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('10')
  })

  it('shows ascending sort indicator after first click', async () => {
    const user = userEvent.setup()
    const rows = [{ revenue: 100 }, { revenue: 200 }]
    render(<DataTableView rows={rows} />)

    await user.click(screen.getByTestId('header-revenue'))
    expect(screen.getByTestId('sort-asc-revenue')).toBeInTheDocument()
  })

  it('shows descending sort indicator after second click', async () => {
    const user = userEvent.setup()
    const rows = [{ revenue: 100 }, { revenue: 200 }]
    render(<DataTableView rows={rows} />)

    await user.click(screen.getByTestId('header-revenue'))
    await user.click(screen.getByTestId('header-revenue'))
    expect(screen.getByTestId('sort-desc-revenue')).toBeInTheDocument()
  })

  it('column header has aria-sort="ascending" when sorted asc', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ x: 1 }, { x: 2 }]} />)

    await user.click(screen.getByTestId('header-x'))
    expect(screen.getByTestId('header-x')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('column header has aria-sort="descending" when sorted desc', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ x: 1 }, { x: 2 }]} />)

    await user.click(screen.getByTestId('header-x'))
    await user.click(screen.getByTestId('header-x'))
    expect(screen.getByTestId('header-x')).toHaveAttribute('aria-sort', 'descending')
  })
})

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('DataTableView — pagination', () => {
  it('shows "Page 1 of 6" for 53 rows with pageSize=10', () => {
    const rows = Array.from({ length: 53 }, (_, i) => ({ id: i, name: `item-${i}` }))
    render(<DataTableView rows={rows} pageSize={10} />)
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 6')
  })

  it('shows "Page 1 of 5" for 50 rows with pageSize=10', () => {
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 5')
  })

  it('page 1 shows only rows 1–10 for pageSize=10', () => {
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)

    const tableBody = screen.getByTestId('data-table').querySelector('tbody')!
    const bodyRows = within(tableBody).getAllByRole('row')
    expect(bodyRows).toHaveLength(10)
  })

  it('clicking next shows page 2 and updates page info', async () => {
    const user = userEvent.setup()
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)

    await user.click(screen.getByTestId('pagination-next'))
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 2 of 5')
  })

  it('clicking prev after next returns to page 1', async () => {
    const user = userEvent.setup()
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)

    await user.click(screen.getByTestId('pagination-next'))
    await user.click(screen.getByTestId('pagination-prev'))
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 5')
  })

  it('clicking last navigates to last page', async () => {
    const user = userEvent.setup()
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)

    await user.click(screen.getByTestId('pagination-last'))
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 5 of 5')
  })

  it('clicking first returns from last page to page 1', async () => {
    const user = userEvent.setup()
    const rows = makeRows(50)
    render(<DataTableView rows={rows} pageSize={10} />)

    await user.click(screen.getByTestId('pagination-last'))
    await user.click(screen.getByTestId('pagination-first'))
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 5')
  })

  it('prev button is disabled on page 1', () => {
    const rows = makeRows(30)
    render(<DataTableView rows={rows} pageSize={10} />)
    expect(screen.getByTestId('pagination-prev')).toBeDisabled()
  })

  it('next button is disabled on last page', async () => {
    const user = userEvent.setup()
    // 15 rows with pageSize=10 → 2 pages
    const rows = makeRows(15)
    render(<DataTableView rows={rows} pageSize={10} />)

    // Navigate to last page
    await user.click(screen.getByTestId('pagination-last'))
    expect(screen.getByTestId('pagination-next')).toBeDisabled()
  })

  it('does not render pagination when only 1 page', () => {
    const rows = makeRows(5)
    render(<DataTableView rows={rows} pageSize={25} />)
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
  })

  it('shows row count in footer', () => {
    const rows = makeRows(42)
    render(<DataTableView rows={rows} pageSize={10} />)
    expect(screen.getByTestId('row-count')).toHaveTextContent('42 rows')
  })
})

// ─── Column Visibility ────────────────────────────────────────────────────────

describe('DataTableView — column visibility toggle', () => {
  it('column toggle button is present when showColumnToggle=true', () => {
    render(<DataTableView rows={[{ id: 1, name: 'Alice' }]} />)
    expect(screen.getByTestId('column-toggle-button')).toBeInTheDocument()
  })

  it('column toggle panel opens when button is clicked', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ id: 1, name: 'Alice' }]} />)

    await user.click(screen.getByTestId('column-toggle-button'))
    expect(screen.getByTestId('column-toggle-panel')).toBeInTheDocument()
  })

  it('hiding "id" column removes it from the DOM', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ id: 1, name: 'Alice' }]} />)

    // Open toggle panel
    await user.click(screen.getByTestId('column-toggle-button'))

    // Uncheck the "id" column
    const idCheckbox = screen.getByTestId('col-toggle-id')
    await user.click(idCheckbox)

    // The "id" header should no longer be in the DOM
    expect(screen.queryByTestId('header-id')).not.toBeInTheDocument()
  })

  it('re-showing a hidden column makes it reappear', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ id: 1, name: 'Alice' }]} />)

    await user.click(screen.getByTestId('column-toggle-button'))

    // Hide "id"
    await user.click(screen.getByTestId('col-toggle-id'))
    expect(screen.queryByTestId('header-id')).not.toBeInTheDocument()

    // Show "id" again
    await user.click(screen.getByTestId('col-toggle-id'))
    expect(screen.getByTestId('header-id')).toBeInTheDocument()
  })

  it('hiding one column does not hide others', async () => {
    const user = userEvent.setup()
    render(<DataTableView rows={[{ id: 1, name: 'Alice', score: 99 }]} />)

    await user.click(screen.getByTestId('column-toggle-button'))
    await user.click(screen.getByTestId('col-toggle-id'))

    // Other columns still visible
    expect(screen.getByTestId('header-name')).toBeInTheDocument()
    expect(screen.getByTestId('header-score')).toBeInTheDocument()
  })

  it('column toggle button is NOT present when showColumnToggle=false', () => {
    render(<DataTableView rows={[{ id: 1 }]} showColumnToggle={false} />)
    expect(screen.queryByTestId('column-toggle-button')).not.toBeInTheDocument()
  })
})

// ─── Large Dataset ────────────────────────────────────────────────────────────

describe('DataTableView — large dataset performance', () => {
  it('renders 10,000 rows without crashing (pagination shows only current page)', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      id: i + 1,
      name: `item-${i + 1}`,
      revenue: (i + 1) * 123,
      status: i % 2 === 0 ? 'active' : 'inactive',
    }))

    expect(() => {
      render(<DataTableView rows={rows} pageSize={25} />)
    }).not.toThrow()

    // Should show only first page (25 rows), not all 10,000
    const tableBody = screen.getByTestId('data-table').querySelector('tbody')!
    const bodyRows = within(tableBody).getAllByRole('row')
    expect(bodyRows).toHaveLength(25)

    // Should show 400 pages total
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 1 of 400')
  })

  it('renders 1,000 rows and navigates to last page without crashing', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, val: i * 5 }))

    render(<DataTableView rows={rows} pageSize={50} />)

    await user.click(screen.getByTestId('pagination-last'))
    expect(screen.getByTestId('pagination-info')).toHaveTextContent('Page 20 of 20')
  })
})

// ─── formatCellValue Integration ─────────────────────────────────────────────

describe('DataTableView — formatCellValue integration', () => {
  it('renders large numbers with comma formatting', () => {
    render(<DataTableView rows={[{ revenue: 1234567 }]} />)
    expect(screen.getByTestId('cell-0-revenue')).toHaveTextContent('1,234,567')
  })

  it('renders ISO date strings as human-readable dates', () => {
    render(<DataTableView rows={[{ created_at: '2024-01-15' }]} />)
    const cell = screen.getByTestId('cell-0-created_at')
    // Should show something like "Jan 15, 2024"
    expect(cell.textContent).toMatch(/Jan/i)
    expect(cell.textContent).toMatch(/2024/)
  })

  it('renders boolean values as "true" or "false"', () => {
    render(<DataTableView rows={[{ active: true, deleted: false }]} />)
    expect(screen.getByTestId('cell-0-active')).toHaveTextContent('true')
    expect(screen.getByTestId('cell-0-deleted')).toHaveTextContent('false')
  })

  it('renders null values as empty cells', () => {
    render(<DataTableView rows={[{ optional: null }]} />)
    expect(screen.getByTestId('cell-0-optional')).toHaveTextContent('')
  })

  it('truncates very long string values', () => {
    const long = 'x'.repeat(300)
    render(<DataTableView rows={[{ description: long }]} cellMaxLength={100} />)
    const cell = screen.getByTestId('cell-0-description')
    expect(cell.textContent).toHaveLength(101) // 100 chars + '…'
    expect(cell.textContent).toMatch(/…$/)
  })
})
