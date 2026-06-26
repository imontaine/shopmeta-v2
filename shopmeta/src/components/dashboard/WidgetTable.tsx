// src/components/dashboard/WidgetTable.tsx
// Table widget — renders rows using DataTableView (Unit 9).

import React from 'react'
import { DataTableView } from '#/components/chat/DataTableView'

export interface WidgetTableProps {
  /** The query result rows */
  rows: Array<Record<string, unknown>>
  /** Number of rows per page. Default: 10 */
  pageSize?: number
  className?: string
}

export function WidgetTable({ rows, pageSize = 10, className }: WidgetTableProps) {
  return (
    <div
      data-testid="widget-table"
      className={className}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <DataTableView rows={rows} pageSize={pageSize} />
    </div>
  )
}
