// src/routes/index.tsx
// Root index — redirect to /chat (or /login if unauthenticated, handled by _authenticated layout)

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/chat' })
  },
  component: () => null,
})
