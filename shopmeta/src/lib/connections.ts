// src/lib/connections.ts
// Server functions for ClickHouse connection CRUD with encrypted password storage.
//
// Security model:
// - All operations are scoped to orgId (tenant isolation).
// - Passwords are encrypted at rest using AES-256-GCM (src/lib/crypto.ts).
// - The encrypted_password column stores the ciphertext; plaintext is never stored.
// - "test connection" verifies live connectivity using @clickhouse/client.
// - "set default" clears all other defaults for the org atomically.
// - "delete" nullifies connectionId on any widgets referencing the deleted connection.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { connections, widgets } from '#/lib/db/schema'
import { encrypt, decrypt, getEncryptionKey } from '#/lib/crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Safe connection row — never includes encryptedPassword */
export interface ConnectionRow {
  id: string
  orgId: string
  name: string
  host: string
  port: number | null
  database: string
  username: string
  isDefault: boolean | null
  createdAt: string | null
}

function serializeConnection(c: {
  id: string
  orgId: string
  name: string
  host: string
  port: number | null
  database: string
  username: string
  isDefault: boolean | null
  createdAt: Date | null
}): ConnectionRow {
  return {
    id: c.id,
    orgId: c.orgId,
    name: c.name,
    host: c.host,
    port: c.port,
    database: c.database,
    username: c.username,
    isDefault: c.isDefault,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
  }
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireOrgSession() {
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

// ─── Input schemas ────────────────────────────────────────────────────────────

const CreateConnectionInput = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1).max(255),
  port: z.number().int().positive().max(65535).optional().default(8443),
  database: z.string().min(1).max(255),
  username: z.string().min(1).max(255),
  password: z.string().min(1), // plaintext — encrypted before storage
  isDefault: z.boolean().optional().default(false),
})

const UpdateConnectionInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().positive().max(65535).optional(),
  database: z.string().min(1).max(255).optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).optional(), // if omitted, existing password is kept
})

const DeleteConnectionInput = z.object({
  id: z.string().uuid(),
})

const GetConnectionInput = z.object({
  id: z.string().uuid(),
})

const TestConnectionInput = z.object({
  id: z.string().uuid().optional(),
  // Or test ad-hoc credentials without an existing record:
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  database: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
})

const SetDefaultConnectionInput = z.object({
  id: z.string().uuid(),
})

// ─── Server functions ─────────────────────────────────────────────────────────

/**
 * Creates a new ClickHouse connection for the org.
 * Password is encrypted with AES-256-GCM before storage.
 * If isDefault=true, all other org connections are cleared first.
 */
export const createConnection = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()
    const encKey = getEncryptionKey()

    const encryptedPassword = encrypt(data.password, encKey)

    // If this is the first or explicitly-default connection, ensure no other defaults
    if (data.isDefault) {
      await db
        .update(connections)
        .set({ isDefault: false })
        .where(eq(connections.orgId, orgId))
    }

    const [connection] = await db
      .insert(connections)
      .values({
        orgId,
        name: data.name,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        encryptedPassword,
        isDefault: data.isDefault,
      })
      .returning()

    return serializeConnection(connection!)
  })

/**
 * Lists all ClickHouse connections for the org.
 * Never returns encrypted passwords.
 */
export const listConnections = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const rows = await db
      .select()
      .from(connections)
      .where(eq(connections.orgId, orgId))

    return rows.map(serializeConnection)
  })

/**
 * Gets a single connection by ID (org-scoped).
 */
export const getConnection = createServerFn({ method: 'GET' })
  .validator((data: unknown) => GetConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))

    if (!connection) {
      throw new Error(`Connection not found: ${data.id}`)
    }

    return serializeConnection(connection)
  })

/**
 * Updates a connection. Only provided fields are changed.
 * If password is provided, it is re-encrypted before storage.
 */
export const updateConnection = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership
    const [existing] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))

    if (!existing) {
      throw new Error(`Connection not found or not authorized: ${data.id}`)
    }

    // Build update payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {}
    if (data.name !== undefined) updates['name'] = data.name
    if (data.host !== undefined) updates['host'] = data.host
    if (data.port !== undefined) updates['port'] = data.port
    if (data.database !== undefined) updates['database'] = data.database
    if (data.username !== undefined) updates['username'] = data.username
    if (data.password !== undefined) {
      updates['encryptedPassword'] = encrypt(data.password, getEncryptionKey())
    }

    if (Object.keys(updates).length === 0) {
      return serializeConnection(existing)
    }

    const [updated] = await db
      .update(connections)
      .set(updates)
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))
      .returning()

    return serializeConnection(updated!)
  })

/**
 * Deletes a connection and sets connectionId=null on any widgets referencing it.
 */
export const deleteConnection = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership
    const [existing] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))

    if (!existing) {
      throw new Error(`Connection not found or not authorized: ${data.id}`)
    }

    // Null out widgets referencing this connection (per spec)
    await db
      .update(widgets)
      .set({ connectionId: null })
      .where(eq(widgets.connectionId, data.id))

    // Delete the connection
    await db.delete(connections).where(eq(connections.id, data.id))

    return { deleted: true, id: data.id }
  })

/**
 * Sets a connection as the default for the org.
 * Clears the isDefault flag on all other connections in the same org first.
 */
export const setDefaultConnection = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetDefaultConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify ownership
    const [existing] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))

    if (!existing) {
      throw new Error(`Connection not found or not authorized: ${data.id}`)
    }

    // Clear all defaults for this org, then set the new one
    await db
      .update(connections)
      .set({ isDefault: false })
      .where(eq(connections.orgId, orgId))

    const [updated] = await db
      .update(connections)
      .set({ isDefault: true })
      .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))
      .returning()

    return serializeConnection(updated!)
  })

/**
 * Tests a ClickHouse connection.
 * If `id` is provided, loads the stored credentials (decrypting the password).
 * Otherwise, tests ad-hoc credentials passed directly.
 *
 * Returns { success: true } or { success: false, error: string }
 */
export const testConnection = createServerFn({ method: 'POST' })
  .validator((data: unknown) => TestConnectionInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()

    let host: string
    let port: number
    let database: string
    let username: string
    let password: string

    if (data.id) {
      const db = getDb()
      const [connection] = await db
        .select()
        .from(connections)
        .where(and(eq(connections.id, data.id), eq(connections.orgId, orgId)))

      if (!connection) {
        return { success: false as const, error: 'Connection not found' }
      }

      host = connection.host
      port = connection.port ?? 8443
      database = connection.database
      username = connection.username
      try {
        password = decrypt(connection.encryptedPassword, getEncryptionKey())
      } catch {
        return { success: false as const, error: 'Failed to decrypt stored password' }
      }
    } else {
      if (!data.host || !data.database || !data.username || !data.password) {
        return { success: false as const, error: 'Missing required connection parameters' }
      }
      host = data.host
      port = data.port ?? 8443
      database = data.database
      username = data.username
      password = data.password
    }

    try {
      const { createClient } = await import('@clickhouse/client')
      const client = createClient({
        url: `https://${host}:${port}`,
        database,
        username,
        password,
        request_timeout: 10_000,
        // Disable compression for quick ping
        compression: { response: false, request: false },
      })

      // Simple ping — SELECT 1
      const result = await client.query({ query: 'SELECT 1', format: 'JSONEachRow' })
      const rows = await result.json<{ '1': number }[]>()
      await client.close()

      if (rows && rows.length > 0) {
        return { success: true as const }
      }
      return { success: false as const, error: 'Query returned unexpected result' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Sanitize — don't leak internal stack traces to client
      const safe = message.replace(/\n[\s\S]*/m, '').slice(0, 200)
      return { success: false as const, error: safe }
    }
  })
