// src/lib/auth/auth.ts
// Better Auth server configuration.
// Falls back to in-memory adapter when DATABASE_URL is not set
// (enables local dev and E2E tests without a real database).

import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

// ─── Global singleton ─────────────────────────────────────────────────────────
// Use `globalThis` instead of module-level variables.
// In Vite SSR dev mode, modules are re-evaluated on every request.
// `globalThis` persists across re-evaluations within the same Node.js process.

declare global {
  // eslint-disable-next-line no-var
  var __betterAuthInstance: ReturnType<typeof betterAuth> | undefined
  // eslint-disable-next-line no-var
  var __betterAuthPromise: Promise<ReturnType<typeof betterAuth>> | undefined
  // In-memory DB arrays shared across re-evaluations
  // eslint-disable-next-line no-var
  var __betterAuthMemDb:
    | {
        user: Record<string, unknown>[]
        session: Record<string, unknown>[]
        account: Record<string, unknown>[]
        verification: Record<string, unknown>[]
        organization: Record<string, unknown>[]
        member: Record<string, unknown>[]
        invitation: Record<string, unknown>[]
      }
    | undefined
}

async function buildAuth(): Promise<ReturnType<typeof betterAuth>> {
  const databaseUrl = process.env['DATABASE_URL']

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let database: any

  if (databaseUrl) {
    // Production / configured dev: Drizzle + PostgreSQL
    const [{ drizzleAdapter }, { db }] = await Promise.all([
      import('better-auth/adapters/drizzle'),
      import('#/lib/db/index'),
    ])
    database = drizzleAdapter(db, { provider: 'pg' })
  } else {
    // No DATABASE_URL: in-memory adapter for local dev and E2E tests.
    // Persist memDb on globalThis so it survives Vite SSR module re-evaluations.
    if (!globalThis.__betterAuthMemDb) {
      globalThis.__betterAuthMemDb = {
        user: [],
        session: [],
        account: [],
        verification: [],
        organization: [],
        member: [],
        invitation: [],
      }
    }
    const { memoryAdapter } = await import('@better-auth/memory-adapter')
    database = memoryAdapter(globalThis.__betterAuthMemDb)
    if (process.env['NODE_ENV'] !== 'test') {
      console.warn(
        '[auth] DATABASE_URL is not set — using in-memory adapter. ' +
        'Data will not persist across restarts. Set DATABASE_URL for production.',
      )
    }
  }

  // Forward-declare so databaseHooks closure can reference the created instance
  // eslint-disable-next-line prefer-const
  let instance: ReturnType<typeof betterAuth>

  instance = betterAuth({
    database,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24,
      // Disabled: the session_data cookie cache can serve stale sessions after
      // signOut if the Set-Cookie clearing fails to reach the browser.
      // Defense-in-depth: even if our manual cookie clearing in /sign-out
      // somehow fails, DB-based getSession() returns null for deleted sessions.
      cookieCache: {
        enabled: false,
      },
    },

    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
      }),
      // Must be last — handles TanStack Start cookie integration
      tanstackStartCookies(),
    ],

    // Auto-create an org for every new user
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              const orgName = user.email.split('@')[0] ?? 'My Organization'
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (instance.api as any).createOrganization({
                body: {
                  name: orgName,
                  slug: `org-${user.id.slice(0, 8)}`,
                  userId: user.id,
                },
              })
            } catch (err) {
              console.error('[auth] Failed to auto-create org for user:', user.id, err)
            }
          },
        },
      },
    },

    trustedOrigins:
      process.env['NODE_ENV'] === 'production'
        ? [process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000']
        : [
            // In development, trust any localhost origin regardless of port
            // (Vite may auto-pick 3001, 3002, etc. if 3000 is taken)
            'http://localhost:*',
          ],
    baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',
    secret: process.env['BETTER_AUTH_SECRET'] ?? 'fallback-dev-secret-change-in-production',
  })

  return instance
}

/**
 * Returns (or lazily creates) the auth instance.
 * Uses globalThis to survive Vite SSR module re-evaluations.
 * Use this at the call site: `const auth = await getAuth()`
 */
export async function getAuth(): Promise<ReturnType<typeof betterAuth>> {
  if (globalThis.__betterAuthInstance) return globalThis.__betterAuthInstance
  if (!globalThis.__betterAuthPromise) {
    globalThis.__betterAuthPromise = buildAuth().then((instance) => {
      globalThis.__betterAuthInstance = instance
      globalThis.__betterAuthPromise = undefined
      return instance
    })
  }
  return globalThis.__betterAuthPromise
}

export type Auth = Awaited<ReturnType<typeof getAuth>>
