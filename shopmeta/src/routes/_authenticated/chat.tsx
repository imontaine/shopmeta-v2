// src/routes/_authenticated/chat.tsx
// Protected chat route — only accessible when authenticated.
// Supports ?conversationId= search param to load a specific conversation.

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { z } from 'zod'

// ─── Search params schema ──────────────────────────────────────────────────
const ChatSearchSchema = z.object({
  conversationId: z.string().uuid().optional(),
})

export const Route = createFileRoute('/_authenticated/chat')({
  validateSearch: ChatSearchSchema,
  component: ChatPage,
})

function ChatPage() {
  // Use context.user provided by the root route's beforeLoad.
  // Stable — no async re-renders from session fetching.
  const { user } = Route.useRouteContext()
  const { conversationId } = Route.useSearch()

  // Disabled until React hydrates — prevents Playwright clicking the button
  // before the onClick handler is attached (same race as the auth forms).
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => { setIsHydrated(true) }, [])

  const handleLogout = () => {
    // Navigate to the raw API sign-out endpoint (GET).
    // This is a full page reload, so the server handler receives the actual
    // browser request with cookies. The handler deletes the session from DB
    // and returns a 302 redirect with Set-Cookie clearing headers.
    // TanStack Router's redirect mechanism is NOT involved — the browser
    // processes the raw HTTP response directly.
    window.location.href = '/api/sign-out'
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          AI Chat
          {conversationId && (
            <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.5, marginLeft: '0.75rem' }}>
              #{conversationId.slice(0, 8)}
            </span>
          )}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            {user?.email}
          </span>
          <button
            id="logout-btn"
            onClick={handleLogout}
            disabled={!isHydrated}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {conversationId ? (
        <div
          id="conversation-view"
          style={{ opacity: 0.8 }}
          data-conversation-id={conversationId}
        >
          <p style={{ opacity: 0.6 }}>
            Conversation <strong>{conversationId.slice(0, 8)}</strong> loaded.
            Full chat interface coming in Unit 5.
          </p>
        </div>
      ) : (
        <p style={{ opacity: 0.6 }}>
          Select a conversation from the sidebar or click{' '}
          <strong>New Chat</strong> to start one.
          Full chat interface coming in Unit 5.
        </p>
      )}
    </div>
  )
}
