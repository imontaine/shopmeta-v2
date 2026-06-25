import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import viteReact from '@vitejs/plugin-react'

// Component test config — uses jsdom environment for React component rendering.
// Run with: pnpm vitest run --config vitest.component.config.ts
export default defineConfig({
  plugins: [viteReact()],
  test: {
    name: 'component',
    environment: 'jsdom',
    include: ['tests/component/**/*.test.tsx', 'tests/component/**/*.spec.tsx'],
    globals: true,
    setupFiles: ['./tests/component/setup.ts'],
  },
  resolve: {
    alias: {
      '#': resolve(__dirname, './src'),
    },
  },
})
