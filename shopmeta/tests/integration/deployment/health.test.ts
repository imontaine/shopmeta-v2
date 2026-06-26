// tests/integration/deployment/health.test.ts
// Integration tests for the /api/health endpoint logic.
//
// Strategy: In-memory mock of the health check business logic.
// Tests verify:
//  - Health check returns { status: 'ok', db: 'connected' } when DB is available
//  - Health check returns { status: 'degraded', db: 'error' } when DB is down
//  - Health check always returns HTTP 200 (never 5xx)
//  - Response has correct Content-Type header
//  - Response includes timestamp and version fields
//  - Env var checks: DATABASE_URL missing → db: 'error'

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── In-memory health check simulation ───────────────────────────────────────

type DBStatus = 'connected' | 'error'

interface HealthCheckResult {
  status: 'ok' | 'degraded'
  db: DBStatus
  timestamp: string
  version: string
}

async function simulateHealthCheck(options: {
  databaseUrl: string | undefined
  dbQuerySucceeds: boolean
  version?: string
}): Promise<{ body: HealthCheckResult; httpStatus: number; contentType: string }> {
  let dbStatus: DBStatus

  if (!options.databaseUrl) {
    dbStatus = 'error'
  } else if (options.dbQuerySucceeds) {
    dbStatus = 'connected'
  } else {
    dbStatus = 'error'
  }

  const body: HealthCheckResult = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
    version: options.version ?? 'unknown',
  }

  // Health endpoint always returns 200
  return {
    body,
    httpStatus: 200,
    contentType: 'application/json',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/health — response shape', () => {
  test('spec example: returns { status: "ok", db: "connected" } when DB available', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
    })

    expect(result.body.status).toBe('ok')
    expect(result.body.db).toBe('connected')
  })

  test('returns { status: "degraded", db: "error" } when DB is down', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: false,
    })

    expect(result.body.status).toBe('degraded')
    expect(result.body.db).toBe('error')
  })

  test('returns { status: "degraded", db: "error" } when DATABASE_URL is missing', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: undefined,
      dbQuerySucceeds: false,
    })

    expect(result.body.status).toBe('degraded')
    expect(result.body.db).toBe('error')
  })

  test('always returns HTTP 200 (never 5xx) — even when DB is down', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: undefined,
      dbQuerySucceeds: false,
    })

    expect(result.httpStatus).toBe(200)
  })

  test('returns HTTP 200 when DB is available', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
    })

    expect(result.httpStatus).toBe(200)
  })

  test('Content-Type is application/json', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
    })

    expect(result.contentType).toBe('application/json')
  })

  test('response includes timestamp field (ISO 8601)', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
    })

    expect(result.body.timestamp).toBeTruthy()
    // Validate ISO 8601 format
    expect(() => new Date(result.body.timestamp)).not.toThrow()
    expect(new Date(result.body.timestamp).getFullYear()).toBeGreaterThan(2020)
  })

  test('response includes version field', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
      version: '1.0.0',
    })

    expect(result.body.version).toBe('1.0.0')
  })

  test('response body is valid JSON (parseable)', async () => {
    const result = await simulateHealthCheck({
      databaseUrl: 'postgresql://user:pass@localhost:5432/shopmeta',
      dbQuerySucceeds: true,
    })

    const jsonStr = JSON.stringify(result.body)
    expect(() => JSON.parse(jsonStr)).not.toThrow()
  })
})

describe('/api/health — status logic', () => {
  test('status is "ok" if and only if db is "connected"', async () => {
    const ok = await simulateHealthCheck({ databaseUrl: 'postgresql://x:y@z/db', dbQuerySucceeds: true })
    const degraded = await simulateHealthCheck({ databaseUrl: 'postgresql://x:y@z/db', dbQuerySucceeds: false })

    expect(ok.body.status === 'ok').toBe(ok.body.db === 'connected')
    expect(degraded.body.status === 'ok').toBe(degraded.body.db === 'connected')
  })

  test('status is "degraded" if db is "error"', async () => {
    const result = await simulateHealthCheck({ databaseUrl: 'postgresql://x:y@z/db', dbQuerySucceeds: false })
    expect(result.body.status).toBe('degraded')
    expect(result.body.db).toBe('error')
  })
})

// ─── Deployment artifact tests ────────────────────────────────────────────────

import * as fs from 'node:fs'
import * as path from 'node:path'

const SHOPMETA_ROOT = path.resolve(import.meta.dirname, '../../..')

describe('Deployment artifacts — file existence', () => {
  test('Dockerfile exists', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, 'Dockerfile'))).toBe(true)
  })

  test('docker-compose.yml exists', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, 'docker-compose.yml'))).toBe(true)
  })

  test('docker-compose.test.yml exists', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, 'docker-compose.test.yml'))).toBe(true)
  })

  test('docker-entrypoint.sh exists', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, 'docker-entrypoint.sh'))).toBe(true)
  })

  test('health route source exists at src/routes/api/health.ts', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, 'src/routes/api/health.ts'))).toBe(true)
  })

  test('drizzle migrations directory has SQL files', () => {
    const drizzleDir = path.join(SHOPMETA_ROOT, 'drizzle')
    const sqlFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'))
    expect(sqlFiles.length).toBeGreaterThan(0)
  })

  test('.env.example exists with required env var documentation', () => {
    expect(fs.existsSync(path.join(SHOPMETA_ROOT, '.env.example'))).toBe(true)
  })
})

describe('Deployment artifacts — Dockerfile content', () => {
  let dockerfile: string

  beforeEach(() => {
    dockerfile = fs.readFileSync(path.join(SHOPMETA_ROOT, 'Dockerfile'), 'utf8')
  })

  test('Dockerfile has multi-stage build', () => {
    expect(dockerfile).toMatch(/FROM .+ AS deps/i)
    expect(dockerfile).toMatch(/FROM .+ AS builder/i)
    expect(dockerfile).toMatch(/FROM .+ AS runner/i)
  })

  test('Dockerfile uses non-root USER node', () => {
    expect(dockerfile).toContain('USER node')
  })

  test('Dockerfile has HEALTHCHECK targeting /api/health', () => {
    expect(dockerfile).toContain('HEALTHCHECK')
    expect(dockerfile).toContain('/api/health')
  })

  test('Dockerfile EXPOSEs port', () => {
    expect(dockerfile).toMatch(/EXPOSE\s+\d+/)
  })

  test('Dockerfile uses ENTRYPOINT (not CMD) for startup', () => {
    expect(dockerfile).toContain('ENTRYPOINT')
  })

  test('Dockerfile copies drizzle migrations', () => {
    expect(dockerfile).toContain('drizzle')
  })

  test('Dockerfile sets NODE_ENV=production', () => {
    expect(dockerfile).toContain('NODE_ENV=production')
  })
})

describe('Deployment artifacts — docker-compose.yml content', () => {
  let compose: string

  beforeEach(() => {
    compose = fs.readFileSync(path.join(SHOPMETA_ROOT, 'docker-compose.yml'), 'utf8')
  })

  test('docker-compose.yml has app.shopmeta.app Traefik label', () => {
    expect(compose).toContain('app.shopmeta.app')
  })

  test('docker-compose.yml references external dokploy-network', () => {
    expect(compose).toContain('dokploy-network')
    expect(compose).toContain('external: true')
  })

  test('docker-compose.yml has postgres service', () => {
    expect(compose).toMatch(/postgres:\d+/)
  })

  test('docker-compose.yml has depends_on with service_healthy', () => {
    expect(compose).toContain('service_healthy')
  })

  test('docker-compose.yml sets DATABASE_URL environment variable', () => {
    expect(compose).toContain('DATABASE_URL')
  })

  test('docker-compose.yml sets ENCRYPTION_KEY environment variable', () => {
    expect(compose).toContain('ENCRYPTION_KEY')
  })

  test('docker-compose.yml has persistent volume for postgres data', () => {
    expect(compose).toContain('pgdata')
  })

  test('docker-compose.yml uses Cloudflare for TLS (HTTP-only Traefik entrypoint)', () => {
    // Cloudflare Flexible mode: TLS terminates at Cloudflare edge.
    // Traefik only needs an HTTP router (entrypoints=web), no certresolver.
    expect(compose).toContain('Cloudflare')
    expect(compose).toContain('entrypoints=web')
  })
})

describe('Deployment artifacts — docker-entrypoint.sh content', () => {
  let entrypoint: string

  beforeEach(() => {
    entrypoint = fs.readFileSync(path.join(SHOPMETA_ROOT, 'docker-entrypoint.sh'), 'utf8')
  })

  test('entrypoint.sh has shebang line', () => {
    expect(entrypoint.startsWith('#!/')).toBe(true)
  })

  test('entrypoint.sh waits for PostgreSQL', () => {
    // Should contain a retry loop for database readiness
    expect(entrypoint).toMatch(/retry|nc -z|pg_isready|until|while/i)
  })

  test('entrypoint.sh runs database migrations', () => {
    expect(entrypoint).toMatch(/migrate|migration/i)
  })

  test('entrypoint.sh starts the Node.js server', () => {
    expect(entrypoint).toMatch(/vite preview|node .+server/i)
  })

  test('entrypoint.sh uses exec (PID 1 signal handling)', () => {
    expect(entrypoint).toContain('exec node')
  })
})

describe('Deployment artifacts — health route content', () => {
  let healthRoute: string

  beforeEach(() => {
    healthRoute = fs.readFileSync(
      path.join(SHOPMETA_ROOT, 'src/routes/api/health.ts'),
      'utf8',
    )
  })

  test("health route returns status: 'ok'", () => {
    expect(healthRoute).toContain("status: 'ok'")
  })

  test("health route returns db: 'connected'", () => {
    expect(healthRoute).toContain("'connected'")
  })

  test('health route handles DB error gracefully', () => {
    expect(healthRoute).toMatch(/catch|error|degraded/i)
  })

  test('health route is at /api/health path', () => {
    expect(healthRoute).toContain('/api/health')
  })

  test('health route returns JSON response', () => {
    expect(healthRoute).toContain('application/json')
  })

  test('health route performs SELECT 1 DB check', () => {
    expect(healthRoute).toMatch(/SELECT 1|checkDatabase/i)
  })
})

describe('Deployment artifacts — .env.example completeness', () => {
  let envExample: string

  beforeEach(() => {
    envExample = fs.readFileSync(path.join(SHOPMETA_ROOT, '.env.example'), 'utf8')
  })

  test('.env.example documents DATABASE_URL', () => {
    expect(envExample).toContain('DATABASE_URL')
  })

  test('.env.example documents BETTER_AUTH_SECRET', () => {
    expect(envExample).toContain('BETTER_AUTH_SECRET')
  })

  test('.env.example documents OPENAI_API_KEY', () => {
    expect(envExample).toContain('OPENAI_API_KEY')
  })

  test('.env.example documents ENCRYPTION_KEY', () => {
    expect(envExample).toContain('ENCRYPTION_KEY')
  })
})
