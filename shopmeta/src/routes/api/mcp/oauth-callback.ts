// src/routes/api/mcp/oauth-callback.ts
// OAuth 2.0 callback route for MCP server authentication.
//
// The browser is redirected here after the user completes the OAuth flow
// at the MCP server's authorization server (e.g., ClickHouse Cloud login).
//
// URL: /api/mcp/oauth-callback?code=<code>&state=<sdk_state>&app_state=<our_state>
//
// The `app_state` parameter is a base64url-encoded JSON object set by
// /api/mcp/oauth/start containing: { mcpServerId, orgId }
//
// The SDK handles: codeVerifier lookup, token exchange, token persistence
// (via DrizzleOAuthProvider which it calls internally). We just decode
// app_state and delegate everything else to auth().

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
        const appStateParam = url.searchParams.get('app_state')
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

        if (!code || !appStateParam) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=Missing+code+or+app_state' },
          })
        }

        // Decode our app_state (set by /api/mcp/oauth/start)
        let appState: { mcpServerId: string; orgId: string }
        try {
          appState = JSON.parse(Buffer.from(appStateParam, 'base64url').toString('utf8'))
          if (!appState.mcpServerId || !appState.orgId) throw new Error('Missing fields')
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=Invalid+app_state+parameter' },
          })
        }

        // Verify session matches the org from app_state
        try {
          const session = await requireOrgSession()
          if (session.orgId !== appState.orgId) {
            return new Response(null, {
              status: 302,
              headers: { Location: '/mcp-servers?oauth_error=Session+org+mismatch' },
            })
          }
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/login' },
          })
        }

        // Load server row
        const db = getDb()
        const [server] = await db
          .select({ url: mcpServers.url, oauthState: mcpServers.oauthState })
          .from(mcpServers)
          .where(and(
            eq(mcpServers.id, appState.mcpServerId),
            eq(mcpServers.orgId, appState.orgId),
          ))
          .limit(1)

        if (!server) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=MCP+server+not+found' },
          })
        }

        // Reconstruct the same redirectUrl used in /oauth/start.
        // The SDK requires it to match exactly what was used for PKCE + DCR.
        // Use getPublicOrigin() to honour reverse-proxy forwarding headers so
        // the https:// scheme is preserved (same as oauth-start).
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
        const provider = new DrizzleOAuthProvider(appState.mcpServerId, appState.orgId, redirectUrl)

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

        // Clear the transient codeVerifier from oauthState (security hygiene).
        // Keep the AS discovery cache fields so refresh works without re-discovery.
        try {
          const currentState = (server.oauthState ?? {}) as Record<string, unknown>
          const { codeVerifier: _removed, ...persistedState } = currentState
          await db.update(mcpServers)
            .set({ oauthState: persistedState })
            .where(and(
              eq(mcpServers.id, appState.mcpServerId),
              eq(mcpServers.orgId, appState.orgId),
            ))
        } catch (err) {
          // Non-fatal - tokens are already saved
          console.error('[oauth-callback] Failed to clear codeVerifier:', err)
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