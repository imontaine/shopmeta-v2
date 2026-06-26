import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Read version — try root package.json first (local dev), fall back to
// local package.json (Docker), then env var, then '0.0.0'.
function getAppVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  const rootPkgPath = resolve(__dirname, '../package.json')
  const localPkgPath = resolve(__dirname, 'package.json')
  const pkgPath = existsSync(rootPkgPath) ? rootPkgPath : localPkgPath
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
const APP_VERSION = getAppVersion()

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
