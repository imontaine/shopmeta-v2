// src/components/admin/UserList.tsx
// Searchable user list for the admin panel.
// Renders all org members with their role, email, and suspension status.
// Supports: text search (filters by name/email), suspend/reactivate/remove actions.
// Includes: InviteMemberForm for inviting new members by email.

import React, { useState, useMemo, useCallback } from 'react'
import type { OrgMemberRow, MemberRole } from '#/lib/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserListProps {
  /** All members loaded from the server */
  users: OrgMemberRow[]
  /** The current admin's userId (to disable self-actions) */
  currentUserId?: string
  /** Called when admin suspends a user */
  onSuspend?: (userId: string) => void | Promise<void>
  /** Called when admin reactivates a user */
  onReactivate?: (userId: string) => void | Promise<void>
  /** Called when admin removes a member from the org */
  onRemove?: (userId: string) => void | Promise<void>
  /** Whether suspend/reactivate/remove actions are in progress */
  actionLoading?: string | null
  className?: string
}

export interface InviteMemberFormProps {
  /** Called when the form is submitted with email + role */
  onInvite: (email: string, role: 'admin' | 'member') => void | Promise<void>
  /** Whether the invite is in progress */
  loading?: boolean
  className?: string
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<MemberRole | 'suspended', string> = {
  owner: 'hsl(280 70% 60%)',
  admin: 'hsl(220 70% 60%)',
  member: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
  suspended: 'hsl(0 72% 60%)',
}

function RoleBadge({ role, suspended }: { role: MemberRole; suspended: boolean }) {
  const label = suspended ? 'suspended' : role
  const color = ROLE_COLORS[label] ?? ROLE_COLORS.member

  return (
    <span
      data-testid={`role-badge-${label}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        border: `1px solid ${color}`,
        color,
        background: `${color}22`,
      }}
    >
      {label}
    </span>
  )
}

// ─── UserList ─────────────────────────────────────────────────────────────────

export function UserList({
  users,
  currentUserId,
  onSuspend,
  onReactivate,
  onRemove,
  actionLoading,
  className,
}: UserListProps) {
  const [search, setSearch] = useState('')

  // Filter users by search query (case-insensitive, matches name or email)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [users, search])

  const handleSuspend = useCallback(
    async (userId: string) => {
      await onSuspend?.(userId)
    },
    [onSuspend],
  )

  const handleReactivate = useCallback(
    async (userId: string) => {
      await onReactivate?.(userId)
    },
    [onReactivate],
  )

  const handleRemove = useCallback(
    async (userId: string) => {
      await onRemove?.(userId)
    },
    [onRemove],
  )

  return (
    <div
      data-testid="user-list"
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <input
          data-testid="user-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search users"
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            background: 'hsl(var(--muted, 240 4.8% 15.88%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '6px',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            fontSize: '0.85rem',
            boxSizing: 'border-box',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.9rem',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          }}
        >
          🔍
        </span>
      </div>

      {/* Result count */}
      <div
        data-testid="user-count"
        style={{
          fontSize: '0.75rem',
          color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
        }}
      >
        {filtered.length === users.length
          ? `${users.length} member${users.length !== 1 ? 's' : ''}`
          : `${filtered.length} of ${users.length} members`}
      </div>

      {/* User rows */}
      {filtered.length === 0 ? (
        <div
          data-testid="user-list-empty"
          style={{
            padding: '32px',
            textAlign: 'center',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
            fontSize: '0.85rem',
          }}
        >
          No users match your search
        </div>
      ) : (
        <div
          data-testid="user-list-rows"
          style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          {filtered.map((u) => {
            const isSelf = u.userId === currentUserId
            const isLoading = actionLoading === u.userId
            const isOwner = u.role === 'owner'

            return (
              <div
                key={u.userId}
                data-testid={`user-row-${u.userId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  background: u.suspended
                    ? 'hsl(0 72% 51% / 0.06)'
                    : 'hsl(var(--muted, 240 4.8% 15.88%) / 0.4)',
                  border: '1px solid hsl(var(--border, 240 3.7% 25%))',
                  borderRadius: '6px',
                }}
              >
                {/* Avatar placeholder */}
                <div
                  aria-hidden="true"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: `hsl(${u.userId.charCodeAt(0) * 3 % 360} 60% 35%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>

                {/* Name + email */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    data-testid={`user-name-${u.userId}`}
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'hsl(var(--foreground, 0 0% 98%))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.name}
                    {isSelf && (
                      <span style={{ fontSize: '0.7rem', marginLeft: '6px', color: 'hsl(var(--muted-foreground, 240 5% 64.9%))' }}>
                        (you)
                      </span>
                    )}
                  </div>
                  <div
                    data-testid={`user-email-${u.userId}`}
                    style={{
                      fontSize: '0.75rem',
                      color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.email}
                  </div>
                </div>

                {/* Role badge */}
                <RoleBadge role={u.role} suspended={u.suspended} />

                {/* Actions — only rendered when at least one callback is provided */}
                {!isSelf && !isOwner && (onSuspend || onReactivate || onRemove) && (
                  <div style={{ flexShrink: 0, display: 'flex', gap: '6px' }}>
                    {u.suspended ? (
                      onReactivate && (
                        <button
                          data-testid={`reactivate-btn-${u.userId}`}
                          onClick={() => handleReactivate(u.userId)}
                          disabled={isLoading}
                          aria-label={`Reactivate ${u.name}`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            border: '1px solid hsl(142 76% 36%)',
                            borderRadius: '4px',
                            background: 'hsl(142 76% 36% / 0.15)',
                            color: 'hsl(142 76% 56%)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {isLoading ? '…' : 'Reactivate'}
                        </button>
                      )
                    ) : (
                      onSuspend && (
                        <button
                          data-testid={`suspend-btn-${u.userId}`}
                          onClick={() => handleSuspend(u.userId)}
                          disabled={isLoading}
                          aria-label={`Suspend ${u.name}`}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            border: '1px solid hsl(0 72% 51%)',
                            borderRadius: '4px',
                            background: 'hsl(0 72% 51% / 0.1)',
                            color: 'hsl(0 72% 70%)',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {isLoading ? '…' : 'Suspend'}
                        </button>
                      )
                    )}
                    {onRemove && (
                      <button
                        data-testid={`remove-btn-${u.userId}`}
                        onClick={() => handleRemove(u.userId)}
                        disabled={isLoading}
                        aria-label={`Remove ${u.name} from organization`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          border: '1px solid hsl(25 72% 51%)',
                          borderRadius: '4px',
                          background: 'hsl(25 72% 51% / 0.1)',
                          color: 'hsl(25 72% 70%)',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {isLoading ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── InviteMemberForm ─────────────────────────────────────────────────────────

/**
 * Form for inviting a new team member by email.
 * Renders an email input, role selector, and submit button.
 */
export function InviteMemberForm({ onInvite, loading, className }: InviteMemberFormProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    try {
      await onInvite(email.trim(), role)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    }
  }

  return (
    <form
      data-testid="invite-member-form"
      onSubmit={handleSubmit}
      className={className}
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        padding: '12px',
        background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.4)',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        borderRadius: '8px',
      }}
    >
      <div style={{ flex: 1, minWidth: '200px' }}>
        <label
          htmlFor="invite-email"
          style={{
            display: 'block',
            fontSize: '0.75rem',
            fontWeight: 600,
            marginBottom: '4px',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          }}
        >
          Invite by email
        </label>
        <input
          id="invite-email"
          data-testid="invite-email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          required
          disabled={loading}
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'hsl(var(--background, 240 10% 3.9%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '5px',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            fontSize: '0.85rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="invite-role"
          style={{
            display: 'block',
            fontSize: '0.75rem',
            fontWeight: 600,
            marginBottom: '4px',
            color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
          }}
        >
          Role
        </label>
        <select
          id="invite-role"
          data-testid="invite-role-select"
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
          disabled={loading}
          style={{
            padding: '6px 28px 6px 10px',
            background: 'hsl(var(--background, 240 10% 3.9%))',
            border: '1px solid hsl(var(--border, 240 3.7% 25%))',
            borderRadius: '5px',
            color: 'hsl(var(--foreground, 0 0% 98%))',
            fontSize: '0.85rem',
          }}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button
        data-testid="invite-submit-btn"
        type="submit"
        disabled={loading || !email.trim()}
        style={{
          padding: '7px 16px',
          background: 'hsl(224 71% 55%)',
          border: 'none',
          borderRadius: '5px',
          color: '#fff',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !email.trim() ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {loading ? 'Sending…' : 'Send Invite'}
      </button>

      {error && (
        <div
          data-testid="invite-error"
          role="alert"
          style={{
            width: '100%',
            fontSize: '0.75rem',
            color: 'hsl(0 72% 70%)',
            marginTop: '4px',
          }}
        >
          {error}
        </div>
      )}
    </form>
  )
}
