// src/routes/__root.tsx
// Root layout — loads session on each navigation and provides it to router context.
// Uses beforeLoad (not loader) so the session is available in child route contexts.

import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import appCss from '../styles.css?url'

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

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
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
        // Default to dark if anything fails
        document.documentElement.classList.add('dark');
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
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
