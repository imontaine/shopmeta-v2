// src/router.tsx
// TanStack Router instance — created with initial context for session-based auth

import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { RouterContext } from './routes/__root'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // Provide initial context — will be updated by root route loader
    context: {
      user: null,
      session: null,
    } satisfies RouterContext,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
