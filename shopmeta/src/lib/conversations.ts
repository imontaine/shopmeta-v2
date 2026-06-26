// src/lib/conversations.ts
// Server functions for conversation CRUD with tenant isolation.
// All functions enforce orgId scoping — users can only access their own org's conversations.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { conversations, messages } from '#/lib/db/schema'

// JSON-serializable value (required by TanStack Start server functions)
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// Serializable shapes for return values
interface ConversationRow {
  id: string
  userId: string
  orgId: string
  agentId: string | null
  title: string | null
  model: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface MessageRow {
  id: string
  conversationId: string
  parentId: string | null
  role: string
  content: JsonValue
  toolCalls: JsonValue
  metrics: JsonValue
  createdAt: string | null
}

function serializeConversation(c: { id: string; userId: string; orgId: string; agentId: string | null; title: string | null; model: string | null; createdAt: Date | null; updatedAt: Date | null }): ConversationRow {
  return {
    id: c.id,
    userId: c.userId,
    orgId: c.orgId,
    agentId: c.agentId,
    title: c.title,
    model: c.model,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  }
}

function serializeMessage(m: { id: string; conversationId: string; parentId: string | null; role: string; content: unknown; toolCalls: unknown; metrics: unknown; createdAt: Date | null }): MessageRow {
  return {
    id: m.id,
    conversationId: m.conversationId,
    parentId: m.parentId,
    role: m.role,
    content: m.content as JsonValue,
    toolCalls: (m.toolCalls ?? null) as JsonValue,
    metrics: (m.metrics ?? null) as JsonValue,
    createdAt: m.createdAt ? m.createdAt.toISOString() : null,
  }
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Resolves the current session from the request headers.
 * Throws a 401-style Error if unauthenticated.
 */
async function requireSession() {
  const { getAuth } = await import('#/lib/auth/auth')
  const auth = await getAuth()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session?.user) {
    throw new Error('Unauthorized: no active session')
  }
  return session
}

/**
 * Get the current user's active org ID from the session.
 * Better Auth stores `activeOrganizationId` on the session object after
 * `setActiveOrganization` is called. For freshly-registered users, this may
 * not be set yet (the databaseHook creates the org but can't set it active
 * without a request context). In that case, we fall back to the DB.
 */
async function requireOrgSession() {
  const session = await requireSession()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orgId = (session.session as any).activeOrganizationId as string | undefined | null

  if (!orgId) {
    // Fallback: look up the first org the user belongs to via the member table.
    // This handles freshly-registered users whose session doesn't have an active org yet.
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
      // DB unavailable — fall through to error below
    }
  }

  if (!orgId) {
    throw new Error('No active organization. Please join or create an organization.')
  }

  return {
    userId: session.user.id,
    orgId,
    user: session.user,
  }
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreateConversationInput = z.object({
  title: z.string().max(255).optional(),
  model: z.string().optional(),
  agentId: z.string().uuid().optional(),
})

const RenameConversationInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
})

const DeleteConversationInput = z.object({
  id: z.string().uuid(),
})

const ListConversationsInput = z.object({
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
})

const SearchConversationsInput = z.object({
  query: z.string().min(1).max(255),
  limit: z.number().int().positive().max(100).optional().default(20),
})

const GetConversationInput = z.object({
  id: z.string().uuid(),
})

const SaveMessagesInput = z.object({
  conversationId: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'tool', 'system']),
      content: z.unknown(), // TanStack AI message parts (flexible JSON)
      toolCalls: z.unknown().optional(),
      metrics: z.unknown().optional(),
      parentId: z.string().uuid().optional(),
    }),
  ),
})

// ─── Server functions ─────────────────────────────────────────────────────────

/**
 * Creates a new conversation for the authenticated user in their org.
 * Returns the created conversation row.
 */
export const createConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateConversationInput.parse(data))
  .handler(async ({ data }) => {
    const { userId, orgId } = await requireOrgSession()
    const db = getDb()

    const [conversation] = await db
      .insert(conversations)
      .values({
        userId,
        orgId,
        title: data.title ?? 'New Chat',
        model: data.model,
        agentId: data.agentId,
      })
      .returning()

    return serializeConversation(conversation!)
  })

/**
 * Lists conversations for the current user's org, ordered by updatedAt descending.
 * Enforces tenant isolation via orgId.
 */
export const listConversations = createServerFn({ method: 'GET' })
  .validator((data: unknown) => ListConversationsInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    const results = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(data.limit)
      .offset(data.offset)

    return results.map(serializeConversation)
  })

/**
 * Gets a single conversation by ID, verifying tenant ownership.
 */
export const getConversation = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetConversationInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.id),
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )

    if (!conversation) {
      throw new Error(`Conversation not found: ${data.id}`)
    }

    return serializeConversation(conversation)
  })

/**
 * Renames a conversation. Verifies ownership before updating.
 */
export const renameConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => RenameConversationInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    const [updated] = await db
      .update(conversations)
      .set({
        title: data.title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, data.id),
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )
      .returning()

    if (!updated) {
      throw new Error(`Conversation not found or not authorized: ${data.id}`)
    }

    return serializeConversation(updated)
  })

/**
 * Deletes a conversation and all its messages (cascade handled by DB FK).
 */
export const deleteConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteConversationInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership before deleting
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.id),
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )

    if (!existing) {
      throw new Error(`Conversation not found or not authorized: ${data.id}`)
    }

    await db
      .delete(conversations)
      .where(eq(conversations.id, data.id))

    return { deleted: true, id: data.id }
  })

/**
 * Searches conversations by title (case-insensitive LIKE).
 * Enforces tenant isolation.
 */
export const searchConversations = createServerFn({ method: 'GET' })
  .validator((data: unknown) => SearchConversationsInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    const results = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
          sql`lower(${conversations.title}) like lower(${'%' + data.query + '%'})`,
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(data.limit)

    return results.map(serializeConversation)
  })

/**
 * Saves (appends) messages to a conversation.
 * Verifies conversation ownership before inserting.
 * Updates conversation.updatedAt to bump it to the top of the list.
 */
export const saveMessages = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SaveMessagesInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )

    if (!conv) {
      throw new Error(`Conversation not found or not authorized: ${data.conversationId}`)
    }

    // Insert messages
    const inserted = await db
      .insert(messages)
      .values(
        data.messages.map((msg) => ({
          conversationId: data.conversationId,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls ?? null,
          metrics: msg.metrics ?? null,
          parentId: msg.parentId ?? null,
        })),
      )
      .returning()

    // Bump updatedAt on the conversation
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, data.conversationId))

    return inserted.map(serializeMessage)
  })

/**
 * Loads all messages for a conversation, ordered by createdAt ascending.
 * Verifies conversation ownership.
 */
export const getConversationMessages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetConversationInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId, userId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.id),
          eq(conversations.orgId, orgId),
          eq(conversations.userId, userId),
        ),
      )

    if (!conv) {
      throw new Error(`Conversation not found or not authorized: ${data.id}`)
    }

    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, data.id))
      .orderBy(messages.createdAt)

    return result.map(serializeMessage)
  })
