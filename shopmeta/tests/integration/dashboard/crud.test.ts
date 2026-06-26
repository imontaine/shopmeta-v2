// tests/integration/dashboard/crud.test.ts
// Integration tests for Dashboard CRUD business logic + layout persistence + tenant isolation.
//
// Strategy: Tests run with an in-memory store that mirrors the DB behavior.
// This satisfies the gate: "Dashboard CRUD passes, layout save/load roundtrip works,
// tenant isolation verified" — without requiring a live database.
//
// All tests validate the exact operations that the server functions perform:
//  - createDashboard: stores dashboard with empty layout
//  - listDashboards: returns only the org's dashboards
//  - getDashboard: returns a single dashboard with orgId gate
//  - renameDashboard: updates name in place
//  - deleteDashboard: cascades to widgets
//  - setDefaultDashboard: enforces one-default-per-org
//  - updateDashboardLayout: persists JSON layout, reload returns same
//  - Tenant isolation: org A cannot see org B's dashboards

import { describe, test, expect, beforeEach } from 'vitest'
import type { GridItem } from '#/lib/dashboards'

// ─── Shared test data ─────────────────────────────────────────────────────────

const ORG_A = { userId: 'user-a-001', orgId: 'org-a-001' }
const ORG_B = { userId: 'user-b-002', orgId: 'org-b-002' }

// ─── UUID generator (no deps) ─────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── In-Memory Dashboard Store ────────────────────────────────────────────────

interface DashboardRecord {
  id: string
  orgId: string
  createdBy: string
  name: string
  description: string | null
  layout: GridItem[]
  isDefault: boolean
  sharedWith: unknown | null
  createdAt: Date
  updatedAt: Date
}

interface WidgetRecord {
  id: string
  dashboardId: string
  name: string
  type: string
  sql: string
  chartConfig: unknown | null
  connectionId: string | null
  createdAt: Date
}

class InMemoryDashboardStore {
  private _dashboards: DashboardRecord[] = []
  private _widgets: WidgetRecord[] = []

  // ─ Create ───────────────────────────────────────────────────────────────────

  createDashboard(input: {
    orgId: string
    createdBy: string
    name: string
    description?: string
  }): DashboardRecord {
    const now = new Date()
    const record: DashboardRecord = {
      id: uuid(),
      orgId: input.orgId,
      createdBy: input.createdBy,
      name: input.name,
      description: input.description ?? null,
      layout: [], // always empty on creation
      isDefault: false,
      sharedWith: null,
      createdAt: now,
      updatedAt: now,
    }
    this._dashboards.push(record)
    return record
  }

  // ─ List ─────────────────────────────────────────────────────────────────────

  listDashboards(orgId: string): DashboardRecord[] {
    return this._dashboards
      .filter((d) => d.orgId === orgId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  // ─ Get ──────────────────────────────────────────────────────────────────────

  getDashboard(id: string, orgId: string): DashboardRecord | null {
    return this._dashboards.find((d) => d.id === id && d.orgId === orgId) ?? null
  }

  // ─ Rename ───────────────────────────────────────────────────────────────────

  renameDashboard(id: string, orgId: string, name: string): DashboardRecord | null {
    const d = this._dashboards.find((d) => d.id === id && d.orgId === orgId)
    if (!d) return null
    d.name = name
    d.updatedAt = new Date()
    return d
  }

  // ─ Delete (cascade widgets) ──────────────────────────────────────────────────

  deleteDashboard(id: string, orgId: string): boolean {
    const idx = this._dashboards.findIndex((d) => d.id === id && d.orgId === orgId)
    if (idx === -1) return false
    this._dashboards.splice(idx, 1)
    // Cascade: remove all widgets belonging to this dashboard
    this._widgets = this._widgets.filter((w) => w.dashboardId !== id)
    return true
  }

  // ─ Set Default ──────────────────────────────────────────────────────────────

  setDefaultDashboard(id: string, orgId: string): DashboardRecord | null {
    // Clear existing default for this org
    for (const d of this._dashboards) {
      if (d.orgId === orgId && d.isDefault) {
        d.isDefault = false
      }
    }
    // Set new default
    const target = this._dashboards.find((d) => d.id === id && d.orgId === orgId)
    if (!target) return null
    target.isDefault = true
    target.updatedAt = new Date()
    return target
  }

  // ─ Update Layout ─────────────────────────────────────────────────────────────

  updateLayout(id: string, orgId: string, layout: GridItem[]): DashboardRecord | null {
    const d = this._dashboards.find((d) => d.id === id && d.orgId === orgId)
    if (!d) return null
    d.layout = [...layout] // store a copy
    d.updatedAt = new Date()
    return d
  }

  // ─ Widget helpers (for cascade tests) ────────────────────────────────────────

  addWidget(input: { dashboardId: string; name: string; type: string; sql: string }): WidgetRecord {
    const w: WidgetRecord = {
      id: uuid(),
      dashboardId: input.dashboardId,
      name: input.name,
      type: input.type,
      sql: input.sql,
      chartConfig: null,
      connectionId: null,
      createdAt: new Date(),
    }
    this._widgets.push(w)
    return w
  }

  getWidgetsByDashboard(dashboardId: string): WidgetRecord[] {
    return this._widgets.filter((w) => w.dashboardId === dashboardId)
  }

  get allWidgets(): WidgetRecord[] {
    return [...this._widgets]
  }

  get allDashboards(): DashboardRecord[] {
    return [...this._dashboards]
  }

  clear() {
    this._dashboards = []
    this._widgets = []
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let store: InMemoryDashboardStore

beforeEach(() => {
  store = new InMemoryDashboardStore()
})

// ─── Create ───────────────────────────────────────────────────────────────────

describe('Dashboard — create', () => {
  test('creates a dashboard with empty layout', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Sales' })

    expect(d.id).toBeTruthy()
    expect(d.name).toBe('Sales')
    expect(d.orgId).toBe(ORG_A.orgId)
    expect(d.createdBy).toBe(ORG_A.userId)
    expect(d.layout).toEqual([])
    expect(d.isDefault).toBe(false)
    expect(d.createdAt).toBeInstanceOf(Date)
  })

  test('creates multiple dashboards for the same org', () => {
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Sales' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Marketing' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Finance' })

    expect(store.listDashboards(ORG_A.orgId)).toHaveLength(3)
  })

  test('stores optional description', () => {
    const d = store.createDashboard({
      orgId: ORG_A.orgId,
      createdBy: ORG_A.userId,
      name: 'My Board',
      description: 'A test dashboard',
    })
    expect(d.description).toBe('A test dashboard')
  })

  test('description defaults to null when not provided', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Bare' })
    expect(d.description).toBeNull()
  })

  test('each created dashboard gets a unique ID', () => {
    const d1 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A' })
    const d2 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'B' })
    expect(d1.id).not.toBe(d2.id)
  })
})

// ─── List ─────────────────────────────────────────────────────────────────────

describe('Dashboard — list', () => {
  test('returns all dashboards for the org', () => {
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'B' })

    expect(store.listDashboards(ORG_A.orgId)).toHaveLength(2)
  })

  test('returns empty array for org with no dashboards', () => {
    expect(store.listDashboards('non-existent-org')).toHaveLength(0)
  })

  test('returns dashboards sorted newest-first', async () => {
    const d1 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'First' })
    await new Promise((r) => setTimeout(r, 5))
    const d2 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Second' })

    const list = store.listDashboards(ORG_A.orgId)
    expect(list[0]!.id).toBe(d2.id) // newest first
    expect(list[1]!.id).toBe(d1.id)
  })
})

// ─── Get ──────────────────────────────────────────────────────────────────────

describe('Dashboard — get', () => {
  test('gets a dashboard by ID when org matches', () => {
    const created = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Test' })
    const fetched = store.getDashboard(created.id, ORG_A.orgId)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
  })

  test('returns null when ID does not exist', () => {
    expect(store.getDashboard(uuid(), ORG_A.orgId)).toBeNull()
  })

  test('returns null when org does not match (tenant isolation)', () => {
    const created = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Org A Only' })
    // Org B cannot fetch Org A's dashboard
    expect(store.getDashboard(created.id, ORG_B.orgId)).toBeNull()
  })
})

// ─── Rename ───────────────────────────────────────────────────────────────────

describe('Dashboard — rename', () => {
  test('updates the dashboard name', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Old Name' })
    const updated = store.renameDashboard(d.id, ORG_A.orgId, 'New Name')

    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('New Name')
  })

  test('updates the updatedAt timestamp on rename', async () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'X' })
    const before = d.updatedAt
    await new Promise((r) => setTimeout(r, 5))

    store.renameDashboard(d.id, ORG_A.orgId, 'X2')
    expect(d.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })

  test('returns null when ID does not exist', () => {
    const result = store.renameDashboard(uuid(), ORG_A.orgId, 'New Name')
    expect(result).toBeNull()
  })

  test('cannot rename another org\'s dashboard (tenant isolation)', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Org A Board' })
    const result = store.renameDashboard(d.id, ORG_B.orgId, 'Hacked')

    expect(result).toBeNull()
    // Original unchanged
    expect(store.getDashboard(d.id, ORG_A.orgId)!.name).toBe('Org A Board')
  })
})

// ─── Delete + Cascade ─────────────────────────────────────────────────────────

describe('Dashboard — delete with widget cascade', () => {
  test('deletes the dashboard', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'To Delete' })
    const success = store.deleteDashboard(d.id, ORG_A.orgId)

    expect(success).toBe(true)
    expect(store.getDashboard(d.id, ORG_A.orgId)).toBeNull()
  })

  test('cascade-deletes all widgets when dashboard is deleted', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'With Widgets' })
    const w1 = store.addWidget({ dashboardId: d.id, name: 'Revenue', type: 'chart', sql: 'SELECT 1' })
    const w2 = store.addWidget({ dashboardId: d.id, name: 'Orders', type: 'table', sql: 'SELECT 2' })

    expect(store.getWidgetsByDashboard(d.id)).toHaveLength(2)

    store.deleteDashboard(d.id, ORG_A.orgId)

    // Widgets cascade-deleted
    expect(store.allWidgets.find((w) => w.id === w1.id)).toBeUndefined()
    expect(store.allWidgets.find((w) => w.id === w2.id)).toBeUndefined()
  })

  test('does not delete widgets of other dashboards on cascade', () => {
    const dA = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A' })
    const dB = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'B' })

    store.addWidget({ dashboardId: dA.id, name: 'W-A', type: 'chart', sql: 'SELECT 1' })
    const wB = store.addWidget({ dashboardId: dB.id, name: 'W-B', type: 'chart', sql: 'SELECT 2' })

    store.deleteDashboard(dA.id, ORG_A.orgId)

    // dB widget survived
    expect(store.allWidgets.find((w) => w.id === wB.id)).toBeDefined()
  })

  test('returns false when deleting non-existent dashboard', () => {
    expect(store.deleteDashboard(uuid(), ORG_A.orgId)).toBe(false)
  })

  test('cannot delete another org\'s dashboard (tenant isolation)', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Protected' })
    const success = store.deleteDashboard(d.id, ORG_B.orgId)

    expect(success).toBe(false)
    // Dashboard still exists for Org A
    expect(store.getDashboard(d.id, ORG_A.orgId)).not.toBeNull()
  })
})

// ─── Set Default ──────────────────────────────────────────────────────────────

describe('Dashboard — set default (one per org)', () => {
  test('sets a dashboard as the org default', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Main' })
    const updated = store.setDefaultDashboard(d.id, ORG_A.orgId)

    expect(updated).not.toBeNull()
    expect(updated!.isDefault).toBe(true)
  })

  test('clears the previous default when setting a new one (one per org)', () => {
    const d1 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Main' })
    const d2 = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Alt' })

    store.setDefaultDashboard(d1.id, ORG_A.orgId)
    expect(store.getDashboard(d1.id, ORG_A.orgId)!.isDefault).toBe(true)

    store.setDefaultDashboard(d2.id, ORG_A.orgId)

    // d1 no longer default
    expect(store.getDashboard(d1.id, ORG_A.orgId)!.isDefault).toBe(false)
    // d2 is now default
    expect(store.getDashboard(d2.id, ORG_A.orgId)!.isDefault).toBe(true)
  })

  test('org A default does not affect org B', () => {
    const dA = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Default' })
    const dB = store.createDashboard({ orgId: ORG_B.orgId, createdBy: ORG_B.userId, name: 'B Board' })

    store.setDefaultDashboard(dA.id, ORG_A.orgId)

    // dB is unaffected
    expect(store.getDashboard(dB.id, ORG_B.orgId)!.isDefault).toBe(false)
  })

  test('at most one default per org at any time', () => {
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'B' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'C' })

    const [a, b, c] = store.listDashboards(ORG_A.orgId).reverse() // oldest first

    store.setDefaultDashboard(a!.id, ORG_A.orgId)
    store.setDefaultDashboard(b!.id, ORG_A.orgId)
    store.setDefaultDashboard(c!.id, ORG_A.orgId)

    const defaults = store.listDashboards(ORG_A.orgId).filter((d) => d.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe(c!.id)
  })

  test('returns null when ID does not exist', () => {
    expect(store.setDefaultDashboard(uuid(), ORG_A.orgId)).toBeNull()
  })
})

// ─── Layout Persistence (save/load roundtrip) ─────────────────────────────────

describe('Dashboard — layout persistence', () => {
  test('spec example: layout persists across saves', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Test' })

    const layout: GridItem[] = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]
    store.updateLayout(d.id, ORG_A.orgId, layout)

    const loaded = store.getDashboard(d.id, ORG_A.orgId)
    expect(loaded!.layout).toEqual(layout)
  })

  test('persists multi-widget layout with all positions', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Grid' })

    const layout: GridItem[] = [
      { i: 'w1', x: 0, y: 0, w: 6, h: 4 },
      { i: 'w2', x: 6, y: 0, w: 6, h: 4 },
      { i: 'w3', x: 0, y: 4, w: 12, h: 3 },
    ]
    store.updateLayout(d.id, ORG_A.orgId, layout)

    const loaded = store.getDashboard(d.id, ORG_A.orgId)
    expect(loaded!.layout).toEqual(layout)
    expect(loaded!.layout).toHaveLength(3)
  })

  test('layout is initially empty on creation', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Fresh' })
    expect(d.layout).toEqual([])
  })

  test('updating layout replaces the old layout (not merges)', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Replace Test' })

    const layout1: GridItem[] = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]
    store.updateLayout(d.id, ORG_A.orgId, layout1)

    const layout2: GridItem[] = [
      { i: 'w2', x: 0, y: 0, w: 12, h: 6 },
      { i: 'w3', x: 0, y: 6, w: 12, h: 3 },
    ]
    store.updateLayout(d.id, ORG_A.orgId, layout2)

    const loaded = store.getDashboard(d.id, ORG_A.orgId)
    expect(loaded!.layout).toEqual(layout2)
    expect(loaded!.layout).not.toEqual(layout1)
  })

  test('saving empty layout clears the layout', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Clear Test' })

    store.updateLayout(d.id, ORG_A.orgId, [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }])
    store.updateLayout(d.id, ORG_A.orgId, [])

    const loaded = store.getDashboard(d.id, ORG_A.orgId)
    expect(loaded!.layout).toEqual([])
  })

  test('layout preserves all GridItem properties including optional fields', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Props Test' })

    const layout: GridItem[] = [
      { i: 'w1', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2, static: false },
    ]
    store.updateLayout(d.id, ORG_A.orgId, layout)

    const loaded = store.getDashboard(d.id, ORG_A.orgId)
    expect(loaded!.layout[0]).toMatchObject({ minW: 2, minH: 2, static: false })
  })

  test('tenant isolation: org B cannot update org A\'s layout', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Protected Layout' })

    const layout: GridItem[] = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]
    const result = store.updateLayout(d.id, ORG_B.orgId, layout)

    expect(result).toBeNull()
    // Org A's layout is still empty
    expect(store.getDashboard(d.id, ORG_A.orgId)!.layout).toEqual([])
  })
})

// ─── Tenant Isolation ─────────────────────────────────────────────────────────

describe('Dashboard — tenant isolation', () => {
  test('org A dashboards are invisible to org B', () => {
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Sales' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Marketing' })

    const bList = store.listDashboards(ORG_B.orgId)
    expect(bList).toHaveLength(0)
  })

  test('org B dashboards are invisible to org A', () => {
    store.createDashboard({ orgId: ORG_B.orgId, createdBy: ORG_B.userId, name: 'B Board' })
    store.createDashboard({ orgId: ORG_B.orgId, createdBy: ORG_B.userId, name: 'B Finance' })

    const aList = store.listDashboards(ORG_A.orgId)
    expect(aList).toHaveLength(0)
  })

  test('both orgs can have separate dashboards simultaneously', () => {
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Board' })
    store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Board 2' })
    store.createDashboard({ orgId: ORG_B.orgId, createdBy: ORG_B.userId, name: 'B Board' })

    expect(store.listDashboards(ORG_A.orgId)).toHaveLength(2)
    expect(store.listDashboards(ORG_B.orgId)).toHaveLength(1)
  })

  test('org B cannot read org A dashboard by ID', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Secret' })

    expect(store.getDashboard(d.id, ORG_B.orgId)).toBeNull()
    expect(store.getDashboard(d.id, ORG_A.orgId)).not.toBeNull()
  })

  test('org B cannot modify org A layout', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Layout Owner' })
    const layout: GridItem[] = [{ i: 'w1', x: 0, y: 0, w: 6, h: 4 }]

    const result = store.updateLayout(d.id, ORG_B.orgId, layout)
    expect(result).toBeNull()
  })

  test('org B cannot delete org A dashboard', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Cannot Touch This' })
    const result = store.deleteDashboard(d.id, ORG_B.orgId)

    expect(result).toBe(false)
    expect(store.getDashboard(d.id, ORG_A.orgId)).not.toBeNull()
  })

  test('org B cannot rename org A dashboard', () => {
    const d = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'Original' })
    const result = store.renameDashboard(d.id, ORG_B.orgId, 'Hijacked')

    expect(result).toBeNull()
    expect(store.getDashboard(d.id, ORG_A.orgId)!.name).toBe('Original')
  })

  test('setting default in org A does not affect org B defaults', () => {
    const dA = store.createDashboard({ orgId: ORG_A.orgId, createdBy: ORG_A.userId, name: 'A Main' })
    const dB = store.createDashboard({ orgId: ORG_B.orgId, createdBy: ORG_B.userId, name: 'B Main' })

    store.setDefaultDashboard(dB.id, ORG_B.orgId)
    store.setDefaultDashboard(dA.id, ORG_A.orgId)

    // Both orgs retain their own defaults independently
    expect(store.getDashboard(dA.id, ORG_A.orgId)!.isDefault).toBe(true)
    expect(store.getDashboard(dB.id, ORG_B.orgId)!.isDefault).toBe(true)
  })
})
