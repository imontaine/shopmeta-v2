// src/routes/api/mcp/oauth-callback.ts
// OAuth 2.0 callback route for MCP server authentication.
//
// The browser is redirected here after the user completes the OAuth flow
// at the MCP server's authorization server (e.g., ClickHouse Cloud login).
//
// URL: /api/mcp/oauth-callback?code=<code>&state=<state>
//
// The `state` parameter is a base64-encoded JSON object stored in
// sessionStorage on the client before the redirect:
// {
//   mcpServerId: string      // The DB ID of the MCP server being authorized
//   codeVerifier: string     // PKCE code verifier (generated before redirect)
//   tokenEndpoint: string    // Token endpoint URL (discovered via RFC 8414)
//   clientId: string         // Client ID from DCR
//   redirectUri: string      // This callback URL (must match what was registered)
// }
//
// After successful token exchange, the access token is stored in the
// mcp_servers.auth_config JSONB column and the user is redirected back
// to /mcp-servers with a success indicator.

import { createFileRoute } from '@tanstack/react-router'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const Route = createFileRoute('/api/mcp/oauth-callback')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const stateParam = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDesc = url.searchParams.get('error_description')

        // Handle OAuth error response
        if (error) {
          const msg = encodeURIComponent(errorDesc ?? error)
          return new Response(null, {
            status: 302,
            headers: { Location: `/mcp-servers?oauth_error=${msg}` },
          })
        }

        if (!code || !stateParam) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=Missing+code+or+state' },
          })
        }

        // Decode state
        let state: {
          mcpServerId: string
          codeVerifier: string
          tokenEndpoint: string
          clientId: string
          redirectUri: string
        }
        try {
          state = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'))
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: '/mcp-servers?oauth_error=Invalid+state+parameter' },
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

        // Exchange code for token
        let tokens: { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string }
        try {
          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: state.codeVerifier,
            client_id: state.clientId,
            redirect_uri: state.redirectUri,
          })

          const tokenRes = await fetch(state.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          })

          if (!tokenRes.ok) {
            const errBody = await tokenRes.text()
            throw new Error(`Token endpoint ${tokenRes.status}: ${errBody}`)
          }

          tokens = await tokenRes.json() as typeof tokens
        } catch (err) {
          const msg = encodeURIComponent(err instanceof Error ? err.message : 'Token exchange failed')
          return new Response(null, {
            status: 302,
            headers: { Location: `/mcp-servers?oauth_error=${msg}` },
          })
        }

        // Store token in DB
        try {
          const db = getDb()
          await db
            .update(mcpServers)
            .set({
              authType: 'oauth',
              authConfig: {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresIn: tokens.expires_in,
                tokenType: tokens.token_type ?? 'Bearer',
                scope: tokens.scope,
                issuedAt: Date.now(),
              },
              updatedAt: new Date(),
            })
            .where(and(
              eq(mcpServers.id, state.mcpServerId),
              eq(mcpServers.orgId, orgId),
            ))
        } catch (err) {
          const msg = encodeURIComponent(err instanceof Error ? err.message : 'Failed to save token')
          return new Response(null, {
            status: 302,
            headers: { Location: `/mcp-servers?oauth_error=${msg}` },
          })
        }

        // Success redirect
        return new Response(null, {
          status: 302,
          headers: { Location: '/mcp-servers?oauth_success=1' },
        })
      },
    },
  },
})
