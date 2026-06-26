/// <reference types="@testing-library/jest-dom" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import viteReact from '@vitejs/plugin-react'

// Component test config — uses jsdom environment for React component rendering.
// Run with: pnpm vitest run --config vitest.component.config.ts
export default defineConfig({
  plugins: [viteReact()],
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
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
      '@': resolve(__dirname, './src'),
    },
  },
})
