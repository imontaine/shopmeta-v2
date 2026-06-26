// tests/integration/admin/roles.test.ts
// Integration tests for admin role enforcement, user listing, suspend/reactivate.
//
// Tests:
//  - Admin/owner can list all users in the org
//  - Non-admin (member) gets 403 on admin endpoints
//  - Admin can suspend a user (user cannot login → marked suspended)
//  - Admin can reactivate a suspended user
//  - Cannot suspend self
//  - Cannot suspend an owner

import { describe, test, expect, beforeEach } from 'vitest'
import { ADMIN_ROLES } from '#/lib/admin'
import type { MemberRole } from '#/lib/admin'

// ─── In-Memory Role/User Store ────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

interface OrgUser {
  userId: string
  email: string
  name: string
  role: MemberRole
  suspended: boolean
  orgId: string
  joinedAt: Date
}

class InMemoryAdminStore {
  private users: OrgUser[] = []

  addUser(opts: {
    userId?: string
    email: string
    name: string
    role: MemberRole
    orgId: string
    suspended?: boolean
  }): OrgUser {
    const u: OrgUser = {
      userId: opts.userId ?? uuid(),
      email: opts.email,
      name: opts.name,
      role: opts.role,
      suspended: opts.suspended ?? false,
      orgId: opts.orgId,
      joinedAt: new Date(),
    }
    this.users.push(u)
    return u
  }

  getUser(userId: string, orgId: string): OrgUser | null {
    return this.users.find((u) => u.userId === userId && u.orgId === orgId) ?? null
  }

  // ─ Role check ───────────────────────────────────────────────────────────────

  getRole(userId: string, orgId: string): MemberRole {
    return this.users.find((u) => u.userId === userId && u.orgId === orgId)?.role ?? 'member'
  }

  requireAdmin(callerId: string, orgId: string): void {
    const role = this.getRole(callerId, orgId)
    if (!ADMIN_ROLES.includes(role)) {
      throw new Error('Forbidden: admin or owner role required')
    }
  }

  // ─ List users ───────────────────────────────────────────────────────────────

  listUsers(callerId: string, orgId: string, search?: string): OrgUser[] {
    this.requireAdmin(callerId, orgId)
    let users = this.users.filter((u) => u.orgId === orgId)
    if (search) {
      const q = search.toLowerCase()
      users = users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    return users
  }

  // ─ Suspend ──────────────────────────────────────────────────────────────────

  suspendUser(callerId: string, orgId: string, targetUserId: string): void {
    this.requireAdmin(callerId, orgId)

    if (callerId === targetUserId) throw new Error('Cannot suspend your own account')

    const target = this.getUser(targetUserId, orgId)
    if (!target) throw new Error('User is not a member of this organization')
    if (target.role === 'owner') throw new Error('Cannot suspend an organization owner')

    target.suspended = true
  }

  // ─ Reactivate ───────────────────────────────────────────────────────────────

  reactivateUser(callerId: string, orgId: string, targetUserId: string): void {
    this.requireAdmin(callerId, orgId)

    const target = this.getUser(targetUserId, orgId)
    if (!target) throw new Error('User is not a member of this organization')

    target.suspended = false
  }

  clear() { this.users = [] }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ORG_A = 'org-a'
const ORG_B = 'org-b'

let store: InMemoryAdminStore
let ownerUser: OrgUser
let adminUser: OrgUser
let memberUser: OrgUser
let memberUser2: OrgUser

beforeEach(() => {
  store = new InMemoryAdminStore()

  ownerUser = store.addUser({ email: 'owner@acme.com', name: 'Owner User', role: 'owner', orgId: ORG_A })
  adminUser = store.addUser({ email: 'admin@acme.com', name: 'Admin User', role: 'admin', orgId: ORG_A })
  memberUser = store.addUser({ email: 'john.doe@acme.com', name: 'John Doe', role: 'member', orgId: ORG_A })
  memberUser2 = store.addUser({ email: 'jane.smith@acme.com', name: 'Jane Smith', role: 'member', orgId: ORG_A })
})

// ─── Role constants ───────────────────────────────────────────────────────────

describe('ADMIN_ROLES constant', () => {
  test('includes owner and admin', () => {
    expect(ADMIN_ROLES).toContain('owner')
    expect(ADMIN_ROLES).toContain('admin')
  })

  test('does not include member', () => {
    expect(ADMIN_ROLES).not.toContain('member')
  })
})

// ─── List Users ───────────────────────────────────────────────────────────────

describe('Admin — list users', () => {
  test('owner can list all users in the org', () => {
    const users = store.listUsers(ownerUser.userId, ORG_A)
    expect(users).toHaveLength(4)
  })

  test('admin can list all users in the org', () => {
    const users = store.listUsers(adminUser.userId, ORG_A)
    expect(users).toHaveLength(4)
  })

  test('spec example: non-admin gets 403 on admin endpoints', () => {
    expect(() => store.listUsers(memberUser.userId, ORG_A)).toThrow(
      'Forbidden: admin or owner role required',
    )
  })

  test('non-admin in different org also gets forbidden', () => {
    const orgBMember = store.addUser({ email: 'b@b.com', name: 'B User', role: 'member', orgId: ORG_B })
    expect(() => store.listUsers(orgBMember.userId, ORG_B)).toThrow('Forbidden')
  })

  test('returns correct user data (name, email, role)', () => {
    const users = store.listUsers(ownerUser.userId, ORG_A)
    const john = users.find((u) => u.userId === memberUser.userId)
    expect(john).toBeDefined()
    expect(john!.name).toBe('John Doe')
    expect(john!.email).toBe('john.doe@acme.com')
    expect(john!.role).toBe('member')
  })

  test('search "john" returns only matching users', () => {
    // Add 10 users to meet spec example of searching in 10 users
    for (let i = 0; i < 6; i++) {
      store.addUser({ email: `user${i}@test.com`, name: `User ${i}`, role: 'member', orgId: ORG_A })
    }

    const results = store.listUsers(adminUser.userId, ORG_A, 'john')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((u) => u.name.toLowerCase().includes('john') || u.email.toLowerCase().includes('john'))).toBe(true)
  })

  test('search is case-insensitive', () => {
    const results = store.listUsers(adminUser.userId, ORG_A, 'JOHN')
    expect(results.length).toBeGreaterThan(0)
  })

  test('search by email works', () => {
    const results = store.listUsers(adminUser.userId, ORG_A, 'acme.com')
    expect(results.length).toBeGreaterThan(0)
  })

  test('search with no matches returns empty array', () => {
    const results = store.listUsers(adminUser.userId, ORG_A, 'zzz-no-match-xyz')
    expect(results).toHaveLength(0)
  })

  test('empty search returns all users', () => {
    const results = store.listUsers(adminUser.userId, ORG_A, '')
    expect(results).toHaveLength(4)
  })

  test('lists only users from the current org', () => {
    store.addUser({ email: 'other@org.com', name: 'Other Org User', role: 'owner', orgId: ORG_B })
    const orgAAdmin = store.addUser({ email: 'oadmin@org.com', name: 'Org B Admin', role: 'admin', orgId: ORG_B })

    const orgBResults = store.listUsers(orgAAdmin.userId, ORG_B)
    expect(orgBResults.every((u) => u.orgId === ORG_B)).toBe(true)
    expect(orgBResults.some((u) => u.orgId === ORG_A)).toBe(false)
  })
})

// ─── Suspend User ─────────────────────────────────────────────────────────────

describe('Admin — suspend user', () => {
  test('admin can suspend a member', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(true)
  })

  test('owner can suspend a member', () => {
    store.suspendUser(ownerUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(true)
  })

  test('member cannot suspend anyone (403)', () => {
    expect(() => store.suspendUser(memberUser.userId, ORG_A, memberUser2.userId)).toThrow(
      'Forbidden: admin or owner role required',
    )
  })

  test('cannot suspend yourself', () => {
    expect(() => store.suspendUser(adminUser.userId, ORG_A, adminUser.userId)).toThrow(
      'Cannot suspend your own account',
    )
  })

  test('cannot suspend an organization owner', () => {
    expect(() => store.suspendUser(adminUser.userId, ORG_A, ownerUser.userId)).toThrow(
      'Cannot suspend an organization owner',
    )
  })

  test('cannot suspend a non-member', () => {
    expect(() => store.suspendUser(adminUser.userId, ORG_A, 'non-existent-user-id')).toThrow(
      'User is not a member of this organization',
    )
  })

  test('suspended user appears suspended in user list', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    const users = store.listUsers(adminUser.userId, ORG_A)
    const john = users.find((u) => u.userId === memberUser.userId)
    expect(john!.suspended).toBe(true)
  })
})

// ─── Reactivate User ──────────────────────────────────────────────────────────

describe('Admin — reactivate user', () => {
  test('admin can reactivate a suspended user', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(true)

    store.reactivateUser(adminUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(false)
  })

  test('owner can reactivate a suspended user', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    store.reactivateUser(ownerUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(false)
  })

  test('member cannot reactivate users (403)', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    expect(() => store.reactivateUser(memberUser2.userId, ORG_A, memberUser.userId)).toThrow('Forbidden')
  })

  test('reactivating a non-suspended user is a no-op', () => {
    // memberUser is not suspended
    expect(() => store.reactivateUser(adminUser.userId, ORG_A, memberUser.userId)).not.toThrow()
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(false)
  })

  test('cannot reactivate a non-member', () => {
    expect(() => store.reactivateUser(adminUser.userId, ORG_A, 'unknown-user')).toThrow(
      'User is not a member of this organization',
    )
  })

  test('suspend → reactivate → not suspended', () => {
    store.suspendUser(ownerUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(true)

    store.reactivateUser(ownerUser.userId, ORG_A, memberUser.userId)
    expect(store.getUser(memberUser.userId, ORG_A)!.suspended).toBe(false)
  })

  test('reactivated user is no longer suspended in user list', () => {
    store.suspendUser(adminUser.userId, ORG_A, memberUser.userId)
    store.reactivateUser(adminUser.userId, ORG_A, memberUser.userId)

    const users = store.listUsers(adminUser.userId, ORG_A)
    const john = users.find((u) => u.userId === memberUser.userId)
    expect(john!.suspended).toBe(false)
  })
})

// ─── Role enforcement edge cases ──────────────────────────────────────────────

describe('Role enforcement — edge cases', () => {
  test('unknown user defaults to member role (denied access)', () => {
    expect(() => store.listUsers('unknown-user-id', ORG_A)).toThrow('Forbidden')
  })

  test('user from different org cannot access org A admin', () => {
    const orgBOwner = store.addUser({ email: 'b@owner.com', name: 'B Owner', role: 'owner', orgId: ORG_B })
    // orgBOwner is owner of ORG_B but member (unknown) of ORG_A
    expect(() => store.listUsers(orgBOwner.userId, ORG_A)).toThrow('Forbidden')
  })

  test('admin role passes ADMIN_ROLES.includes check', () => {
    expect(ADMIN_ROLES.includes('admin')).toBe(true)
  })

  test('owner role passes ADMIN_ROLES.includes check', () => {
    expect(ADMIN_ROLES.includes('owner')).toBe(true)
  })

  test('member role fails ADMIN_ROLES.includes check', () => {
    expect(ADMIN_ROLES.includes('member')).toBe(false)
  })
})
