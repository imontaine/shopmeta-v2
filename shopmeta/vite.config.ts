import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  ssr: {
    // @better-fetch/fetch must be external because bundling it pulls in
    // better-auth internals that need Zod 4 .meta() which conflicts with
    // the Zod 3 that Vite resolves. Added as direct dep for pnpm hoisting.
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
  preview: {
    allowedHosts: ['app.shopmeta.app'],
  },
})

export default config
