// src/routes/api/mcp/oauth-callback.ts
// OAuth 2.0 callback route for MCP server authentication.
//
// The browser is redirected here after the user completes the OAuth flow
// at the MCP server's authorization server (e.g., ClickHouse Cloud login).
//
// URL: /api/mcp/oauth-callback?code=<code>&state=<sdk_state>
//
// The AS echoes back only the standard `code` and `state` parameters.
// We stored the SDK's `state` value in oauthState.pendingState during
// /api/mcp/oauth-start, so we reverse-lookup the server row by that value.
//
// The SDK handles: codeVerifier lookup, token exchange, token persistence
// (via DrizzleOAuthProvider which it calls internally). We just find the
// right server row and delegate everything else to auth().

import { createFileRoute } from '@tanstack/react-router'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { DrizzleOAuthProvider } from '#/lib/mcp-oauth-provider'
import { auth } from '@modelcontextprotocol/sdk/client/auth.js'
import { getPublicOrigin } from '#/lib/get-origin'

export const Route = createFileRoute('/api/mcp/oauth-callback')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const sdkState = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDesc = url.searchParams.get('error_description')

        // Handle OAuth error response from AS
        if (error) {
          const msg = encodeURIComponent(errorDesc ?? error)
          return new Response(null, {
            status: 302,
            headers: { Location: `/mcp-servers?oauth_error=${msg}` },
          })
        }

        if (!code || !sdkState) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=Missing+code+or+state+from+authorization+server' },
          })
        }

        // Verify session
        let orgId: string
        try {
          const session = await requireOrgSession()
          orgId = session.orgId
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/login' },
          })
        }

        // Reverse-lookup the MCP server row by the SDK state value we stored
        // in oauthState.pendingState during /api/mcp/oauth-start.
        // The AS only echoes back `code` and `state` — we stored our context
        // in the DB so we don't depend on the AS preserving extra params.
        const db = getDb()
        const rows = await db
          .select({
            id: mcpServers.id,
            url: mcpServers.url,
            oauthState: mcpServers.oauthState,
          })
          .from(mcpServers)
          .where(eq(mcpServers.orgId, orgId))

        const server = rows.find((r) => {
          const state = (r.oauthState ?? {}) as Record<string, unknown>
          return state['pendingState'] === sdkState
        })

        if (!server) {
          console.error(`[oauth-callback] No server found for state=${sdkState} orgId=${orgId}`)
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=OAuth+state+not+found.+The+flow+may+have+expired+or+already+completed.' },
          })
        }

        // Reconstruct the same redirectUrl used in /oauth/start.
        // The SDK requires it to match exactly what was used for PKCE + DCR.
        const origin = getPublicOrigin(request)
        const redirectUrl = `${origin}/api/mcp/oauth-callback`

        // Delegate token exchange to the SDK.
        // auth() with authorizationCode set will:
        //   1. Read provider.discoveryState() - skip re-discovery (cached in oauthState)
        //   2. Read provider.clientInformation() - skip DCR (already in oauthClientInfo)
        //   3. Read provider.codeVerifier() - the stored PKCE verifier from oauthState
        //   4. Call exchangeAuthorization() - POST to token endpoint
        //   5. Call provider.saveTokens() - persists to mcp_servers.auth_config
        //   6. Return 'AUTHORIZED'
        const provider = new DrizzleOAuthProvider(server.id, orgId, redirectUrl)

        try {
          const result = await auth(provider, {
            serverUrl: server.url,
            authorizationCode: code,
          })

          if (result !== 'AUTHORIZED') {
            return new Response(null, {
              status: 302,
              headers: { Location: '/mcp-servers?oauth_error=Token+exchange+did+not+complete' },
            })
          }
        } catch (err) {
          const msg = encodeURIComponent(err instanceof Error ? err.message : 'Token exchange failed')
          console.error('[oauth-callback] Token exchange failed:', err)
          return new Response(null, {
            status: 302,
            headers: { Location: `/mcp-servers?oauth_error=${msg}` },
          })
        }

        // Clear transient state: codeVerifier + pendingState.
        // Keep AS discovery cache fields for refresh flows.
        try {
          const currentState = (server.oauthState ?? {}) as Record<string, unknown>
          const {
            codeVerifier: _cv,
            pendingState: _ps,
            ...persistedState
          } = currentState
          await db.update(mcpServers)
            .set({ oauthState: persistedState })
            .where(and(
              eq(mcpServers.id, server.id),
              eq(mcpServers.orgId, orgId),
            ))
        } catch (err) {
          // Non-fatal - tokens are already saved
          console.error('[oauth-callback] Failed to clear transient state:', err)
        }

        // Success
        return new Response(null, {
          status: 302,
          headers: { Location: '/mcp-servers?oauth_success=1' },
        })
      },
    },
  },
})