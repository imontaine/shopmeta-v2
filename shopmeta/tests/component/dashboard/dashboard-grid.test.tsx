// tests/component/dashboard/dashboard-grid.test.tsx
// Component tests for DashboardGrid (react-grid-layout wrapper) and Widget.
// Tests: widget count, layout rendering, drag-and-drop layout change callback,
// resize layout change, empty state, widget header/controls.

import React from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock react-grid-layout ─────────────────────────────────────────────────
// react-grid-layout relies on DOM measurements (getBoundingClientRect, ResizeObserver)
// which jsdom cannot provide. We mock it to render children directly inside a wrapper.
vi.mock('react-grid-layout', async () => {
  // The default export is the GridLayout component.
  // WidthProvider HOC just renders its wrapped component.
  const GridLayout = ({
    children,
    onLayoutChange,
    layout,
    layouts,
  }: {
    children: React.ReactNode
    onLayoutChange?: (layout: unknown[], allLayouts?: unknown) => void
    layout?: unknown[]
    layouts?: { lg?: unknown[] }
  }) => {
    const activeLayout = layout ?? layouts?.lg ?? []
    return (
      <div
        data-testid="rgl-grid"
        data-layout={JSON.stringify(activeLayout)}
        // Expose a way to simulate layout change in tests
        onClick={() => onLayoutChange?.(activeLayout, layouts ?? {})}
      >
        {children}
      </div>
    )
  }

  // Responsive is essentially the same GridLayout in tests
  const Responsive = GridLayout

  // WidthProvider is a HOC — just return the component as-is
  const WidthProvider = (Component: React.ComponentType<unknown>) => Component

  return {
    default: GridLayout,
    Responsive,
    WidthProvider,
  }
})


import { DashboardGrid } from '#/components/dashboard/DashboardGrid'
import { Widget } from '#/components/dashboard/Widget'
import type { DashboardLayout } from '#/components/dashboard/DashboardGrid'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const threeWidgetLayout: DashboardLayout = [
  { i: 'w1', x: 0, y: 0, w: 6, h: 4 },
  { i: 'w2', x: 6, y: 0, w: 6, h: 4 },
  { i: 'w3', x: 0, y: 4, w: 12, h: 3 },
]

function makeWidgets(ids: string[]) {
  return ids.map((id) => (
    <div key={id} data-testid={`grid-item-${id}`}>
      Widget {id}
    </div>
  ))
}

// ─── DashboardGrid — render ───────────────────────────────────────────────────

describe('DashboardGrid — rendering', () => {
  it('renders the grid container', () => {
    render(
      <DashboardGrid layout={threeWidgetLayout}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )
    expect(screen.getByTestId('dashboard-grid')).toBeInTheDocument()
  })

  it('renders 3 widgets when 3 children provided', () => {
    render(
      <DashboardGrid layout={threeWidgetLayout}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )
    expect(screen.getByTestId('grid-item-w1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-w2')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-w3')).toBeInTheDocument()
  })

  it('renders 1 widget when only 1 child provided', () => {
    render(
      <DashboardGrid layout={[{ i: 'w1', x: 0, y: 0, w: 12, h: 4 }]}>
        <div key="w1" data-testid="grid-item-w1">Widget</div>
      </DashboardGrid>,
    )
    expect(screen.getByTestId('grid-item-w1')).toBeInTheDocument()
  })

  it('renders grid with react-grid-layout inner element', () => {
    render(
      <DashboardGrid layout={threeWidgetLayout}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )
    // Our mock renders 'rgl-grid'
    expect(screen.getByTestId('rgl-grid')).toBeInTheDocument()
  })

  it('passes layout to the underlying grid via data-layout attribute', () => {
    render(
      <DashboardGrid layout={threeWidgetLayout}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )
    const grid = screen.getByTestId('rgl-grid')
    const layoutAttr = JSON.parse(grid.getAttribute('data-layout') ?? '[]')
    expect(layoutAttr).toHaveLength(3)
  })
})

// ─── DashboardGrid — empty state ─────────────────────────────────────────────

describe('DashboardGrid — empty state', () => {
  it('shows empty state when no children', () => {
    render(<DashboardGrid layout={[]}>{[]}</DashboardGrid>)
    expect(screen.getByTestId('dashboard-grid-empty')).toBeInTheDocument()
  })

  it('empty state contains helpful message', () => {
    render(<DashboardGrid layout={[]}>{[]}</DashboardGrid>)
    const empty = screen.getByTestId('dashboard-grid-empty')
    expect(empty.textContent).toContain('No widgets yet')
  })

  it('does not render grid container in empty state', () => {
    render(<DashboardGrid layout={[]}>{[]}</DashboardGrid>)
    expect(screen.queryByTestId('dashboard-grid')).not.toBeInTheDocument()
  })
})

// ─── DashboardGrid — layout change callback ───────────────────────────────────

describe('DashboardGrid — onLayoutChange (drag and resize)', () => {
  it('calls onLayoutChange when layout changes (simulated drag)', async () => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()

    render(
      <DashboardGrid layout={threeWidgetLayout} onLayoutChange={onLayoutChange}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )

    // Clicking the mock grid triggers onLayoutChange (simulates drag/resize)
    await user.click(screen.getByTestId('rgl-grid'))

    expect(onLayoutChange).toHaveBeenCalled()
  })

  it('onLayoutChange receives the new layout array', async () => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()
    const layout: DashboardLayout = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]

    render(
      <DashboardGrid layout={layout} onLayoutChange={onLayoutChange}>
        <div key="w1">W1</div>
      </DashboardGrid>,
    )

    await user.click(screen.getByTestId('rgl-grid'))

    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ i: 'w1' }),
      ]),
    )
  })

  it('does not throw when onLayoutChange is not provided', async () => {
    const user = userEvent.setup()
    render(
      <DashboardGrid layout={threeWidgetLayout}>
        {makeWidgets(['w1', 'w2', 'w3'])}
      </DashboardGrid>,
    )
    // Should not throw
    await expect(user.click(screen.getByTestId('rgl-grid'))).resolves.not.toThrow()
  })

  it('layout change updates widget positions (resize scenario)', async () => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()

    // Start with a 6-wide widget
    const initialLayout: DashboardLayout = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]

    const { rerender } = render(
      <DashboardGrid layout={initialLayout} onLayoutChange={onLayoutChange}>
        <div key="w1">W1</div>
      </DashboardGrid>,
    )

    // Simulate resize: rerender with new layout
    const resizedLayout: DashboardLayout = [{ i: 'w1', x: 0, y: 0, w: 12, h: 4 }]
    rerender(
      <DashboardGrid layout={resizedLayout} onLayoutChange={onLayoutChange}>
        <div key="w1">W1</div>
      </DashboardGrid>,
    )

    await user.click(screen.getByTestId('rgl-grid'))
    expect(onLayoutChange).toHaveBeenCalled()
  })
})

// ─── Widget component ─────────────────────────────────────────────────────────

describe('Widget — rendering', () => {
  it('renders the widget container', () => {
    render(<Widget id="w1" title="Revenue" />)
    expect(screen.getByTestId('widget-w1')).toBeInTheDocument()
  })

  it('renders the widget title', () => {
    render(<Widget id="w1" title="Monthly Revenue" />)
    expect(screen.getByTestId('widget-title-w1')).toHaveTextContent('Monthly Revenue')
  })

  it('renders children in the widget body', () => {
    render(
      <Widget id="w1" title="Test">
        <div data-testid="widget-content">Chart goes here</div>
      </Widget>,
    )
    expect(screen.getByTestId('widget-content')).toBeInTheDocument()
  })

  it('widget body contains the children', () => {
    render(
      <Widget id="w1" title="Test">
        <span>My chart content</span>
      </Widget>,
    )
    const body = screen.getByTestId('widget-body-w1')
    expect(body.textContent).toContain('My chart content')
  })

  it('header has widget-drag-handle class for dragging', () => {
    render(<Widget id="w1" title="Draggable" />)
    const header = screen.getByTestId('widget-header-w1')
    expect(header).toHaveClass('widget-drag-handle')
  })
})

describe('Widget — loading state', () => {
  it('shows loading indicator when loading=true', () => {
    render(<Widget id="w1" title="Loading Widget" loading />)
    expect(screen.getByTestId('widget-loading-w1')).toBeInTheDocument()
  })

  it('does not render children when loading', () => {
    render(
      <Widget id="w1" title="Loading Widget" loading>
        <div data-testid="hidden-content">Should not show</div>
      </Widget>,
    )
    expect(screen.queryByTestId('hidden-content')).not.toBeInTheDocument()
  })
})

describe('Widget — error state', () => {
  it('shows error message when error prop is provided', () => {
    render(<Widget id="w1" title="Error Widget" error="Query failed: timeout" />)
    expect(screen.getByTestId('widget-error-w1')).toBeInTheDocument()
    expect(screen.getByTestId('widget-error-w1').textContent).toContain('Query failed: timeout')
  })

  it('does not render children when error is present', () => {
    render(
      <Widget id="w1" title="Error Widget" error="DB down">
        <div data-testid="hidden-content">Not visible</div>
      </Widget>,
    )
    expect(screen.queryByTestId('hidden-content')).not.toBeInTheDocument()
  })
})

describe('Widget — action buttons', () => {
  it('renders remove button when onRemove is provided', () => {
    render(<Widget id="w1" title="Removable" onRemove={vi.fn()} />)
    expect(screen.getByTestId('widget-remove-w1')).toBeInTheDocument()
  })

  it('does not render remove button when onRemove is not provided', () => {
    render(<Widget id="w1" title="No Remove" />)
    expect(screen.queryByTestId('widget-remove-w1')).not.toBeInTheDocument()
  })

  it('calls onRemove with the widget id when remove button clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<Widget id="w1" title="Remove Me" onRemove={onRemove} />)

    await user.click(screen.getByTestId('widget-remove-w1'))
    expect(onRemove).toHaveBeenCalledWith('w1')
  })

  it('renders edit button when onEdit is provided', () => {
    render(<Widget id="w1" title="Editable" onEdit={vi.fn()} />)
    expect(screen.getByTestId('widget-edit-w1')).toBeInTheDocument()
  })

  it('does not render edit button when onEdit is not provided', () => {
    render(<Widget id="w1" title="No Edit" />)
    expect(screen.queryByTestId('widget-edit-w1')).not.toBeInTheDocument()
  })

  it('calls onEdit with widget id when edit button clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Widget id="w2" title="Edit Me" onEdit={onEdit} />)

    await user.click(screen.getByTestId('widget-edit-w2'))
    expect(onEdit).toHaveBeenCalledWith('w2')
  })
})

// ─── Integration: DashboardGrid + Widget ─────────────────────────────────────

describe('DashboardGrid + Widget — integration', () => {
  it('renders 3 Widget children in the grid', () => {
    const layout: DashboardLayout = [
      { i: 'sales', x: 0, y: 0, w: 6, h: 4 },
      { i: 'orders', x: 6, y: 0, w: 6, h: 4 },
      { i: 'revenue', x: 0, y: 4, w: 12, h: 3 },
    ]

    render(
      <DashboardGrid layout={layout}>
        <div key="sales"><Widget id="sales" title="Sales" /></div>
        <div key="orders"><Widget id="orders" title="Orders" /></div>
        <div key="revenue"><Widget id="revenue" title="Revenue" /></div>
      </DashboardGrid>,
    )

    expect(screen.getByTestId('widget-sales')).toBeInTheDocument()
    expect(screen.getByTestId('widget-orders')).toBeInTheDocument()
    expect(screen.getByTestId('widget-revenue')).toBeInTheDocument()
  })

  it('widget titles are all visible', () => {
    const layout: DashboardLayout = [
      { i: 'w1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'w2', x: 6, y: 0, w: 6, h: 4 },
    ]

    render(
      <DashboardGrid layout={layout}>
        <div key="w1"><Widget id="w1" title="Chart Alpha" /></div>
        <div key="w2"><Widget id="w2" title="Table Beta" /></div>
      </DashboardGrid>,
    )

    expect(screen.getByTestId('widget-title-w1')).toHaveTextContent('Chart Alpha')
    expect(screen.getByTestId('widget-title-w2')).toHaveTextContent('Table Beta')
  })

  it('onRemove callback works when inside grid', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const layout: DashboardLayout = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]

    render(
      <DashboardGrid layout={layout}>
        <div key="w1">
          <Widget id="w1" title="Removable" onRemove={onRemove} />
        </div>
      </DashboardGrid>,
    )

    await user.click(screen.getByTestId('widget-remove-w1'))
    expect(onRemove).toHaveBeenCalledWith('w1')
  })

  it('grid + widget renders without errors for all widget types', () => {
    const layout: DashboardLayout = [
      { i: 'chart-1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'table-1', x: 6, y: 0, w: 6, h: 4 },
      { i: 'kpi-1', x: 0, y: 4, w: 3, h: 2 },
    ]

    const { container } = render(
      <DashboardGrid layout={layout}>
        <div key="chart-1"><Widget id="chart-1" title="Revenue Chart" type="chart" /></div>
        <div key="table-1"><Widget id="table-1" title="Orders Table" type="table" /></div>
        <div key="kpi-1"><Widget id="kpi-1" title="MRR" type="kpi" /></div>
      </DashboardGrid>,
    )

    expect(container).toBeTruthy()
    expect(screen.getByTestId('widget-chart-1')).toBeInTheDocument()
    expect(screen.getByTestId('widget-table-1')).toBeInTheDocument()
    expect(screen.getByTestId('widget-kpi-1')).toBeInTheDocument()
  })
})
