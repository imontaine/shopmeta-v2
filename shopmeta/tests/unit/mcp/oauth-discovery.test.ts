// tests/unit/mcp/oauth-discovery.test.ts
//
// WHY THIS TEST SUITE EXISTS
// --------------------------
// The MCP OAuth flow is a 5-step chain of HTTP calls:
//   1. Probe MCP URL ? 401 WWW-Authenticate (RFC 9728)
//   2. Fetch resource metadata ? authorization_servers list
//   3. Fetch AS metadata ? endpoints + DCR support
//   4. POST /register ? dynamic client_id (RFC 7591)
//   5. POST /token ? access_token + refresh_token (PKCE exchange)
//
// Auto-refresh adds a 6th step:
//   6. POST /token grant_type=refresh_token ? new access_token
//
// Every one of these steps has failure modes. This suite exercises them
// all without network calls by mocking globalThis.fetch.
//
// The functions under test are extracted/inlined from src/lib/mcp-oauth.ts
// because TanStack Start server functions cannot be called in a Node test env.
// We test the LOGIC, not the createServerFn wrapper.

import { describe, test, expect, vi, afterEach } from 'vitest'

// --- Types --------------------------------------------------------------------

interface OAuthDiscoveryResult {
  authorizationEndpoint: string
  tokenEndpoint: string
  clientId: string
  resourceMetadataUrl: string
  supportsDcr: boolean
}

interface StoredOAuthConfig {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType: string
  issuedAt: number
  tokenEndpoint?: string
  clientId?: string
}

// --- Extracted logic under test -----------------------------------------------
//
// These functions mirror the core HTTP logic from mcp-oauth.ts.
// We don't import the real module because createServerFn() requires a
// TanStack Start runtime unavailable in vitest.

async function discoverMcpOAuthLogic(
  url: string,
  redirectUri: string,
  clientName: string,
): Promise<OAuthDiscoveryResult> {
  // Step 1: Probe ? expect 401 + WWW-Authenticate
  const probe = await fetch(url, { method: 'GET' })
  if (probe.status !== 401) {
    throw new Error(`Expected 401 from MCP server, got ${probe.status}`)
  }

  const wwwAuth = probe.headers.get('WWW-Authenticate') ?? ''
  const rmMatch = wwwAuth.match(/resource_metadata="?([^",\s]+)"?/)
  if (!rmMatch?.[1]) {
    throw new Error(`No resource_metadata in WWW-Authenticate: ${wwwAuth}`)
  }
  const resourceMetadataUrl = rmMatch[1]

  // Step 2: Protected Resource Metadata (RFC 9728)
  const rmRes = await fetch(resourceMetadataUrl)
  if (!rmRes.ok) throw new Error(`Resource metadata fetch failed: ${rmRes.status}`)
  const rm = (await rmRes.json()) as { authorization_servers?: string[] }
  const authServer = rm.authorization_servers?.[0]
  if (!authServer) throw new Error('No authorization_servers in resource metadata')

  // Step 3: Authorization Server Metadata (RFC 8414)
  const asMeta = await fetch(`${authServer}/.well-known/oauth-authorization-server`)
  if (!asMeta.ok) throw new Error(`AS metadata fetch failed: ${asMeta.status}`)
  const as = (await asMeta.json()) as {
    authorization_endpoint?: string
    token_endpoint?: string
    registration_endpoint?: string
  }
  if (!as.authorization_endpoint || !as.token_endpoint) {
    throw new Error('AS metadata missing required endpoints')
  }

  // Step 4: Dynamic Client Registration (RFC 7591) — optional
  let clientId = ''
  let supportsDcr = false

  if (as.registration_endpoint) {
    const regRes = await fetch(as.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      }),
    })
    if (regRes.ok) {
      const reg = (await regRes.json()) as { client_id?: string }
      clientId = reg.client_id ?? ''
      supportsDcr = true
    }
  }

  return {
    authorizationEndpoint: as.authorization_endpoint,
    tokenEndpoint: as.token_endpoint,
    clientId,
    resourceMetadataUrl,
    supportsDcr,
  }
}

async function resolveOAuthTokenLogic(
  cfg: StoredOAuthConfig,
  bufferMs = 60_000,
): Promise<{ token: string; refreshed: boolean; newConfig?: Partial<StoredOAuthConfig> }> {
  const expiresIn = cfg.expiresIn ?? 3600
  const expiresAt = cfg.issuedAt + expiresIn * 1000
  const isExpired = expiresAt - Date.now() < bufferMs

  if (!isExpired) return { token: cfg.accessToken, refreshed: false }

  if (!cfg.refreshToken) {
    throw new Error('Token expired and no refresh_token available. Re-authenticate.')
  }
  if (!cfg.tokenEndpoint) {
    throw new Error('Token expired and tokenEndpoint not stored. Re-authenticate.')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.refreshToken,
    ...(cfg.clientId ? { client_id: cfg.clientId } : {}),
  })

  const res = await fetch(cfg.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '(unreadable)')
    throw new Error(`Token refresh failed (${res.status}): ${err}`)
  }

  const refreshed = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }

  if (!refreshed.access_token) {
    throw new Error('Refresh response missing access_token')
  }

  const newConfig: Partial<StoredOAuthConfig> = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? cfg.refreshToken,
    expiresIn: refreshed.expires_in ?? cfg.expiresIn,
    tokenType: refreshed.token_type ?? cfg.tokenType,
    issuedAt: Date.now(),
  }

  return { token: refreshed.access_token, refreshed: true, newConfig }
}

// --- Test helpers -------------------------------------------------------------

function makeFetch(
  responses: Array<{ url: string | RegExp; status?: number; ok?: boolean; body?: unknown; headers?: Record<string, string> }>,
) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const match = responses.find((r) =>
      typeof r.url === 'string' ? r.url === url : r.url.test(url),
    )
    if (!match) throw new Error(`Unmocked fetch to: ${url}`)
    const status = match.status ?? 200
    const ok = match.ok ?? (status >= 200 && status < 300)
    return {
      status,
      ok,
      headers: new Headers(match.headers ?? {}),
      json: async () => match.body,
      text: async () => (match.body ? JSON.stringify(match.body) : ''),
    } as Response
  })
}

function freshConfig(overrides: Partial<StoredOAuthConfig> = {}): StoredOAuthConfig {
  return {
    accessToken: 'fresh-access-token',
    refreshToken: 'the-refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    issuedAt: Date.now() - 60_000, // 59 minutes remaining
    tokenEndpoint: 'https://mcp.example.com/token',
    clientId: 'client-123',
    ...overrides,
  }
}

function expiredConfig(overrides: Partial<StoredOAuthConfig> = {}): StoredOAuthConfig {
  return {
    accessToken: 'expired-access-token',
    refreshToken: 'the-refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    issuedAt: Date.now() - 2 * 3600 * 1000, // issued 2h ago
    tokenEndpoint: 'https://mcp.example.com/token',
    clientId: 'client-123',
    ...overrides,
  }
}

// --- Discovery tests ----------------------------------------------------------

describe('MCP OAuth Discovery chain (RFC 9728 ? 8414 ? 7591)', () => {
  afterEach(() => vi.restoreAllMocks())

  test('full happy path: discovers all endpoints + DCR client_id', async () => {
    vi.stubGlobal('fetch', makeFetch([
      {
        url: 'https://mcp.example.com/mcp',
        status: 401, ok: false,
        headers: { 'WWW-Authenticate': 'Bearer realm="OAuth", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"' },
      },
      {
        url: 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        body: { resource: 'https://mcp.example.com/mcp', authorization_servers: ['https://mcp.example.com'] },
      },
      {
        url: 'https://mcp.example.com/.well-known/oauth-authorization-server',
        body: {
          authorization_endpoint: 'https://mcp.example.com/authorize',
          token_endpoint: 'https://mcp.example.com/token',
          registration_endpoint: 'https://mcp.example.com/register',
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        },
      },
      {
        url: 'https://mcp.example.com/register',
        status: 201,
        body: { client_id: 'dyn-uuid-1234', client_name: 'ShopMeta' },
      },
    ]))

    const result = await discoverMcpOAuthLogic(
      'https://mcp.example.com/mcp',
      'https://app.shopmeta.app/api/mcp/oauth-callback',
      'ShopMeta',
    )

    expect(result.authorizationEndpoint).toBe('https://mcp.example.com/authorize')
    expect(result.tokenEndpoint).toBe('https://mcp.example.com/token')
    expect(result.clientId).toBe('dyn-uuid-1234')
    expect(result.supportsDcr).toBe(true)
    expect(result.resourceMetadataUrl).toContain('.well-known')
  })

  test('reproduces ClickHouse Cloud exact header format', async () => {
    // This is the ACTUAL format returned by https://mcp.clickhouse.cloud/mcp
    vi.stubGlobal('fetch', makeFetch([
      {
        url: 'https://mcp.clickhouse.cloud/mcp',
        status: 401, ok: false,
        headers: { 'WWW-Authenticate': 'Bearer realm="OAuth", resource_metadata="https://mcp.clickhouse.cloud/.well-known/oauth-protected-resource/mcp"' },
      },
      {
        url: 'https://mcp.clickhouse.cloud/.well-known/oauth-protected-resource/mcp',
        body: {
          resource: 'https://mcp.clickhouse.cloud/mcp',
          authorization_servers: ['https://mcp.clickhouse.cloud'],
          scopes_supported: ['mcp:access', 'openid', 'profile', 'email'],
          bearer_methods_supported: ['header'],
        },
      },
      {
        url: 'https://mcp.clickhouse.cloud/.well-known/oauth-authorization-server',
        body: {
          issuer: 'https://mcp.clickhouse.cloud',
          authorization_endpoint: 'https://mcp.clickhouse.cloud/authorize',
          token_endpoint: 'https://mcp.clickhouse.cloud/token',
          registration_endpoint: 'https://mcp.clickhouse.cloud/register',
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          scopes_supported: ['mcp:access', 'clickstack:access', 'openid', 'profile', 'email'],
        },
      },
      {
        url: 'https://mcp.clickhouse.cloud/register',
        status: 201,
        body: { client_id: 'a53b3c66-e47e-405d-8a73-3ccad9e282f3' },
      },
    ]))

    const result = await discoverMcpOAuthLogic(
      'https://mcp.clickhouse.cloud/mcp',
      'https://app.shopmeta.app/api/mcp/oauth-callback',
      'ShopMeta',
    )

    expect(result.authorizationEndpoint).toBe('https://mcp.clickhouse.cloud/authorize')
    expect(result.tokenEndpoint).toBe('https://mcp.clickhouse.cloud/token')
    expect(result.clientId).toBeTruthy()
    expect(result.supportsDcr).toBe(true)
  })

  test('DCR not supported: returns empty clientId, supportsDcr = false', async () => {
    vi.stubGlobal('fetch', makeFetch([
      {
        url: 'https://mcp.example.com/mcp',
        status: 401, ok: false,
        headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/rm"' },
      },
      {
        url: 'https://mcp.example.com/.well-known/rm',
        body: { authorization_servers: ['https://auth.example.com'] },
      },
      {
        url: 'https://auth.example.com/.well-known/oauth-authorization-server',
        body: {
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          // No registration_endpoint
        },
      },
    ]))

    const result = await discoverMcpOAuthLogic(
      'https://mcp.example.com/mcp',
      'https://app.shopmeta.app/api/mcp/oauth-callback',
      'ShopMeta',
    )

    expect(result.authorizationEndpoint).toBe('https://auth.example.com/authorize')
    expect(result.clientId).toBe('')
    expect(result.supportsDcr).toBe(false)
  })

  test('throws when MCP server returns 200 (not OAuth-protected)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, headers: new Headers() } as Response)))
    await expect(
      discoverMcpOAuthLogic('https://mcp.example.com/mcp', 'https://app.shopmeta.app/api/mcp/oauth-callback', 'ShopMeta'),
    ).rejects.toThrow('Expected 401')
  })

  test('throws when WWW-Authenticate has no resource_metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 401, ok: false, headers: new Headers({ 'WWW-Authenticate': 'Bearer realm="API"' }),
    } as Response)))
    await expect(
      discoverMcpOAuthLogic('https://mcp.example.com/mcp', 'https://app.shopmeta.app/api/mcp/oauth-callback', 'ShopMeta'),
    ).rejects.toThrow('No resource_metadata')
  })

  test('throws when resource metadata has no authorization_servers', async () => {
    vi.stubGlobal('fetch', makeFetch([
      { url: 'https://mcp.example.com/mcp', status: 401, ok: false, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/rm"' } },
      { url: 'https://mcp.example.com/.well-known/rm', body: { resource: 'https://mcp.example.com/mcp' } },
    ]))
    await expect(
      discoverMcpOAuthLogic('https://mcp.example.com/mcp', 'https://app.shopmeta.app/api/mcp/oauth-callback', 'ShopMeta'),
    ).rejects.toThrow('No authorization_servers')
  })

  test('throws when AS metadata is missing authorization_endpoint', async () => {
    vi.stubGlobal('fetch', makeFetch([
      { url: 'https://mcp.example.com/mcp', status: 401, ok: false, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/rm"' } },
      { url: 'https://mcp.example.com/.well-known/rm', body: { authorization_servers: ['https://auth.example.com'] } },
      { url: 'https://auth.example.com/.well-known/oauth-authorization-server', body: { issuer: 'https://auth.example.com' } },
    ]))
    await expect(
      discoverMcpOAuthLogic('https://mcp.example.com/mcp', 'https://app.shopmeta.app/api/mcp/oauth-callback', 'ShopMeta'),
    ).rejects.toThrow('missing required endpoints')
  })
})

// --- Token refresh tests ------------------------------------------------------

describe('OAuth token auto-refresh logic', () => {
  afterEach(() => vi.restoreAllMocks())

  test('returns token as-is when still valid (no fetch called)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { token, refreshed } = await resolveOAuthTokenLogic(freshConfig())
    expect(token).toBe('fresh-access-token')
    expect(refreshed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('expired token is refreshed, new token returned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'Bearer' }),
      text: async () => '',
    } as Response)))

    const { token, refreshed, newConfig } = await resolveOAuthTokenLogic(expiredConfig())
    expect(refreshed).toBe(true)
    expect(token).toBe('new-access')
    expect(newConfig?.accessToken).toBe('new-access')
    expect(newConfig?.issuedAt).toBeGreaterThan(0)
  })

  test('sends correct form body: grant_type, refresh_token, client_id', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }), text: async () => '' } as Response
    }))

    await resolveOAuthTokenLogic(expiredConfig({ refreshToken: 'rt-xyz', clientId: 'cl-abc' }))

    const params = new URLSearchParams(capturedBody)
    expect(params.get('grant_type')).toBe('refresh_token')
    expect(params.get('refresh_token')).toBe('rt-xyz')
    expect(params.get('client_id')).toBe('cl-abc')
  })

  test('omits client_id for public clients (no clientId stored)', async () => {
    let capturedBody = ''
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }), text: async () => '' } as Response
    }))

    await resolveOAuthTokenLogic(expiredConfig({ clientId: undefined }))
    expect(new URLSearchParams(capturedBody).has('client_id')).toBe(false)
  })

  test('handles refresh_token rotation: new refresh_token is stored', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: 'new-access', refresh_token: 'rotated-rt', expires_in: 3600, token_type: 'Bearer' }),
      text: async () => '',
    } as Response)))

    const { newConfig } = await resolveOAuthTokenLogic(expiredConfig({ refreshToken: 'old-rt' }))
    expect(newConfig?.refreshToken).toBe('rotated-rt')
  })

  test('no rotation: preserves original refresh_token when server omits new one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' }), // no refresh_token
      text: async () => '',
    } as Response)))

    const { newConfig } = await resolveOAuthTokenLogic(expiredConfig({ refreshToken: 'original-rt' }))
    expect(newConfig?.refreshToken).toBe('original-rt')
  })

  test('throws when expired with no refresh_token', async () => {
    await expect(resolveOAuthTokenLogic(expiredConfig({ refreshToken: undefined }))).rejects.toThrow('no refresh_token')
  })

  test('throws when expired with no tokenEndpoint', async () => {
    await expect(resolveOAuthTokenLogic(expiredConfig({ tokenEndpoint: undefined }))).rejects.toThrow('tokenEndpoint not stored')
  })

  test('throws on 401 from token endpoint (revoked token)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid_grant' } as Response)))
    await expect(resolveOAuthTokenLogic(expiredConfig())).rejects.toThrow('Token refresh failed (401)')
  })

  test('throws on 400 from token endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, text: async () => 'invalid_request' } as Response)))
    await expect(resolveOAuthTokenLogic(expiredConfig())).rejects.toThrow('Token refresh failed (400)')
  })

  test('throws when refresh response has no access_token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ token_type: 'Bearer' }), text: async () => '',
    } as Response)))
    await expect(resolveOAuthTokenLogic(expiredConfig())).rejects.toThrow('missing access_token')
  })
})

// --- Auth header building tests -----------------------------------------------

describe('Auth header building (mcpRowToServerConfig logic)', () => {
  function buildHeaders(authType: string, authConfig: Record<string, unknown> | null) {
    const headers: Record<string, string> = {}
    if (authType === 'apikey') {
      const cfg = authConfig as { key?: string; headerFormat?: string; customHeader?: string } | null
      if (cfg?.key) {
        if (cfg.headerFormat === 'basic') headers['Authorization'] = `Basic ${cfg.key}`
        else if (cfg.headerFormat === 'custom' && cfg.customHeader) headers[cfg.customHeader] = cfg.key
        else headers['Authorization'] = `Bearer ${cfg.key}`
      }
    }
    return headers
  }

  test('none auth type ? no headers', () => {
    expect(buildHeaders('none', null)).toEqual({})
  })

  test('apikey bearer ? Authorization: Bearer <key>', () => {
    expect(buildHeaders('apikey', { key: 'sk-abc', headerFormat: 'bearer' })['Authorization']).toBe('Bearer sk-abc')
  })

  test('apikey basic ? Authorization: Basic <key>', () => {
    expect(buildHeaders('apikey', { key: 'b64key', headerFormat: 'basic' })['Authorization']).toBe('Basic b64key')
  })

  test('apikey custom header ? named header, no Authorization', () => {
    const headers = buildHeaders('apikey', { key: 'tok', headerFormat: 'custom', customHeader: 'X-API-Token' })
    expect(headers['X-API-Token']).toBe('tok')
    expect(headers['Authorization']).toBeUndefined()
  })

  test('apikey with no key ? no headers', () => {
    expect(buildHeaders('apikey', { headerFormat: 'bearer' })).toEqual({})
  })

  test('apikey defaults to Bearer when headerFormat is unset', () => {
    expect(buildHeaders('apikey', { key: 'sk-default' })['Authorization']).toBe('Bearer sk-default')
  })
})

// --- WWW-Authenticate regex tests ---------------------------------------------

describe('WWW-Authenticate header parsing', () => {
  function parse(header: string): string | null {
    return header.match(/resource_metadata="?([^",\s]+)"?/)?.[1] ?? null
  }

  test('ClickHouse exact format: realm + quoted resource_metadata', () => {
    expect(parse('Bearer realm="OAuth", resource_metadata="https://mcp.clickhouse.cloud/.well-known/oauth-protected-resource/mcp"'))
      .toBe('https://mcp.clickhouse.cloud/.well-known/oauth-protected-resource/mcp')
  })

  test('minimal: unquoted resource_metadata', () => {
    expect(parse('Bearer resource_metadata=https://example.com/.well-known/rm'))
      .toBe('https://example.com/.well-known/rm')
  })

  test('quoted resource_metadata without realm', () => {
    expect(parse('Bearer resource_metadata="https://example.com/.well-known/rm"'))
      .toBe('https://example.com/.well-known/rm')
  })

  test('no resource_metadata ? null', () => {
    expect(parse('Bearer realm="API"')).toBeNull()
  })

  test('empty header ? null', () => {
    expect(parse('')).toBeNull()
  })

  test('deep path in resource_metadata', () => {
    expect(parse('Bearer resource_metadata="https://auth.example.com/.well-known/oauth-protected-resource/v1/mcp"'))
      .toBe('https://auth.example.com/.well-known/oauth-protected-resource/v1/mcp')
  })
})
