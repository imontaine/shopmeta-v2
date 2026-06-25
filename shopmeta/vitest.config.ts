import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.spec.ts'],
    exclude: ['tests/integration/**'],
    globals: true,
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
