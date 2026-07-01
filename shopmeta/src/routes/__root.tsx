// src/routes/__root.tsx
// Root layout — loads session on each navigation and provides it to router context.
// Uses beforeLoad (not loader) so the session is available in child route contexts.

import * as React from 'react'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import appCss from '../styles.css?url'

// ─── Lazy-loaded DevTools (client-only) ──────────────────────────────────────
// DevTools must NOT render during SSR — their hooks crash when called outside
// a React render context. Lazy-loading ensures they only mount after hydration.
const TanStackRouterDevtoolsPanel = React.lazy(() =>
  import('@tanstack/react-router-devtools').then((m) => ({
    default: m.TanStackRouterDevtoolsPanel,
  })),
)
const TanStackDevtools = React.lazy(() =>
  import('@tanstack/react-devtools').then((m) => ({
    default: m.TanStackDevtools,
  })),
)

// ─── Session loading server function ─────────────────────────────────────────
// Loaded on every navigation to populate the router context with auth state.
const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { getAuth } = await import('#/lib/auth/auth')
    const auth = await getAuth()
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) return { user: null, session: null }

    return {
      user: session.user
        ? { id: session.user.id, email: session.user.email, name: session.user.name }
        : null,
      session: session.session
        ? { id: session.session.id, userId: session.session.userId, expiresAt: session.session.expiresAt }
        : null,
    }
  } catch (_err) {
    return { user: null, session: null }
  }
})

// ─── Router context type ──────────────────────────────────────────────────
export interface RouterContext {
  user: { id: string; email: string; name: string } | null
  session: { id: string; userId: string; expiresAt: Date } | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'ShopMeta — AI-Powered Magento Analytics' },
      {
        name: 'description',
        content: 'ShopMeta gives your team AI-powered insights on your Magento store data with ClickHouse analytics.',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),

  // ─── beforeLoad populates the router context ────────────────────────────
  // Using beforeLoad (not loader) ensures the returned data is merged into
  // the context that child routes see via their `context` argument.
  // loader() data is accessible via Route.useLoaderData() but NOT via context.
  beforeLoad: async () => {
    try {
      return await getSessionFn()
    } catch (_err) {
      return { user: null, session: null }
    }
  },

  notFoundComponent: () => <p>Not Found</p>,

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Track whether we've hydrated — devtools only mount after hydration
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])

  // Inline script to apply theme class before first paint — prevents FOUC.
  // Runs synchronously during HTML parsing, before CSS is applied.
  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('shopmeta-theme');
        var resolved;
        if (stored === 'dark' || stored === 'light') {
          resolved = stored;
        } else {
          resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.classList.add(resolved === 'dark' ? 'dark' : 'light');
      } catch (e) {
        // Default to light if anything fails
        document.documentElement.classList.add('light');
      }
    })();
  `

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Anti-FOUC: applies theme class synchronously before render */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {/* DevTools: lazy-loaded, mounted after hydration to avoid SSR mismatch */}
        {mounted && process.env.NODE_ENV === 'development' && (
          <React.Suspense fallback={null}>
            <TanStackDevtools
              config={{ position: 'bottom-right' }}
              plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
            />
          </React.Suspense>
        )}
        <Scripts />
      </body>
    </html>
  )
}


