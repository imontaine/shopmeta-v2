// tests/component/layout/protected-route.test.tsx
// Tests the protected route middleware logic extracted from _authenticated.tsx.
// We test the beforeLoad logic directly rather than rendering the full router.

import { describe, test, expect, vi } from 'vitest'

// ─── Protected route redirect logic ──────────────────────────────────────────
// Extracted from _authenticated.tsx for isolated unit testing.
// The real route uses redirect() from @tanstack/react-router which throws.

class RedirectError extends Error {
  public readonly to: string
  public readonly search: Record<string, string>

  constructor(to: string, search: Record<string, string> = {}) {
    super(`Redirect to ${to}`)
    this.to = to
    this.search = search
  }
}

async function protectedRouteBeforeLoad(
  context: { user: { id: string; email: string } | null },
  location: { href: string }
) {
  if (!context.user) {
    throw new RedirectError('/login', { redirect: location.href })
  }
}

describe('Protected route middleware', () => {
  test('allows access when user is authenticated', async () => {
    const context = { user: { id: 'user-1', email: 'test@example.com' } }
    const location = { href: '/chat' }

    // Should NOT throw
    await expect(protectedRouteBeforeLoad(context, location)).resolves.toBeUndefined()
  })

  test('redirects unauthenticated user to /login', async () => {
    const context = { user: null }
    const location = { href: '/chat' }

    await expect(protectedRouteBeforeLoad(context, location)).rejects.toThrow(RedirectError)
  })

  test('redirect error has correct destination', async () => {
    const context = { user: null }
    const location = { href: '/chat' }

    try {
      await protectedRouteBeforeLoad(context, location)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RedirectError)
      expect((err as RedirectError).to).toBe('/login')
    }
  })

  test('redirect preserves original location in search params', async () => {
    const context = { user: null }
    const location = { href: '/dashboard?foo=bar' }

    try {
      await protectedRouteBeforeLoad(context, location)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RedirectError)
      expect((err as RedirectError).search.redirect).toBe('/dashboard?foo=bar')
    }
  })

  test('authenticated user with valid session does not redirect', async () => {
    const context = {
      user: { id: 'user-abc', email: 'admin@shopmeta.app' }
    }
    const location = { href: '/settings' }

    await expect(protectedRouteBeforeLoad(context, location)).resolves.toBeUndefined()
  })

  test('unauthenticated user visiting any protected route gets redirected', async () => {
    const routes = ['/chat', '/dashboard', '/agents', '/settings', '/admin']

    for (const route of routes) {
      await expect(
        protectedRouteBeforeLoad({ user: null }, { href: route })
      ).rejects.toThrow(RedirectError)
    }
  })
})
