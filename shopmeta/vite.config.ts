import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read version from root package.json (where `npm run deploy` bumps it)
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
)
const APP_VERSION = rootPkg.version ?? '0.0.0'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
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
