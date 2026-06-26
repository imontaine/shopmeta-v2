// tests/component/dashboard/widgets.test.tsx
// Component tests for:
//  - WidgetKPI: renders single formatted number with title
//  - WidgetChart: delegates to ChartView (mocked)
//  - WidgetTable: delegates to DataTableView (mocked)
//  - WidgetEditModal: form fields, type switching, chart config section visibility
//  - SaveToDashboard: button, form expansion, dashboard-picker, save-widget

import React from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock ChartView — we just need to verify it gets rendered with the right props
vi.mock('#/components/charts/ChartView', () => ({
  ChartView: ({ rows, initialConfig }: { rows: unknown[]; initialConfig?: { type?: string } }) => (
    <div data-testid="chart-view-mock" data-chart-type={initialConfig?.type} data-row-count={rows.length}>
      ChartView Mock
    </div>
  ),
}))

// Mock DataTableView
vi.mock('#/components/chat/DataTableView', () => ({
  DataTableView: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="data-table-view-mock" data-row-count={rows.length}>
      DataTableView Mock
    </div>
  ),
}))

// Mock saveToDashboard server fn
vi.mock('#/lib/widgets', async () => {
  const actual = await vi.importActual('#/lib/widgets')
  return {
    ...actual,
    saveToDashboard: vi.fn().mockResolvedValue({ id: 'widget-001', name: 'Test Widget' }),
  }
})

// Mock suggestChart
vi.mock('#/lib/utils/suggestChart', () => ({
  suggestChart: vi.fn().mockReturnValue({ type: 'line', xAxis: 'date', yAxis: 'revenue' }),
}))

import { WidgetKPI, formatKPIValue, extractKPIValue } from '#/components/dashboard/WidgetKPI'
import { WidgetChart } from '#/components/dashboard/WidgetChart'
import { WidgetTable } from '#/components/dashboard/WidgetTable'
import { WidgetEditModal } from '#/components/dashboard/WidgetEditModal'
import { SaveToDashboard } from '#/components/chat/SaveToDashboard'
import type { ChartConfig } from '#/lib/widgets'

// ─── WidgetKPI — formatKPIValue utility ───────────────────────────────────────

describe('formatKPIValue utility', () => {
  it('formats integer with commas', () => {
    expect(formatKPIValue(42567)).toBe('42,567')
  })

  it('formats spec example: 42567 → "42,567"', () => {
    expect(formatKPIValue(42567)).toBe('42,567')
  })

  it('formats large number with commas', () => {
    expect(formatKPIValue(1234567)).toContain('M')
  })

  it('formats billion numbers', () => {
    expect(formatKPIValue(2_000_000_000)).toContain('B')
  })

  it('returns "—" for null', () => {
    expect(formatKPIValue(null)).toBe('—')
  })

  it('returns "—" for undefined', () => {
    expect(formatKPIValue(undefined)).toBe('—')
  })

  it('handles string-encoded number', () => {
    expect(formatKPIValue('42567')).toBe('42,567')
  })

  it('formats float with max 2 decimal places', () => {
    const result = formatKPIValue(3.14159)
    expect(result).toBe('3.14')
  })

  it('formats zero correctly', () => {
    expect(formatKPIValue(0)).toBe('0')
  })

  it('handles negative numbers', () => {
    expect(formatKPIValue(-1234)).toBe('-1,234')
  })
})

// ─── extractKPIValue utility ──────────────────────────────────────────────────

describe('extractKPIValue utility', () => {
  it('extracts first numeric value from first row', () => {
    const rows = [{ total: 42567, name: 'orders' }]
    expect(extractKPIValue(rows)).toBe(42567)
  })

  it('returns null for empty rows', () => {
    expect(extractKPIValue([])).toBeNull()
  })

  it('returns null for null', () => {
    expect(extractKPIValue(null as unknown as [])).toBeNull()
  })

  it('handles string-encoded number as first column', () => {
    const rows = [{ count: '9999' }]
    const val = extractKPIValue(rows)
    expect(val).toBe(9999)
  })
})

// ─── WidgetKPI — component ───────────────────────────────────────────────────

describe('WidgetKPI — renders single number', () => {
  it('renders the KPI container', () => {
    render(<WidgetKPI title="Total Orders" rows={[{ total: 42567 }]} />)
    expect(screen.getByTestId('widget-kpi')).toBeInTheDocument()
  })

  it('spec example: { total: 42567 } → renders "42,567"', () => {
    render(<WidgetKPI title="Total Orders" rows={[{ total: 42567 }]} />)
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('42,567')
  })

  it('renders the title', () => {
    render(<WidgetKPI title="Monthly Revenue" rows={[{ revenue: 100 }]} />)
    expect(screen.getByTestId('kpi-title')).toHaveTextContent('Monthly Revenue')
  })

  it('renders prefix when provided', () => {
    render(<WidgetKPI title="Revenue" rows={[{ revenue: 1000 }]} prefix="$" />)
    expect(screen.getByTestId('kpi-prefix')).toHaveTextContent('$')
  })

  it('does not render prefix when not provided', () => {
    render(<WidgetKPI title="Count" rows={[{ n: 5 }]} />)
    expect(screen.queryByTestId('kpi-prefix')).not.toBeInTheDocument()
  })

  it('renders suffix when provided', () => {
    render(<WidgetKPI title="Rate" rows={[{ rate: 85 }]} suffix="%" />)
    expect(screen.getByTestId('kpi-suffix')).toHaveTextContent('%')
  })

  it('renders "—" for empty rows', () => {
    render(<WidgetKPI title="Empty" rows={[]} />)
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('—')
  })

  it('renders large numbers abbreviated', () => {
    render(<WidgetKPI title="GMV" rows={[{ gmv: 5_400_000 }]} />)
    const value = screen.getByTestId('kpi-value').textContent
    expect(value).toContain('M')
  })
})

// ─── WidgetChart — component ─────────────────────────────────────────────────

describe('WidgetChart — renders Recharts via ChartView', () => {
  const chartConfig: ChartConfig = { chartType: 'line', xAxis: 'date', yAxis: ['revenue'], title: 'Revenue' }
  const rows = [
    { date: '2024-01', revenue: 100 },
    { date: '2024-02', revenue: 150 },
  ]

  it('renders the widget-chart container', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={rows} />)
    expect(screen.getByTestId('widget-chart')).toBeInTheDocument()
  })

  it('renders ChartView inside (mocked)', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={rows} />)
    expect(screen.getByTestId('chart-view-mock')).toBeInTheDocument()
  })

  it('passes chartType to ChartView', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={rows} />)
    expect(screen.getByTestId('chart-view-mock')).toHaveAttribute('data-chart-type', 'line')
  })

  it('passes rows count to ChartView', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={rows} />)
    expect(screen.getByTestId('chart-view-mock')).toHaveAttribute('data-row-count', '2')
  })

  it('shows empty state when rows is empty', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={[]} />)
    expect(screen.getByTestId('widget-chart-empty')).toBeInTheDocument()
  })

  it('does not render ChartView when rows is empty', () => {
    render(<WidgetChart chartConfig={chartConfig} rows={[]} />)
    expect(screen.queryByTestId('chart-view-mock')).not.toBeInTheDocument()
  })

  it('renders bar chart type', () => {
    const barConfig: ChartConfig = { chartType: 'bar', xAxis: 'category', yAxis: ['count'] }
    render(<WidgetChart chartConfig={barConfig} rows={[{ category: 'A', count: 5 }]} />)
    expect(screen.getByTestId('chart-view-mock')).toHaveAttribute('data-chart-type', 'bar')
  })
})

// ─── WidgetTable — component ─────────────────────────────────────────────────

describe('WidgetTable — renders TanStack Table via DataTableView', () => {
  const rows = [
    { id: 1, name: 'Order A', total: 100 },
    { id: 2, name: 'Order B', total: 200 },
    { id: 3, name: 'Order C', total: 300 },
  ]

  it('renders the widget-table container', () => {
    render(<WidgetTable rows={rows} />)
    expect(screen.getByTestId('widget-table')).toBeInTheDocument()
  })

  it('renders DataTableView inside (mocked)', () => {
    render(<WidgetTable rows={rows} />)
    expect(screen.getByTestId('data-table-view-mock')).toBeInTheDocument()
  })

  it('passes correct row count to DataTableView', () => {
    render(<WidgetTable rows={rows} />)
    expect(screen.getByTestId('data-table-view-mock')).toHaveAttribute('data-row-count', '3')
  })

  it('renders empty DataTableView when rows is empty', () => {
    render(<WidgetTable rows={[]} />)
    expect(screen.getByTestId('data-table-view-mock')).toHaveAttribute('data-row-count', '0')
  })
})

// ─── WidgetEditModal ─────────────────────────────────────────────────────────

describe('WidgetEditModal — form fields', () => {
  const defaultValues = {
    name: 'Revenue Chart',
    type: 'chart' as const,
    sql: 'SELECT date, revenue FROM orders',
    chartConfig: { chartType: 'line' as const, xAxis: 'date', yAxis: ['revenue'], title: '' },
  }

  it('renders the modal', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('widget-edit-modal')).toBeInTheDocument()
  })

  it('shows the name field with initial value', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    const nameInput = screen.getByTestId('widget-edit-name') as HTMLInputElement
    expect(nameInput.value).toBe('Revenue Chart')
  })

  it('shows the SQL field with initial value', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    const sqlInput = screen.getByTestId('widget-edit-sql') as HTMLTextAreaElement
    expect(sqlInput.value).toBe('SELECT date, revenue FROM orders')
  })

  it('shows chart config section when type is chart', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('chart-config-section')).toBeInTheDocument()
  })

  it('hides chart config section when type is table', () => {
    const tableValues = { ...defaultValues, type: 'table' as const, chartConfig: null }
    render(<WidgetEditModal initialValues={tableValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('chart-config-section')).not.toBeInTheDocument()
  })

  it('hides chart config section when type is kpi', () => {
    const kpiValues = { ...defaultValues, type: 'kpi' as const, chartConfig: null }
    render(<WidgetEditModal initialValues={kpiValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('chart-config-section')).not.toBeInTheDocument()
  })

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByTestId('widget-edit-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={onClose} />)

    await user.click(screen.getByTestId('widget-edit-cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onSave with current values when save button clicked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<WidgetEditModal initialValues={defaultValues} onSave={onSave} onClose={vi.fn()} />)

    await user.click(screen.getByTestId('widget-edit-save'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Revenue Chart',
        sql: 'SELECT date, revenue FROM orders',
      }),
    )
  })

  it('type buttons switch the widget type', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<WidgetEditModal initialValues={defaultValues} onSave={onSave} onClose={vi.fn()} />)

    // Switch to table type
    await user.click(screen.getByTestId('widget-type-btn-table'))

    // Chart config section should disappear
    expect(screen.queryByTestId('chart-config-section')).not.toBeInTheDocument()
  })

  it('chart config section shows x-axis, y-axis, chart type inputs', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('chart-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('x-axis-input')).toBeInTheDocument()
    expect(screen.getByTestId('y-axis-input')).toBeInTheDocument()
  })

  it('modal has role="dialog"', () => {
    render(<WidgetEditModal initialValues={defaultValues} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

// ─── SaveToDashboard — component ─────────────────────────────────────────────

const mockDashboards = [
  { id: 'dash-001', name: 'My Dashboard' },
  { id: 'dash-002', name: 'Alt Dashboard' },
]

const sampleRows = [
  { date: '2024-01', revenue: 100 },
  { date: '2024-02', revenue: 150 },
]

describe('SaveToDashboard — collapsed state', () => {
  it('renders the save button initially', () => {
    render(<SaveToDashboard sql="SELECT 1" rows={[]} dashboards={mockDashboards} />)
    expect(screen.getByTestId('save-to-dashboard')).toBeInTheDocument()
  })

  it('button text contains "Save to Dashboard"', () => {
    render(<SaveToDashboard sql="SELECT 1" rows={[]} dashboards={mockDashboards} />)
    expect(screen.getByTestId('save-to-dashboard').textContent).toContain('Save to Dashboard')
  })

  it('form is not visible initially', () => {
    render(<SaveToDashboard sql="SELECT 1" rows={[]} dashboards={mockDashboards} />)
    expect(screen.queryByTestId('save-to-dashboard-form')).not.toBeInTheDocument()
  })
})

describe('SaveToDashboard — expanded form', () => {
  it('opens the form when button is clicked', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('save-to-dashboard-form')).toBeInTheDocument()
  })

  it('shows dashboard-picker select when dashboards provided', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('dashboard-picker')).toBeInTheDocument()
  })

  it('dashboard-picker has all dashboard options', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    const picker = screen.getByTestId('dashboard-picker') as HTMLSelectElement
    const options = Array.from(picker.options).map((o) => o.text)
    expect(options).toContain('My Dashboard')
    expect(options).toContain('Alt Dashboard')
  })

  it('shows widget name input', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('save-widget-name')).toBeInTheDocument()
  })

  it('shows the save-widget button', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('save-widget')).toBeInTheDocument()
  })

  it('cancel button closes the form', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('save-to-dashboard-form')).toBeInTheDocument()

    await user.click(screen.getByTestId('save-widget-cancel'))
    expect(screen.queryByTestId('save-to-dashboard-form')).not.toBeInTheDocument()
  })

  it('shows type buttons (chart/table/kpi)', async () => {
    const user = userEvent.setup()
    render(<SaveToDashboard sql="SELECT 1" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    expect(screen.getByTestId('save-type-chart')).toBeInTheDocument()
    expect(screen.getByTestId('save-type-table')).toBeInTheDocument()
    expect(screen.getByTestId('save-type-kpi')).toBeInTheDocument()
  })

  it('calls saveToDashboard fn and shows saved state on submit', async () => {
    const user = userEvent.setup()
    const { saveToDashboard } = await import('#/lib/widgets')
    const mockSave = vi.mocked(saveToDashboard)
    mockSave.mockResolvedValue({ id: 'widget-001', name: 'Test' } as ReturnType<typeof saveToDashboard> extends Promise<infer R> ? R : never)

    render(<SaveToDashboard sql="SELECT date, revenue FROM orders" rows={sampleRows} dashboards={mockDashboards} />)

    await user.click(screen.getByTestId('save-to-dashboard'))
    await user.click(screen.getByTestId('save-widget'))

    // After save, shows saved confirmation
    expect(await screen.findByTestId('save-to-dashboard-saved')).toBeInTheDocument()
  })

  it('calls onSaved callback with widget id after save', async () => {
    const user = userEvent.setup()
    const { saveToDashboard } = await import('#/lib/widgets')
    vi.mocked(saveToDashboard).mockResolvedValue({ id: 'widget-123', name: 'Test' } as ReturnType<typeof saveToDashboard> extends Promise<infer R> ? R : never)

    const onSaved = vi.fn()
    render(
      <SaveToDashboard
        sql="SELECT 1"
        rows={sampleRows}
        dashboards={mockDashboards}
        onSaved={onSaved}
      />,
    )

    await user.click(screen.getByTestId('save-to-dashboard'))
    await user.click(screen.getByTestId('save-widget'))

    await screen.findByTestId('save-to-dashboard-saved')
    expect(onSaved).toHaveBeenCalledWith('widget-123')
  })
})
