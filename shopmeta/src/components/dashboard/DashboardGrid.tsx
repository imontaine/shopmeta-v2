// src/components/dashboard/DashboardGrid.tsx
// Drag-and-drop grid layout for dashboard widgets using react-grid-layout.
// Uses Responsive + WidthProvider for breakpoint-aware layouts:
//   lg (≥1200px): 12 cols · md (≥996px): 10 cols · sm (≥768px): 6 cols
//   xs (≥480px):  4 cols  · xxs (<480px): 2 cols   (mobile stacked)

import React, { useState, useCallback } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import type { Layout, Layouts } from 'react-grid-layout'
import type { GridItem, DashboardLayout } from '#/lib/dashboards'

// Inject the WidthProvider HOC so the grid fills its container width automatically
const ResponsiveGridLayout = WidthProvider(Responsive)


// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardGridProps {
  /** The initial layout (persisted grid positions) */
  layout: DashboardLayout
  /** The children to render as grid items. Each must have a `key` matching a layout `i`. */
  children: React.ReactNode
  /** Number of columns in the grid. Default: 12 */
  cols?: number
  /** Height of a single row in pixels. Default: 80 */
  rowHeight?: number
  /** Whether widgets can be dragged. Default: true */
  isDraggable?: boolean
  /** Whether widgets can be resized. Default: true */
  isResizable?: boolean
  /** Margin between grid items [horizontal, vertical]. Default: [8, 8] */
  margin?: [number, number]
  /** Called when layout changes (user drag or resize). Use to persist layout. */
  onLayoutChange?: (layout: DashboardLayout) => void
  /** Whether to show the empty state. Default: auto-detected when children is empty. */
  isEmpty?: boolean
  className?: string
}

// ─── DashboardGrid ────────────────────────────────────────────────────────────

export function DashboardGrid({
  layout,
  children,
  cols = 12,
  rowHeight = 80,
  isDraggable = true,
  isResizable = true,
  margin = [8, 8],
  onLayoutChange,
  className,
}: DashboardGridProps) {
  // Responsive breakpoint column counts
  const breakpointCols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }

  // Build responsive layouts: use the persisted layout for 'lg', reflow others
  const [currentLayouts, setCurrentLayouts] = useState<Layouts>({
    lg: layout,
    md: layout,
    sm: layout,
    xs: layout,
    xxs: layout,
  })

  const handleLayoutChange = useCallback(
    (_currentLayout: Layout[], allLayouts: Layouts) => {
      setCurrentLayouts(allLayouts)
      // Persist using the 'lg' layout as the canonical one
      const lgLayout = allLayouts.lg ?? []
      const normalized: DashboardLayout = lgLayout.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW,
        minH: item.minH,
        static: item.static,
      }))
      onLayoutChange?.(normalized)
    },
    [onLayoutChange],
  )

  const childCount = React.Children.count(children)

  if (childCount === 0) {
    return (
      <div
        data-testid="dashboard-grid-empty"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px',
          textAlign: 'center',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          minHeight: '300px',
          border: '2px dashed hsl(var(--border, 240 3.7% 25%))',
          borderRadius: '12px',
        }}
      >
        <span style={{ fontSize: '2.5rem', marginBottom: '16px' }}>📊</span>
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600 }}>
          No widgets yet
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>
          Add a widget to start building your dashboard
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="dashboard-grid"
      className={className}
      style={{ width: '100%' }}
    >
      <ResponsiveGridLayout
        className="layout"
        layouts={currentLayouts}
        breakpoints={breakpoints}
        cols={breakpointCols}
        rowHeight={rowHeight}
        isDraggable={isDraggable}
        isResizable={isResizable}
        margin={margin}
        onLayoutChange={handleLayoutChange}
        resizeHandles={['se', 'sw', 'ne', 'nw']}
        draggableHandle=".widget-drag-handle"
        useCSSTransforms
      >
        {children}
      </ResponsiveGridLayout>
    </div>
  )
}


// ─── Exports ──────────────────────────────────────────────────────────────────
// Re-export types from dashboards for convenience
export type { GridItem, DashboardLayout }
