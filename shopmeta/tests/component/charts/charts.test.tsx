// tests/component/charts/charts.test.tsx
// Component tests for chart components: LineChartView, BarChartView,
// AreaChartView, PieChartView, ChartConfigEditor, ChartTypeSwitcher, ChartView.
//
// KEY: Recharts' ResponsiveContainer needs a non-zero container to render SVG.
// In jsdom there is no layout engine, so containerWidth=0 → SVG is not rendered.
// We mock ResponsiveContainer to render children directly with a fixed width.
// This lets us test SVG presence while all real Recharts logic stays intact.

import React, { useState } from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock ResponsiveContainer ─────────────────────────────────────────────────
// Must be before importing chart components (hoisted by Vitest's vi.mock)

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    // Override ResponsiveContainer to render children with fixed width/height
    ResponsiveContainer: ({ children, height }: { children: React.ReactElement; height?: number }) => (
      <div style={{ width: 600, height: height ?? 300 }}>
        {React.cloneElement(children, { width: 600, height: height ?? 300 })}
      </div>
    ),
  }
})

// ─── Imports ──────────────────────────────────────────────────────────────────

import { LineChartView } from '#/components/charts/LineChartView'
import { BarChartView } from '#/components/charts/BarChartView'
import { AreaChartView } from '#/components/charts/AreaChartView'
import { PieChartView } from '#/components/charts/PieChartView'
import { ChartConfigEditor } from '#/components/charts/ChartConfigEditor'
import { ChartTypeSwitcher } from '#/components/charts/ChartTypeSwitcher'
import { ChartView } from '#/components/charts/ChartView'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const timeSeriesData = [
  { date: '2024-01', revenue: 1000, cost: 800 },
  { date: '2024-02', revenue: 1200, cost: 900 },
  { date: '2024-03', revenue: 1500, cost: 1100 },
]

const categoricalData = [
  { region: 'APAC', sales: 500 },
  { region: 'EMEA', sales: 300 },
  { region: 'AMER', sales: 700 },
]

const pieData = [
  { status: 'shipped', count: 10 },
  { status: 'pending', count: 5 },
  { status: 'cancelled', count: 2 },
]

// ─── LineChartView ────────────────────────────────────────────────────────────

describe('LineChartView', () => {
  it('renders the chart wrapper', () => {
    render(<LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} />)
    expect(screen.getByTestId('line-chart-wrapper')).toBeInTheDocument()
  })

  it('renders an SVG element (Recharts output)', () => {
    const { container } = render(
      <LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} height={300} />,
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders path elements (line strokes) in the SVG', () => {
    const { container } = render(
      <LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} height={300} />,
    )
    const paths = container.querySelectorAll('path')
    // Recharts creates path elements for line strokes, grid, etc.
    expect(paths.length).toBeGreaterThan(0)
  })

  it('shows chart title when provided', () => {
    render(
      <LineChartView
        data={timeSeriesData}
        xKey="date"
        yKeys={['revenue']}
        title="Monthly Revenue"
      />,
    )
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Monthly Revenue')
  })

  it('does not show title element when no title provided', () => {
    render(<LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} />)
    expect(screen.queryByTestId('chart-title')).not.toBeInTheDocument()
  })

  it('renders without error for multiple y-axis series', () => {
    expect(() =>
      render(
        <LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue', 'cost']} />,
      ),
    ).not.toThrow()
  })

  it('renders without error for empty data', () => {
    expect(() =>
      render(<LineChartView data={[]} xKey="date" yKeys={['revenue']} />),
    ).not.toThrow()
  })

  it('wrapper has accessible aria-label', () => {
    render(
      <LineChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} title="Revenue" />,
    )
    const wrapper = screen.getByTestId('line-chart-wrapper')
    expect(wrapper).toHaveAttribute('aria-label', 'Revenue')
  })
})

// ─── BarChartView ─────────────────────────────────────────────────────────────

describe('BarChartView', () => {
  it('renders the chart wrapper', () => {
    render(<BarChartView data={categoricalData} xKey="region" yKeys={['sales']} />)
    expect(screen.getByTestId('bar-chart-wrapper')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = render(
      <BarChartView data={categoricalData} xKey="region" yKeys={['sales']} height={300} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders rect elements (bar shapes) in the SVG', () => {
    const { container } = render(
      <BarChartView data={categoricalData} xKey="region" yKeys={['sales']} height={300} />,
    )
    const rects = container.querySelectorAll('rect')
    // Recharts creates rect elements for bars, backgrounds, clip paths
    expect(rects.length).toBeGreaterThan(0)
  })

  it('shows chart title when provided', () => {
    render(
      <BarChartView
        data={categoricalData}
        xKey="region"
        yKeys={['sales']}
        title="Sales by Region"
      />,
    )
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Sales by Region')
  })

  it('renders without error for empty data', () => {
    expect(() =>
      render(<BarChartView data={[]} xKey="region" yKeys={['sales']} />),
    ).not.toThrow()
  })

  it('renders without error for multi-series bars', () => {
    const multiData = [
      { region: 'A', q1: 100, q2: 150 },
      { region: 'B', q1: 200, q2: 180 },
    ]
    expect(() =>
      render(<BarChartView data={multiData} xKey="region" yKeys={['q1', 'q2']} />),
    ).not.toThrow()
  })
})

// ─── AreaChartView ────────────────────────────────────────────────────────────

describe('AreaChartView', () => {
  it('renders the chart wrapper', () => {
    render(<AreaChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} />)
    expect(screen.getByTestId('area-chart-wrapper')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = render(
      <AreaChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} height={300} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders gradient defs in the SVG', () => {
    const { container } = render(
      <AreaChartView data={timeSeriesData} xKey="date" yKeys={['revenue']} />,
    )
    const defs = container.querySelector('defs')
    expect(defs).not.toBeNull()
  })

  it('renders without error for stacked areas', () => {
    expect(() =>
      render(
        <AreaChartView
          data={timeSeriesData}
          xKey="date"
          yKeys={['revenue', 'cost']}
          stacked
        />,
      ),
    ).not.toThrow()
  })

  it('renders title when provided', () => {
    render(
      <AreaChartView
        data={timeSeriesData}
        xKey="date"
        yKeys={['revenue']}
        title="Revenue Trend"
      />,
    )
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Revenue Trend')
  })
})

// ─── PieChartView ─────────────────────────────────────────────────────────────

describe('PieChartView', () => {
  it('renders the chart wrapper', () => {
    render(<PieChartView data={pieData} nameKey="status" valueKey="count" />)
    expect(screen.getByTestId('pie-chart-wrapper')).toBeInTheDocument()
  })

  it('renders an SVG element', () => {
    const { container } = render(
      <PieChartView data={pieData} nameKey="status" valueKey="count" height={300} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders sector/path elements for pie slices', () => {
    const { container } = render(
      <PieChartView data={pieData} nameKey="status" valueKey="count" height={300} />,
    )
    // Recharts renders pie slices as path elements inside the SVG
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
  })

  it('renders without error in doughnut mode', () => {
    expect(() =>
      render(
        <PieChartView data={pieData} nameKey="status" valueKey="count" doughnut />,
      ),
    ).not.toThrow()
  })

  it('renders title when provided', () => {
    render(
      <PieChartView
        data={pieData}
        nameKey="status"
        valueKey="count"
        title="Order Status"
      />,
    )
    expect(screen.getByTestId('chart-title')).toHaveTextContent('Order Status')
  })

  it('renders without error for single data point', () => {
    const single = [{ category: 'Only', value: 100 }]
    expect(() =>
      render(<PieChartView data={single} nameKey="category" valueKey="value" />),
    ).not.toThrow()
  })
})

// ─── ChartTypeSwitcher ────────────────────────────────────────────────────────

describe('ChartTypeSwitcher', () => {
  it('renders all 4 chart type buttons', () => {
    render(<ChartTypeSwitcher current="line" onChange={vi.fn()} />)
    expect(screen.getByTestId('chart-type-btn-line')).toBeInTheDocument()
    expect(screen.getByTestId('chart-type-btn-bar')).toBeInTheDocument()
    expect(screen.getByTestId('chart-type-btn-area')).toBeInTheDocument()
    expect(screen.getByTestId('chart-type-btn-pie')).toBeInTheDocument()
  })

  it('active button has aria-selected=true', () => {
    render(<ChartTypeSwitcher current="bar" onChange={vi.fn()} />)
    expect(screen.getByTestId('chart-type-btn-bar')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('chart-type-btn-line')).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange when a different type is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChartTypeSwitcher current="line" onChange={onChange} />)

    await user.click(screen.getByTestId('chart-type-btn-bar'))
    expect(onChange).toHaveBeenCalledWith('bar')
  })

  it('calls onChange with "pie" when pie button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChartTypeSwitcher current="line" onChange={onChange} />)

    await user.click(screen.getByTestId('chart-type-btn-pie'))
    expect(onChange).toHaveBeenCalledWith('pie')
  })

  it('has role=tablist on the container', () => {
    render(<ChartTypeSwitcher current="line" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('each button has role=tab', () => {
    render(<ChartTypeSwitcher current="line" onChange={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
  })
})

// ─── ChartConfigEditor ────────────────────────────────────────────────────────

describe('ChartConfigEditor', () => {
  const config = {
    type: 'bar' as const,
    xAxis: 'region',
    yAxis: ['sales'],
    title: 'Sales by Region',
  }

  it('renders with all fields', () => {
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('chart-config-editor')).toBeInTheDocument()
    expect(screen.getByTestId('chart-title-input')).toBeInTheDocument()
    expect(screen.getByTestId('chart-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('chart-xaxis-select')).toBeInTheDocument()
    expect(screen.getByTestId('chart-yaxis-group')).toBeInTheDocument()
  })

  it('title input shows current title', () => {
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('chart-title-input')).toHaveValue('Sales by Region')
  })

  it('chart type select shows current type', () => {
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('chart-type-select')).toHaveValue('bar')
  })

  it('x-axis select shows current xAxis', () => {
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('chart-xaxis-select')).toHaveValue('region')
  })

  it('changing chart type calls onChange with new type', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={onChange} />,
    )

    await user.selectOptions(screen.getByTestId('chart-type-select'), 'line')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'line' }),
    )
  })

  it('changing x-axis calls onChange with new xAxis', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={onChange} />,
    )

    await user.selectOptions(screen.getByTestId('chart-xaxis-select'), 'sales')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxis: 'sales' }),
    )
  })

  it('changing title calls onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ChartConfigEditor config={config} columns={['region', 'sales']} onChange={onChange} />,
    )

    const input = screen.getByTestId('chart-title-input')
    await user.clear(input)
    await user.type(input, 'New Title')
    // onChange called on each keystroke
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall[0].title).toBe('New Title')
  })

  it('y-axis checkboxes show correct checked state', () => {
    const cfg = { ...config, yAxis: ['sales'] }
    render(
      <ChartConfigEditor config={cfg} columns={['region', 'sales', 'profit']} onChange={vi.fn()} />,
    )

    expect(screen.getByTestId('yaxis-toggle-sales')).toBeChecked()
    expect(screen.getByTestId('yaxis-toggle-profit')).not.toBeChecked()
  })

  it('toggling a y-axis checkbox calls onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ChartConfigEditor
        config={{ ...config, yAxis: ['sales'] }}
        columns={['region', 'sales', 'profit']}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByTestId('yaxis-toggle-profit'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ yAxis: expect.arrayContaining(['sales', 'profit']) }),
    )
  })
})

// ─── ChartView (unified) ──────────────────────────────────────────────────────

describe('ChartView — unified chart component', () => {
  it('auto-suggests line chart for time-series data', () => {
    render(<ChartView rows={timeSeriesData} />)
    expect(screen.getByTestId('chart-view')).toBeInTheDocument()
    // Line chart wrapper should be present
    expect(screen.getByTestId('line-chart-wrapper')).toBeInTheDocument()
  })

  it('shows chart type switcher', () => {
    render(<ChartView rows={timeSeriesData} />)
    expect(screen.getByTestId('chart-type-switcher')).toBeInTheDocument()
  })

  it('shows "no suggestion" message when data has no numeric columns', () => {
    const noNumericData = [{ name: 'Alice', city: 'NYC' }]
    render(<ChartView rows={noNumericData} />)
    expect(screen.getByTestId('chart-view-no-suggestion')).toBeInTheDocument()
  })

  it('switching line → bar renders bar chart instead', async () => {
    const user = userEvent.setup()
    render(<ChartView rows={timeSeriesData} />)

    // Initially line chart
    expect(screen.getByTestId('line-chart-wrapper')).toBeInTheDocument()

    // Switch to bar
    await user.click(screen.getByTestId('chart-type-btn-bar'))

    // Now bar chart should be visible
    expect(screen.getByTestId('bar-chart-wrapper')).toBeInTheDocument()
    expect(screen.queryByTestId('line-chart-wrapper')).not.toBeInTheDocument()
  })

  it('switching line → pie renders pie chart', async () => {
    const user = userEvent.setup()
    render(<ChartView rows={timeSeriesData} />)

    await user.click(screen.getByTestId('chart-type-btn-pie'))
    expect(screen.getByTestId('pie-chart-wrapper')).toBeInTheDocument()
  })

  it('switching line → area renders area chart', async () => {
    const user = userEvent.setup()
    render(<ChartView rows={timeSeriesData} />)

    await user.click(screen.getByTestId('chart-type-btn-area'))
    expect(screen.getByTestId('area-chart-wrapper')).toBeInTheDocument()
  })

  it('config editor toggle button is shown', () => {
    render(<ChartView rows={categoricalData} />)
    expect(screen.getByTestId('chart-edit-toggle')).toBeInTheDocument()
  })

  it('config editor appears after clicking configure button', async () => {
    const user = userEvent.setup()
    render(<ChartView rows={categoricalData} />)

    // Editor should be hidden initially
    expect(screen.queryByTestId('chart-config-editor')).not.toBeInTheDocument()

    // Open it
    await user.click(screen.getByTestId('chart-edit-toggle'))
    expect(screen.getByTestId('chart-config-editor')).toBeInTheDocument()
  })

  it('config editor re-renders chart when y-axis changes', async () => {
    const user = userEvent.setup()
    const multiData = [
      { date: '2024-01', revenue: 100, profit: 30 },
      { date: '2024-02', revenue: 150, profit: 50 },
    ]
    render(<ChartView rows={multiData} showEditor />)

    // Editor is open (showEditor=true), check profit checkbox
    expect(screen.getByTestId('chart-config-editor')).toBeInTheDocument()

    // Toggle profit
    const profitCheckbox = screen.getByTestId('yaxis-toggle-profit')
    await user.click(profitCheckbox)

    // Chart should still render without error
    expect(screen.getByTestId('chart-view')).toBeInTheDocument()
  })

  it('accepts an initialConfig override', () => {
    const initialConfig = {
      type: 'bar' as const,
      xAxis: 'region',
      yAxis: ['sales'],
      title: 'Custom Config',
    }
    render(<ChartView rows={categoricalData} initialConfig={initialConfig} />)
    // Should render bar chart from the override
    expect(screen.getByTestId('bar-chart-wrapper')).toBeInTheDocument()
  })
})
