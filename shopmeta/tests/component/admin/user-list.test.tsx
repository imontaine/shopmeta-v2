// tests/component/admin/user-list.test.tsx
// Component tests for the UserList admin component.
// Tests: rendering users, search filtering, role badges, suspend/reactivate buttons.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserList } from '#/components/admin/UserList'
import type { OrgMemberRow } from '#/lib/admin'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<OrgMemberRow> & Pick<OrgMemberRow, 'userId' | 'email' | 'name'>): OrgMemberRow {
  return {
    role: 'member',
    suspended: false,
    joinedAt: new Date().toISOString(),
    ...overrides,
  }
}

const OWNER = makeUser({ userId: 'owner-1', email: 'owner@acme.com', name: 'Alice Owner', role: 'owner' })
const ADMIN = makeUser({ userId: 'admin-1', email: 'admin@acme.com', name: 'Bob Admin', role: 'admin' })
const JOHN = makeUser({ userId: 'member-john', email: 'john.doe@acme.com', name: 'John Doe', role: 'member' })
const JANE = makeUser({ userId: 'member-jane', email: 'jane.smith@acme.com', name: 'Jane Smith', role: 'member' })
const SUSPENDED = makeUser({ userId: 'member-suspended', email: 'bad@acme.com', name: 'Bad Actor', role: 'member', suspended: true })

// 10 users for spec example
function makeTenUsers(): OrgMemberRow[] {
  const extras = Array.from({ length: 6 }, (_, i) =>
    makeUser({ userId: `extra-${i}`, email: `user${i}@company.com`, name: `User ${i}`, role: 'member' }),
  )
  return [OWNER, ADMIN, JOHN, JANE, ...extras]
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('UserList — rendering', () => {
  it('renders the user-list container', () => {
    render(<UserList users={[JOHN, JANE]} />)
    expect(screen.getByTestId('user-list')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<UserList users={[JOHN, JANE]} />)
    expect(screen.getByTestId('user-search')).toBeInTheDocument()
  })

  it('renders all users initially', () => {
    render(<UserList users={[JOHN, JANE, OWNER]} />)
    expect(screen.getByTestId(`user-row-${JOHN.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${JANE.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${OWNER.userId}`)).toBeInTheDocument()
  })

  it('shows user count', () => {
    render(<UserList users={[JOHN, JANE]} />)
    expect(screen.getByTestId('user-count').textContent).toContain('2')
  })

  it('shows user name and email', () => {
    render(<UserList users={[JOHN]} />)
    expect(screen.getByTestId(`user-name-${JOHN.userId}`)).toHaveTextContent('John Doe')
    expect(screen.getByTestId(`user-email-${JOHN.userId}`)).toHaveTextContent('john.doe@acme.com')
  })

  it('shows empty state when users is empty', () => {
    render(<UserList users={[]} />)
    expect(screen.getByTestId('user-list-empty')).toBeInTheDocument()
  })

  it('does not show user-list-rows when empty', () => {
    render(<UserList users={[]} />)
    expect(screen.queryByTestId('user-list-rows')).not.toBeInTheDocument()
  })
})

// ─── Search ───────────────────────────────────────────────────────────────────

describe('UserList — search', () => {
  it('spec example: 10 users, search "john" → only matching users shown', async () => {
    const user = userEvent.setup()
    const tenUsers = makeTenUsers()
    render(<UserList users={tenUsers} />)

    await user.type(screen.getByTestId('user-search'), 'john')

    // Only John Doe should match
    expect(screen.getByTestId(`user-row-${JOHN.userId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`user-row-${JANE.userId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`user-row-${OWNER.userId}`)).not.toBeInTheDocument()
  })

  it('search is case-insensitive', async () => {
    const user = userEvent.setup()
    render(<UserList users={[JOHN, JANE]} />)

    await user.type(screen.getByTestId('user-search'), 'JOHN')
    expect(screen.getByTestId(`user-row-${JOHN.userId}`)).toBeInTheDocument()
  })

  it('search by email', async () => {
    const user = userEvent.setup()
    render(<UserList users={[JOHN, JANE]} />)

    await user.type(screen.getByTestId('user-search'), 'jane.smith')
    expect(screen.getByTestId(`user-row-${JANE.userId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`user-row-${JOHN.userId}`)).not.toBeInTheDocument()
  })

  it('search with no match shows empty state', async () => {
    const user = userEvent.setup()
    render(<UserList users={[JOHN, JANE]} />)

    await user.type(screen.getByTestId('user-search'), 'zzznomatch')
    expect(screen.getByTestId('user-list-empty')).toBeInTheDocument()
  })

  it('clearing search restores all users', async () => {
    const user = userEvent.setup()
    render(<UserList users={[JOHN, JANE]} />)

    const input = screen.getByTestId('user-search')
    await user.type(input, 'john')
    await user.clear(input)

    expect(screen.getByTestId(`user-row-${JOHN.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${JANE.userId}`)).toBeInTheDocument()
  })

  it('shows filtered count vs total when search is active', async () => {
    const user = userEvent.setup()
    const tenUsers = makeTenUsers()
    render(<UserList users={tenUsers} />)

    await user.type(screen.getByTestId('user-search'), 'john')

    const count = screen.getByTestId('user-count')
    // Should show "X of 10 members"
    expect(count.textContent).toContain('of')
    expect(count.textContent).toContain('10')
  })
})

// ─── Role badges ─────────────────────────────────────────────────────────────

describe('UserList — role badges', () => {
  it('renders owner role badge', () => {
    render(<UserList users={[OWNER]} />)
    expect(screen.getByTestId('role-badge-owner')).toBeInTheDocument()
  })

  it('renders admin role badge', () => {
    render(<UserList users={[ADMIN]} />)
    expect(screen.getByTestId('role-badge-admin')).toBeInTheDocument()
  })

  it('renders member role badge', () => {
    render(<UserList users={[JOHN]} />)
    expect(screen.getByTestId('role-badge-member')).toBeInTheDocument()
  })

  it('renders suspended badge for suspended users', () => {
    render(<UserList users={[SUSPENDED]} />)
    expect(screen.getByTestId('role-badge-suspended')).toBeInTheDocument()
  })
})

// ─── Suspend/Reactivate buttons ───────────────────────────────────────────────

describe('UserList — suspend/reactivate buttons', () => {
  it('shows suspend button for active member', () => {
    render(<UserList users={[JOHN]} currentUserId={ADMIN.userId} onSuspend={vi.fn()} />)
    expect(screen.getByTestId(`suspend-btn-${JOHN.userId}`)).toBeInTheDocument()
  })

  it('does not show suspend button when no onSuspend callback', () => {
    render(<UserList users={[JOHN]} currentUserId={ADMIN.userId} />)
    expect(screen.queryByTestId(`suspend-btn-${JOHN.userId}`)).not.toBeInTheDocument()
  })

  it('calls onSuspend with userId when suspend button clicked', async () => {
    const user = userEvent.setup()
    const onSuspend = vi.fn()
    render(<UserList users={[JOHN]} currentUserId={ADMIN.userId} onSuspend={onSuspend} />)

    await user.click(screen.getByTestId(`suspend-btn-${JOHN.userId}`))
    expect(onSuspend).toHaveBeenCalledWith(JOHN.userId)
  })

  it('shows reactivate button for suspended member', () => {
    render(<UserList users={[SUSPENDED]} currentUserId={ADMIN.userId} onReactivate={vi.fn()} />)
    expect(screen.getByTestId(`reactivate-btn-${SUSPENDED.userId}`)).toBeInTheDocument()
  })

  it('calls onReactivate with userId when reactivate button clicked', async () => {
    const user = userEvent.setup()
    const onReactivate = vi.fn()
    render(<UserList users={[SUSPENDED]} currentUserId={ADMIN.userId} onReactivate={onReactivate} />)

    await user.click(screen.getByTestId(`reactivate-btn-${SUSPENDED.userId}`))
    expect(onReactivate).toHaveBeenCalledWith(SUSPENDED.userId)
  })

  it('does not show suspend button for self (currentUserId)', () => {
    render(<UserList users={[JOHN]} currentUserId={JOHN.userId} onSuspend={vi.fn()} />)
    // Self: no suspend button
    expect(screen.queryByTestId(`suspend-btn-${JOHN.userId}`)).not.toBeInTheDocument()
  })

  it('does not show suspend button for owner', () => {
    render(<UserList users={[OWNER]} currentUserId={ADMIN.userId} onSuspend={vi.fn()} />)
    expect(screen.queryByTestId(`suspend-btn-${OWNER.userId}`)).not.toBeInTheDocument()
  })

  it('shows (you) label next to self', () => {
    render(<UserList users={[JOHN]} currentUserId={JOHN.userId} />)
    const nameCell = screen.getByTestId(`user-name-${JOHN.userId}`)
    expect(nameCell.textContent).toContain('you')
  })

  it('does not show (you) label for other users', () => {
    render(<UserList users={[JOHN, JANE]} currentUserId={JOHN.userId} />)
    const janeNameCell = screen.getByTestId(`user-name-${JANE.userId}`)
    expect(janeNameCell.textContent).not.toContain('you')
  })

  it('disables buttons when actionLoading matches userId', () => {
    render(
      <UserList
        users={[JOHN]}
        currentUserId={ADMIN.userId}
        onSuspend={vi.fn()}
        actionLoading={JOHN.userId}
      />,
    )
    const btn = screen.getByTestId(`suspend-btn-${JOHN.userId}`) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('does not disable button when actionLoading is different userId', () => {
    render(
      <UserList
        users={[JOHN]}
        currentUserId={ADMIN.userId}
        onSuspend={vi.fn()}
        actionLoading={JANE.userId}
      />,
    )
    const btn = screen.getByTestId(`suspend-btn-${JOHN.userId}`) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })
})

// ─── Integration: multiple users ─────────────────────────────────────────────

describe('UserList — integration', () => {
  it('renders a mixed list of owner, admin, member, suspended users', () => {
    render(<UserList users={[OWNER, ADMIN, JOHN, SUSPENDED]} currentUserId={ADMIN.userId} onSuspend={vi.fn()} onReactivate={vi.fn()} />)

    expect(screen.getByTestId(`user-row-${OWNER.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${ADMIN.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${JOHN.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`user-row-${SUSPENDED.userId}`)).toBeInTheDocument()
  })

  it('suspend button for member + reactivate for suspended coexist', () => {
    render(
      <UserList
        users={[JOHN, SUSPENDED]}
        currentUserId={ADMIN.userId}
        onSuspend={vi.fn()}
        onReactivate={vi.fn()}
      />,
    )

    expect(screen.getByTestId(`suspend-btn-${JOHN.userId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`reactivate-btn-${SUSPENDED.userId}`)).toBeInTheDocument()
  })
})
