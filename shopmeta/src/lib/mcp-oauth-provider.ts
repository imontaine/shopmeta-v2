// src/lib/mcp-oauth-provider.ts
// DrizzleOAuthProvider — implements OAuthClientProvider from @modelcontextprotocol/sdk
// backed by Postgres (via Drizzle ORM).
//
// This is the ONLY OAuth-related code we write. All cryptographic operations
// (PKCE, code exchange, token refresh, DCR, AS discovery) are handled by the SDK.
// We just provide the persistence layer:
//
//   oauthClientInfo  ? SDK OAuthClientInformationFull from DCR (static per-server)
//   authConfig       ? SDK OAuthTokens (access_token, refresh_token, …)
//   oauthState       ? Transient PKCE + redirect URL + cached AS discovery metadata
//
// The discovery state cache (authorizationServerUrl + authorizationServerMetadata)
// is critical for fast server-side token refresh: it lets auth() skip the RFC 9728
// re-discovery step on every 401, which would otherwise add 8+ seconds of latency.

import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// --- Stored oauth_state shape -------------------------------------------------

// The oauthState JSONB column serves double duty:
//   1. During auth flow:  { codeVerifier, redirectUrl }   ? written by /oauth/start
//   2. After first auth:  + cached discovery fields        ? written by saveDiscoveryState
// We merge on every write so neither half overwrites the other.
interface StoredOAuthState {
  // Transient (cleared after callback)
  codeVerifier?: string
  redirectUrl?: string
  // Persisted (AS discovery cache — avoids re-fetching on every refresh)
  authorizationServerUrl?: string
  resourceMetadataUrl?: string
  resourceMetadata?: Record<string, unknown>
  authorizationServerMetadata?: Record<string, unknown>
}

// --- Provider -----------------------------------------------------------------

export class DrizzleOAuthProvider implements OAuthClientProvider {
  /**
   * @param mcpServerId - DB ID of the mcp_servers row
   * @param orgId       - Org ID for tenant scoping
   * @param redirectUrl - The OAuth callback URL (derived from request origin)
   */
  constructor(
    private readonly mcpServerId: string,
    private readonly orgId: string,
    public readonly redirectUrl: string,
  ) {}

  // -- OAuthClientProvider required: clientMetadata ----------------------------

  get clientMetadata() {
    return {
      client_name: 'ShopMeta',
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none' as const,
      grant_types: ['authorization_code', 'refresh_token'] as string[],
      response_types: ['code'] as string[],
    }
  }

  // -- Client registration (DCR) ------------------------------------------------

  /**
   * Returns the stored DCR result, or undefined if DCR has not been performed yet.
   * The SDK calls this to check if registration is needed before attempting auth.
   */
  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const db = getDb()
    const [row] = await db
      .select({ oauthClientInfo: mcpServers.oauthClientInfo })
      .from(mcpServers)
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
      .limit(1)
    if (!row?.oauthClientInfo) return undefined
    return row.oauthClientInfo as unknown as OAuthClientInformationMixed
  }

  /**
   * Persists the DCR registration result. Called by the SDK after registerClient().
   */
  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    const db = getDb()
    await db
      .update(mcpServers)
      .set({ oauthClientInfo: info as unknown as Record<string, unknown> })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }

  // -- Tokens -------------------------------------------------------------------

  /**
   * Returns stored OAuth tokens in SDK's OAuthTokens shape, or undefined if
   * no token has been issued yet (e.g. before first OAuth flow completes).
   *
   * The SDK reads this to:
   *   1. Inject Authorization: Bearer <access_token> on every MCP request
   *   2. Attempt refresh if access_token is expired (uses refresh_token)
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    const db = getDb()
    const [row] = await db
      .select({ authConfig: mcpServers.authConfig, authType: mcpServers.authType })
      .from(mcpServers)
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
      .limit(1)
    if (!row || row.authType !== 'oauth' || !row.authConfig) return undefined
    return row.authConfig as unknown as OAuthTokens
  }

  /**
   * Persists tokens after a successful exchange or refresh. The SDK calls this:
   *   - After exchangeAuthorization() in the callback
   *   - After refreshAuthorization() on a 401
   *
   * The SDK's OAuthTokens shape uses snake_case: { access_token, refresh_token, … }
   */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const db = getDb()
    await db
      .update(mcpServers)
      .set({
        authType: 'oauth',
        authConfig: tokens as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }

  // -- PKCE code verifier -------------------------------------------------------

  /**
   * Persists the PKCE code verifier before redirecting to the authorization server.
   * Merges with existing oauthState to preserve other fields.
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const existing = await this._readOauthState()
    await this._writeOauthState({ ...existing, codeVerifier })
  }

  /**
   * Returns the stored PKCE code verifier to complete the token exchange.
   * Called by the SDK in the callback flow.
   */
  async codeVerifier(): Promise<string> {
    const state = await this._readOauthState()
    if (!state.codeVerifier) {
      throw new Error(
        `[DrizzleOAuthProvider] No PKCE code verifier stored for MCP server ${this.mcpServerId}. ` +
        `The OAuth flow may have expired or not been started.`
      )
    }
    return state.codeVerifier
  }

  // -- Discovery state cache -----------------------------------------------------

  /**
   * Persists AS discovery results after RFC 9728 + RFC 8414 discovery.
   * Subsequent calls to auth() will read this cache and skip re-discovery,
   * which is critical for fast server-side token refresh.
   */
  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const existing = await this._readOauthState()
    await this._writeOauthState({
      ...existing,
      authorizationServerUrl: state.authorizationServerUrl,
      resourceMetadataUrl: state.resourceMetadataUrl,
      resourceMetadata: state.resourceMetadata as Record<string, unknown> | undefined,
      authorizationServerMetadata: state.authorizationServerMetadata as Record<string, unknown> | undefined,
    })
  }

  /**
   * Returns cached discovery state, or undefined if not yet cached.
   * When available, auth() skips RFC 9728 re-discovery entirely.
   */
  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const state = await this._readOauthState()
    if (!state.authorizationServerUrl) return undefined
    return {
      authorizationServerUrl: state.authorizationServerUrl,
      resourceMetadataUrl: state.resourceMetadataUrl,
      resourceMetadata: state.resourceMetadata as OAuthDiscoveryState['resourceMetadata'],
      authorizationServerMetadata: state.authorizationServerMetadata as OAuthDiscoveryState['authorizationServerMetadata'],
    }
  }

  // -- Credential invalidation --------------------------------------------------

  /**
   * SDK error-recovery hook — called when the server signals credentials are invalid.
   * Scopes: 'tokens' | 'client' | 'verifier' | 'discovery' | 'all'
   */
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    const db = getDb()
    const where = and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId))

    if (scope === 'tokens' || scope === 'all') {
      await db.update(mcpServers)
        .set({ authConfig: null, updatedAt: new Date() })
        .where(where)
    }
    if (scope === 'client' || scope === 'all') {
      await db.update(mcpServers)
        .set({ oauthClientInfo: null })
        .where(where)
    }
    if (scope === 'verifier') {
      const existing = await this._readOauthState()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { codeVerifier: _removed, ...rest } = existing
      await this._writeOauthState(rest)
    }
    if (scope === 'discovery' || scope === 'all') {
      const existing = await this._readOauthState()
      // Keep only the transient auth flow fields; clear AS discovery cache
      await this._writeOauthState({
        codeVerifier: existing.codeVerifier,
        redirectUrl: existing.redirectUrl,
      })
    }
  }

  // -- Redirect (server-side no-op) ---------------------------------------------

  /**
   * No-op for server-side usage.
   *
   * The SDK calls this when it wants to redirect the user to the AS. In the browser
   * this would be window.location.href = url. Server-side, the URL is captured by
   * /api/mcp/oauth/start and returned to the browser as JSON.
   *
   * If called during chat stream (refresh failed beyond recovery), the transport
   * throws UnauthorizedError which surfaces to the user as "please reconnect".
   */
  redirectToAuthorization(_url: URL): void {
    // Intentional no-op — see comment above
  }

  // -- Private helpers ----------------------------------------------------------

  private async _readOauthState(): Promise<StoredOAuthState> {
    const db = getDb()
    const [row] = await db
      .select({ oauthState: mcpServers.oauthState })
      .from(mcpServers)
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
      .limit(1)
    return (row?.oauthState as StoredOAuthState | null) ?? {}
  }

  private async _writeOauthState(state: StoredOAuthState): Promise<void> {
    const db = getDb()
    await db
      .update(mcpServers)
      .set({ oauthState: state as unknown as Record<string, unknown> })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }
}
