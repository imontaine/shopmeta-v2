// src/components/mcp/McpServersPage.tsx
// MCP Servers catalog page — conforms to the /settings design system.
//
// Structure mirrors ConnectionsSettings:
//   settings-page > settings-header + settings-layout > settings-tabs + settings-content > mcp-settings
//
// CSS prefix: mcp-* — but all structural/token patterns borrowed from conn-* / settings-*
// so the visual result is identical to /settings.

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listMcpServers,
  createMcpServer,
  deleteMcpServer,
  updateMcpServer,
} from '#/lib/mcp-servers'
import type { McpServerRow } from '#/lib/mcp-servers'
import { discoverMcpOAuth } from '#/lib/mcp-oauth'
import type { McpOAuthDiscovery } from '#/lib/mcp-oauth'

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

let toastId = 0

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const add = (type: Toast['type'], message: string) => {
    const id = ++toastId
    setToasts((p) => [...p, { id, type, message }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000)
  }
  return { toasts, add }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type AuthType = 'none' | 'apikey' | 'oauth'
type Transport = 'streamable-http' | 'sse'
type HeaderFormat = 'bearer' | 'basic' | 'custom'

interface FormState {
  name: string
  serverName: string
  description: string
  url: string
  transport: Transport
  iconUrl: string
  authType: AuthType
  // API Key
  apiKey: string
  headerFormat: HeaderFormat
  customHeader: string
  // OAuth
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  scope: string
  // Trust
  trusted: boolean
}

const emptyForm: FormState = {
  name: '',
  serverName: '',
  description: '',
  url: '',
  transport: 'streamable-http',
  iconUrl: '',
  authType: 'none',
  apiKey: '',
  headerFormat: 'bearer',
  customHeader: '',
  clientId: '',
  clientSecret: '',
  authUrl: '',
  tokenUrl: '',
  scope: '',
  trusted: false,
}

function formToPayload(f: FormState) {
  let authConfig: Record<string, unknown> | undefined
  if (f.authType === 'apikey') {
    authConfig = {
      key: f.apiKey,
      headerFormat: f.headerFormat,
      ...(f.headerFormat === 'custom' ? { customHeader: f.customHeader } : {}),
    }
  } else if (f.authType === 'oauth') {
    authConfig = {
      clientId: f.clientId,
      clientSecret: f.clientSecret || undefined,
      authUrl: f.authUrl || undefined,
      tokenUrl: f.tokenUrl || undefined,
      scope: f.scope || undefined,
    }
  }
  return {
    name: f.name.trim(),
    serverName: f.serverName.trim(),
    description: f.description.trim() || undefined,
    url: f.url.trim(),
    transport: f.transport,
    iconUrl: f.iconUrl.trim() || undefined,
    authType: f.authType,
    authConfig,
    trusted: f.trusted,
  }
}

function rowToForm(r: McpServerRow): FormState {
  const cfg = r.authConfig ?? {}
  return {
    name: r.name,
    serverName: r.serverName,
    description: r.description ?? '',
    url: r.url,
    transport: (r.transport as Transport) ?? 'streamable-http',
    iconUrl: r.iconUrl ?? '',
    authType: (r.authType as AuthType) ?? 'none',
    apiKey: (cfg['key'] as string) ?? '',
    headerFormat: ((cfg['headerFormat'] as HeaderFormat) ?? 'bearer'),
    customHeader: (cfg['customHeader'] as string) ?? '',
    clientId: (cfg['clientId'] as string) ?? '',
    clientSecret: (cfg['clientSecret'] as string) ?? '',
    authUrl: (cfg['authUrl'] as string) ?? '',
    tokenUrl: (cfg['tokenUrl'] as string) ?? '',
    scope: (cfg['scope'] as string) ?? '',
    trusted: r.trusted,
  }
}

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.name.trim()) e['name'] = 'Name is required'
  if (!f.url.trim()) {
    e['url'] = 'MCP Server URL is required'
  } else {
    try { new URL(f.url) } catch { e['url'] = 'Must be a valid URL' }
  }
  if (!f.trusted) e['trusted'] = 'You must confirm you trust this application'
  if (f.authType === 'apikey' && !f.apiKey.trim()) e['apiKey'] = 'API Key is required'
  // OAuth: clientId only required if the user filled in manual fields (not auto-discovery)
  if (f.authType === 'oauth' && !f.clientId.trim() && (f.authUrl.trim() || f.tokenUrl.trim())) {
    e['clientId'] = 'Client ID is required when manually specifying OAuth endpoints'
  }
  if (f.authType === 'apikey' && f.headerFormat === 'custom' && !f.customHeader.trim()) {
    e['customHeader'] = 'Custom header name is required'
  }
  return e
}

// ─── MCP Server Form ───────────────────────────────────────────────────────────

interface McpFormProps {
  initial?: FormState
  title: string
  onSubmit: (f: FormState) => Promise<unknown>
  onCancel: () => void
  submitLabel: string
  isSubmitting: boolean
}

function McpServerForm({ initial = emptyForm, title, onSubmit, onCancel, submitLabel, isSubmitting }: McpFormProps) {
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [iconError, setIconError] = useState<string | null>(null)
  const [iconMode, setIconMode] = useState<'upload' | 'url'>('upload')
  const nameRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // OAuth discovery state
  const [oauthDiscovering, setOauthDiscovering] = useState(false)
  const [oauthDiscovered, setOauthDiscovered] = useState<McpOAuthDiscovery | null>(null)
  const [oauthDiscoverError, setOauthDiscoverError] = useState<string | null>(null)
  const [oauthConnecting, setOauthConnecting] = useState(false)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val }))

  // Generate PKCE code verifier + challenge (browser-side, no dependency needed)
  async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const verifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const encoded = new TextEncoder().encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    return { verifier, challenge }
  }

  // Step 1: probe the MCP URL, discover OAuth metadata
  async function handleDiscoverOAuth() {
    const urlVal = form.url.trim()
    if (!urlVal) { setErrors({ url: 'Enter the MCP Server URL first' }); return }
    try { new URL(urlVal) } catch { setErrors({ url: 'Must be a valid URL' }); return }
    setErrors({})
    setOauthDiscovering(true)
    setOauthDiscovered(null)
    setOauthDiscoverError(null)
    try {
      const discovery = await discoverMcpOAuth({ data: { url: urlVal } })
      setOauthDiscovered(discovery)
    } catch (err) {
      setOauthDiscoverError(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setOauthDiscovering(false)
    }
  }

  // Step 2: save the server record, then redirect to OAuth authorization page
  async function handleConnectOAuth() {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs['name'] = 'Name is required'
    if (!form.trusted) errs['trusted'] = 'You must confirm you trust this application'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    if (!oauthDiscovered) return
    setOauthConnecting(true)
    setErrors({})
    try {
      // Save the server with authType=oauth (no token yet — token comes after callback)
      const saved = await onSubmit({
        ...form,
        authType: 'oauth',
        clientId: oauthDiscovered.clientId,
        authUrl: oauthDiscovered.authorizationEndpoint,
        tokenUrl: oauthDiscovered.tokenEndpoint,
      }) as McpServerRow

      if (!saved?.id) throw new Error('Failed to save MCP server')

      // Generate PKCE
      const { verifier, challenge } = await generatePkce()

      // Build the callback URL
      const redirectUri = `${window.location.origin}/api/mcp/oauth-callback`

      // Encode state (base64url)
      const stateObj = {
        mcpServerId: saved.id,
        codeVerifier: verifier,
        tokenEndpoint: oauthDiscovered.tokenEndpoint,
        clientId: oauthDiscovered.clientId,
        redirectUri,
      }
      const state = btoa(JSON.stringify(stateObj))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      // Build authorization URL
      const authUrl = new URL(oauthDiscovered.authorizationEndpoint)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', oauthDiscovered.clientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', challenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      if (form.scope) authUrl.searchParams.set('scope', form.scope)

      // Redirect to authorization server
      window.location.href = authUrl.toString()
    } catch (err) {
      setOauthDiscoverError(err instanceof Error ? err.message : 'Connection failed')
      setOauthConnecting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    await onSubmit(form)
  }

  return (
    <div className="conn-form-wrapper" data-testid="mcp-server-form">
      <h3 className="conn-form-title">{title}</h3>
      <form className="conn-form" onSubmit={handleSubmit} noValidate>

        {/* Icon — Upload or URL */}
        <div className="conn-field">
          <div className="mcp-icon-field-header">
            <label className="conn-label">
              Icon <span className="mcp-label-optional">(optional — minimum 128 x 128 px)</span>
            </label>
            <div className="mcp-icon-mode-tabs">
              <button
                type="button"
                className={`mcp-icon-mode-tab${iconMode === 'upload' ? ' mcp-icon-mode-tab--active' : ''}`}
                onClick={() => setIconMode('upload')}
              >
                Upload
              </button>
              <button
                type="button"
                className={`mcp-icon-mode-tab${iconMode === 'url' ? ' mcp-icon-mode-tab--active' : ''}`}
                onClick={() => setIconMode('url')}
              >
                URL
              </button>
            </div>
          </div>

          <div className="mcp-icon-upload-row">
            {/* Preview */}
            <button
              type="button"
              className="mcp-icon-thumb mcp-icon-thumb--clickable"
              onClick={() => iconMode === 'upload' && fileRef.current?.click()}
              title={iconMode === 'upload' ? 'Click to upload icon' : undefined}
              aria-label={form.iconUrl ? 'Icon preview — click to change' : 'Click to upload icon'}
              disabled={isSubmitting}
            >
              {form.iconUrl ? (
                <img src={form.iconUrl} alt="Icon preview" className="mcp-icon-thumb-img" />
              ) : (
                <span className="mcp-icon-thumb-placeholder">
                  {iconMode === 'upload' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  )}
                </span>
              )}
            </button>

            {/* Hidden file input */}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              style={{ display: 'none' }}
              disabled={isSubmitting}
              data-testid="mcp-icon-file"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setIconError(null)
                // Validate dimensions
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = (ev) => resolve(ev.target!.result as string)
                  reader.onerror = reject
                  reader.readAsDataURL(file)
                })
                // For SVG skip dimension check (vector — always scalable)
                if (file.type === 'image/svg+xml') {
                  set('iconUrl', dataUrl)
                  return
                }
                const img = new Image()
                img.onload = () => {
                  if (img.naturalWidth < 128 || img.naturalHeight < 128) {
                    setIconError(
                      `Image too small: ${img.naturalWidth}x${img.naturalHeight}px. Minimum 128x128 px required.`,
                    )
                    // Reset file input so user can try again
                    if (fileRef.current) fileRef.current.value = ''
                  } else {
                    set('iconUrl', dataUrl)
                  }
                }
                img.onerror = () => setIconError('Failed to read image. Please try a different file.')
                img.src = dataUrl
              }}
            />

            {/* Right side: upload button or URL input */}
            <div className="mcp-icon-upload-right">
              {iconMode === 'upload' ? (
                <>
                  <button
                    type="button"
                    className="conn-btn conn-btn--cancel mcp-icon-upload-btn"
                    onClick={() => fileRef.current?.click()}
                    disabled={isSubmitting}
                    data-testid="mcp-icon-upload-btn"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {form.iconUrl ? 'Replace image' : 'Choose image'}
                  </button>
                  {form.iconUrl && (
                    <button
                      type="button"
                      className="conn-btn conn-btn--cancel mcp-icon-remove-btn"
                      onClick={() => {
                        set('iconUrl', '')
                        setIconError(null)
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      disabled={isSubmitting}
                      aria-label="Remove icon"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                  <p className="mcp-icon-hint">PNG, JPG, WebP, GIF or SVG — min 128x128 px</p>
                </>
              ) : (
                <input
                  id="mcp-icon-url"
                  className="conn-input"
                  type="url"
                  placeholder="https://example.com/icon.png"
                  value={form.iconUrl}
                  onChange={(e) => {
                    set('iconUrl', e.target.value)
                    setIconError(null)
                  }}
                  disabled={isSubmitting}
                  data-testid="mcp-icon-url"
                />
              )}
            </div>
          </div>

          {iconError && <p className="mcp-field-error">{iconError}</p>}
        </div>

        {/* Name + Server Name */}
        <div className="conn-form-grid">
          <div className="conn-field">
            <label className="conn-label" htmlFor="mcp-name">
              Name <span className="mcp-required">*</span>
            </label>
            <input
              id="mcp-name"
              ref={nameRef}
              className={`conn-input${errors['name'] ? ' conn-input--error' : ''}`}
              type="text"
              placeholder="e.g. ClickHouse Cloud"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={isSubmitting}
              data-testid="mcp-name"
            />
            {errors['name'] && <p className="mcp-field-error">{errors['name']}</p>}
          </div>
          <div className="conn-field">
            <label className="conn-label" htmlFor="mcp-server-name">
              Server Name <span className="mcp-label-optional">(tool prefix)</span>
            </label>
            <input
              id="mcp-server-name"
              className="conn-input"
              type="text"
              placeholder="e.g. clickhouse"
              value={form.serverName}
              onChange={(e) => set('serverName', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              disabled={isSubmitting}
              data-testid="mcp-server-name"
            />
          </div>
        </div>

        {/* Description */}
        <div className="conn-field">
          <label className="conn-label" htmlFor="mcp-description">
            Description <span className="mcp-label-optional">(optional)</span>
          </label>
          <input
            id="mcp-description"
            className="conn-input"
            type="text"
            placeholder="What this MCP server provides"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            disabled={isSubmitting}
            data-testid="mcp-description"
          />
        </div>

        {/* MCP Server URL */}
        <div className="conn-field">
          <label className="conn-label" htmlFor="mcp-url">
            MCP Server URL <span className="mcp-required">*</span>
          </label>
          <input
            id="mcp-url"
            className={`conn-input${errors['url'] ? ' conn-input--error' : ''}`}
            type="url"
            placeholder="https://mcp.clickhouse.cloud/mcp"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            disabled={isSubmitting}
            data-testid="mcp-url"
          />
          {errors['url'] && <p className="mcp-field-error">{errors['url']}</p>}
        </div>

        {/* Transport */}
        <div className="conn-field">
          <label className="conn-label">Transport</label>
          <div className="mcp-radio-group">
            <label className={`mcp-radio-option${form.transport === 'streamable-http' ? ' mcp-radio-option--active' : ''}`}>
              <input
                type="radio"
                name="mcp-transport"
                value="streamable-http"
                checked={form.transport === 'streamable-http'}
                onChange={() => set('transport', 'streamable-http')}
                disabled={isSubmitting}
                className="mcp-radio-input"
              />
              <span className="mcp-radio-body">
                <span className="mcp-radio-title">Streamable HTTPS</span>
                <span className="mcp-radio-hint">Recommended for most MCP servers</span>
              </span>
            </label>
            <label className={`mcp-radio-option${form.transport === 'sse' ? ' mcp-radio-option--active' : ''}`}>
              <input
                type="radio"
                name="mcp-transport"
                value="sse"
                checked={form.transport === 'sse'}
                onChange={() => set('transport', 'sse')}
                disabled={isSubmitting}
                className="mcp-radio-input"
              />
              <span className="mcp-radio-body">
                <span className="mcp-radio-title">SSE</span>
                <span className="mcp-radio-hint">Server-Sent Events for real-time streaming</span>
              </span>
            </label>
          </div>
        </div>

        {/* Authentication */}
        <div className="conn-field">
          <label className="conn-label">Authentication</label>
          <div className="mcp-auth-tabs" role="tablist" aria-label="Authentication type">
            {(['none', 'apikey', 'oauth'] as AuthType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={form.authType === t}
                className={`mcp-auth-tab${form.authType === t ? ' mcp-auth-tab--active' : ''}`}
                onClick={() => set('authType', t)}
                disabled={isSubmitting}
                data-testid={`mcp-auth-tab-${t}`}
              >
                {t === 'none' ? 'None (Auto-detect)' : t === 'apikey' ? 'API Key' : 'OAuth'}
              </button>
            ))}
          </div>

          {/* API Key panel */}
          {form.authType === 'apikey' && (
            <div className="mcp-auth-panel" role="tabpanel">
              <div className="conn-field">
                <label className="conn-label" htmlFor="mcp-api-key">
                  API Key <span className="mcp-required">*</span>
                </label>
                <input
                  id="mcp-api-key"
                  className={`conn-input mcp-mono${errors['apiKey'] ? ' conn-input--error' : ''}`}
                  type="password"
                  placeholder="sk-..."
                  value={form.apiKey}
                  onChange={(e) => set('apiKey', e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="off"
                  data-testid="mcp-api-key"
                />
                {errors['apiKey'] && <p className="mcp-field-error">{errors['apiKey']}</p>}
              </div>
              <div className="conn-field">
                <label className="conn-label">Header Format</label>
                <div className="mcp-inline-radios">
                  {(['bearer', 'basic', 'custom'] as HeaderFormat[]).map((hf) => (
                    <label key={hf} className="mcp-inline-radio">
                      <input
                        type="radio"
                        name="mcp-header-format"
                        value={hf}
                        checked={form.headerFormat === hf}
                        onChange={() => set('headerFormat', hf)}
                        disabled={isSubmitting}
                        className="mcp-radio-input"
                        data-testid={`mcp-header-format-${hf}`}
                      />
                      {hf.charAt(0).toUpperCase() + hf.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              {form.headerFormat === 'custom' && (
                <div className="conn-field">
                  <label className="conn-label" htmlFor="mcp-custom-header">
                    Custom Header Name <span className="mcp-required">*</span>
                  </label>
                  <input
                    id="mcp-custom-header"
                    className={`conn-input${errors['customHeader'] ? ' conn-input--error' : ''}`}
                    type="text"
                    placeholder="X-API-Key"
                    value={form.customHeader}
                    onChange={(e) => set('customHeader', e.target.value)}
                    disabled={isSubmitting}
                    data-testid="mcp-custom-header"
                  />
                  {errors['customHeader'] && <p className="mcp-field-error">{errors['customHeader']}</p>}
                </div>
              )}
            </div>
          )}

          {/* OAuth panel — two modes:
              1. Auto-discover (for servers like ClickHouse Cloud that use dynamic OAuth/PKCE)
              2. Manual (for servers where you already have client credentials)
          */}
          {form.authType === 'oauth' && (
            <div className="mcp-auth-panel" role="tabpanel">

              {/* Auto-discover mode */}
              <div className="mcp-oauth-discover-section">
                <div className="mcp-oauth-discover-header">
                  <div>
                    <p className="mcp-oauth-discover-title">Connect with OAuth</p>
                    <p className="mcp-oauth-discover-hint">
                      For servers like ClickHouse Cloud — we'll auto-discover the auth server and redirect you to log in.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="conn-btn conn-btn--primary"
                    onClick={handleDiscoverOAuth}
                    disabled={isSubmitting || oauthDiscovering || oauthConnecting}
                    data-testid="mcp-discover-oauth-btn"
                  >
                    {oauthDiscovering && <span className="conn-spinner" />}
                    {oauthDiscovering ? 'Discovering…' : 'Discover OAuth'}
                  </button>
                </div>

                {oauthDiscoverError && (
                  <div className="mcp-oauth-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{oauthDiscoverError}</span>
                  </div>
                )}

                {oauthDiscovered && (
                  <div className="mcp-oauth-discovered">
                    <div className="mcp-oauth-discovered-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      OAuth endpoints discovered
                    </div>
                    <div className="mcp-oauth-endpoints">
                      <span className="mcp-oauth-endpoint-label">Auth:</span>
                      <code className="mcp-oauth-endpoint-url">{oauthDiscovered.authorizationEndpoint}</code>
                    </div>
                    <div className="mcp-oauth-endpoints">
                      <span className="mcp-oauth-endpoint-label">Token:</span>
                      <code className="mcp-oauth-endpoint-url">{oauthDiscovered.tokenEndpoint}</code>
                    </div>
                    {oauthDiscovered.clientId && (
                      <div className="mcp-oauth-endpoints">
                        <span className="mcp-oauth-endpoint-label">Client ID:</span>
                        <code className="mcp-oauth-endpoint-url">{oauthDiscovered.clientId}</code>
                      </div>
                    )}
                    <button
                      type="button"
                      className="conn-btn conn-btn--primary mcp-oauth-connect-btn"
                      onClick={handleConnectOAuth}
                      disabled={isSubmitting || oauthConnecting}
                      data-testid="mcp-connect-oauth-btn"
                    >
                      {oauthConnecting && <span className="conn-spinner" />}
                      {oauthConnecting ? 'Saving & redirecting…' : 'Connect with OAuth →'}
                    </button>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mcp-oauth-divider">
                <span>or configure manually</span>
              </div>

              {/* Manual fields (collapsed by default — only shown if user needs them) */}
              <div className="conn-form-grid">
                <div className="conn-field">
                  <label className="conn-label" htmlFor="mcp-client-id">
                    Client ID <span className="mcp-label-optional">(optional if using auto-discover)</span>
                  </label>
                  <input
                    id="mcp-client-id"
                    className={`conn-input${errors['clientId'] ? ' conn-input--error' : ''}`}
                    type="text"
                    placeholder="Client ID"
                    value={form.clientId}
                    onChange={(e) => set('clientId', e.target.value)}
                    disabled={isSubmitting}
                    data-testid="mcp-client-id"
                  />
                  {errors['clientId'] && <p className="mcp-field-error">{errors['clientId']}</p>}
                </div>
                <div className="conn-field">
                  <label className="conn-label" htmlFor="mcp-client-secret">Client Secret</label>
                  <input
                    id="mcp-client-secret"
                    className="conn-input mcp-mono"
                    type="password"
                    placeholder="Client Secret"
                    value={form.clientSecret}
                    onChange={(e) => set('clientSecret', e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="off"
                    data-testid="mcp-client-secret"
                  />
                </div>
                <div className="conn-field">
                  <label className="conn-label" htmlFor="mcp-auth-url">Authorization URL</label>
                  <input
                    id="mcp-auth-url"
                    className="conn-input"
                    type="url"
                    placeholder="https://auth.example.com/authorize"
                    value={form.authUrl}
                    onChange={(e) => set('authUrl', e.target.value)}
                    disabled={isSubmitting}
                    data-testid="mcp-auth-url"
                  />
                </div>
                <div className="conn-field">
                  <label className="conn-label" htmlFor="mcp-token-url">Token URL</label>
                  <input
                    id="mcp-token-url"
                    className="conn-input"
                    type="url"
                    placeholder="https://auth.example.com/token"
                    value={form.tokenUrl}
                    onChange={(e) => set('tokenUrl', e.target.value)}
                    disabled={isSubmitting}
                    data-testid="mcp-token-url"
                  />
                </div>
              </div>
              <div className="conn-field">
                <label className="conn-label" htmlFor="mcp-scope">Scope</label>
                <input
                  id="mcp-scope"
                  className="conn-input"
                  type="text"
                  placeholder="read write"
                  value={form.scope}
                  onChange={(e) => set('scope', e.target.value)}
                  disabled={isSubmitting}
                  data-testid="mcp-scope"
                />
              </div>
            </div>
          )}
        </div>

        {/* Trust checkbox */}
        <div className={`mcp-trust-box${errors['trusted'] ? ' mcp-trust-box--error' : ''}`}>
          <label className="conn-checkbox-label">
            <input
              type="checkbox"
              className="conn-checkbox"
              checked={form.trusted}
              onChange={(e) => set('trusted', e.target.checked)}
              disabled={isSubmitting}
              data-testid="mcp-trusted"
            />
            <span>
              <strong>I trust this application</strong>
              <span className="mcp-trust-hint"> — Custom connectors are not verified by Shopmeta</span>
            </span>
          </label>
          {errors['trusted'] && <p className="mcp-field-error">{errors['trusted']}</p>}
        </div>

        {/* Actions — matches conn-form-actions pattern */}
        <div className="conn-form-actions">
          <div />
          <div className="conn-form-actions-right">
            <button
              type="button"
              className="conn-btn conn-btn--cancel"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="mcp-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="conn-btn conn-btn--primary"
              disabled={isSubmitting}
              id="mcp-submit-btn"
              data-testid="mcp-submit"
            >
              {isSubmitting && <span className="conn-spinner" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── MCP Server Card ───────────────────────────────────────────────────────────

function transportLabel(t: string) {
  if (t === 'streamable-http') return 'Streamable HTTPS'
  if (t === 'sse') return 'SSE'
  return t
}

function authLabel(t: string) {
  if (t === 'none') return 'No auth'
  if (t === 'apikey') return 'API Key'
  if (t === 'oauth') return 'OAuth'
  return t
}

interface McpCardProps {
  server: McpServerRow
  onEdit: (s: McpServerRow) => void
  onDelete: (s: McpServerRow) => void
  isDeleting: boolean
}

function McpServerCard({ server, onEdit, onDelete, isDeleting }: McpCardProps) {
  return (
    <div className="conn-card" data-testid={`mcp-card-${server.id}`}>
      <div className="conn-card-header">
        <div className="conn-card-title-row">
          <div className="mcp-card-icon">
            {server.iconUrl ? (
              <img src={server.iconUrl} alt="" className="mcp-card-icon-img" />
            ) : (
              <span className="mcp-card-icon-placeholder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
            )}
          </div>
          <span className="conn-card-name">{server.name}</span>
        </div>
        <div className="conn-card-actions">
          <button
            className="conn-card-btn"
            onClick={() => onEdit(server)}
            aria-label={`Edit ${server.name}`}
            title="Edit"
            data-testid={`mcp-edit-${server.id}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            className="conn-card-btn conn-card-btn--danger"
            onClick={() => onDelete(server)}
            disabled={isDeleting}
            aria-label={`Delete ${server.name}`}
            title="Delete"
            data-testid={`mcp-delete-${server.id}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="conn-card-meta">
        {/* URL */}
        <span className="conn-meta-item">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <code className="mcp-card-url">{server.url}</code>
        </span>
        <span className="conn-meta-sep">·</span>
        <span className="conn-meta-item">{transportLabel(server.transport)}</span>
        <span className="conn-meta-sep">·</span>
        <span className="conn-meta-item">{authLabel(server.authType)}</span>
        {server.serverName && (
          <>
            <span className="conn-meta-sep">·</span>
            <span className="conn-meta-item">
              <code className="mcp-card-prefix">{server.serverName}</code>
            </span>
          </>
        )}
      </div>

      {server.description && (
        <p className="mcp-card-desc">{server.description}</p>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit'

export function McpServersPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<View>('list')
  const [editingServer, setEditingServer] = useState<McpServerRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toasts, add: addToast } = useToast()

  // Handle OAuth callback results (?oauth_success=1 or ?oauth_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get('oauth_success')
    const oauthError = params.get('oauth_error')
    if (success) {
      addToast('success', 'MCP server connected via OAuth successfully!')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      // Clean up the URL
      window.history.replaceState({}, '', '/mcp-servers')
    } else if (oauthError) {
      addToast('error', `OAuth connection failed: ${decodeURIComponent(oauthError)}`)
      window.history.replaceState({}, '', '/mcp-servers')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: servers = [], isLoading, isError, error } = useQuery({
    queryKey: ['mcp-servers'],
    // Wrap in try/catch so schema/migration errors (table/column not existing)
    // never set isError — they just return an empty list instead.
    queryFn: async () => {
      try {
        return await listMcpServers({ data: {} })
      } catch (err) {
        // Catch ALL errors — the server already returns [] on DB errors but
        // postgres.js wraps errors as 'Failed query: ...' so pattern matching
        // on the message text is unreliable. Showing empty state is correct.
        console.error('[mcp-servers] Query failed (showing empty):', err instanceof Error ? err.message : String(err))
        return [] as import('#/lib/mcp-servers').McpServerRow[]
      }
    },
    retry: false,
  })


  const createMutation = useMutation({
    mutationFn: (f: FormState) => createMcpServer({ data: formToPayload(f) }),
    onSuccess: (result) => {
      const s = result as McpServerRow
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setView('list')
      addToast('success', `"${s.name}" added to catalog`)
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to add server'),
  })

  const updateMutation = useMutation({
    mutationFn: (f: FormState) =>
      updateMcpServer({ data: { id: editingServer!.id, ...formToPayload(f) } }),
    onSuccess: (result) => {
      const s = result as McpServerRow
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setView('list')
      setEditingServer(null)
      addToast('success', `"${s.name}" updated`)
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to update server'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMcpServer({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setDeletingId(null)
      addToast('success', 'Server removed from catalog')
    },
    onError: (err) => {
      setDeletingId(null)
      addToast('error', err instanceof Error ? err.message : 'Failed to delete server')
    },
  })

  const handleEdit = (s: McpServerRow) => {
    setEditingServer(s)
    setView('edit')
  }

  const handleDelete = (s: McpServerRow) => {
    if (!window.confirm(`Remove "${s.name}" from the catalog? This will also detach it from any agents.`)) return
    setDeletingId(s.id)
    deleteMutation.mutate(s.id)
  }

  const handleCancel = () => {
    setView('list')
    setEditingServer(null)
  }

  // Matches settings-page structure exactly
  return (
    <div className="settings-page">
      {/* Toast notifications — identical to conn-toasts pattern */}
      <div className="conn-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`conn-toast conn-toast--${t.type}`}>
            {t.type === 'success' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>

      {/* Page header — matches .settings-header */}
      <div className="settings-header">
        <h1 className="settings-title">MCP Servers</h1>
        <p className="settings-subtitle">
          Connect Model Context Protocol servers to extend your agents with external tools and data sources.
        </p>
      </div>

      {/* Layout — matches .settings-layout with sidebar tabs */}
      <div className="settings-layout">
        {/* Tabs sidebar */}
        <nav className="settings-tabs" aria-label="MCP sections">
          <button className="settings-tab settings-tab--active" id="mcp-tab-servers">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            MCP Servers
          </button>
        </nav>

        {/* Content — matches .settings-content */}
        <div className="settings-content">
          <div className="conn-settings" data-testid="mcp-settings">

            {/* Section header — identical to conn-section-header */}
            <div className="conn-section-header">
              <div>
                <h2 className="conn-section-title">MCP Server Catalog</h2>
                <p className="conn-section-desc">
                  Add MCP servers to your catalog and attach them to agents. Auth credentials are stored securely.
                </p>
              </div>
              {view === 'list' && (
                <button
                  className="conn-btn conn-btn--primary"
                  onClick={() => setView('create')}
                  id="mcp-add-btn"
                  data-testid="mcp-add-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add MCP Server
                </button>
              )}
            </div>

            {/* Create form */}
            {view === 'create' && (
              <McpServerForm
                title="New MCP Server"
                onSubmit={async (f) => {
                  // For OAuth flow: we need the raw server row returned without
                  // triggering setView('list') — mutateAsync fires onSuccess too.
                  // Use mutateAsync here; the OAuth handler will redirect before
                  // the list view is rendered.
                  return await createMutation.mutateAsync(f)
                }}
                onCancel={handleCancel}
                submitLabel="Add MCP Server"
                isSubmitting={createMutation.isPending}
              />

            )}

            {/* Edit form */}
            {view === 'edit' && editingServer && (
              <McpServerForm
                title={`Edit: ${editingServer.name}`}
                initial={rowToForm(editingServer)}
                onSubmit={updateMutation.mutateAsync}
                onCancel={handleCancel}
                submitLabel="Save Changes"
                isSubmitting={updateMutation.isPending}
              />
            )}

            {/* List view */}
            {view === 'list' && (
              <div className="conn-list-section">
                {isLoading && (
                  <div className="conn-loading">
                    <div className="conn-loading-dots"><span /><span /><span /></div>
                    <span>Loading MCP servers…</span>
                  </div>
                )}
                {isError && (
                  <div className="conn-error-banner" data-testid="mcp-error-banner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      Failed to load MCP servers.
                      {error && (
                        <span className="mcp-error-detail"> ({error instanceof Error ? error.message : String(error)})</span>
                      )}
                    </span>
                  </div>
                )}
                {!isLoading && !isError && servers.length === 0 && (
                  <div className="conn-empty">
                    <div className="conn-empty-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </div>
                    <h3 className="conn-empty-title">No MCP servers yet</h3>
                    <p className="conn-empty-desc">
                      Add your first MCP server to connect external tools and data sources to your agents.
                    </p>
                    <button
                      className="conn-btn conn-btn--primary"
                      onClick={() => setView('create')}
                      data-testid="mcp-empty-add-btn"
                    >
                      Add your first MCP server
                    </button>
                  </div>
                )}
                {!isLoading && servers.length > 0 && (
                  <div className="conn-grid" data-testid="mcp-grid">
                    {servers.map((s) => (
                      <McpServerCard
                        key={s.id}
                        server={s}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        isDeleting={deletingId === s.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
