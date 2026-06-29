// src/lib/auth/require-org-session.ts
// Shared auth guard for server functions.
// Returns the authenticated user's ID, org ID, and user object.
// Throws if no session or no active organization.

import { eq } from 'drizzle-orm'
import { getRequestHeaders } from '@tanstack/react-start/server'

export async function requireOrgSession() {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new Error('Unauthorized: no active session')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orgId = (session.session as any).activeOrganizationId as string | undefined | null

  if (!orgId) {
    try {
      const { member } = await import('#/lib/db/schema')
      const { db } = await import('#/lib/db/index')
      const rows = await db
        .select({ orgId: member.organizationId })
        .from(member)
        .where(eq(member.userId, session.user.id))
        .limit(1)
      orgId = rows[0]?.orgId ?? null
    } catch {
      // DB unavailable
    }
  }

  if (!orgId) {
    throw new Error('No active organization. Please join or create an organization.')
  }

  return { userId: session.user.id, orgId, user: session.user }
}
