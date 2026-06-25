// src/routes/sign-out.tsx
// Dedicated sign-out route — performs server-side session invalidation.
//
// The browser navigates HERE (full page navigation) via window.location.href.
// Uses createServerFn to safely call server-only APIs (auth + getRequestHeaders).
// The redirect uses a Headers object with proper separate Set-Cookie headers.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// ─── Server-only sign-out action ─────────────────────────────────────────────
// Encapsulates all server imports so they don't leak to the client bundle.
const doSignOut = createServerFn({ method: 'POST' }).handler(async () => {
  // Dynamically import to keep these server-only modules out of client bundle
  const { getRequestHeaders } = await import('@tanstack/react-start/server')
  const { getAuth } = await import('#/lib/auth/auth')
  try {
    const auth = await getAuth()
    const headers = getRequestHeaders()
    await auth.api.signOut({ headers })
  } catch (_err) {
    // Ignore — cookie clearing below handles the rest
  }
})

export const Route = createFileRoute('/sign-out')({
  beforeLoad: async () => {
    // Call the server-side sign-out (deletes session from DB)
    try {
      await doSignOut()
    } catch (_err) {
      // Continue to cookie clearing even if this fails
    }

    // Clear session cookies with properly-formed separate Set-Cookie headers.
    // CRITICAL: Set-Cookie CANNOT use comma-separated values (unlike other headers).
    // Headers.append() emits two separate Set-Cookie headers correctly.
    const clearHeaders = new Headers()
    clearHeaders.append(
      'Set-Cookie',
      'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    )
    clearHeaders.append(
      'Set-Cookie',
      'better-auth.session_data=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    )

    throw redirect({
      to: '/login',
      headers: clearHeaders,
    })
  },
  // This route never renders — it always redirects in beforeLoad.
  component: () => null,
})
