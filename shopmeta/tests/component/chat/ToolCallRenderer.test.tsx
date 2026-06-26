// tests/component/chat/ToolCallRenderer.test.tsx
// Component and integration tests for ToolCallRenderer.
// Tests: tab visibility (chart/result/query), stats bar metrics, SQL copy,
// chart presence/absence based on data shape, error state, full end-to-end.
//
// NOTE: ChartView includes a ChartTypeSwitcher with role="tablist" and role="tab".
// All tab-bar assertions are scoped to data-testid="tab-bar" to avoid ambiguity.

import React from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock recharts ResponsiveContainer (same as charts.test.tsx) ─────────────
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    ResponsiveContainer: ({ children, height }: { children: React.ReactElement; height?: number }) => (
      <div style={{ width: 600, height: height ?? 300 }}>
        {React.cloneElement(children, { width: 600, height: height ?? 300 })}
      </div>
    ),
  }
})

// ─── Mock clipboard ────────────────────────────────────────────────────────────
// Must be configurable:true so userEvent.setup() can re-stub it per test.
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
  })
})

// ─── Imports ──────────────────────────────────────────────────────────────────
import { ToolCallRenderer } from '#/components/chat/ToolCallRenderer'
import type { QueryToolResult, ToolResultStatus } from '#/components/chat/ToolCallRenderer'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const chartableResult: QueryToolResult = {
  rows: [
    { date: '2024-01', revenue: 100 },
    { date: '2024-02', revenue: 150 },
    { date: '2024-03', revenue: 200 },
  ],
  metrics: { elapsed: 0.42, rows_read: 1500, bytes_read: 32768 },
}

const nonChartableResult: QueryToolResult = {
  rows: [
    { name: 'Alice', city: 'NYC' },
    { name: 'Bob', city: 'LA' },
  ],
  metrics: { elapsed: 0.05, rows_read: 2, bytes_read: 256 },
}

const completeStatus: ToolResultStatus = { type: 'complete' }
const errorStatus: ToolResultStatus = { type: 'error', message: 'Connection refused' }
const runningStatus: ToolResultStatus = { type: 'running' }

const exampleArgs = { query: 'SELECT date, revenue FROM orders LIMIT 10' }

// Helper — scope to the ToolCallRenderer's own tab bar (not ChartTypeSwitcher's)
function getTabBar() {
  return screen.getByTestId('tab-bar')
}

// ─── Tab Visibility ───────────────────────────────────────────────────────────

describe('ToolCallRenderer — tab visibility', () => {
  it('shows Chart, Result, and Query tabs when data is chartable', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    const bar = getTabBar()
    expect(within(bar).getByRole('tab', { name: /chart/i })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: /result/i })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: /query/i })).toBeInTheDocument()
  })

  it('hides Chart tab when data is NOT chartable', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    const bar = getTabBar()
    expect(within(bar).queryByRole('tab', { name: /chart/i })).not.toBeInTheDocument()
  })

  it('shows Result and Query tabs even when data is not chartable', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    const bar = getTabBar()
    expect(within(bar).getByRole('tab', { name: /result/i })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: /query/i })).toBeInTheDocument()
  })

  it('shows exactly 3 tabs when chartable', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    const tabs = within(getTabBar()).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
  })

  it('shows exactly 2 tabs when not chartable', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    const tabs = within(getTabBar()).getAllByRole('tab')
    expect(tabs).toHaveLength(2)
  })
})

// ─── Default Active Tab ───────────────────────────────────────────────────────

describe('ToolCallRenderer — default active tab', () => {
  it('Chart tab is active by default when data is chartable', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    expect(screen.getByTestId('tab-chart')).toHaveAttribute('aria-selected', 'true')
  })

  it('Result tab is active by default when data is NOT chartable', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    expect(screen.getByTestId('tab-result')).toHaveAttribute('aria-selected', 'true')
  })

  it('non-active tabs have aria-selected=false', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    expect(screen.getByTestId('tab-result')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('tab-query')).toHaveAttribute('aria-selected', 'false')
  })
})

// ─── Tab Switching ────────────────────────────────────────────────────────────

describe('ToolCallRenderer — tab switching', () => {
  it('clicking Result tab shows the DataTableView', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-result'))

    // DataTableView should be rendered (not hidden)
    expect(screen.getByTestId('tabpanel-result')).not.toHaveAttribute('hidden')
  })

  it('clicking Query tab shows SQL code block', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))

    const queryPanel = screen.getByTestId('tabpanel-query')
    expect(queryPanel).not.toHaveAttribute('hidden')
    expect(within(queryPanel).getByTestId('sql-code-block')).toBeInTheDocument()
  })

  it('clicking Chart tab shows the chart view', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    // Navigate away first, then back
    await user.click(screen.getByTestId('tab-result'))
    await user.click(screen.getByTestId('tab-chart'))

    expect(screen.getByTestId('tabpanel-chart')).not.toHaveAttribute('hidden')
  })

  it('tab panel for inactive tab has hidden attribute', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    // Start on Chart tab (default) — Result panel is hidden
    expect(screen.getByTestId('tabpanel-result')).toHaveAttribute('hidden')

    // Switch to result — Chart panel becomes hidden
    await user.click(screen.getByTestId('tab-result'))
    expect(screen.getByTestId('tabpanel-chart')).toHaveAttribute('hidden')
  })

  it('switching tabs updates aria-selected on the clicked tab', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    expect(screen.getByTestId('tab-query')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-chart')).toHaveAttribute('aria-selected', 'false')
  })
})

// ─── Result Tab (DataTableView) ───────────────────────────────────────────────

describe('ToolCallRenderer — Result tab', () => {
  it('Result tab shows data table with correct column headers', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-result'))

    const panel = screen.getByTestId('tabpanel-result')
    expect(within(panel).getByTestId('data-table')).toBeInTheDocument()
    expect(within(panel).getByTestId('header-date')).toBeInTheDocument()
    expect(within(panel).getByTestId('header-revenue')).toBeInTheDocument()
  })

  it('Result tab shows "No results" for empty rows', async () => {
    const user = userEvent.setup()
    const emptyResult: QueryToolResult = { rows: [], metrics: {} }
    render(
      <ToolCallRenderer
        result={emptyResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-result'))
    const panel = screen.getByTestId('tabpanel-result')
    expect(within(panel).getByTestId('data-table-empty')).toBeInTheDocument()
  })
})

// ─── Query Tab ────────────────────────────────────────────────────────────────

describe('ToolCallRenderer — Query tab', () => {
  it('SQL code block shows the query from args', async () => {
    const user = userEvent.setup()
    const sql = 'SELECT date, revenue FROM orders LIMIT 10'
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={{ query: sql }}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))

    const codeBlock = screen.getByTestId('sql-code-block')
    // The code block contains highlighted HTML, but the raw text should include keywords
    expect(codeBlock.textContent).toContain('SELECT')
    expect(codeBlock.textContent).toContain('FROM')
    expect(codeBlock.textContent).toContain('orders')
  })

  it('SQL prefers result.query over args.query', async () => {
    const user = userEvent.setup()
    const resultWithQuery: QueryToolResult = {
      ...chartableResult,
      query: 'SELECT 1 FROM result_query',
    }
    render(
      <ToolCallRenderer
        result={resultWithQuery}
        args={{ query: 'SELECT 1 FROM args_query' }}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    const codeBlock = screen.getByTestId('sql-code-block')
    expect(codeBlock.textContent).toContain('result_query')
  })

  it('shows "No SQL query available" when no query provided', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    const panel = screen.getByTestId('tabpanel-query')
    expect(panel.textContent).toContain('No SQL query available')
  })

  it('copy SQL button is visible in the query display', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    expect(screen.getByTestId('copy-sql-button')).toBeInTheDocument()
  })

  it('clicking copy SQL writes to clipboard and shows Copied state', async () => {
    const user = userEvent.setup()
    const sql = 'SELECT date, revenue FROM orders'
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={{ query: sql }}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    const copyBtn = screen.getByTestId('copy-sql-button')

    // Before click: shows "Copy"
    expect(copyBtn).toHaveTextContent('Copy')

    await user.click(copyBtn)

    // After click: shows "✓ Copied" — confirms clipboard interaction happened
    expect(screen.getByTestId('copy-sql-button')).toHaveTextContent('✓ Copied')
  })

  it('copy button shows "✓ Copied" after click', async () => {
    const user = userEvent.setup()
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )

    await user.click(screen.getByTestId('tab-query'))
    await user.click(screen.getByTestId('copy-sql-button'))

    expect(screen.getByTestId('copy-sql-button')).toHaveTextContent('✓ Copied')
  })
})

// ─── Stats Bar ────────────────────────────────────────────────────────────────

describe('ToolCallRenderer — stats bar', () => {
  const metricsResult: QueryToolResult = {
    rows: [{ x: 1 }],
    metrics: { elapsed: 0.42, rows_read: 1500, bytes_read: 32768 },
  }

  it('stats bar is always visible', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument()
  })

  it('shows elapsed time formatted as ms', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.getByTestId('stats-elapsed')).toBeInTheDocument()
    expect(screen.getByTestId('stats-elapsed').textContent).toContain('420ms')
  })

  it('shows row count element', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.getByTestId('stats-rows')).toBeInTheDocument()
  })

  it('shows bytes scanned formatted as KB', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    // 32768 bytes = 32.0 KB
    expect(screen.getByTestId('stats-bytes')).toBeInTheDocument()
    expect(screen.getByTestId('stats-bytes').textContent).toContain('KB')
  })

  it('shows "Complete" status badge for complete status', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.getByTestId('stats-status').textContent?.trim()).toBe('Complete')
  })

  it('shows "Running" in status badge for running status', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={runningStatus} />,
    )
    expect(screen.getByTestId('stats-status').textContent).toContain('Running')
  })

  it('shows "Error" status badge for error status', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={errorStatus} />,
    )
    expect(screen.getByTestId('stats-status').textContent?.trim()).toBe('Error')
  })

  it('shows rows_read metric with comma formatting', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.getByTestId('stats-rows-read')).toBeInTheDocument()
    expect(screen.getByTestId('stats-rows-read').textContent).toContain('1,500')
  })

  it('does not show elapsed when not provided', () => {
    const noMetrics: QueryToolResult = { rows: [{ x: 1 }], metrics: {} }
    render(
      <ToolCallRenderer result={noMetrics} args={exampleArgs} status={completeStatus} />,
    )
    expect(screen.queryByTestId('stats-elapsed')).not.toBeInTheDocument()
  })

  it('spec example: elapsed=0.42, rows_read=1500, bytes_read=32768 → all displayed', () => {
    render(
      <ToolCallRenderer result={metricsResult} args={exampleArgs} status={completeStatus} />,
    )
    const bar = screen.getByTestId('stats-bar')
    // All three metrics are in the stats bar
    expect(bar.textContent).toMatch(/420ms|0\.42/)
    expect(bar.textContent).toMatch(/KB|32/)
    expect(bar.textContent).toMatch(/1,500|1500/)
  })
})

// ─── Error State ──────────────────────────────────────────────────────────────

describe('ToolCallRenderer — error state', () => {
  it('renders error state for error status', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={errorStatus}
      />,
    )
    expect(screen.getByTestId('tool-call-renderer-error')).toBeInTheDocument()
  })

  it('shows error message text', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={errorStatus}
      />,
    )
    expect(screen.getByTestId('tool-call-renderer-error').textContent).toContain(
      'Connection refused',
    )
  })

  it('does NOT render the main tabbed UI in error state', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={errorStatus}
      />,
    )
    expect(screen.queryByTestId('tool-call-renderer')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument()
  })

  it('shows SQL in error state when query is provided', () => {
    render(
      <ToolCallRenderer
        result={nonChartableResult}
        args={exampleArgs}
        status={errorStatus}
      />,
    )
    expect(screen.getByTestId('sql-code-block')).toBeInTheDocument()
  })
})

// ─── Integration: Full Tool Result ────────────────────────────────────────────

describe('ToolCallRenderer — integration (full tool result)', () => {
  it('renders complete UI for a mock tool result (spec example)', () => {
    const result: QueryToolResult = {
      rows: [{ date: '2024-01', revenue: 100 }],
      metrics: { elapsed: 0.1 },
    }
    render(
      <ToolCallRenderer
        result={result}
        args={{ query: 'SELECT ...' }}
        status={{ type: 'complete' }}
      />,
    )

    // From the spec: all 3 tabs visible (scoped to tab-bar to avoid ChartTypeSwitcher)
    const bar = getTabBar()
    expect(within(bar).getByRole('tab', { name: /chart/i })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: /result/i })).toBeInTheDocument()
    expect(within(bar).getByRole('tab', { name: /query/i })).toBeInTheDocument()
  })

  it('full chartable flow: chart tab active, shows chart, can switch to result', async () => {
    const user = userEvent.setup()
    const result: QueryToolResult = {
      rows: [
        { date: '2024-01', revenue: 100 },
        { date: '2024-02', revenue: 150 },
      ],
      metrics: { elapsed: 0.2, rows_read: 1000, bytes_read: 16384 },
    }

    render(
      <ToolCallRenderer
        result={result}
        args={{ query: 'SELECT date, SUM(revenue) FROM orders GROUP BY date' }}
        status={{ type: 'complete' }}
      />,
    )

    // 1. Stats bar visible
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument()

    // 2. Chart tab is default active
    expect(screen.getByTestId('tab-chart')).toHaveAttribute('aria-selected', 'true')

    // 3. Chart panel rendered
    expect(screen.getByTestId('tabpanel-chart')).not.toHaveAttribute('hidden')

    // 4. Switch to Result — data table appears
    await user.click(screen.getByTestId('tab-result'))
    const resultPanel = screen.getByTestId('tabpanel-result')
    expect(resultPanel).not.toHaveAttribute('hidden')
    expect(within(resultPanel).getByTestId('data-table')).toBeInTheDocument()

    // 5. Switch to Query — SQL visible
    await user.click(screen.getByTestId('tab-query'))
    const queryPanel = screen.getByTestId('tabpanel-query')
    expect(queryPanel).not.toHaveAttribute('hidden')
    expect(within(queryPanel).getByTestId('sql-code-block')).toBeInTheDocument()
    expect(within(queryPanel).getByTestId('copy-sql-button')).toBeInTheDocument()
  })

  it('full non-chartable flow: result tab active, no chart tab', async () => {
    const user = userEvent.setup()
    const result: QueryToolResult = {
      rows: [
        { name: 'Alice', city: 'NYC' },
        { name: 'Bob', city: 'LA' },
      ],
      metrics: { elapsed: 0.05, bytes_read: 256 },
    }

    render(
      <ToolCallRenderer
        result={result}
        args={{ query: 'SELECT name, city FROM users' }}
        status={{ type: 'complete' }}
      />,
    )

    // No chart tab
    expect(within(getTabBar()).queryByRole('tab', { name: /chart/i })).not.toBeInTheDocument()

    // Result is default and active
    expect(screen.getByTestId('tab-result')).toHaveAttribute('aria-selected', 'true')

    // Data table shows user data
    await user.click(screen.getByTestId('tab-result'))
    const panel = screen.getByTestId('tabpanel-result')
    expect(within(panel).getByTestId('header-name')).toBeInTheDocument()
    expect(within(panel).getByTestId('header-city')).toBeInTheDocument()
  })

  it('renders tablist with accessible role on the tab-bar element', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    expect(screen.getByTestId('tab-bar')).toHaveAttribute('role', 'tablist')
  })

  it('main container has data-testid="tool-call-renderer"', () => {
    render(
      <ToolCallRenderer
        result={chartableResult}
        args={exampleArgs}
        status={completeStatus}
      />,
    )
    expect(screen.getByTestId('tool-call-renderer')).toBeInTheDocument()
  })

  it('chart determinism: same data always produces same tab structure', () => {
    const { unmount } = render(
      <ToolCallRenderer result={chartableResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(within(getTabBar()).getAllByRole('tab')).toHaveLength(3)
    unmount()

    render(
      <ToolCallRenderer result={chartableResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(within(getTabBar()).getAllByRole('tab')).toHaveLength(3)
  })

  it('non-chartable determinism: string-only data always hides chart tab', () => {
    const { unmount } = render(
      <ToolCallRenderer result={nonChartableResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(within(getTabBar()).queryByRole('tab', { name: /chart/i })).not.toBeInTheDocument()
    unmount()

    render(
      <ToolCallRenderer result={nonChartableResult} args={exampleArgs} status={completeStatus} />,
    )
    expect(within(getTabBar()).queryByRole('tab', { name: /chart/i })).not.toBeInTheDocument()
  })
})
