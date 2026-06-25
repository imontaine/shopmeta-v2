// playwright.config.ts
// Playwright E2E test configuration for ShopMeta

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // Maximum time a single test can run
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Fail fast on CI
  forbidOnly: !!process.env['CI'],

  // Retry on CI
  retries: process.env['CI'] ? 1 : 0,

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
        // Reuse if already running (e.g., from pnpm dev in another terminal)
        reuseExistingServer: true,
        // Longer timeout to account for cold starts
        timeout: 60000,
        // Accept any status code from the health check URL (500 from missing DB is ok at start)
        // The actual test assertions will catch real failures
        cwd: process.cwd(),
      },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
