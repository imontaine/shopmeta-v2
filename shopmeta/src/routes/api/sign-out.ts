// src/routes/api/sign-out.ts
// Raw server API route for sign-out.
//
// The browser navigates here via window.location.href (full page GET).
// We have access to the actual browser request with all headers/cookies.
//
// Steps:
//  1. Call auth.api.signOut({ headers }) with real request headers →
//     deletes the session from DB, tanstackStartCookies sets clearing cookies
//  2. Return a raw 302 Response with our own Set-Cookie clearing headers +
//     Location: /login — bypassing TanStack Router's redirect mechanism entirely

import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '#/lib/auth/auth'

export const Route = createFileRoute('/api/sign-out')({
  // @ts-expect-error — server handlers are a TanStack Start extension (not in types)
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Delete the session from the DB using the actual browser request headers.
        // The request object here contains the real Cookie header (the session token).
        try {
          const auth = await getAuth()
          await auth.api.signOut({ headers: request.headers })
        } catch {
          // Ignore — we always clear cookies below
        }

        // Return a raw 302 redirect with proper cookie-clearing Set-Cookie headers.
        // Using a Headers object so we can append() multiple Set-Cookie headers —
        // Set-Cookie cannot be comma-joined like other headers.
        const responseHeaders = new Headers()
        responseHeaders.append(
          'Set-Cookie',
          'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
        )
        responseHeaders.append(
          'Set-Cookie',
          'better-auth.session_data=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
        )
        responseHeaders.append(
          'Set-Cookie',
          'better-auth.dont_remember=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
        )
        responseHeaders.set('Location', '/login')

        return new Response(null, { status: 302, headers: responseHeaders })
      },
    },
  },
})
