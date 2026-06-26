// src/routes/api/health.ts
// Health check endpoint for Docker HEALTHCHECK and load balancer probes.
//
// GET /api/health
// Returns:
//   200 { status: 'ok', db: 'connected' }     — app running, DB reachable
//   200 { status: 'degraded', db: 'error' }   — app running, DB unreachable
//   (never 5xx — always returns 200 so Traefik/Docker doesn't restart the container
//    just because the DB is temporarily unavailable)
//
// The DB check runs a simple SELECT 1 query via drizzle.

import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'

export const Route = createFileRoute('/api/health')({
  // @ts-expect-error — server handlers are a TanStack Start extension
  server: {
    handlers: {
      GET: async () => {
        const dbStatus = await checkDatabase()

        const body = JSON.stringify({
          status: dbStatus === 'connected' ? 'ok' : 'degraded',
          db: dbStatus,
          timestamp: new Date().toISOString(),
          version: process.env['npm_package_version'] ?? 'unknown',
        })

        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})

async function checkDatabase(): Promise<'connected' | 'error'> {
  try {
    // Only attempt DB check if DATABASE_URL is set
    if (!process.env['DATABASE_URL']) {
      return 'error'
    }

    const { getDb } = await import('#/lib/db/index')
    const db = getDb()

    // Run a minimal query to verify the connection
    await db.execute(sql`SELECT 1`)
    return 'connected'
  } catch {
    return 'error'
  }
}
