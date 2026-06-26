// tests/e2e/global-setup.ts
// Playwright global setup — runs before all E2E tests.
// 1. Kills any process on port 3000 so the dev server binds correctly
// 2. Loads .env.e2e to point at the dedicated Dokploy PostgreSQL
// 3. Optionally opens SSH tunnel if E2E_SSH_TUNNEL=true
// 4. Runs Drizzle migrations to ensure schema is up to date

import { execSync, spawn } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import type { ChildProcess } from 'child_process'

const ROOT = resolve(import.meta.dirname, '../..')

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      vars[key] = value
    }
    return vars
  } catch {
    return {}
  }
}

let sshTunnelProcess: ChildProcess | null = null

async function openSshTunnel(): Promise<void> {
  const sshKey = process.env['E2E_SSH_KEY']
  const sshHost = process.env['E2E_SSH_HOST'] ?? '146.190.79.165'
  const sshUser = process.env['E2E_SSH_USER'] ?? 'root'
  const localPort = process.env['E2E_LOCAL_DB_PORT'] ?? '5433'
  const remotePort = process.env['E2E_REMOTE_DB_PORT'] ?? '5433'

  if (!sshKey || !existsSync(sshKey)) {
    throw new Error(
      `SSH tunnel requested (E2E_SSH_TUNNEL=true) but E2E_SSH_KEY is not set or file not found.\n` +
      `Set E2E_SSH_KEY to the path of your SSH private key.`
    )
  }

  console.log(`🔑 Opening SSH tunnel: localhost:${localPort} → ${sshHost}:${remotePort}`)

  sshTunnelProcess = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ExitOnForwardFailure=yes',
    '-i', sshKey,
    '-N',
    '-L', `${localPort}:localhost:${remotePort}`,
    `${sshUser}@${sshHost}`,
  ], { stdio: 'pipe' })

  // Wait for tunnel to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SSH tunnel timed out after 10s'))
    }, 10000)

    sshTunnelProcess!.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`SSH tunnel failed: ${err.message}`))
    })

    // Give tunnel 2s to establish
    setTimeout(() => {
      clearTimeout(timeout)
      resolve()
    }, 2000)
  })

  console.log(`✅ SSH tunnel established on port ${localPort}`)
}

export default async function globalSetup() {
  console.log('\n🔧 E2E Global Setup: Loading .env.e2e...')

  // Load E2E env vars and inject into process.env
  const e2eEnvPath = join(ROOT, '.env.e2e')
  const e2eEnv = loadEnvFile(e2eEnvPath)

  for (const [key, value] of Object.entries(e2eEnv)) {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }

  const dbUrl = process.env['DATABASE_URL']
  if (!dbUrl) {
    throw new Error('DATABASE_URL must be set in .env.e2e for E2E tests')
  }

  // SSH tunnel mode — needed when DB port is behind a firewall
  if (process.env['E2E_SSH_TUNNEL'] === 'true') {
    await openSshTunnel()
  }

  console.log(`📦 E2E Database: ${dbUrl.replace(/:([^:@]+)@/, ':***@')}`)

  // Run Drizzle migrations against the E2E database
  // Skip if E2E_SKIP_MIGRATIONS=true — useful when running against a live production
  // URL where the app already handles migrations on startup via docker-entrypoint.sh
  if (process.env['E2E_SKIP_MIGRATIONS'] !== 'true') {
    console.log('🗄️  Running database migrations...')
    try {
      execSync('pnpm db:migrate', {
        cwd: ROOT,
        stdio: 'pipe',
        timeout: 30000,
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
        },
      })
      console.log('✅ Migrations complete')
    } catch (err) {
      const castErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
      const output = castErr.stderr?.toString() ?? castErr.message ?? String(err)
      // If already up to date, that's fine
      if (output.includes('No changes') || output.includes('up to date') || output.includes('0 migrations')) {
        console.log('✅ Migrations already up to date')
      } else {
        console.error('Migration output:', output)
        throw new Error(
          `Migrations failed.\n\n` +
          `If the error is a connection timeout, the database port may be blocked.\n` +
          `Options to fix:\n` +
          `  1. SSH into the server and run: ufw allow 5433\n` +
          `  2. Set E2E_SSH_TUNNEL=true and E2E_SSH_KEY=/path/to/key in .env.e2e\n` +
          `  3. Set E2E_SKIP_MIGRATIONS=true if the production app already migrated\n\n` +
          `Error details: ${output}`
        )
      }
    }
  } else {
    console.log('⏭️  Skipping migrations (E2E_SKIP_MIGRATIONS=true)')
  }

  console.log('✅ E2E Global Setup complete\n')

}

export async function globalTeardown() {
  // Only clean up the SSH tunnel if one was opened.
  // Do NOT kill port 3000 here — Playwright manages its own webServer lifecycle.
  if (sshTunnelProcess) {
    console.log('\n🔧 E2E Teardown: Closing SSH tunnel...')
    sshTunnelProcess.kill()
    sshTunnelProcess = null
  }
}

