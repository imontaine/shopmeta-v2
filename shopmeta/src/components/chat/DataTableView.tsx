// src/components/chat/DataTableView.tsx
// Query result data table using @tanstack/react-table v8.
//
// Features:
//  - Auto-generates columns from the keys of the first row object
//  - Click header to sort ascending → descending → unsorted
//  - Configurable page size with page count display
//  - Column visibility toggle (show/hide individual columns)
//  - Empty state message when rows = []
//  - Handles 10,000+ rows (only renders current page)
//  - formatCellValue for numbers, dates, long strings

import React, { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type PaginationState,
} from '@tanstack/react-table'
import { formatCellValue } from '#/lib/utils/formatCellValue'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RowData = Record<string, unknown>

export interface DataTableViewProps {
  /** Array of row objects (auto-generates columns from keys) */
  rows: RowData[]
  /** Number of rows per page. Default: 25 */
  pageSize?: number
  /** Optional custom class name for the outer container */
  className?: string
  /** Whether to show the column visibility toggle panel */
  showColumnToggle?: boolean
  /** Max character length before cell value is truncated */
  cellMaxLength?: number
}

// ─── Column Auto-Generation ───────────────────────────────────────────────────

function buildColumns(rows: RowData[], cellMaxLength: number): ColumnDef<RowData>[] {
  if (rows.length === 0) return []

  // Derive column keys from the union of all row keys (first row is enough for most cases)
  const keys = Object.keys(rows[0]!)

  return keys.map((key) => ({
    id: key,
    accessorKey: key,
    header: key,
    cell: ({ getValue }) => formatCellValue(getValue(), { maxLength: cellMaxLength }),
    // Enable sorting; first click → ascending (not descending)
    enableSorting: true,
    sortDescFirst: false,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DataTableView({
  rows,
  pageSize: initialPageSize = 25,
  className,
  showColumnToggle = true,
  cellMaxLength = 200,
}: DataTableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  })
  const [showToggle, setShowToggle] = useState(false)

  const columns = useMemo(() => buildColumns(rows, cellMaxLength), [rows, cellMaxLength])

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: false,
  })

  const totalPages = table.getPageCount()
  const currentPage = pagination.pageIndex + 1

  // ─── Empty State ───────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div
        data-testid="data-table-empty"
        className={className}
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          fontSize: '0.9rem',
        }}
      >
        No results
      </div>
    )
  }

  // ─── Main Table ────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="data-table-view"
      className={className}
      style={{ width: '100%', overflow: 'hidden' }}
    >
      {/* Column Visibility Toggle */}
      {showColumnToggle && columns.length > 0 && (
        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            data-testid="column-toggle-button"
            onClick={() => setShowToggle((v) => !v)}
            aria-expanded={showToggle}
            aria-label="Toggle column visibility"
            style={{
              padding: '4px 10px',
              fontSize: '0.78rem',
              borderRadius: '4px',
              border: '1px solid hsl(var(--border, 240 3.7% 25%))',
              background: 'transparent',
              color: 'hsl(var(--foreground, 0 0% 98%))',
              cursor: 'pointer',
            }}
          >
            Columns
          </button>

          {showToggle && (
            <div
              data-testid="column-toggle-panel"
              role="group"
              aria-label="Column visibility"
              style={{
                position: 'absolute',
                zIndex: 50,
                background: 'hsl(var(--background, 240 10% 3.9%))',
                border: '1px solid hsl(var(--border, 240 3.7% 25%))',
                borderRadius: '6px',
                padding: '8px',
                marginTop: '28px',
                minWidth: '140px',
              }}
            >
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    color: 'hsl(var(--foreground, 0 0% 98%))',
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid={`col-toggle-${col.id}`}
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  {col.id}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table
          data-testid="data-table"
          role="table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.82rem',
          }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} role="row">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      role="columnheader"
                      data-testid={`header-${header.id}`}
                      onClick={header.column.getToggleSortingHandler()}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                          ? 'descending'
                          : 'none'
                      }
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        borderBottom: '1px solid hsl(var(--border, 240 3.7% 25%))',
                        background: 'hsl(var(--muted, 240 4.8% 15.88%))',
                        fontWeight: 600,
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        color: 'hsl(var(--foreground, 0 0% 98%))',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && (
                          <span aria-hidden="true" data-testid={`sort-asc-${header.id}`}>↑</span>
                        )}
                        {sorted === 'desc' && (
                          <span aria-hidden="true" data-testid={`sort-desc-${header.id}`}>↓</span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                role="row"
                data-testid={`row-${rowIdx}`}
                style={{
                  borderBottom: '1px solid hsl(var(--border, 240 3.7% 25%) / 0.5)',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    role="cell"
                    data-testid={`cell-${rowIdx}-${cell.column.id}`}
                    style={{
                      padding: '6px 10px',
                      color: 'hsl(var(--foreground, 0 0% 98%))',
                      maxWidth: '320px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          data-testid="pagination"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 4px',
            fontSize: '0.8rem',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              data-testid="pagination-first"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
              style={paginationBtnStyle(!table.getCanPreviousPage())}
            >
              «
            </button>
            <button
              data-testid="pagination-prev"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              style={paginationBtnStyle(!table.getCanPreviousPage())}
            >
              ‹
            </button>
          </div>

          <span data-testid="pagination-info">
            Page {currentPage} of {totalPages}
          </span>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              data-testid="pagination-next"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              style={paginationBtnStyle(!table.getCanNextPage())}
            >
              ›
            </button>
            <button
              data-testid="pagination-last"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
              style={paginationBtnStyle(!table.getCanNextPage())}
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Row count summary */}
      <div
        data-testid="row-count"
        style={{
          fontSize: '0.75rem',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          padding: '2px 4px',
          textAlign: 'right',
        }}
      >
        {rows.length.toLocaleString('en-US')} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid hsl(var(--border, 240 3.7% 25%))',
    background: 'transparent',
    color: disabled
      ? 'hsl(var(--muted-foreground, 240 5% 64.9%))'
      : 'hsl(var(--foreground, 0 0% 98%))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}
