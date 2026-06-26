// tests/integration/admin/usage.test.ts
// Integration tests for token usage tracking and aggregation.
//
// Tests:
//  - Token tracking records usage per request with input/output tokens
//  - Usage aggregation by model (e.g. 3 GPT-4o + 2 Claude → correct grouping)
//  - Total token counting
//  - Per-user filtering

import { describe, test, expect, beforeEach } from 'vitest'

// ─── In-Memory Usage Store ────────────────────────────────────────────────────

interface UsageRecord {
  id: string
  userId: string
  orgId: string
  model: string
  inputTokens: number
  outputTokens: number
  conversationId: string | null
  createdAt: Date
}

interface UsageByModel {
  model: string
  requestCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

class InMemoryUsageStore {
  private records: UsageRecord[] = []

  // ─ Record usage ─────────────────────────────────────────────────────────────

  recordUsage(input: {
    userId: string
    orgId: string
    model: string
    inputTokens: number
    outputTokens: number
    conversationId?: string
  }): UsageRecord {
    const record: UsageRecord = {
      id: uuid(),
      userId: input.userId,
      orgId: input.orgId,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      conversationId: input.conversationId ?? null,
      createdAt: new Date(),
    }
    this.records.push(record)
    return record
  }

  // Simulates calling the server function after a chat completion
  simulateChatCompletion(input: {
    userId: string
    orgId: string
    model: string
    inputTokens: number
    outputTokens: number
    conversationId?: string
  }): UsageRecord {
    return this.recordUsage(input)
  }

  // ─ Query ───────────────────────────────────────────────────────────────────

  getByUser(userId: string): UsageRecord[] {
    return this.records.filter((r) => r.userId === userId)
  }

  getByOrg(orgId: string): UsageRecord[] {
    return this.records.filter((r) => r.orgId === orgId)
  }

  // ─ Aggregate ───────────────────────────────────────────────────────────────

  aggregateByModel(orgId: string, userId?: string): UsageByModel[] {
    const records = this.records.filter(
      (r) => r.orgId === orgId && (userId ? r.userId === userId : true),
    )

    const modelMap = new Map<string, UsageByModel>()
    for (const rec of records) {
      const existing = modelMap.get(rec.model)
      if (existing) {
        existing.requestCount++
        existing.totalInputTokens += rec.inputTokens
        existing.totalOutputTokens += rec.outputTokens
        existing.totalTokens += rec.inputTokens + rec.outputTokens
      } else {
        modelMap.set(rec.model, {
          model: rec.model,
          requestCount: 1,
          totalInputTokens: rec.inputTokens,
          totalOutputTokens: rec.outputTokens,
          totalTokens: rec.inputTokens + rec.outputTokens,
        })
      }
    }

    return Array.from(modelMap.values()).sort((a, b) => b.requestCount - a.requestCount)
  }

  getSummary(orgId: string) {
    const records = this.getByOrg(orgId)
    const byModel = this.aggregateByModel(orgId)
    const totalInputTokens = records.reduce((s, r) => s + r.inputTokens, 0)
    const totalOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0)
    return {
      totalRequests: records.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      byModel,
    }
  }

  clear() { this.records = [] }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

const ORG_A = 'org-a'
const USER_1 = 'user-1'
const USER_2 = 'user-2'

let store: InMemoryUsageStore

beforeEach(() => {
  store = new InMemoryUsageStore()
})

// ─── Token Tracking ───────────────────────────────────────────────────────────

describe('Token usage tracking', () => {
  test('spec example: records inputTokens and outputTokens per request', () => {
    const record = store.simulateChatCompletion({
      userId: USER_1,
      orgId: ORG_A,
      model: 'gpt-4o',
      inputTokens: 150,
      outputTokens: 300,
    })

    const records = store.getByUser(USER_1)
    expect(records).toHaveLength(1)
    expect(records[0]!.inputTokens).toBe(150)
    expect(records[0]!.outputTokens).toBe(300)
  })

  test('records model name with each usage entry', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    const records = store.getByUser(USER_1)
    expect(records[0]!.model).toBe('gpt-4o')
  })

  test('records userId and orgId with each usage entry', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    const records = store.getByUser(USER_1)
    expect(records[0]!.userId).toBe(USER_1)
    expect(records[0]!.orgId).toBe(ORG_A)
  })

  test('records conversationId when provided', () => {
    const convId = uuid()
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 10, outputTokens: 20, conversationId: convId })
    const records = store.getByUser(USER_1)
    expect(records[0]!.conversationId).toBe(convId)
  })

  test('conversationId is null when not provided', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    const records = store.getByUser(USER_1)
    expect(records[0]!.conversationId).toBeNull()
  })

  test('each record gets a unique ID', () => {
    const r1 = store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    const r2 = store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 30, outputTokens: 40 })
    expect(r1.id).not.toBe(r2.id)
  })

  test('records from multiple completions accumulate', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 150, outputTokens: 300 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'claude-sonnet', inputTokens: 80, outputTokens: 160 })

    expect(store.getByUser(USER_1)).toHaveLength(3)
  })

  test('supports zero input tokens (tool-only response)', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 0, outputTokens: 50 })
    const records = store.getByUser(USER_1)
    expect(records[0]!.inputTokens).toBe(0)
  })
})

// ─── Usage Aggregation by Model ───────────────────────────────────────────────

describe('Usage aggregation by model', () => {
  test('spec example: 5 requests (3 GPT-4o, 2 Claude) → grouped correctly', () => {
    // 3 GPT-4o requests
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 150, outputTokens: 300 })
    store.simulateChatCompletion({ userId: USER_2, orgId: ORG_A, model: 'gpt-4o', inputTokens: 120, outputTokens: 240 })

    // 2 Claude requests
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'claude-sonnet', inputTokens: 80, outputTokens: 160 })
    store.simulateChatCompletion({ userId: USER_2, orgId: ORG_A, model: 'claude-sonnet', inputTokens: 60, outputTokens: 120 })

    const byModel = store.aggregateByModel(ORG_A)

    expect(byModel).toHaveLength(2)

    const gpt4 = byModel.find((b) => b.model === 'gpt-4o')
    expect(gpt4).toBeDefined()
    expect(gpt4!.requestCount).toBe(3)

    const claude = byModel.find((b) => b.model === 'claude-sonnet')
    expect(claude).toBeDefined()
    expect(claude!.requestCount).toBe(2)
  })

  test('aggregation sums inputTokens and outputTokens per model', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 150, outputTokens: 300 })

    const byModel = store.aggregateByModel(ORG_A)
    const gpt4 = byModel.find((b) => b.model === 'gpt-4o')!

    expect(gpt4.totalInputTokens).toBe(250)
    expect(gpt4.totalOutputTokens).toBe(500)
    expect(gpt4.totalTokens).toBe(750)
  })

  test('model with most requests appears first (sorted by requestCount desc)', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 10, outputTokens: 20 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'claude-sonnet', inputTokens: 10, outputTokens: 20 })

    const byModel = store.aggregateByModel(ORG_A)
    expect(byModel[0]!.model).toBe('gpt-4o')
  })

  test('returns empty array when no usage records', () => {
    expect(store.aggregateByModel(ORG_A)).toEqual([])
  })

  test('getSummary returns totalRequests, totalTokens, and byModel', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'claude-sonnet', inputTokens: 50, outputTokens: 100 })

    const summary = store.getSummary(ORG_A)
    expect(summary.totalRequests).toBe(2)
    expect(summary.totalInputTokens).toBe(150)
    expect(summary.totalOutputTokens).toBe(300)
    expect(summary.totalTokens).toBe(450)
    expect(summary.byModel).toHaveLength(2)
  })

  test('per-user filtering: only returns usage for specified user', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })
    store.simulateChatCompletion({ userId: USER_2, orgId: ORG_A, model: 'gpt-4o', inputTokens: 50, outputTokens: 100 })

    const user1Usage = store.aggregateByModel(ORG_A, USER_1)
    expect(user1Usage).toHaveLength(1)
    expect(user1Usage[0]!.totalInputTokens).toBe(100) // only USER_1's record
  })

  test('tenant isolation: org A usage not visible to org B query', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gpt-4o', inputTokens: 100, outputTokens: 200 })

    const orgBUsage = store.aggregateByModel('org-b')
    expect(orgBUsage).toHaveLength(0)
  })

  test('handles single model single request correctly', () => {
    store.simulateChatCompletion({ userId: USER_1, orgId: ORG_A, model: 'gemini-2.0-flash', inputTokens: 500, outputTokens: 1000 })

    const byModel = store.aggregateByModel(ORG_A)
    expect(byModel).toHaveLength(1)
    expect(byModel[0]!.model).toBe('gemini-2.0-flash')
    expect(byModel[0]!.requestCount).toBe(1)
    expect(byModel[0]!.totalTokens).toBe(1500)
  })
})
