// src/lib/auth/client.ts
// Better Auth browser client.
//
// The Better Auth React client must only be loaded in the browser.
// We create it once (lazily) and export stable wrapper functions.

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

// Use the non-React client for type inference (works in both envs)
import type { createAuthClient as CreateClientFn } from 'better-auth/client'
import type { organizationClient } from 'better-auth/client/plugins'

export type AuthClient = ReturnType<typeof CreateClientFn<[ReturnType<typeof organizationClient>]>>

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: AuthClient | null = null
let _clientPromise: Promise<AuthClient> | null = null

/** Lazily initialize the Better Auth client (browser-only). */
function getClientPromise(): Promise<AuthClient> {
  if (_client) return Promise.resolve(_client)
  if (_clientPromise) return _clientPromise

  if (import.meta.env.SSR) {
    return Promise.reject(new Error('Auth client not available on server'))
  }

  _clientPromise = Promise.all([
    // Must use the REACT version so useSession is available
    import('better-auth/client'),
    import('better-auth/client/plugins'),
  ]).then(([{ createAuthClient }, { organizationClient: orgPlugin }]) => {
    _client = createAuthClient({
      baseURL: window.location.origin,
      plugins: [orgPlugin()],
    }) as AuthClient
    _clientPromise = null
    return _client
  })

  return _clientPromise
}

// Eagerly start initialization on browser load
if (!import.meta.env.SSR) {
  getClientPromise().catch((err) => {
    console.error('[auth-client] Failed to initialize:', err)
  })
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

export const signIn: AuthClient['signIn'] = new Proxy(
  {} as AuthClient['signIn'],
  {
    get(_target, prop: string) {
      if (import.meta.env.SSR) return async () => ({ data: null, error: null })
      return async (...args: unknown[]) => {
        try {
          const client = await getClientPromise()
          const fn = (client.signIn as Record<string, (...a: unknown[]) => unknown>)[prop]
          if (typeof fn !== 'function') return { data: null, error: { message: 'Method not found' } }
          return fn(...args)
        } catch (err) {
          console.error('[auth-client] signIn error:', err)
          return { data: null, error: { message: 'Auth error' } }
        }
      }
    },
  }
)

// ─── Sign up ──────────────────────────────────────────────────────────────────

export const signUp: AuthClient['signUp'] = new Proxy(
  {} as AuthClient['signUp'],
  {
    get(_target, prop: string) {
      if (import.meta.env.SSR) return async () => ({ data: null, error: null })
      return async (...args: unknown[]) => {
        try {
          const client = await getClientPromise()
          const fn = (client.signUp as Record<string, (...a: unknown[]) => unknown>)[prop]
          if (typeof fn !== 'function') return { data: null, error: { message: 'Method not found' } }
          return fn(...args)
        } catch (err) {
          console.error('[auth-client] signUp error:', err)
          return { data: null, error: { message: 'Auth error' } }
        }
      }
    },
  }
)

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (import.meta.env.SSR) return
  try {
    const client = await getClientPromise()
    await client.signOut()
  } catch (err) {
    console.error('[auth-client] signOut error:', err)
  }
}

// ─── useSession hook ──────────────────────────────────────────────────────────

export type SessionData = {
  user: { id: string; email: string; name: string; image?: string | null } | null
  session: { id: string; userId: string; expiresAt: Date } | null
} | null

export function useSession(): { data: SessionData; isPending: boolean } {
  if (import.meta.env.SSR) {
    return { data: null, isPending: false }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [client, setClient] = useState<AuthClient | null>(_client)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [sessionData, setSessionData] = useState<SessionData>(null)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isPending, setIsPending] = useState(!_client)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (client) return
    getClientPromise()
      .then((c) => setClient(c))
      .catch(() => setIsPending(false))
  }, [client])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!client) return
    // Fetch the session once client is ready
    client.getSession()
      .then((result) => {
        // result.data has { session, user } or null
        const d = result?.data as { session: { id: string; userId: string; expiresAt: Date } | null; user: { id: string; email: string; name: string; image?: string | null } | null } | null
        setSessionData(d ?? null)
        setIsPending(false)
      })
      .catch(() => {
        setSessionData(null)
        setIsPending(false)
      })
  }, [client])

  return { data: sessionData, isPending }
}

// ─── Forget password ──────────────────────────────────────────────────────────

export async function forgetPassword(opts: {
  email: string
  redirectTo: string
}): Promise<{ data: unknown; error: { message: string } | null }> {
  if (import.meta.env.SSR) return { data: null, error: null }
  try {
    const client = await getClientPromise()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((client as any).forgetPassword as (o: typeof opts) => Promise<{ data: unknown; error: { message: string } | null }>)(opts)
  } catch (err) {
    console.error('[auth-client] forgetPassword error:', err)
    return { data: null, error: { message: 'Auth error' } }
  }
}

// ─── Reset password ───────────────────────────────────────────────────────────

export async function resetPassword(opts: {
  newPassword: string
  token?: string
}): Promise<{ data: unknown; error: { message: string } | null }> {
  if (import.meta.env.SSR) return { data: null, error: null }
  try {
    const client = await getClientPromise()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((client as any).resetPassword as (o: typeof opts) => Promise<{ data: unknown; error: { message: string } | null }>)(opts)
  } catch (err) {
    console.error('[auth-client] resetPassword error:', err)
    return { data: null, error: { message: 'Auth error' } }
  }
}
