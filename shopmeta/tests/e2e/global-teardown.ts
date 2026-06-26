// tests/e2e/global-teardown.ts
// Playwright global teardown — runs after all E2E tests complete.
// Closes SSH tunnel if one was opened during setup.

export { globalTeardown as default } from './global-setup'
