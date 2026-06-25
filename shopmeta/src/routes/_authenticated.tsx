// src/routes/_authenticated.tsx
// Protected layout — wraps all authenticated routes.
// Redirects to /login if the user is not authenticated.
// Provides ThemeProvider + AppLayout (sidebar + main content) for all child routes.
// QueryClientProvider is included here so all authenticated child routes can use TanStack Query.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '#/lib/theme'
import { AppLayout } from '#/components/layout/AppLayout'

// Stable QueryClient instance — created once per mount of the authenticated layout
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    // context.user is provided via the root route loader → router context
    // When undefined/null, user is unauthenticated
    if (!context.user) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppLayout />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
