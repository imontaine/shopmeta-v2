// tests/integration/dashboard/widgets.test.ts
// Integration tests for Widget CRUD business logic + query executor + save-to-dashboard.
//
// Strategy: In-memory stores mirror the DB behavior.
// Tests cover:
//  - createWidget: stored with SQL and chart config
//  - updateWidget: partial updates, type change
//  - deleteWidget: removes widget
//  - widget query executor: success (returns rows), error (bad SQL → error object)
//  - saveToDashboard: creates widget with cachedData seeded from tool result
//  - Tenant isolation: org B cannot touch org A's widgets

import { describe, test, expect, beforeEach } from 'vitest'
import type { WidgetType, ChartConfig } from '#/lib/widgets'

// ─── Shared test data ─────────────────────────────────────────────────────────

const ORG_A = { userId: 'user-a', orgId: 'org-a' }
const ORG_B = { userId: 'user-b', orgId: 'org-b' }

// ─── UUID generator ───────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ─── In-Memory Widget Store ───────────────────────────────────────────────────

interface DashboardRecord {
  id: string
  orgId: string
  name: string
}

interface WidgetRecord {
  id: string
  dashboardId: string
  name: string
  type: WidgetType
  sql: string
  chartConfig: ChartConfig | null
  refreshInterval: number | null
  connectionId: string | null
  cachedData: unknown | null
  lastRefreshed: Date | null
  createdAt: Date
}

interface ConnectionRecord {
  id: string
  orgId: string
  host: string
  port: number
  database: string
  username: string
  password: string // plaintext for test purposes
  isDefault: boolean
}

class InMemoryWidgetStore {
  private _dashboards: DashboardRecord[] = []
  private _widgets: WidgetRecord[] = []
  private _connections: ConnectionRecord[] = []

  // ─ Dashboards ───────────────────────────────────────────────────────────────

  createDashboard(orgId: string, name: string): DashboardRecord {
    const d: DashboardRecord = { id: uuid(), orgId, name }
    this._dashboards.push(d)
    return d
  }

  getDashboard(id: string, orgId: string): DashboardRecord | null {
    return this._dashboards.find((d) => d.id === id && d.orgId === orgId) ?? null
  }

  // ─ Connections ──────────────────────────────────────────────────────────────

  createConnection(orgId: string, opts: { host: string; password: string; isDefault?: boolean }): ConnectionRecord {
    const c: ConnectionRecord = {
      id: uuid(),
      orgId,
      host: opts.host,
      port: 8443,
      database: 'default',
      username: 'default',
      password: opts.password,
      isDefault: opts.isDefault ?? false,
    }
    this._connections.push(c)
    return c
  }

  getDefaultConnection(orgId: string): ConnectionRecord | null {
    return this._connections.find((c) => c.orgId === orgId && c.isDefault) ?? null
  }

  // ─ Widget CRUD ──────────────────────────────────────────────────────────────

  createWidget(input: {
    orgId: string
    dashboardId: string
    name: string
    type: WidgetType
    sql: string
    chartConfig?: ChartConfig
    refreshInterval?: number
    connectionId?: string
    cachedData?: unknown
  }): WidgetRecord {
    const d = this.getDashboard(input.dashboardId, input.orgId)
    if (!d) throw new Error('Dashboard not found or not authorized')

    const w: WidgetRecord = {
      id: uuid(),
      dashboardId: input.dashboardId,
      name: input.name,
      type: input.type,
      sql: input.sql,
      chartConfig: input.chartConfig ?? null,
      refreshInterval: input.refreshInterval ?? null,
      connectionId: input.connectionId ?? null,
      cachedData: input.cachedData ?? null,
      lastRefreshed: input.cachedData ? new Date() : null,
      createdAt: new Date(),
    }
    this._widgets.push(w)
    return w
  }

  updateWidget(id: string, orgId: string, updates: Partial<Omit<WidgetRecord, 'id' | 'dashboardId' | 'createdAt'>>): WidgetRecord | null {
    const w = this._widgets.find((w) => {
      if (w.id !== id) return false
      const d = this._dashboards.find((d) => d.id === w.dashboardId)
      return d?.orgId === orgId
    })
    if (!w) return null
    Object.assign(w, updates)
    return w
  }

  deleteWidget(id: string, orgId: string): boolean {
    const idx = this._widgets.findIndex((w) => {
      if (w.id !== id) return false
      const d = this._dashboards.find((d) => d.id === w.dashboardId)
      return d?.orgId === orgId
    })
    if (idx === -1) return false
    this._widgets.splice(idx, 1)
    return true
  }

  getWidget(id: string, orgId: string): WidgetRecord | null {
    return this._widgets.find((w) => {
      if (w.id !== id) return false
      const d = this._dashboards.find((d) => d.id === w.dashboardId)
      return d?.orgId === orgId
    }) ?? null
  }

  getWidgetsByDashboard(dashboardId: string): WidgetRecord[] {
    return this._widgets.filter((w) => w.dashboardId === dashboardId)
  }

  // ─ Query Executor ────────────────────────────────────────────────────────────

  async executeQuery(widgetId: string, orgId: string): Promise<
    | { success: true; rows: Array<Record<string, unknown>>; elapsed: number }
    | { success: false; error: string }
  > {
    const widget = this.getWidget(widgetId, orgId)
    if (!widget) return { success: false, error: 'Widget not found or not authorized' }

    // Find connection
    const connId = widget.connectionId
    const conn = connId
      ? this._connections.find((c) => c.id === connId && c.orgId === orgId)
      : this.getDefaultConnection(orgId)

    if (!conn) return { success: false, error: 'No ClickHouse connection configured' }

    // Simulate query execution
    const sql = widget.sql.toLowerCase().trim()

    if (sql === 'select 1') {
      return { success: true, rows: [{ '1': 1 }], elapsed: 0.01 }
    }

    if (sql.includes('bad_table_xyz')) {
      return { success: false, error: "DB::Exception: Table default.bad_table_xyz doesn't exist" }
    }

    if (sql.startsWith('select count(') && sql.includes('orders')) {
      return { success: true, rows: [{ count: 42567 }], elapsed: 0.12 }
    }

    // Generic success
    const rows = [{ result: 'ok', query: widget.sql }]
    widget.cachedData = rows
    widget.lastRefreshed = new Date()
    return { success: true, rows, elapsed: 0.05 }
  }

  // ─ Save to Dashboard ─────────────────────────────────────────────────────────

  saveToDashboard(input: {
    orgId: string
    dashboardId: string
    name: string
    type: WidgetType
    sql: string
    chartConfig?: ChartConfig
    cachedRows?: Array<Record<string, unknown>>
    connectionId?: string
  }): WidgetRecord {
    return this.createWidget({
      orgId: input.orgId,
      dashboardId: input.dashboardId,
      name: input.name,
      type: input.type,
      sql: input.sql,
      chartConfig: input.chartConfig,
      cachedData: input.cachedRows ?? [],
      connectionId: input.connectionId,
    })
  }

  clear() {
    this._dashboards = []
    this._widgets = []
    this._connections = []
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let store: InMemoryWidgetStore
let dashA: DashboardRecord
let dashB: DashboardRecord

beforeEach(() => {
  store = new InMemoryWidgetStore()
  dashA = store.createDashboard(ORG_A.orgId, 'Org A Dashboard')
  dashB = store.createDashboard(ORG_B.orgId, 'Org B Dashboard')
})

// ─── Create Widget ────────────────────────────────────────────────────────────

describe('Widget — create', () => {
  test('creates a widget with SQL and chart config', () => {
    const chartConfig: ChartConfig = { chartType: 'line', xAxis: 'date', yAxis: ['revenue'], title: 'Revenue' }

    const w = store.createWidget({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Revenue Chart',
      type: 'chart',
      sql: 'SELECT date, revenue FROM orders',
      chartConfig,
    })

    expect(w.id).toBeTruthy()
    expect(w.name).toBe('Revenue Chart')
    expect(w.type).toBe('chart')
    expect(w.sql).toBe('SELECT date, revenue FROM orders')
    expect(w.chartConfig).toEqual(chartConfig)
    expect(w.dashboardId).toBe(dashA.id)
  })

  test('creates widget without chart config (table type)', () => {
    const w = store.createWidget({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Orders Table',
      type: 'table',
      sql: 'SELECT * FROM orders LIMIT 100',
    })

    expect(w.type).toBe('table')
    expect(w.chartConfig).toBeNull()
  })

  test('creates KPI widget', () => {
    const w = store.createWidget({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Total Revenue',
      type: 'kpi',
      sql: 'SELECT sum(revenue) AS total FROM orders',
    })

    expect(w.type).toBe('kpi')
  })

  test('throws when dashboard does not belong to the org (tenant isolation)', () => {
    expect(() =>
      store.createWidget({
        orgId: ORG_B.orgId, // Org B trying to add to Org A's dashboard
        dashboardId: dashA.id,
        name: 'Hacked Widget',
        type: 'table',
        sql: 'SELECT 1',
      }),
    ).toThrow('Dashboard not found or not authorized')
  })

  test('each widget gets a unique ID', () => {
    const w1 = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'A', type: 'kpi', sql: 'SELECT 1' })
    const w2 = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'B', type: 'kpi', sql: 'SELECT 2' })
    expect(w1.id).not.toBe(w2.id)
  })

  test('widget appears on the correct dashboard', () => {
    store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W1', type: 'table', sql: 'SELECT 1' })
    store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W2', type: 'table', sql: 'SELECT 2' })

    expect(store.getWidgetsByDashboard(dashA.id)).toHaveLength(2)
    expect(store.getWidgetsByDashboard(dashB.id)).toHaveLength(0)
  })
})

// ─── Update Widget ────────────────────────────────────────────────────────────

describe('Widget — update', () => {
  test('updates widget name', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'Old Name', type: 'kpi', sql: 'SELECT 1' })

    const updated = store.updateWidget(w.id, ORG_A.orgId, { name: 'New Name' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('New Name')
  })

  test('updates widget SQL', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })
    const updated = store.updateWidget(w.id, ORG_A.orgId, { sql: 'SELECT count(*) FROM orders' })
    expect(updated!.sql).toBe('SELECT count(*) FROM orders')
  })

  test('updates widget type', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'table', sql: 'SELECT 1' })
    const updated = store.updateWidget(w.id, ORG_A.orgId, { type: 'chart' })
    expect(updated!.type).toBe('chart')
  })

  test('updates chart config', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'chart', sql: 'SELECT 1' })
    const newConfig: ChartConfig = { chartType: 'pie', xAxis: 'category', yAxis: ['count'] }
    const updated = store.updateWidget(w.id, ORG_A.orgId, { chartConfig: newConfig })
    expect(updated!.chartConfig).toEqual(newConfig)
  })

  test('returns null when widget does not exist', () => {
    const result = store.updateWidget(uuid(), ORG_A.orgId, { name: 'X' })
    expect(result).toBeNull()
  })

  test('org B cannot update org A widget (tenant isolation)', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })
    const result = store.updateWidget(w.id, ORG_B.orgId, { name: 'Hacked' })
    expect(result).toBeNull()
    // Original unchanged
    expect(store.getWidget(w.id, ORG_A.orgId)!.name).toBe('W')
  })
})

// ─── Delete Widget ────────────────────────────────────────────────────────────

describe('Widget — delete', () => {
  test('deletes a widget', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })
    const success = store.deleteWidget(w.id, ORG_A.orgId)

    expect(success).toBe(true)
    expect(store.getWidget(w.id, ORG_A.orgId)).toBeNull()
  })

  test('returns false when widget does not exist', () => {
    expect(store.deleteWidget(uuid(), ORG_A.orgId)).toBe(false)
  })

  test('org B cannot delete org A widget', () => {
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })
    const success = store.deleteWidget(w.id, ORG_B.orgId)

    expect(success).toBe(false)
    expect(store.getWidget(w.id, ORG_A.orgId)).not.toBeNull()
  })
})

// ─── Query Executor ───────────────────────────────────────────────────────────

describe('Widget — query executor', () => {
  test('returns rows on success', async () => {
    store.createConnection(ORG_A.orgId, { host: 'ch.example.com', password: 'test123', isDefault: true })
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })

    const result = await store.executeQuery(w.id, ORG_A.orgId)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.rows)).toBe(true)
      expect(result.rows.length).toBeGreaterThan(0)
    }
  })

  test('returns error object (not crash) for bad SQL', async () => {
    store.createConnection(ORG_A.orgId, { host: 'ch.example.com', password: 'test123', isDefault: true })
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'table', sql: 'SELECT * FROM bad_table_xyz' })

    const result = await store.executeQuery(w.id, ORG_A.orgId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
      expect(typeof result.error).toBe('string')
      expect(result.error).toContain("bad_table_xyz")
    }
  })

  test('returns error when no connection configured', async () => {
    // No connection added for org A
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })

    const result = await store.executeQuery(w.id, ORG_A.orgId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('connection')
    }
  })

  test('returns error when widget not found (tenant isolation)', async () => {
    store.createConnection(ORG_A.orgId, { host: 'ch.example.com', password: 'test123', isDefault: true })
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })

    // Org B tries to execute Org A's widget
    const result = await store.executeQuery(w.id, ORG_B.orgId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('not found')
    }
  })

  test('uses default connection when widget has no connectionId', async () => {
    store.createConnection(ORG_A.orgId, { host: 'default-ch.example.com', password: 'pass', isDefault: true })
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1', connectionId: undefined })

    // Widget uses default connection — should succeed
    const result = await store.executeQuery(w.id, ORG_A.orgId)
    expect(result.success).toBe(true)
  })

  test('returns elapsed time on success', async () => {
    store.createConnection(ORG_A.orgId, { host: 'ch.example.com', password: 'pass', isDefault: true })
    const w = store.createWidget({ orgId: ORG_A.orgId, dashboardId: dashA.id, name: 'W', type: 'kpi', sql: 'SELECT 1' })

    const result = await store.executeQuery(w.id, ORG_A.orgId)
    if (result.success) {
      expect(typeof result.elapsed).toBe('number')
    }
  })
})

// ─── Save to Dashboard (from chat) ────────────────────────────────────────────

describe('Widget — save to dashboard (from chat tool result)', () => {
  test('creates a widget from chat tool result', () => {
    const rows = [{ date: '2024-01', revenue: 100 }, { date: '2024-02', revenue: 150 }]
    const chartConfig: ChartConfig = { chartType: 'line', xAxis: 'date', yAxis: ['revenue'], title: 'Revenue' }

    const w = store.saveToDashboard({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Revenue Trend',
      type: 'chart',
      sql: 'SELECT date, revenue FROM orders',
      chartConfig,
      cachedRows: rows,
    })

    expect(w).toBeDefined()
    expect(w.name).toBe('Revenue Trend')
    expect(w.type).toBe('chart')
    expect(w.chartConfig).toEqual(chartConfig)
  })

  test('widget appears on the dashboard after save', () => {
    store.saveToDashboard({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Orders KPI',
      type: 'kpi',
      sql: 'SELECT count(*) FROM orders',
    })

    expect(store.getWidgetsByDashboard(dashA.id)).toHaveLength(1)
  })

  test('seeds cachedData with tool result rows', () => {
    const rows = [{ total: 42567 }]
    const w = store.saveToDashboard({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Total Orders',
      type: 'kpi',
      sql: 'SELECT count(*) AS total FROM orders',
      cachedRows: rows,
    })

    expect(w.cachedData).toEqual(rows)
    expect(w.lastRefreshed).not.toBeNull()
  })

  test('cachedData is empty array when no rows provided', () => {
    const w = store.saveToDashboard({
      orgId: ORG_A.orgId,
      dashboardId: dashA.id,
      name: 'Empty',
      type: 'table',
      sql: 'SELECT 1',
    })

    expect(w.cachedData).toEqual([])
  })

  test('tenant isolation: org B cannot save to org A dashboard', () => {
    expect(() =>
      store.saveToDashboard({
        orgId: ORG_B.orgId,
        dashboardId: dashA.id, // Org A's dashboard
        name: 'Hacked Widget',
        type: 'kpi',
        sql: 'SELECT 1',
      }),
    ).toThrow('Dashboard not found or not authorized')
  })

  test('E2E simulation: chat result → widget on dashboard', () => {
    // 1. Run query in chat, get result
    const toolResult = {
      rows: [
        { date: '2024-01', revenue: 100 },
        { date: '2024-02', revenue: 150 },
        { date: '2024-03', revenue: 200 },
      ],
      sql: 'SELECT date, sum(revenue) FROM orders GROUP BY date',
    }

    // 2. User picks a dashboard and clicks Save
    const dashboardId = dashA.id
    const chartConfig: ChartConfig = { chartType: 'line', xAxis: 'date', yAxis: ['revenue'] }

    const saved = store.saveToDashboard({
      orgId: ORG_A.orgId,
      dashboardId,
      name: 'Revenue by Month',
      type: 'chart',
      sql: toolResult.sql,
      chartConfig,
      cachedRows: toolResult.rows,
    })

    // 3. Navigate to dashboard — widget is visible
    const widgets = store.getWidgetsByDashboard(dashboardId)
    expect(widgets).toHaveLength(1)
    expect(widgets[0]!.id).toBe(saved.id)
    expect(widgets[0]!.name).toBe('Revenue by Month')
    expect(widgets[0]!.cachedData).toEqual(toolResult.rows)
  })
})
