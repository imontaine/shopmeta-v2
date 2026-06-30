// tests/unit/mcp/oauth-provider.test.ts
// Unit tests for DrizzleOAuthProvider — implements OAuthClientProvider backed by Postgres.
//
// Strategy: mock the DB layer so we can test the provider logic without a real DB.
// Each test creates a fresh in-memory store simulating the mcp_servers row state.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AuthorizationServerMetadata } from '@modelcontextprotocol/sdk/shared/auth.js'

// ── Mock the DB module ─────────────────────────────────────────────────────────
// We simulate a single mcp_servers row with in-memory state.

type MockRow = {
  authType: string
  authConfig: Record<string, unknown> | null
  oauthClientInfo: Record<string, unknown> | null
  oauthState: Record<string, unknown> | null
}

let mockRow: MockRow

const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockDb = { select: mockSelect, update: mockUpdate }

vi.mock('#/lib/db/index', () => ({
  getDb: () => mockDb,
}))

vi.mock('#/lib/db/schema', () => ({
  mcpServers: { id: 'id', orgId: 'orgId', authType: 'authType', authConfig: 'authConfig', oauthClientInfo: 'oauthClientInfo', oauthState: 'oauthState' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  and: (...args: unknown[]) => ({ and: args }),
}))

// ── Setup mock chaining: db.select().from().where().limit() ────────────────────

function setupSelectMock() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([mockRow]),
  }
  mockSelect.mockReturnValue(chain)
  return chain
}

function setupUpdateMock() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  mockUpdate.mockReturnValue(chain)
  // Capture the set() call and apply to mockRow
  chain.set.mockImplementation((updates: Partial<MockRow>) => {
    Object.assign(mockRow, updates)
    return chain
  })
  return chain
}

// ── Import provider AFTER mocks are set ──────────────────────────────────────

const { DrizzleOAuthProvider } = await import('#/lib/mcp-oauth-provider')

const SERVER_ID = 'srv-123'
const ORG_ID = 'org-456'
const REDIRECT_URL = 'https://app.shopmeta.app/api/mcp/oauth-callback'

function makeProvider() {
  return new DrizzleOAuthProvider(SERVER_ID, ORG_ID, REDIRECT_URL)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DrizzleOAuthProvider — redirectUrl', () => {
  it('exposes the redirectUrl passed to constructor', () => {
    const p = makeProvider()
    expect(p.redirectUrl).toBe(REDIRECT_URL)
  })
})

describe('DrizzleOAuthProvider — clientMetadata', () => {
  it('includes the redirectUrl in redirect_uris', () => {
    const p = makeProvider()
    expect(p.clientMetadata.redirect_uris).toContain(REDIRECT_URL)
  })

  it('sets token_endpoint_auth_method to none (public client)', () => {
    const p = makeProvider()
    expect(p.clientMetadata.token_endpoint_auth_method).toBe('none')
  })

  it('includes authorization_code and refresh_token grant types', () => {
    const p = makeProvider()
    expect(p.clientMetadata.grant_types).toContain('authorization_code')
    expect(p.clientMetadata.grant_types).toContain('refresh_token')
  })
})

describe('DrizzleOAuthProvider — redirectToAuthorization', () => {
  it('is a no-op on the server (does not throw)', () => {
    const p = makeProvider()
    expect(() => p.redirectToAuthorization(new URL('https://auth.example.com/authorize?code_challenge=abc'))).not.toThrow()
  })
})

describe('DrizzleOAuthProvider — tokens()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
  })

  it('returns undefined when authConfig is null', async () => {
    setupSelectMock()
    const p = makeProvider()
    const result = await p.tokens()
    expect(result).toBeUndefined()
  })

  it('returns undefined when authType is apikey (not oauth)', async () => {
    mockRow = { authType: 'apikey', authConfig: { key: 'sk-123' }, oauthClientInfo: null, oauthState: null }
    setupSelectMock()
    const p = makeProvider()
    const result = await p.tokens()
    expect(result).toBeUndefined()
  })

  it('returns OAuthTokens when authType is oauth with tokens stored', async () => {
    const storedTokens: OAuthTokens = {
      access_token: 'tok-abc',
      token_type: 'bearer',
      refresh_token: 'ref-xyz',
      expires_in: 3600,
    }
    mockRow = { authType: 'oauth', authConfig: storedTokens as unknown as Record<string, unknown>, oauthClientInfo: null, oauthState: null }
    setupSelectMock()
    const p = makeProvider()
    const result = await p.tokens()
    expect(result).toMatchObject({
      access_token: 'tok-abc',
      token_type: 'bearer',
      refresh_token: 'ref-xyz',
    })
  })

  it('returns undefined when server row not found', async () => {
    // Simulate empty result set
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    }
    mockSelect.mockReturnValue(chain)
    const p = makeProvider()
    const result = await p.tokens()
    expect(result).toBeUndefined()
  })
})

describe('DrizzleOAuthProvider — saveTokens()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
    setupSelectMock()
    setupUpdateMock()
  })

  it('persists tokens to authConfig and sets authType to oauth', async () => {
    const tokens: OAuthTokens = {
      access_token: 'new-tok',
      token_type: 'bearer',
      refresh_token: 'new-ref',
    }
    const p = makeProvider()
    await p.saveTokens(tokens)
    expect(mockRow.authConfig).toMatchObject({ access_token: 'new-tok', token_type: 'bearer' })
    expect(mockRow.authType).toBe('oauth')
  })

  it('overwrites existing tokens on re-auth', async () => {
    const p = makeProvider()
    await p.saveTokens({ access_token: 'first', token_type: 'bearer' })
    await p.saveTokens({ access_token: 'second', token_type: 'bearer' })
    expect(mockRow.authConfig).toMatchObject({ access_token: 'second' })
  })
})

describe('DrizzleOAuthProvider — clientInformation()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
  })

  it('returns undefined when oauthClientInfo is null', async () => {
    setupSelectMock()
    const p = makeProvider()
    const result = await p.clientInformation()
    expect(result).toBeUndefined()
  })

  it('returns stored client info after save', async () => {
    const clientInfo: OAuthClientInformationFull = {
      client_id: 'dynamic-client-123',
      redirect_uris: [REDIRECT_URL],
    }
    mockRow = { ...mockRow, oauthClientInfo: clientInfo as unknown as Record<string, unknown> }
    setupSelectMock()
    const p = makeProvider()
    const result = await p.clientInformation()
    expect(result).toMatchObject({ client_id: 'dynamic-client-123' })
  })
})

describe('DrizzleOAuthProvider — saveClientInformation()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
    setupSelectMock()
    setupUpdateMock()
  })

  it('writes DCR result to oauthClientInfo column', async () => {
    const info: OAuthClientInformationFull = {
      client_id: 'dcr-abc',
      redirect_uris: [REDIRECT_URL],
    }
    const p = makeProvider()
    await p.saveClientInformation(info)
    expect(mockRow.oauthClientInfo).toMatchObject({ client_id: 'dcr-abc' })
  })
})

describe('DrizzleOAuthProvider — saveCodeVerifier() / codeVerifier()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
  })

  it('round-trips codeVerifier through oauthState', async () => {
    setupSelectMock()
    setupUpdateMock()
    const p = makeProvider()
    await p.saveCodeVerifier('verifier-abc123')

    // After save, the mock row is updated — now simulate reading it back
    expect(mockRow.oauthState).toMatchObject({ codeVerifier: 'verifier-abc123' })

    const result = await p.codeVerifier()
    expect(result).toBe('verifier-abc123')
  })

  it('preserves existing oauthState fields when saving codeVerifier', async () => {
    mockRow.oauthState = { authorizationServerUrl: 'https://auth.example.com' }
    setupSelectMock()
    setupUpdateMock()
    const p = makeProvider()
    await p.saveCodeVerifier('v-xyz')
    expect(mockRow.oauthState).toMatchObject({
      authorizationServerUrl: 'https://auth.example.com',
      codeVerifier: 'v-xyz',
    })
  })

  it('throws when codeVerifier is not stored', async () => {
    mockRow.oauthState = {} // no codeVerifier
    setupSelectMock()
    const p = makeProvider()
    await expect(p.codeVerifier()).rejects.toThrow(/code.?verifier/i)
  })

  it('throws when oauthState is null', async () => {
    mockRow.oauthState = null
    setupSelectMock()
    const p = makeProvider()
    await expect(p.codeVerifier()).rejects.toThrow(/code.?verifier/i)
  })
})

describe('DrizzleOAuthProvider — saveDiscoveryState() / discoveryState()', () => {
  beforeEach(() => {
    mockRow = { authType: 'none', authConfig: null, oauthClientInfo: null, oauthState: null }
  })

  it('returns undefined when oauthState has no authorizationServerUrl', async () => {
    mockRow.oauthState = { codeVerifier: 'v-abc' } // no AS URL
    setupSelectMock()
    const p = makeProvider()
    const result = await p.discoveryState()
    expect(result).toBeUndefined()
  })

  it('returns undefined when oauthState is null', async () => {
    setupSelectMock()
    const p = makeProvider()
    const result = await p.discoveryState()
    expect(result).toBeUndefined()
  })

  it('round-trips discovery state through oauthState', async () => {
    const asMeta: Partial<AuthorizationServerMetadata> = {
      issuer: 'https://auth.clickhouse.cloud',
      authorization_endpoint: 'https://auth.clickhouse.cloud/authorize',
      token_endpoint: 'https://auth.clickhouse.cloud/token',
    }
    setupSelectMock()
    setupUpdateMock()

    const p = makeProvider()
    await p.saveDiscoveryState({
      authorizationServerUrl: 'https://auth.clickhouse.cloud',
      authorizationServerMetadata: asMeta as AuthorizationServerMetadata,
    })

    expect(mockRow.oauthState).toMatchObject({
      authorizationServerUrl: 'https://auth.clickhouse.cloud',
      authorizationServerMetadata: { issuer: 'https://auth.clickhouse.cloud' },
    })

    const result = await p.discoveryState()
    expect(result).toMatchObject({ authorizationServerUrl: 'https://auth.clickhouse.cloud' })
    expect((result?.authorizationServerMetadata as typeof asMeta)?.issuer).toBe('https://auth.clickhouse.cloud')
  })

  it('preserves existing oauthState fields (e.g. codeVerifier) when saving discovery state', async () => {
    mockRow.oauthState = { codeVerifier: 'keep-me' }
    setupSelectMock()
    setupUpdateMock()

    const p = makeProvider()
    await p.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example.com' })

    expect(mockRow.oauthState).toMatchObject({
      codeVerifier: 'keep-me',
      authorizationServerUrl: 'https://auth.example.com',
    })
  })
})

describe('DrizzleOAuthProvider — invalidateCredentials()', () => {
  beforeEach(() => {
    mockRow = {
      authType: 'oauth',
      authConfig: { access_token: 'old-tok', token_type: 'bearer' },
      oauthClientInfo: { client_id: 'dcr-abc' },
      oauthState: { authorizationServerUrl: 'https://auth.example.com', codeVerifier: 'v' },
    }
    setupSelectMock()
    setupUpdateMock()
  })

  it('nulls authConfig when scope is "tokens"', async () => {
    const p = makeProvider()
    await p.invalidateCredentials('tokens')
    expect(mockRow.authConfig).toBeNull()
    // client info should remain
    expect(mockRow.oauthClientInfo).toMatchObject({ client_id: 'dcr-abc' })
  })

  it('nulls authConfig and oauthClientInfo when scope is "all"', async () => {
    const p = makeProvider()
    await p.invalidateCredentials('all')
    expect(mockRow.authConfig).toBeNull()
    expect(mockRow.oauthClientInfo).toBeNull()
  })

  it('nulls authConfig when scope is "client" (forces re-DCR)', async () => {
    const p = makeProvider()
    await p.invalidateCredentials('client')
    expect(mockRow.oauthClientInfo).toBeNull()
  })

  it('clears codeVerifier when scope is "verifier"', async () => {
    const p = makeProvider()
    await p.invalidateCredentials('verifier')
    const remaining = mockRow.oauthState as Record<string, unknown>
    expect(remaining['codeVerifier']).toBeUndefined()
    // AS discovery cache should remain
    expect(remaining['authorizationServerUrl']).toBe('https://auth.example.com')
  })
})
