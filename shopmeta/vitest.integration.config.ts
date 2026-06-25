import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts', 'tests/integration/**/*.spec.ts'],
    exclude: ['tests/unit/**'],
    globals: true,
    // Integration tests can take longer due to server/container startup
    testTimeout: 120000,
    hookTimeout: 120000,
    // Run integration tests serially to avoid port conflicts
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/routes/**'],
    },
  },
  resolve: {
    alias: {
      '#': resolve(__dirname, './src'),
    },
  },
})
