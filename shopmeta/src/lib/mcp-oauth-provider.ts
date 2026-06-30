// src/lib/mcp-oauth-provider.ts
// DrizzleOAuthProvider implements OAuthClientProvider from @modelcontextprotocol/sdk.
// Persists all OAuth state (DCR result, tokens, PKCE verifier, AS discovery cache)
// into Postgres via mcp_servers table columns.
//
// Column mapping:
//   auth_config       -> OAuthTokens (access_token, refresh_token, ...)
//   oauth_client_info -> OAuthClientInformationFull (DCR result, written once)
//   oauth_state       -> StoredOAuthState:
//                        { codeVerifier?, redirectUrl?, authorizationServerUrl?,
//                          resourceMetadataUrl?, resourceMetadata?,
//                          authorizationServerMetadata? }
//
// The authorizationServerMetadata is the critical discovery cache -- without it
// every token refresh triggers a full RFC 9728 re-discovery (~8s timeout).
// With it, the SDK skips re-discovery on refresh flows.

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthTokens,
  OAuthProtectedResourceMetadata,
  AuthorizationServerMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// Shape persisted in the oauth_state column
interface StoredOAuthState {
  codeVerifier?: string
  redirectUrl?: string
  authorizationServerUrl?: string
  resourceMetadataUrl?: string
  resourceMetadata?: OAuthProtectedResourceMetadata
  authorizationServerMetadata?: AuthorizationServerMetadata
}

export class DrizzleOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly mcpServerId: string,
    private readonly orgId: string,
    public readonly redirectUrl: string,
  ) {}

  // -- clientMetadata (passed to DCR) -------------------------------------------

  get clientMetadata() {
    return {
      client_name: 'ShopMeta',
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none' as const,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }
  }

  // -- Internal DB helpers -------------------------------------------------------

  private async loadRow() {
    const db = getDb()
    const [row] = await db
      .select({
        authType: mcpServers.authType,
        authConfig: mcpServers.authConfig,
        oauthClientInfo: mcpServers.oauthClientInfo,
        oauthState: mcpServers.oauthState,
      })
      .from(mcpServers)
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
      .limit(1)
    return row ?? null
  }

  private async patchState(patch: Partial<StoredOAuthState>) {
    const row = await this.loadRow()
    const existing = (row?.oauthState ?? {}) as StoredOAuthState
    const merged = { ...existing, ...patch }
    const db = getDb()
    await db
      .update(mcpServers)
      .set({ oauthState: merged as Record<string, unknown> })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }

  private loadState(row: { oauthState: unknown } | null): StoredOAuthState {
    return (row?.oauthState ?? {}) as StoredOAuthState
  }

  // -- Token storage -------------------------------------------------------------

  async tokens(): Promise<OAuthTokens | undefined> {
    const row = await this.loadRow()
    if (!row) return undefined
    if (row.authType !== 'oauth') return undefined
    const cfg = row.authConfig as Record<string, unknown> | null
    if (!cfg || !cfg['access_token']) return undefined
    return cfg as unknown as OAuthTokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const db = getDb()
    await db
      .update(mcpServers)
      .set({
        authType: 'oauth',
        authConfig: tokens as unknown as Record<string, unknown>,
      })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }

  // -- Client registration (DCR) -------------------------------------------------

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const row = await this.loadRow()
    if (!row?.oauthClientInfo) return undefined
    return row.oauthClientInfo as unknown as OAuthClientInformationFull
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    const db = getDb()
    await db
      .update(mcpServers)
      .set({ oauthClientInfo: info as unknown as Record<string, unknown> })
      .where(and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId)))
  }

  // -- PKCE code verifier --------------------------------------------------------

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.patchState({ codeVerifier })
  }

  async codeVerifier(): Promise<string> {
    const row = await this.loadRow()
    const state = this.loadState(row)
    if (!state.codeVerifier) {
      throw new Error('[DrizzleOAuthProvider] codeVerifier not found in oauthState -- was saveCodeVerifier() called?')
    }
    return state.codeVerifier
  }

  // -- AS discovery state cache --------------------------------------------------
  // Caching the AS metadata avoids re-running RFC 9728 + RFC 8414 on every
  // token refresh (~8s timeout per discovery attempt against remote AS).

  async saveDiscoveryState(state: {
    authorizationServerUrl: string
    resourceMetadataUrl?: string
    resourceMetadata?: OAuthProtectedResourceMetadata
    authorizationServerMetadata?: AuthorizationServerMetadata
  }): Promise<void> {
    await this.patchState(state)
  }

  async discoveryState(): Promise<{
    authorizationServerUrl: string
    resourceMetadataUrl?: string
    resourceMetadata?: OAuthProtectedResourceMetadata
    authorizationServerMetadata?: AuthorizationServerMetadata
  } | undefined> {
    const row = await this.loadRow()
    const state = this.loadState(row)
    if (!state.authorizationServerUrl) return undefined
    return {
      authorizationServerUrl: state.authorizationServerUrl,
      resourceMetadataUrl: state.resourceMetadataUrl,
      resourceMetadata: state.resourceMetadata,
      authorizationServerMetadata: state.authorizationServerMetadata,
    }
  }

  // -- Credential invalidation ---------------------------------------------------
  // Called by the SDK on certain error conditions to force re-auth.
  //
  // scope:
  //   'tokens'   -> clear access/refresh tokens only (force re-auth, keep client)
  //   'client'   -> clear DCR result (force re-registration + re-auth)
  //   'verifier' -> clear PKCE codeVerifier only (stale exchange attempt)
  //   'all'      -> clear everything (full reset)

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier',
  ): Promise<void> {
    const db = getDb()
    const where = and(eq(mcpServers.id, this.mcpServerId), eq(mcpServers.orgId, this.orgId))

    if (scope === 'tokens') {
      await db.update(mcpServers).set({ authConfig: null }).where(where)
      return
    }

    if (scope === 'client') {
      await db.update(mcpServers).set({ oauthClientInfo: null }).where(where)
      return
    }

    if (scope === 'verifier') {
      const row = await this.loadRow()
      const existing = this.loadState(row)
      const { codeVerifier: _removed, ...rest } = existing
      await db
        .update(mcpServers)
        .set({ oauthState: rest as Record<string, unknown> })
        .where(where)
      return
    }

    // 'all' -> clear tokens + DCR client info
    await db
      .update(mcpServers)
      .set({ authConfig: null, oauthClientInfo: null })
      .where(where)
  }

  // -- Authorization redirect ----------------------------------------------------
  // Server-side no-op: the oauth-start route intercepts the URL before this
  // is called by overriding this method on the provider instance.
  // If this is called during the chat stream (refresh failure path), the
  // transport will throw UnauthorizedError which surfaces to the user as
  // "Please reconnect your MCP server".

  redirectToAuthorization(_url: URL): void {
    // Intentional no-op -- see comment above
  }
}