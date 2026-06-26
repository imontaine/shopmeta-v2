// playwright.config.ts
// Playwright E2E test configuration for ShopMeta
//
// For E2E runs with a live database, place credentials in .env.e2e.
// The global-setup loads that file and runs Drizzle migrations automatically.

import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Load .env.e2e if present ────────────────────────────────────────────────
// For E2E runs, always override existing env vars with .env.e2e values so the
// test database URL (DATABASE_URL) wins over any stale system/shell env var.
function loadDotEnv(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      // Always override — E2E values must take precedence
      process.env[key] = value
    }
  } catch {
    // .env.e2e not required — fall back to .env
  }
}

loadDotEnv(resolve(process.cwd(), '.env.e2e'))

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Global setup: load env + run DB migrations before any tests
  globalSetup: './tests/e2e/global-setup.ts',

  // Global teardown: close SSH tunnel if one was opened
  // Using a separate file to prevent Playwright from calling globalSetup twice.
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Maximum time a single test can run
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Fail fast on CI
  forbidOnly: !!process.env['CI'],

  // Retry failed tests once — necessary because remote DB latency occasionally
  // causes registration/login to exceed the 15 s timeout. One retry keeps the
  // suite stable without masking real bugs.
  retries: 1,

  // Parallel workers
  workers: 1,

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    // Base URL for the dev server — override with E2E_BASE_URL in CI
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Capture screenshots on failure
    screenshot: 'only-on-failure',

    // Use a fresh context for each test
    storageState: undefined,

    // Give React time to hydrate before Playwright interacts with elements.
    // Without this, clicks/fills can race against the hydration process.
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },

  // Start the dev server automatically for local runs
  // Set E2E_BASE_URL to skip this (e.g., if server is already running)
  webServer: process.env['E2E_SKIP_WEBSERVER']
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        // IMPORTANT: Always start a fresh server so it picks up the E2E DATABASE_URL.
        // reuseExistingServer=true would cause the server to use .env (wrong DB).
        reuseExistingServer: false,
        // Longer timeout to account for cold starts
        timeout: 120000,
        // Pass the E2E environment to the dev server so it uses PostgreSQL
        // (not the in-memory adapter) and picks up the correct auth secret.
        // Only forward keys that are actually set — passing an empty string
        // would explicitly shadow the inherited value with '', making the
        // truthy check in auth.ts fall through to in-memory mode.
        env: Object.fromEntries(
          (
            [
              'DATABASE_URL',
              'BETTER_AUTH_SECRET',
              'BETTER_AUTH_URL',
              'OPENAI_API_KEY',
              'ANTHROPIC_API_KEY',
              'GOOGLE_AI_API_KEY',
              'NODE_ENV',
            ] as const
          )
            .map((k) => [k, process.env[k] ?? ''])
            .filter(([, v]) => v !== '')
        ),
        cwd: process.cwd(),
      },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
