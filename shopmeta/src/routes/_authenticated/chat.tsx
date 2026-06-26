// src/routes/_authenticated/chat.tsx
// Protected chat route — only accessible when authenticated.
// Supports ?conversationId= search param to load a specific conversation.

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ChatLayout } from '#/components/chat/ChatLayout'

// ─── Search params schema ──────────────────────────────────────────────────
const ChatSearchSchema = z.object({
  conversationId: z.string().uuid().optional(),
})

export const Route = createFileRoute('/_authenticated/chat')({
  validateSearch: ChatSearchSchema,
  component: ChatPage,
})

function ChatPage() {
  const { conversationId } = Route.useSearch()

  return (
    <div
      id="conversation-view"
      data-testid="chat-page"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <ChatLayout conversationId={conversationId} />
    </div>
  )
}
