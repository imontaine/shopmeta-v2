import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    // Allow these to be inlined into the SSR bundle
    noExternal: [
      'better-auth',
      'better-auth/react',
      'better-auth/tanstack-start',
      'better-auth/client/plugins',
      // @better-fetch/fetch must be bundled — pnpm strict mode doesn't hoist
      // it so it can't be resolved as external at runtime in production
      '@better-fetch/fetch',
    ],
  },
})

export default config
