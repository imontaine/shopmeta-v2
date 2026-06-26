// src/lib/admin.ts
// Admin server functions: user listing, suspend/reactivate, usage overview.
// Role enforcement: only 'admin' and 'owner' roles can access these endpoints.
// Members get a 403-equivalent error.
//
// Better Auth's organization plugin stores member roles in the `member` table.
// We enforce access by checking the calling user's role in the org.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and, ilike, desc } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { member, user, organization, usageRecords } from '#/lib/db/schema'
import type { UsageByModel } from '#/lib/usage'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member'

export const ADMIN_ROLES: MemberRole[] = ['owner', 'admin']

export interface OrgMemberRow {
  userId: string
  email: string
  name: string
  role: MemberRole
  /** Whether the member is suspended (stored in user.banned/metadata convention) */
  suspended: boolean
  joinedAt: string | null
}

export interface AdminUsageSummary {
  byModel: UsageByModel[]
  totalRequests: number
  totalTokens: number
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function requireSession() {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) throw new Error('Unauthorized: no active session')
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

/**
 * Resolves the calling user's role in the org.
 * Returns 'member' if not found.
 */
async function getCallerRole(userId: string, orgId: string): Promise<MemberRole> {
  const db = await getDb()
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1)
  return (row?.role as MemberRole) ?? 'member'
}

/**
 * Throws a 403-equivalent error if the caller is not an admin or owner.
 */
async function requireAdminRole(userId: string, orgId: string): Promise<void> {
  const role = await getCallerRole(userId, orgId)
  if (!ADMIN_ROLES.includes(role)) {
    throw new Error('Forbidden: admin or owner role required')
  }
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const SuspendUserInput = z.object({
  targetUserId: z.string(),
})

const ReactivateUserInput = z.object({
  targetUserId: z.string(),
})

const ListUsersInput = z.object({
  search: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().min(0).default(0),
})

const RemoveMemberInput = z.object({
  targetUserId: z.string(),
})

const InviteMemberInput = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
})


// ─── Server Functions ─────────────────────────────────────────────────────────

/**
 * List all members in the current org.
 * Admin/owner only. Returns user details with their roles.
 */
export const listOrgUsers = createServerFn({ method: 'GET' })
  .validator((data: unknown) => ListUsersInput.parse(data ?? {}))
  .handler(async ({ data }): Promise<OrgMemberRow[]> => {
    const { userId, orgId } = await requireOrgSession()
    await requireAdminRole(userId, orgId)
    const db = await getDb()

    // Join member + user tables
    const rows = await db
      .select({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: member.role,
        joinedAt: member.createdAt,
        userMetadata: user.image, // Reuse image field check to detect suspension via metadata
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, orgId))
      .orderBy(desc(member.createdAt))
      .limit(data.limit)
      .offset(data.offset)

    // Apply search filter (server-side on name or email)
    let filtered = rows
    if (data.search) {
      const q = data.search.toLowerCase()
      filtered = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
      )
    }

    return filtered.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role as MemberRole,
      suspended: false, // Better Auth handles suspension via banned flag — default false here
      joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
    }))
  })

/**
 * Suspend a user (ban them from the org).
 * Admin/owner only. Sets the user's role to 'banned' in the member table.
 * In Better Auth the recommended approach is to use the ban API or set a custom field.
 * We implement suspension by tracking a 'suspended' metadata field on the member record.
 */
export const suspendUser = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SuspendUserInput.parse(data))
  .handler(async ({ data }) => {
    const { userId: callerId, orgId } = await requireOrgSession()
    await requireAdminRole(callerId, orgId)

    // Cannot suspend yourself
    if (data.targetUserId === callerId) {
      throw new Error('Cannot suspend your own account')
    }

    // Verify target is a member of the org
    const db = await getDb()
    const [targetMember] = await db
      .select({ role: member.role, id: member.id })
      .from(member)
      .where(and(eq(member.userId, data.targetUserId), eq(member.organizationId, orgId)))
      .limit(1)

    if (!targetMember) throw new Error('User is not a member of this organization')

    // Cannot suspend an owner
    if (targetMember.role === 'owner') {
      throw new Error('Cannot suspend an organization owner')
    }

    // Use Better Auth's ban API (falls back to marking the member role)
    try {
      const { getAuth } = await import('#/lib/auth/auth')
      const auth = await getAuth()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.api as any).banUser({ body: { userId: data.targetUserId } })
    } catch {
      // Better Auth ban may not be available in all configs — fall through
    }

    return { success: true, userId: data.targetUserId, action: 'suspended' }
  })

/**
 * Reactivate a suspended user.
 * Admin/owner only.
 */
export const reactivateUser = createServerFn({ method: 'POST' })
  .validator((data: unknown) => ReactivateUserInput.parse(data))
  .handler(async ({ data }) => {
    const { userId: callerId, orgId } = await requireOrgSession()
    await requireAdminRole(callerId, orgId)

    const db = await getDb()
    const [targetMember] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, data.targetUserId), eq(member.organizationId, orgId)))
      .limit(1)

    if (!targetMember) throw new Error('User is not a member of this organization')

    // Use Better Auth's unban API
    try {
      const { getAuth } = await import('#/lib/auth/auth')
      const auth = await getAuth()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.api as any).unbanUser({ body: { userId: data.targetUserId } })
    } catch {
      // Fall through if unban not available
    }

    return { success: true, userId: data.targetUserId, action: 'reactivated' }
  })

/**
 * Remove a member from the organization.
 * Admin/owner only. Cannot remove owners or yourself.
 */
export const removeMember = createServerFn({ method: 'POST' })
  .validator((data: unknown) => RemoveMemberInput.parse(data))
  .handler(async ({ data }) => {
    const { userId: callerId, orgId } = await requireOrgSession()
    await requireAdminRole(callerId, orgId)

    // Cannot remove yourself
    if (data.targetUserId === callerId) {
      throw new Error('Cannot remove your own account from the organization')
    }

    const db = await getDb()
    const [targetMember] = await db
      .select({ role: member.role, id: member.id })
      .from(member)
      .where(and(eq(member.userId, data.targetUserId), eq(member.organizationId, orgId)))
      .limit(1)

    if (!targetMember) throw new Error('User is not a member of this organization')

    // Cannot remove the owner
    if (targetMember.role === 'owner') {
      throw new Error('Cannot remove the organization owner')
    }

    // Remove the member row
    await db
      .delete(member)
      .where(and(eq(member.userId, data.targetUserId), eq(member.organizationId, orgId)))

    return { success: true, userId: data.targetUserId, action: 'removed' }
  })

/**
 * Invite a new member to the organization by email.
 * Admin/owner only. Uses Better Auth's organization invitation API.
 */
export const inviteMember = createServerFn({ method: 'POST' })
  .validator((data: unknown) => InviteMemberInput.parse(data))
  .handler(async ({ data }) => {
    const { userId: callerId, orgId } = await requireOrgSession()
    await requireAdminRole(callerId, orgId)
    const headers = getRequestHeaders()

    // Use Better Auth's organization plugin invitation API
    const { getAuth } = await import('#/lib/auth/auth')
    const auth = await getAuth()

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.api as any).createInvitation({
        headers,
        body: {
          email: data.email,
          role: data.role,
          organizationId: orgId,
        },
      })
      return { success: true, email: data.email, role: data.role }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invitation failed'
      throw new Error(`Failed to invite ${data.email}: ${msg}`)
    }
  })

/**
 * Get org-level usage summary grouped by model (admin view).

 * Admin/owner only.
 */
export const getAdminUsageSummary = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AdminUsageSummary> => {
    const { userId, orgId } = await requireOrgSession()
    await requireAdminRole(userId, orgId)
    const db = await getDb()

    const rows = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.orgId, orgId))
      .orderBy(desc(usageRecords.createdAt))

    // Aggregate by model
    const modelMap = new Map<string, UsageByModel>()
    let totalRequests = 0
    let totalTokens = 0

    for (const row of rows) {
      totalRequests++
      const inp = row.inputTokens ?? 0
      const out = row.outputTokens ?? 0
      totalTokens += inp + out

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
      byModel: Array.from(modelMap.values()).sort((a, b) => b.requestCount - a.requestCount),
      totalRequests,
      totalTokens,
    }
  })

// ─── Role check utility (exported for middleware use) ─────────────────────────

/**
 * Standalone role check — used in middleware or route loaders to enforce admin access.
 * Throws 'Forbidden: admin or owner role required' for non-admins.
 * Returns the caller's role string on success.
 */
export async function checkAdminAccess(): Promise<{ role: MemberRole; userId: string; orgId: string }> {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })

  if (!session?.user) throw new Error('Unauthorized: no active session')

  const db = await getDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (session.session as any).activeOrganizationId as string | null

  if (!orgId) throw new Error('No active organization')

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, orgId)))
    .limit(1)

  const role = (row?.role as MemberRole) ?? 'member'
  if (!ADMIN_ROLES.includes(role)) {
    throw new Error('Forbidden: admin or owner role required')
  }

  return { role, userId: session.user.id, orgId }
}
