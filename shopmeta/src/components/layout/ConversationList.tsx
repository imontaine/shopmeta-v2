// src/components/layout/ConversationList.tsx
// Renders the list of conversations in the sidebar.
// Handles creating, renaming, and deleting conversations inline.
// Uses TanStack Query for data fetching + optimistic updates.

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
} from '#/lib/conversations'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  title: string | null
  updatedAt: Date | string | null
  model: string | null
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const CONVERSATIONS_QUERY_KEY = ['conversations'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

// ─── ConversationItem ─────────────────────────────────────────────────────────

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  collapsed: boolean
  onSelect: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
}

function ConversationItem({
  conversation,
  isActive,
  collapsed,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(conversation.title ?? 'New Chat')
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  // Close menu on outside click.
  // Use a setTimeout(0) guard so the mousedown that OPENED the menu
  // doesn't immediately close it — a race that fires consistently in Playwright.
  useEffect(() => {
    if (!showMenu) return
    let active = false
    const timer = setTimeout(() => { active = true }, 0)
    function handleClick(e: MouseEvent) {
      if (!active) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [showMenu])

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed)
    }
    setIsRenaming(false)
    setShowMenu(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit()
    if (e.key === 'Escape') {
      setRenameValue(conversation.title ?? 'New Chat')
      setIsRenaming(false)
    }
  }

  if (collapsed) {
    return (
      <li>
        <button
          className={['conv-item', 'conv-item--collapsed', isActive ? 'conv-item--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(conversation.id)}
          title={conversation.title ?? 'New Chat'}
          aria-label={conversation.title ?? 'New Chat'}
          data-conversation-id={conversation.id}
        >
          <span className="conv-item-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        </button>
      </li>
    )
  }

  return (
    <li>
      <div
        className={['conv-item', isActive ? 'conv-item--active' : ''].filter(Boolean).join(' ')}
        data-conversation-id={conversation.id}
      >
        {isRenaming ? (
          <input
            ref={inputRef}
            id={`conv-rename-${conversation.id}`}
            className="conv-item-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            aria-label="Rename conversation"
            maxLength={255}
          />
        ) : (
          <button
            className="conv-item-btn"
            onClick={() => onSelect(conversation.id)}
            aria-label={`Open conversation: ${conversation.title ?? 'New Chat'}`}
          >
            <span className="conv-item-title">{conversation.title ?? 'New Chat'}</span>
            <span className="conv-item-time">{formatRelativeTime(conversation.updatedAt)}</span>
          </button>
        )}

        {/* Context menu */}
        {!isRenaming && (
          <div className="conv-item-menu-wrapper" ref={menuRef}>
            <button
              id={`conv-menu-${conversation.id}`}
              className="conv-item-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu((s) => !s)
              }}
              aria-label="Conversation options"
              aria-expanded={showMenu}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showMenu && (
              <div className="conv-item-dropdown" role="menu">
                <button
                  id={`conv-rename-btn-${conversation.id}`}
                  className="conv-item-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setIsRenaming(true)
                    setShowMenu(false)
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Rename
                </button>
                <button
                  id={`conv-delete-btn-${conversation.id}`}
                  className="conv-item-dropdown-item conv-item-dropdown-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setShowMenu(false)
                    onDelete(conversation.id)
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// ─── ConversationList ─────────────────────────────────────────────────────────

interface ConversationListProps {
  collapsed: boolean
  onMobileClose: () => void
}

export function ConversationList({ collapsed, onMobileClose }: ConversationListProps) {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')

  // Extract active conversationId from URL search params
  const searchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  const activeConversationId = searchParams.get('conversationId')

  // ── Fetch conversations ──
  const { data: convList = [], isLoading } = useQuery({
    queryKey: [...CONVERSATIONS_QUERY_KEY, { search: searchQuery }],
    queryFn: async () => {
      if (searchQuery.trim()) {
        const { searchConversations } = await import('#/lib/conversations')
        return searchConversations({ data: { query: searchQuery, limit: 30 } })
      }
      return listConversations({ data: { limit: 50, offset: 0 } })
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  // ── Create mutation ──
  const createMutation = useMutation({
    mutationFn: () => createConversation({ data: {} }),
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
      // Navigate to the new conversation
      navigate({ to: '/chat', search: { conversationId: newConv.id } })
      onMobileClose()
    },
  })

  // ── Rename mutation ──
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation({ data: { id, title } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
    },
  })

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConversation({ data: { id } }),
    onSuccess: (_result, deletedId) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })
      // If we deleted the active conversation, navigate to /chat without params
      if (activeConversationId === deletedId) {
        navigate({ to: '/chat' })
      }
    },
  })

  const handleSelect = (id: string) => {
    navigate({ to: '/chat', search: { conversationId: id } })
    onMobileClose()
  }



  if (collapsed) {
    return (
      <div className="conv-list-collapsed">
        <button
          id="new-chat-btn-collapsed"
          className="conv-new-btn-collapsed"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          aria-label="New chat"
          title="New chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <ul className="conv-list" role="list" aria-label="Conversations">
          {convList.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              collapsed={true}
              onSelect={handleSelect}
              onRename={(id, title) => renameMutation.mutate({ id, title })}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="conv-list-wrapper">
      {/* New Chat button */}
      <button
        id="new-chat-btn"
        className="conv-new-btn"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending}
        aria-label="Start new conversation"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New Chat</span>
      </button>

      {/* Search */}
      <div className="conv-search-wrapper">
        <svg
          className="conv-search-icon"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          id="conv-search-input"
          className="conv-search-input"
          type="search"
          placeholder="Search chats…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search conversations"
        />
      </div>

      {/* List */}
      <ul
        id="conversation-list"
        className="conv-list"
        role="list"
        aria-label="Conversations"
        aria-busy={isLoading}
      >
        {isLoading && (
          <li className="conv-list-loading" aria-label="Loading conversations">
            <span className="conv-list-loading-dot" />
            <span className="conv-list-loading-dot" />
            <span className="conv-list-loading-dot" />
          </li>
        )}

        {!isLoading && convList.length === 0 && (
          <li className="conv-list-empty">
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </li>
        )}

        {convList.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            isActive={conv.id === activeConversationId}
            collapsed={false}
            onSelect={handleSelect}
            onRename={(id, title) => renameMutation.mutate({ id, title })}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ))}
      </ul>
    </div>
  )
}
