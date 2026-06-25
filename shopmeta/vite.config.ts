import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    // Treat the auth client as external in SSR so it's not processed
    // by Vite's SSR module runner (it uses browser APIs / betterFetch)
    external: [
      '@better-fetch/fetch',
    ],
    // Allow these to be inlined into the SSR bundle
    noExternal: [
      'better-auth',
      'better-auth/react',
      'better-auth/tanstack-start',
      'better-auth/client/plugins',
    ],
  },
})

export default config
