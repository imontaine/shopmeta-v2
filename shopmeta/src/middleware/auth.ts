// src/middleware/auth.ts
// Auth middleware — runs on every request to protect server-side routes.
// Attaches the current session and user to the context.

import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getAuth } from '#/lib/auth/auth'

/**
 * Auth middleware — attaches session + user to context.
 * Uses getRequestHeaders() to correctly access the current request in TanStack Start.
 */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  let session = null

  try {
    const auth = await getAuth()
    const headers = getRequestHeaders()
    session = await auth.api.getSession({ headers })
  } catch (_err) {
    // Auth unavailable (e.g., DB not configured) — treat as unauthenticated
    session = null
  }

  return next({
    context: {
      session: session?.session ?? null,
      user: session?.user ?? null,
    },
  })
})

/**
 * Require auth middleware — throws 401 if not authenticated.
 * Use this in createServerFn handlers that need an authenticated user.
 */
export const requireAuthMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    if (!context.user) {
      throw new Error('Unauthorized: You must be logged in to access this resource.')
    }
    return next({
      context: {
        session: context.session!,
        user: context.user!,
      },
    })
  })
