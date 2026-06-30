// src/lib/mcp-oauth.ts
// MCP OAuth 2.0 / PKCE flow implementation.
//
// The MCP spec (modelcontextprotocol.io) uses:
//   1. RFC 9728: OAuth 2.0 Protected Resource Metadata — server signals its auth server via 401
//   2. RFC 8414: OAuth 2.0 Authorization Server Metadata — discover authorize/token endpoints
//   3. RFC 7591: Dynamic Client Registration — register without pre-shared client_id
//   4. RFC 7636: PKCE — mandatory for the authorization code flow
//
// Flow summary:
//   GET /mcp → 401 WWW-Authenticate: Bearer resource_metadata=<rm_url>
//   GET <rm_url> → { authorization_servers: [...] }
//   GET <as>/.well-known/oauth-authorization-server → { authorization_endpoint, token_endpoint, ... }
//   POST <as>/register → { client_id, ... }
//   Redirect user → <authorization_endpoint>?...&code_challenge=...
//   Callback: GET /api/mcp/oauth-callback?code=...&state=...
//   POST <token_endpoint> { code, code_verifier } → { access_token, refresh_token, ... }
//   Store token in mcp_servers.auth_config
//
// Token refresh:
//   resolveOAuthToken(mcpServerId, orgId) — reads authConfig from DB,
//   checks expiry (with 60s buffer), refreshes via refresh_token if needed,
//   writes new tokens back to DB, returns a valid access_token.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireOrgSession } from '#/lib/auth/require-org-session'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpOAuthDiscovery {
  /** Discovered authorization endpoint (for the redirect) */
  authorizationEndpoint: string
  /** Discovered token endpoint (for the code exchange) */
  tokenEndpoint: string
  /** Dynamic client_id obtained via DCR (or empty if DCR not supported) */
  clientId: string
  /** The resource_metadata URL we started from */
  resourceMetadataUrl: string
  /** Whether the server supports dynamic client registration */
  supportsDcr: boolean
}

export interface McpOAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType: string
  scope?: string
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const DiscoverOAuthInput = z.object({
  url: z.string().url('Must be a valid MCP server URL'),
})

const ExchangeCodeInput = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  tokenEndpoint: z.string().url(),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
})

// ─── Helper: fetch with timeout ───────────────────────────────────────────────

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// ─── Server functions ─────────────────────────────────────────────────────────

/**
 * Probes an MCP server URL to discover its OAuth configuration.
 * Steps:
 *   1. GET the MCP URL → expect 401 with WWW-Authenticate header
 *   2. Parse resource_metadata URL from header
 *   3. Fetch resource metadata → find authorization_servers[0]
 *   4. Fetch authorization server metadata → get authorize/token endpoints
 *   5. Attempt Dynamic Client Registration
 */
export const discoverMcpOAuth = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DiscoverOAuthInput.parse(data))
  .handler(async ({ data }): Promise<McpOAuthDiscovery> => {
    await requireOrgSession()

    // Step 1: probe the MCP server — expect 401
    let probeRes: Response
    try {
      probeRes = await fetchWithTimeout(data.url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    } catch (err) {
      throw new Error(`Cannot reach MCP server at ${data.url}: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (probeRes.status !== 401) {
      // Server doesn't require auth — shouldn't happen for ClickHouse Cloud
      // but handle gracefully
      throw new Error(`MCP server at ${data.url} returned ${probeRes.status} — expected 401 for OAuth-protected servers`)
    }

    // Step 2: parse WWW-Authenticate header
    const wwwAuth = probeRes.headers.get('WWW-Authenticate') ?? ''
    const rmMatch = wwwAuth.match(/resource_metadata="?([^",\s]+)"?/i)
    if (!rmMatch?.[1]) {
      throw new Error(
        `MCP server did not provide a resource_metadata URL in the WWW-Authenticate header. ` +
        `Header received: "${wwwAuth || '(none)'}". ` +
        `This server may not support the standard MCP OAuth flow.`
      )
    }
    const resourceMetadataUrl = rmMatch[1]

    // Step 3: fetch resource metadata
    let rmRes: Response
    try {
      rmRes = await fetchWithTimeout(resourceMetadataUrl, { headers: { Accept: 'application/json' } })
    } catch (err) {
      throw new Error(`Failed to fetch resource metadata from ${resourceMetadataUrl}: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!rmRes.ok) {
      throw new Error(`Resource metadata endpoint returned ${rmRes.status}: ${resourceMetadataUrl}`)
    }
    const rm = await rmRes.json() as { authorization_servers?: string[] }

    const authServerBase = rm.authorization_servers?.[0]
    if (!authServerBase) {
      throw new Error(`Resource metadata did not list any authorization_servers: ${JSON.stringify(rm)}`)
    }

    // Step 4: fetch authorization server metadata (RFC 8414)
    const asMeta = await fetchAuthServerMetadata(authServerBase)

    // Step 5: dynamic client registration (RFC 7591)
    let clientId = ''
    let supportsDcr = false
    if (asMeta.registration_endpoint) {
      supportsDcr = true
      clientId = await dynamicClientRegistration(asMeta.registration_endpoint)
    }

    return {
      authorizationEndpoint: asMeta.authorization_endpoint,
      tokenEndpoint: asMeta.token_endpoint,
      clientId,
      resourceMetadataUrl,
      supportsDcr,
    }
  })

/**
 * Exchanges an authorization code for tokens at the token endpoint.
 * Called server-side after the OAuth callback receives the code.
 */
export const exchangeMcpOAuthCode = createServerFn({ method: 'POST' })
  .validator((data: unknown) => ExchangeCodeInput.parse(data))
  .handler(async ({ data }): Promise<McpOAuthTokens> => {
    await requireOrgSession()

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: data.code,
      code_verifier: data.codeVerifier,
      client_id: data.clientId,
      redirect_uri: data.redirectUri,
    })

    let res: Response
    try {
      res = await fetchWithTimeout(data.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
    } catch (err) {
      throw new Error(`Token exchange failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    const json = await res.json() as Record<string, unknown>
    if (!res.ok) {
      throw new Error(`Token endpoint returned ${res.status}: ${JSON.stringify(json)}`)
    }

    return {
      accessToken: String(json['access_token'] ?? ''),
      refreshToken: json['refresh_token'] ? String(json['refresh_token']) : undefined,
      expiresIn: typeof json['expires_in'] === 'number' ? json['expires_in'] : undefined,
      tokenType: String(json['token_type'] ?? 'Bearer'),
      scope: json['scope'] ? String(json['scope']) : undefined,
    }
  })

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface AuthServerMetadata {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
}

async function fetchAuthServerMetadata(baseUrl: string): Promise<AuthServerMetadata> {
  // Try RFC 8414 well-known URL
  const wellKnown = `${baseUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`
  const res = await fetchWithTimeout(wellKnown, { headers: { Accept: 'application/json' } })

  if (!res.ok) {
    // Some servers use OpenID Connect discovery
    const oidc = `${baseUrl.replace(/\/$/, '')}/.well-known/openid-configuration`
    const oidcRes = await fetchWithTimeout(oidc, { headers: { Accept: 'application/json' } })
    if (!oidcRes.ok) {
      throw new Error(
        `Could not fetch authorization server metadata from ${wellKnown} (${res.status}) or ${oidc} (${oidcRes.status})`
      )
    }
    return await oidcRes.json() as AuthServerMetadata
  }

  return await res.json() as AuthServerMetadata
}

async function dynamicClientRegistration(registrationEndpoint: string): Promise<string> {
  const res = await fetchWithTimeout(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ShopMeta',
      redirect_uris: [
        // This will be overridden by the caller with the actual app origin
        // DCR just needs at least one URI to be registered
        'https://app.shopmeta.app/api/mcp/oauth-callback',
      ],
      token_endpoint_auth_method: 'none', // Public client — PKCE only
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Dynamic client registration failed (${res.status}): ${err}`)
  }

  const json = await res.json() as { client_id?: string }
  if (!json.client_id) {
    throw new Error('Dynamic client registration did not return a client_id')
  }

  return json.client_id
}

// ─── Stored token shape ───────────────────────────────────────────────────────

/**
 * The shape written into mcp_servers.auth_config for OAuth servers.
 * Set by the callback route and updated on every refresh.
 */
export interface StoredOAuthConfig {
  accessToken: string
  refreshToken?: string
  /** Seconds until expiry from time of issue */
  expiresIn?: number
  tokenType: string
  scope?: string
  /** Unix ms timestamp when the token was issued / last refreshed */
  issuedAt: number
  /** The token endpoint used to refresh (needed for subsequent refreshes) */
  tokenEndpoint?: string
  /** The client_id used (needed for subsequent refreshes) */
  clientId?: string
}

// ─── Token resolution + auto-refresh ─────────────────────────────────────────

/**
 * Resolves a valid access token for an OAuth MCP server.
 *
 * Algorithm:
 *   1. Read storedConfig from mcp_servers.auth_config.
 *   2. If token is still valid (>60s remaining), return it as-is.
 *   3. If expired / expiring soon AND refresh_token present:
 *      a. POST to tokenEndpoint with grant_type=refresh_token
 *      b. Write new tokens back to DB (issuedAt = now)
 *      c. Return the new access_token
 *   4. If no refresh_token: throw — user must re-authenticate.
 *
 * @param mcpServerId - DB ID of the MCP server row
 * @param orgId       - Org scoping (to prevent cross-org access)
 * @returns           - A valid access_token string
 * @throws            - If no token stored, token expired with no refresh_token,
 *                      or the refresh request fails
 */
export async function resolveOAuthToken(
  mcpServerId: string,
  orgId: string,
): Promise<string> {
  const { getDb } = await import('#/lib/db/index')
  const { mcpServers } = await import('#/lib/db/schema')
  const { eq, and } = await import('drizzle-orm')

  const db = getDb()

  // Read the current auth config
  const [row] = await db
    .select({ authConfig: mcpServers.authConfig, authType: mcpServers.authType })
    .from(mcpServers)
    .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
    .limit(1)

  if (!row) throw new Error(`MCP server not found: ${mcpServerId}`)
  if (row.authType !== 'oauth') throw new Error(`MCP server ${mcpServerId} is not configured for OAuth`)

  const cfg = row.authConfig as StoredOAuthConfig | null
  if (!cfg?.accessToken) {
    throw new Error(
      `MCP server ${mcpServerId} has no stored OAuth token. ` +
      `Please complete the OAuth flow from the MCP Servers settings page.`
    )
  }

  // Check expiry — treat as expired 60s before actual expiry (clock skew buffer)
  const BUFFER_MS = 60 * 1000
  const issuedAt = cfg.issuedAt ?? 0
  const expiresIn = cfg.expiresIn ?? 3600 // default 1h if not specified
  const expiresAt = issuedAt + (expiresIn * 1000)
  const nowMs = Date.now()

  const isExpired = expiresAt - nowMs < BUFFER_MS

  if (!isExpired) {
    // Token is still valid — return as-is
    return cfg.accessToken
  }

  // Token is expired / expiring soon — attempt refresh
  if (!cfg.refreshToken) {
    throw new Error(
      `OAuth token for MCP server ${mcpServerId} has expired and no refresh_token is available. ` +
      `Please re-authenticate from the MCP Servers settings page.`
    )
  }

  if (!cfg.tokenEndpoint) {
    throw new Error(
      `OAuth token for MCP server ${mcpServerId} has expired but the token endpoint is not stored. ` +
      `Please re-authenticate from the MCP Servers settings page.`
    )
  }

  // Perform the refresh
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.refreshToken,
    ...(cfg.clientId ? { client_id: cfg.clientId } : {}),
  })

  let refreshRes: Response
  try {
    refreshRes = await fetchWithTimeout(cfg.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (err) {
    throw new Error(`Token refresh network error for MCP server ${mcpServerId}: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!refreshRes.ok) {
    const errBody = await refreshRes.text().catch(() => '(unreadable)')
    throw new Error(`Token refresh failed for MCP server ${mcpServerId} (${refreshRes.status}): ${errBody}`)
  }

  const refreshed = await refreshRes.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
  }

  if (!refreshed.access_token) {
    throw new Error(`Token refresh for MCP server ${mcpServerId} did not return an access_token`)
  }

  // Build the updated config — keep existing fields, overlay refreshed ones
  const updatedConfig: StoredOAuthConfig = {
    ...cfg,
    accessToken: refreshed.access_token,
    // Servers may issue a new refresh_token (rotation) — use it if present
    refreshToken: refreshed.refresh_token ?? cfg.refreshToken,
    expiresIn: refreshed.expires_in ?? cfg.expiresIn,
    tokenType: refreshed.token_type ?? cfg.tokenType,
    scope: refreshed.scope ?? cfg.scope,
    issuedAt: Date.now(),
  }

  // Persist the refreshed tokens back to DB
  try {
    await db
      .update(mcpServers)
      .set({ authConfig: updatedConfig as unknown as Record<string, unknown>, updatedAt: new Date() })
      .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
  } catch (dbErr) {
    // Log the DB error but still return the new token — don't block the request
    console.error(`[mcp-oauth] Failed to persist refreshed token for ${mcpServerId}:`, dbErr)
  }

  return updatedConfig.accessToken
}
