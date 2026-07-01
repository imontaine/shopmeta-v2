// src/routes/api/mcp/oauth-start.ts
// POST /api/mcp/oauth/start - initiates the OAuth 2.0 + PKCE flow for an MCP server.
//
// Called by the "Connect" button on the MCP servers page when a server has
// authType = 'oauth' but no tokens yet (auth_config is null) or the user
// wants to reconnect.
//
// Flow:
//   1. Verify org session
//   2. Load MCP server row (must exist and belong to org)
//   3. Construct the callback URL from the request origin
//   4. Store redirectUrl in oauthState so the callback can reconstruct it
//   5. Instantiate DrizzleOAuthProvider (SDK storage backend)
//   6. Override redirectToAuthorization on the INSTANCE to capture the auth URL
//      (the SDK calls it as a side-effect; we intercept rather than following it)
//   7. Call SDK auth() - handles RFC 9728 discovery, DCR, PKCE, builds authorizationUrl
//   8. Return { authorizationUrl } as JSON
//   9. Browser does window.location.href = authorizationUrl - user logs in
//  10. AS redirects back to /api/mcp/oauth-callback?code=...&app_state=...

import { createFileRoute } from '@tanstack/react-router'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { DrizzleOAuthProvider } from '#/lib/mcp-oauth-provider'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { getPublicOrigin } from '#/lib/get-origin'

export const Route = createFileRoute('/api/mcp/oauth-start')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // -- Parse body --------------------------------------------------------
        let body: { mcpServerId?: string }
        try {
          body = await request.json() as { mcpServerId?: string }
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }
        const { mcpServerId } = body
        if (!mcpServerId || typeof mcpServerId !== 'string') {
          return Response.json({ error: 'mcpServerId is required' }, { status: 400 })
        }

        // -- Verify session ----------------------------------------------------
        let orgId: string
        try {
          const session = await requireOrgSession()
          orgId = session.orgId
        } catch {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // -- Load MCP server ---------------------------------------------------
        const db = getDb()
        const [server] = await db
          .select({ id: mcpServers.id, url: mcpServers.url, authType: mcpServers.authType })
          .from(mcpServers)
          .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
          .limit(1)

        if (!server) {
          return Response.json({ error: 'MCP server not found' }, { status: 404 })
        }
        if (server.authType !== 'oauth') {
          return Response.json({ error: 'Server is not configured for OAuth' }, { status: 400 })
        }

        // -- Build redirect URL from public origin ----------------------------
        // IMPORTANT: use getPublicOrigin() not new URL(request.url).origin.
        // Behind a reverse proxy the internal request is http:// even though
        // the public URL is https://. The MCP SDK OAuth validator rejects
        // http:// redirect_uris for non-localhost hosts.
        const origin = getPublicOrigin(request)
        const redirectUrl = `${origin}/api/mcp/oauth-callback`

        // -- Run SDK auth() and capture the authorization URL ------------------
        const provider = new DrizzleOAuthProvider(mcpServerId, orgId, redirectUrl)

        // Override redirectToAuthorization on this instance to capture the URL.
        // The SDK calls it then returns 'REDIRECT'. We capture instead of following.
        let capturedAuthUrl: URL | undefined
        provider.redirectToAuthorization = (url: URL) => {
          capturedAuthUrl = url
        }

        try {
          const result = await auth(provider, { serverUrl: server.url })

          if (result === 'AUTHORIZED') {
            // Tokens are already valid - no user action needed
            return Response.json({ alreadyAuthorized: true })
          }

          if (result !== 'REDIRECT' || !capturedAuthUrl) {
            return Response.json(
              { error: 'OAuth flow did not produce an authorization URL' },
              { status: 500 }
            )
          }

          // The SDK has already built the authorizationUrl with its own
          // `state` (CSRF token) and `code_challenge` (PKCE).
          //
          // We store the SDK's `state` value in oauthState so the callback
          // can reverse-lookup which MCP server this flow belongs to.
          // We do NOT append our own `app_state` — the AS only echoes back
          // the standard `code` and `state` params.
          const sdkState = capturedAuthUrl.searchParams.get('state')
          if (sdkState) {
            // Persist the state value so the callback can find this server row.
            // patchState is not directly accessible, so we do it via a DB update.
            const db = getDb()
            const existingRow = await db
              .select({ oauthState: mcpServers.oauthState })
              .from(mcpServers)
              .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
              .limit(1)
            const existing = (existingRow[0]?.oauthState ?? {}) as Record<string, unknown>
            await db
              .update(mcpServers)
              .set({ oauthState: { ...existing, pendingState: sdkState } })
              .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
          }

          return Response.json({
            authorizationUrl: capturedAuthUrl.toString(),
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[oauth-start] OAuth flow error:', message)
          return Response.json(
            { error: `OAuth initialization failed: ${message}` },
            { status: 500 }
          )
        }
      },
    },
  },
})
