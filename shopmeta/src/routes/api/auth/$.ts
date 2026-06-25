// src/routes/api/auth/$.ts
// Better Auth wildcard handler — handles all /api/auth/* requests.
// Uses createFileRoute with server handlers to catch all /api/auth/* routes.

import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '#/lib/auth/auth'

export const Route = createFileRoute('/api/auth/$')({
  // @ts-expect-error — server handlers are a TanStack Start extension
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await getAuth()
        return auth.handler(request)
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = await getAuth()
        return auth.handler(request)
      },
    },
  },
})
