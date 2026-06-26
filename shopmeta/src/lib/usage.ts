// src/lib/usage.ts
// Token usage tracking and aggregation.
// Called after each chat completion to record usage in the usageRecords table.
// Also provides server functions for aggregation queries (for the admin panel).

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and, sum, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { usageRecords, member } from '#/lib/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageRecordRow {
  id: string
  userId: string
  orgId: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  conversationId: string | null
  createdAt: string | null
}

export interface UsageByModel {
  model: string
  requestCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
}

export interface UsageSummary {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  byModel: UsageByModel[]
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireSession() {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) throw new Error('Unauthorized')
  return session
}

async function requireOrgSession() {
  const session = await requireSession()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orgId = (session.session as any).activeOrganizationId as string | undefined | null

  if (!orgId) {
    try {
      const { db } = await import('#/lib/db/index')
      const rows = await db
        .select({ orgId: member.organizationId })
        .from(member)
        .where(eq(member.userId, session.user.id))
        .limit(1)
      orgId = rows[0]?.orgId ?? null
    } catch { /* DB unavailable */ }
  }
  if (!orgId) throw new Error('No active organization')
  return { userId: session.user.id, orgId, user: session.user }
}

// ─── Serialization ────────────────────────────────────────────────────────────

function serializeRecord(r: {
  id: string
  userId: string
  orgId: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  conversationId: string | null
  createdAt: Date | null
}): UsageRecordRow {
  return {
    id: r.id,
    userId: r.userId,
    orgId: r.orgId,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    conversationId: r.conversationId,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
  }
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const RecordUsageInput = z.object({
  userId: z.string(),
  orgId: z.string(),
  model: z.string(),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  conversationId: z.string().uuid().optional(),
})

const GetUsageSummaryInput = z.object({
  /** If provided, filter to a specific user */
  userId: z.string().optional(),
  /** Start date (ISO string) */
  since: z.string().datetime().optional(),
})

// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * Record token usage after a chat completion.
 * Called server-side (not exposed as a public API) — no auth check required here
 * because it is called internally from the chat server function.
 *
 * Also exported as a plain function for direct server-side calls.
 */
export async function recordUsage(input: {
  userId: string
  orgId: string
  model: string
  inputTokens: number
  outputTokens: number
  conversationId?: string
}): Promise<UsageRecordRow> {
  const db = await getDb()

  const [created] = await db
    .insert(usageRecords)
    .values({
      userId: input.userId,
      orgId: input.orgId,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      conversationId: input.conversationId ?? null,
    })
    .returning()

  if (!created) throw new Error('Failed to record usage')
  return serializeRecord(created)
}

/**
 * Server function wrapper for recordUsage — callable from client code when needed.
 */
export const recordUsageFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => RecordUsageInput.parse(data))
  .handler(async ({ data }) => {
    return recordUsage({
      userId: data.userId,
      orgId: data.orgId,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      conversationId: data.conversationId,
    })
  })

/**
 * Get usage summary for the current org (grouped by model).
 * Returns: total requests, total tokens, breakdown by model.
 */
export const getUsageSummary = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetUsageSummaryInput.parse(data ?? {}))
  .handler(async ({ data }): Promise<UsageSummary> => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    // Build where conditions
    const conditions = [eq(usageRecords.orgId, orgId)]
    if (data?.userId) conditions.push(eq(usageRecords.userId, data.userId))

    const rows = await db
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.createdAt))

    // Aggregate by model
    const modelMap = new Map<string, UsageByModel>()
    let totalInputTokens = 0
    let totalOutputTokens = 0

    for (const row of rows) {
      const inp = row.inputTokens ?? 0
      const out = row.outputTokens ?? 0
      totalInputTokens += inp
      totalOutputTokens += out

      const existing = modelMap.get(row.model)
      if (existing) {
        existing.requestCount++
        existing.totalInputTokens += inp
        existing.totalOutputTokens += out
        existing.totalTokens += inp + out
      } else {
        modelMap.set(row.model, {
          model: row.model,
          requestCount: 1,
          totalInputTokens: inp,
          totalOutputTokens: out,
          totalTokens: inp + out,
        })
      }
    }

    return {
      totalRequests: rows.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      byModel: Array.from(modelMap.values()).sort((a, b) => b.requestCount - a.requestCount),
    }
  })

/**
 * List raw usage records for the current org (most recent first).
 */
export const listUsageRecords = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = await getDb()

    const rows = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.orgId, orgId))
      .orderBy(desc(usageRecords.createdAt))
      .limit(500)

    return rows.map(serializeRecord)
  })
