// src/components/mcp/McpServersPage.tsx
// Full CRUD page for the MCP Server Catalog.
// Users add MCP servers here; then select them in the Agent Builder.
//
// Form fields:
//   - Icon (optional, 128x128 min)
//   - Name (required)
//   - Description (optional)
//   - MCP Server URL (required)
//   - Transport: Streamable HTTPS | SSE
//   - Authentication: None | API Key | OAuth
//   - Trust checkbox (required)

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listMcpServers,
  createMcpServer,
  deleteMcpServer,
  updateMcpServer,
} from '#/lib/mcp-servers'
import type { McpServerRow } from '#/lib/mcp-servers'

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
  if (f.authType === 'oauth' && !f.clientId.trim()) e['clientId'] = 'Client ID is required'
  if (f.authType === 'oauth' && f.headerFormat === 'custom' && !f.customHeader.trim()) {
    e['customHeader'] = 'Custom header name is required'
  }
  return e
}

// ─── MCP Server Form ───────────────────────────────────────────────────────────

interface McpFormProps {
  initial?: FormState
  onSubmit: (f: FormState) => Promise<void>
  onCancel: () => void
  submitLabel: string
  isSubmitting: boolean
}

function McpServerForm({ initial = emptyForm, onSubmit, onCancel, submitLabel, isSubmitting }: McpFormProps) {
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    await onSubmit(form)
  }

  return (
    <form className="mcp-form" onSubmit={handleSubmit} noValidate data-testid="mcp-server-form">

      {/* Icon */}
      <div className="mcp-form-section">
        <div className="mcp-form-row">
          <div className="mcp-icon-preview">
            {form.iconUrl ? (
              <img src={form.iconUrl} alt="" className="mcp-icon-img" />
            ) : (
              <div className="mcp-icon-placeholder">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
            )}
          </div>
          <div className="mcp-form-field" style={{ flex: 1 }}>
            <label className="mcp-label" htmlFor="mcp-icon-url">
              Icon <span className="mcp-label-hint">(optional — URL, min 128×128 px)</span>
            </label>
            <input
              id="mcp-icon-url"
              className="mcp-input"
              type="url"
              placeholder="https://example.com/icon.png"
              value={form.iconUrl}
              onChange={(e) => set('iconUrl', e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Name + Server Name */}
      <div className="mcp-form-grid-2">
        <div className="mcp-form-field">
          <label className="mcp-label" htmlFor="mcp-name">
            Name <span className="mcp-required">*</span>
          </label>
          <input
            id="mcp-name"
            ref={nameRef}
            className={`mcp-input ${errors['name'] ? 'mcp-input--error' : ''}`}
            type="text"
            placeholder="e.g. ClickHouse Cloud"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={isSubmitting}
            data-testid="mcp-name"
          />
          {errors['name'] && <p className="mcp-error">{errors['name']}</p>}
        </div>
        <div className="mcp-form-field">
          <label className="mcp-label" htmlFor="mcp-server-name">
            Server Name
            <span className="mcp-label-hint"> (tool prefix)</span>
          </label>
          <input
            id="mcp-server-name"
            className="mcp-input"
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
      <div className="mcp-form-field">
        <label className="mcp-label" htmlFor="mcp-description">
          Description <span className="mcp-label-optional">(optional)</span>
        </label>
        <input
          id="mcp-description"
          className="mcp-input"
          type="text"
          placeholder="What this MCP server provides"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {/* MCP Server URL */}
      <div className="mcp-form-field">
        <label className="mcp-label" htmlFor="mcp-url">
          MCP Server URL <span className="mcp-required">*</span>
        </label>
        <input
          id="mcp-url"
          className={`mcp-input ${errors['url'] ? 'mcp-input--error' : ''}`}
          type="url"
          placeholder="https://mcp.clickhouse.cloud/mcp"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
          disabled={isSubmitting}
          data-testid="mcp-url"
        />
        {errors['url'] && <p className="mcp-error">{errors['url']}</p>}
      </div>

      {/* Transport */}
      <div className="mcp-form-field">
        <label className="mcp-label">Transport</label>
        <div className="mcp-radio-group">
          <label className="mcp-radio-label">
            <input
              type="radio"
              name="transport"
              value="streamable-http"
              checked={form.transport === 'streamable-http'}
              onChange={() => set('transport', 'streamable-http')}
              disabled={isSubmitting}
            />
            <span className="mcp-radio-text">
              <span className="mcp-radio-title">Streamable HTTPS</span>
              <span className="mcp-radio-hint">Recommended for most MCP servers</span>
            </span>
          </label>
          <label className="mcp-radio-label">
            <input
              type="radio"
              name="transport"
              value="sse"
              checked={form.transport === 'sse'}
              onChange={() => set('transport', 'sse')}
              disabled={isSubmitting}
            />
            <span className="mcp-radio-text">
              <span className="mcp-radio-title">SSE</span>
              <span className="mcp-radio-hint">Server-Sent Events for real-time streaming</span>
            </span>
          </label>
        </div>
      </div>

      {/* Authentication */}
      <div className="mcp-form-field">
        <label className="mcp-label">Authentication</label>
        <div className="mcp-auth-tabs">
          {(['none', 'apikey', 'oauth'] as AuthType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`mcp-auth-tab ${form.authType === t ? 'mcp-auth-tab--active' : ''}`}
              onClick={() => set('authType', t)}
              disabled={isSubmitting}
            >
              {t === 'none' ? 'None (Auto-detect)' : t === 'apikey' ? 'API Key' : 'OAuth'}
            </button>
          ))}
        </div>

        {/* API Key fields */}
        {form.authType === 'apikey' && (
          <div className="mcp-auth-body">
            <div className="mcp-form-field">
              <label className="mcp-label" htmlFor="mcp-api-key">
                API Key <span className="mcp-required">*</span>
              </label>
              <input
                id="mcp-api-key"
                className={`mcp-input mcp-mono ${errors['apiKey'] ? 'mcp-input--error' : ''}`}
                type="password"
                placeholder="sk-..."
                value={form.apiKey}
                onChange={(e) => set('apiKey', e.target.value)}
                disabled={isSubmitting}
                autoComplete="off"
                data-testid="mcp-api-key"
              />
              {errors['apiKey'] && <p className="mcp-error">{errors['apiKey']}</p>}
            </div>
            <div className="mcp-form-field">
              <label className="mcp-label">Header Format</label>
              <div className="mcp-radio-group mcp-radio-group--inline">
                {(['bearer', 'basic', 'custom'] as HeaderFormat[]).map((hf) => (
                  <label key={hf} className="mcp-radio-label mcp-radio-label--sm">
                    <input
                      type="radio"
                      name="headerFormat"
                      value={hf}
                      checked={form.headerFormat === hf}
                      onChange={() => set('headerFormat', hf)}
                      disabled={isSubmitting}
                    />
                    <span>{hf.charAt(0).toUpperCase() + hf.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
            {form.headerFormat === 'custom' && (
              <div className="mcp-form-field">
                <label className="mcp-label" htmlFor="mcp-custom-header">
                  Custom Header Name <span className="mcp-required">*</span>
                </label>
                <input
                  id="mcp-custom-header"
                  className={`mcp-input ${errors['customHeader'] ? 'mcp-input--error' : ''}`}
                  type="text"
                  placeholder="X-API-Key"
                  value={form.customHeader}
                  onChange={(e) => set('customHeader', e.target.value)}
                  disabled={isSubmitting}
                />
                {errors['customHeader'] && <p className="mcp-error">{errors['customHeader']}</p>}
              </div>
            )}
          </div>
        )}

        {/* OAuth fields */}
        {form.authType === 'oauth' && (
          <div className="mcp-auth-body">
            <div className="mcp-form-grid-2">
              <div className="mcp-form-field">
                <label className="mcp-label" htmlFor="mcp-client-id">
                  Client ID <span className="mcp-required">*</span>
                </label>
                <input
                  id="mcp-client-id"
                  className={`mcp-input ${errors['clientId'] ? 'mcp-input--error' : ''}`}
                  type="text"
                  placeholder="Client ID"
                  value={form.clientId}
                  onChange={(e) => set('clientId', e.target.value)}
                  disabled={isSubmitting}
                  data-testid="mcp-client-id"
                />
                {errors['clientId'] && <p className="mcp-error">{errors['clientId']}</p>}
              </div>
              <div className="mcp-form-field">
                <label className="mcp-label" htmlFor="mcp-client-secret">
                  Client Secret
                </label>
                <input
                  id="mcp-client-secret"
                  className="mcp-input mcp-mono"
                  type="password"
                  placeholder="Client Secret"
                  value={form.clientSecret}
                  onChange={(e) => set('clientSecret', e.target.value)}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="mcp-form-grid-2">
              <div className="mcp-form-field">
                <label className="mcp-label" htmlFor="mcp-auth-url">Authorization URL</label>
                <input
                  id="mcp-auth-url"
                  className="mcp-input"
                  type="url"
                  placeholder="https://auth.example.com/authorize"
                  value={form.authUrl}
                  onChange={(e) => set('authUrl', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="mcp-form-field">
                <label className="mcp-label" htmlFor="mcp-token-url">Token URL</label>
                <input
                  id="mcp-token-url"
                  className="mcp-input"
                  type="url"
                  placeholder="https://auth.example.com/token"
                  value={form.tokenUrl}
                  onChange={(e) => set('tokenUrl', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="mcp-form-field">
              <label className="mcp-label" htmlFor="mcp-scope">Scope</label>
              <input
                id="mcp-scope"
                className="mcp-input"
                type="text"
                placeholder="read write"
                value={form.scope}
                onChange={(e) => set('scope', e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}
      </div>

      {/* Trust checkbox */}
      <div className={`mcp-trust-box ${errors['trusted'] ? 'mcp-trust-box--error' : ''}`}>
        <label className="mcp-trust-label">
          <input
            type="checkbox"
            className="mcp-checkbox"
            checked={form.trusted}
            onChange={(e) => set('trusted', e.target.checked)}
            disabled={isSubmitting}
            data-testid="mcp-trusted"
          />
          <span className="mcp-trust-text">
            <span className="mcp-trust-title">I trust this application</span>
            <span className="mcp-trust-hint">
              Custom connectors are not verified by Shopmeta
            </span>
          </span>
        </label>
        {errors['trusted'] && <p className="mcp-error">{errors['trusted']}</p>}
      </div>

      {/* Actions */}
      <div className="mcp-form-actions">
        <button
          type="button"
          className="mcp-btn mcp-btn--cancel"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="mcp-btn mcp-btn--primary"
          disabled={isSubmitting}
          data-testid="mcp-submit"
        >
          {isSubmitting && <span className="mcp-spinner" />}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── MCP Server Card ───────────────────────────────────────────────────────────

function transportLabel(t: string) {
  if (t === 'streamable-http') return 'Streamable HTTPS'
  if (t === 'sse') return 'SSE'
  return t
}

function authLabel(t: string) {
  if (t === 'none') return 'None'
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
    <div className="mcp-card" data-testid={`mcp-card-${server.id}`}>
      <div className="mcp-card-header">
        <div className="mcp-card-icon">
          {server.iconUrl ? (
            <img src={server.iconUrl} alt="" className="mcp-card-icon-img" />
          ) : (
            <div className="mcp-card-icon-placeholder">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
          )}
        </div>
        <div className="mcp-card-info">
          <span className="mcp-card-name">{server.name}</span>
          <code className="mcp-card-url">{server.url}</code>
        </div>
        <div className="mcp-card-actions">
          <button
            className="mcp-icon-btn"
            onClick={() => onEdit(server)}
            aria-label={`Edit ${server.name}`}
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            className="mcp-icon-btn mcp-icon-btn--danger"
            onClick={() => onDelete(server)}
            disabled={isDeleting}
            aria-label={`Delete ${server.name}`}
            title="Delete"
            data-testid={`mcp-delete-${server.id}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>
      {server.description && (
        <p className="mcp-card-desc">{server.description}</p>
      )}
      <div className="mcp-card-meta">
        <span className={`mcp-badge mcp-badge--transport mcp-badge--${server.transport}`}>
          {transportLabel(server.transport)}
        </span>
        <span className={`mcp-badge mcp-badge--auth mcp-badge--${server.authType}`}>
          {authLabel(server.authType)}
        </span>
        {!server.trusted && (
          <span className="mcp-badge mcp-badge--untrusted">Not trusted</span>
        )}
        <code className="mcp-card-server-name">{server.serverName}</code>
      </div>
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
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const { data: servers = [], isLoading, isError } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => listMcpServers({ data: {} }),
  })

  const createMutation = useMutation({
    mutationFn: (f: FormState) => createMcpServer({ data: formToPayload(f) }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setView('list')
      showToast('success', `"${s.name}" added to catalog`)
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to add server'),
  })

  const updateMutation = useMutation({
    mutationFn: (f: FormState) =>
      updateMcpServer({ data: { id: editingServer!.id, ...formToPayload(f) } }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setView('list')
      setEditingServer(null)
      showToast('success', `"${s.name}" updated`)
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to update server'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMcpServer({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      setDeletingId(null)
      showToast('success', 'Server removed from catalog')
    },
    onError: (err) => {
      setDeletingId(null)
      showToast('error', err instanceof Error ? err.message : 'Failed to delete server')
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

  return (
    <div className="mcp-page">
      {/* Toast */}
      {toast && (
        <div className={`mcp-toast mcp-toast--${toast.type}`} role="alert">
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mcp-page-header">
        <div>
          <h1 className="mcp-page-title">MCP Servers</h1>
          <p className="mcp-page-subtitle">
            Connect Model Context Protocol servers to extend your agents with external tools and data sources.
          </p>
        </div>
        {view === 'list' && (
          <button
            className="mcp-btn mcp-btn--primary"
            onClick={() => setView('create')}
            data-testid="mcp-add-btn"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add MCP Server
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {(view === 'create' || view === 'edit') && (
        <div className="mcp-form-wrapper">
          <div className="mcp-form-header">
            <h2 className="mcp-form-title">
              {view === 'create' ? 'Add MCP Server' : `Edit: ${editingServer?.name}`}
            </h2>
            <button
              className="mcp-icon-btn"
              onClick={() => { setView('list'); setEditingServer(null) }}
              aria-label="Close form"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <McpServerForm
            initial={view === 'edit' && editingServer ? rowToForm(editingServer) : emptyForm}
            onSubmit={view === 'create' ? createMutation.mutateAsync : updateMutation.mutateAsync}
            onCancel={() => { setView('list'); setEditingServer(null) }}
            submitLabel={view === 'create' ? 'Add MCP Server' : 'Save Changes'}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        </div>
      )}

      {/* Server list */}
      {view === 'list' && (
        <>
          {isLoading && (
            <div className="mcp-state-msg">
              <span className="mcp-spinner mcp-spinner--lg" />
              Loading MCP servers…
            </div>
          )}
          {isError && (
            <div className="mcp-state-msg mcp-state-msg--error">
              Failed to load MCP servers. Please refresh.
            </div>
          )}
          {!isLoading && !isError && servers.length === 0 && (
            <div className="mcp-empty">
              <div className="mcp-empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <p className="mcp-empty-title">No MCP servers yet</p>
              <p className="mcp-empty-subtitle">
                Add your first MCP server to connect external tools and data sources to your agents.
              </p>
              <button className="mcp-btn mcp-btn--primary" onClick={() => setView('create')}>
                Add MCP Server
              </button>
            </div>
          )}
          {!isLoading && servers.length > 0 && (
            <div className="mcp-grid" data-testid="mcp-grid">
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
        </>
      )}
    </div>
  )
}
