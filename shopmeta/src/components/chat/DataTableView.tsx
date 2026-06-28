// src/components/chat/DataTableView.tsx
// Query result data table using @tanstack/react-table v8.
// Restyled with Tailwind classes (prompt-kit migration).
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
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RowData = Record<string, unknown>

export interface DataTableViewProps {
  rows: RowData[]
  pageSize?: number
  className?: string
  showColumnToggle?: boolean
  cellMaxLength?: number
}

// ─── Column Auto-Generation ───────────────────────────────────────────────────

function buildColumns(rows: RowData[], cellMaxLength: number): ColumnDef<RowData>[] {
  if (rows.length === 0) return []
  const keys = Object.keys(rows[0]!)
  return keys.map((key) => ({
    id: key,
    accessorKey: key,
    header: key,
    cell: ({ getValue }) => formatCellValue(getValue(), { maxLength: cellMaxLength }),
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
        className={cn('text-muted-foreground px-4 py-8 text-center text-sm', className)}
      >
        No results
      </div>
    )
  }

  // ─── Main Table ────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="data-table-view"
      className={cn('w-full overflow-hidden', className)}
    >
      {/* Column Visibility Toggle */}
      {showColumnToggle && columns.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            data-testid="column-toggle-button"
            onClick={() => setShowToggle((v) => !v)}
            aria-expanded={showToggle}
            aria-label="Toggle column visibility"
            className="border-border text-foreground cursor-pointer rounded border bg-transparent px-2.5 py-1 text-xs"
          >
            Columns
          </button>

          {showToggle && (
            <div
              data-testid="column-toggle-panel"
              role="group"
              aria-label="Column visibility"
              className="bg-background border-border absolute z-50 mt-7 min-w-[140px] rounded-md border p-2"
            >
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  className="text-foreground flex cursor-pointer items-center gap-1.5 px-1 py-0.5 text-[0.8rem]"
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
      <div className="overflow-x-auto">
        <table
          data-testid="data-table"
          role="table"
          className="w-full border-collapse text-[0.82rem]"
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
                      className={cn(
                        'bg-muted border-border text-foreground whitespace-nowrap border-b px-2.5 py-2 text-left font-semibold select-none',
                        header.column.getCanSort() && 'cursor-pointer',
                      )}
                    >
                      <span className="flex items-center gap-1">
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
                className="border-border/50 border-b"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    role="cell"
                    data-testid={`cell-${rowIdx}-${cell.column.id}`}
                    className="text-foreground max-w-[320px] truncate px-2.5 py-1.5"
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
          className="text-muted-foreground flex items-center justify-between px-1 py-2 text-[0.8rem]"
        >
          <div className="flex gap-1">
            <button
              data-testid="pagination-first"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
              className={paginationBtnClass(!table.getCanPreviousPage())}
            >
              «
            </button>
            <button
              data-testid="pagination-prev"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
              className={paginationBtnClass(!table.getCanPreviousPage())}
            >
              ‹
            </button>
          </div>

          <span data-testid="pagination-info">
            Page {currentPage} of {totalPages}
          </span>

          <div className="flex gap-1">
            <button
              data-testid="pagination-next"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
              className={paginationBtnClass(!table.getCanNextPage())}
            >
              ›
            </button>
            <button
              data-testid="pagination-last"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
              className={paginationBtnClass(!table.getCanNextPage())}
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Row count summary */}
      <div
        data-testid="row-count"
        className="text-muted-foreground px-1 py-0.5 text-right text-xs"
      >
        {rows.length.toLocaleString('en-US')} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginationBtnClass(disabled: boolean): string {
  return cn(
    'border-border rounded border bg-transparent px-2 py-0.5 cursor-pointer',
    disabled
      ? 'text-muted-foreground cursor-not-allowed opacity-50'
      : 'text-foreground',
  )
}
