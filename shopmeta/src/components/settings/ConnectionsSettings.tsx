// src/components/settings/ConnectionsSettings.tsx
// ClickHouse Connections management UI.
// Allows users to: list, create, edit, delete, test, and set a default connection.
// All server calls go through TanStack Query + server functions from src/lib/connections.ts

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  setDefaultConnection,
} from '#/lib/connections'
import type { ConnectionRow } from '#/lib/connections'

// ─── Toast / feedback ─────────────────────────────────────────────────────────

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

let toastIdCounter = 0

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  return { toasts, addToast }
}

// ─── Connection form ──────────────────────────────────────────────────────────

interface ConnectionFormData {
  name: string
  host: string
  port: string
  database: string
  username: string
  password: string
  isDefault: boolean
}

const defaultFormData: ConnectionFormData = {
  name: '',
  host: '',
  port: '8443',
  database: 'default',
  username: 'default',
  password: '',
  isDefault: false,
}

interface ConnectionFormProps {
  initial?: Partial<ConnectionFormData>
  onSubmit: (data: ConnectionFormData) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
  submitLabel: string
  /** connectionId for testing an already-saved connection */
  connectionId?: string
  onTest?: (data: ConnectionFormData) => Promise<void>
  isTestPending?: boolean
  testResult?: { success: boolean; error?: string } | null
}

function ConnectionForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  onTest,
  isTestPending,
  testResult,
}: ConnectionFormProps) {
  const [form, setForm] = useState<ConnectionFormData>({ ...defaultFormData, ...initial })
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (field: keyof ConnectionFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(form)
  }

  const handleTest = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (onTest) await onTest(form)
  }

  return (
    <form className="conn-form" onSubmit={handleSubmit} noValidate>
      <div className="conn-form-grid">
        {/* Name */}
        <div className="conn-field conn-field--full">
          <label className="conn-label" htmlFor="conn-name">Connection Name</label>
          <input
            id="conn-name"
            className="conn-input"
            type="text"
            placeholder="Production ClickHouse"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Host + Port */}
        <div className="conn-field conn-field--host">
          <label className="conn-label" htmlFor="conn-host">Host</label>
          <input
            id="conn-host"
            className="conn-input"
            type="text"
            placeholder="abc123.clickhouse.cloud"
            value={form.host}
            onChange={(e) => handleChange('host', e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <div className="conn-field conn-field--port">
          <label className="conn-label" htmlFor="conn-port">Port</label>
          <input
            id="conn-port"
            className="conn-input"
            type="number"
            placeholder="8443"
            value={form.port}
            onChange={(e) => handleChange('port', e.target.value)}
            required
            min={1}
            max={65535}
            disabled={isSubmitting}
          />
        </div>

        {/* Database */}
        <div className="conn-field conn-field--full">
          <label className="conn-label" htmlFor="conn-database">Database</label>
          <input
            id="conn-database"
            className="conn-input"
            type="text"
            placeholder="default"
            value={form.database}
            onChange={(e) => handleChange('database', e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Username */}
        <div className="conn-field">
          <label className="conn-label" htmlFor="conn-username">Username</label>
          <input
            id="conn-username"
            className="conn-input"
            type="text"
            placeholder="default"
            value={form.username}
            onChange={(e) => handleChange('username', e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        {/* Password */}
        <div className="conn-field">
          <label className="conn-label" htmlFor="conn-password">Password</label>
          <div className="conn-password-wrapper">
            <input
              id="conn-password"
              className="conn-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="conn-password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Set as default checkbox */}
        <div className="conn-field conn-field--full conn-field--checkbox">
          <label className="conn-checkbox-label">
            <input
              type="checkbox"
              className="conn-checkbox"
              checked={form.isDefault}
              onChange={(e) => handleChange('isDefault', e.target.checked)}
              disabled={isSubmitting}
            />
            <span>Set as default connection for this organization</span>
          </label>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div className={`conn-test-result ${testResult.success ? 'conn-test-result--success' : 'conn-test-result--error'}`}>
          {testResult.success ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Connection successful
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {testResult.error ?? 'Connection failed'}
            </>
          )}
        </div>
      )}

      {/* Form actions */}
      <div className="conn-form-actions">
        {onTest && (
          <button
            type="button"
            className="conn-btn conn-btn--test"
            onClick={handleTest}
            disabled={isSubmitting || isTestPending}
            id="conn-test-btn"
          >
            {isTestPending ? (
              <span className="conn-spinner" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.69 3.47a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            )}
            Test Connection
          </button>
        )}
        <div className="conn-form-actions-right">
          <button
            type="button"
            className="conn-btn conn-btn--cancel"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="conn-btn conn-btn--primary"
            disabled={isSubmitting}
            id="conn-submit-btn"
          >
            {isSubmitting ? <span className="conn-spinner" /> : null}
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── Connection card ──────────────────────────────────────────────────────────

interface ConnectionCardProps {
  connection: ConnectionRow
  onEdit: (c: ConnectionRow) => void
  onDelete: (c: ConnectionRow) => void
  onSetDefault: (c: ConnectionRow) => void
  onTest: (c: ConnectionRow) => void
  isTestPending: boolean
  testResult: { success: boolean; error?: string } | null
  isSettingDefault: boolean
  isDeleting: boolean
}

function ConnectionCard({
  connection,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  isTestPending,
  testResult,
  isSettingDefault,
  isDeleting,
}: ConnectionCardProps) {
  return (
    <div
      className={`conn-card ${connection.isDefault ? 'conn-card--default' : ''}`}
      data-connection-id={connection.id}
      data-testid={`connection-card-${connection.id}`}
    >
      <div className="conn-card-header">
        <div className="conn-card-title-row">
          <span className="conn-card-name">{connection.name}</span>
          {connection.isDefault && (
            <span className="conn-default-badge" aria-label="Default connection">
              Default
            </span>
          )}
        </div>
        <div className="conn-card-actions">
          <button
            className="conn-card-btn"
            onClick={() => onTest(connection)}
            disabled={isTestPending}
            aria-label={`Test ${connection.name}`}
            title="Test connection"
          >
            {isTestPending ? (
              <span className="conn-spinner conn-spinner--sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.69 3.47a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            )}
          </button>
          <button
            className="conn-card-btn"
            onClick={() => onEdit(connection)}
            aria-label={`Edit ${connection.name}`}
            title="Edit connection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          {!connection.isDefault && (
            <button
              className="conn-card-btn"
              onClick={() => onSetDefault(connection)}
              disabled={isSettingDefault}
              aria-label={`Set ${connection.name} as default`}
              title="Set as default"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          <button
            className="conn-card-btn conn-card-btn--danger"
            onClick={() => onDelete(connection)}
            disabled={isDeleting}
            aria-label={`Delete ${connection.name}`}
            title="Delete connection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="conn-card-meta">
        <span className="conn-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {connection.host}:{connection.port ?? 8443}
        </span>
        <span className="conn-meta-sep">·</span>
        <span className="conn-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
          {connection.database}
        </span>
        <span className="conn-meta-sep">·</span>
        <span className="conn-meta-item">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {connection.username}
        </span>
      </div>

      {/* Inline test result */}
      {testResult && (
        <div className={`conn-card-test-result ${testResult.success ? 'conn-card-test-result--success' : 'conn-card-test-result--error'}`}>
          {testResult.success ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Connected
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              {testResult.error ?? 'Failed'}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

interface DeleteModalProps {
  connection: ConnectionRow
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}

function DeleteModal({ connection, onConfirm, onCancel, isDeleting }: DeleteModalProps) {
  return (
    <div className="conn-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm deletion">
      <div className="conn-modal">
        <div className="conn-modal-icon conn-modal-icon--danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
        <h2 className="conn-modal-title">Delete Connection</h2>
        <p className="conn-modal-body">
          Are you sure you want to delete <strong>{connection.name}</strong>?
          Any widgets referencing this connection will have their connection unset.
          This action cannot be undone.
        </p>
        <div className="conn-modal-actions">
          <button className="conn-btn conn-btn--cancel" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button
            className="conn-btn conn-btn--danger"
            onClick={onConfirm}
            disabled={isDeleting}
            id="conn-delete-confirm-btn"
          >
            {isDeleting ? <span className="conn-spinner" /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit'

export function ConnectionsSettings() {
  const queryClient = useQueryClient()
  const { toasts, addToast } = useToast()

  const [view, setView] = useState<View>('list')
  const [editingConnection, setEditingConnection] = useState<ConnectionRow | null>(null)
  const [deletingConnection, setDeletingConnection] = useState<ConnectionRow | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({})
  const [testPendingId, setTestPendingId] = useState<string | null>(null)
  const [formTestResult, setFormTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [isFormTestPending, setIsFormTestPending] = useState(false)

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: connectionList = [], isLoading, error } = useQuery({
    queryKey: ['connections'],
    queryFn: () => listConnections({ data: {} }),
  })

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createConnection>[0]) => createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      addToast('success', 'Connection created successfully')
      setView('list')
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to create connection')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateConnection>[0]) => updateConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      addToast('success', 'Connection updated successfully')
      setView('list')
      setEditingConnection(null)
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to update connection')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConnection({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      addToast('success', 'Connection deleted')
      setDeletingConnection(null)
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete connection')
      setDeletingConnection(null)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultConnection({ data: { id } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      addToast('success', `"${data.name}" is now the default connection`)
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to set default')
    },
  })

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async (form: ConnectionFormData) => {
    await createMutation.mutateAsync({
      data: {
        name: form.name,
        host: form.host,
        port: Number(form.port),
        database: form.database,
        username: form.username,
        password: form.password,
        isDefault: form.isDefault,
      },
    })
  }

  const handleUpdate = async (form: ConnectionFormData) => {
    if (!editingConnection) return
    await updateMutation.mutateAsync({
      data: {
        id: editingConnection.id,
        name: form.name,
        host: form.host,
        port: Number(form.port),
        database: form.database,
        username: form.username,
        // Only include password if user typed something
        ...(form.password ? { password: form.password } : {}),
      },
    })
  }

  const handleTestFromForm = async (form: ConnectionFormData) => {
    setIsFormTestPending(true)
    setFormTestResult(null)
    try {
      const result = await testConnection({
        data: {
          host: form.host,
          port: Number(form.port),
          database: form.database,
          username: form.username,
          password: form.password,
        },
      })
      setFormTestResult(result)
      if (result.success) {
        addToast('success', 'Connection test successful!')
      } else {
        addToast('error', result.error ?? 'Connection test failed')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed'
      setFormTestResult({ success: false, error: msg })
    } finally {
      setIsFormTestPending(false)
    }
  }

  const handleTestFromCard = async (connection: ConnectionRow) => {
    setTestPendingId(connection.id)
    setTestResults((prev) => {
      const next = { ...prev }
      delete next[connection.id]
      return next
    })
    try {
      const result = await testConnection({ data: { id: connection.id } })
      setTestResults((prev) => ({ ...prev, [connection.id]: result }))
      if (result.success) {
        addToast('success', `"${connection.name}" is connected!`)
      } else {
        addToast('error', result.error ?? `"${connection.name}" failed`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed'
      setTestResults((prev) => ({ ...prev, [connection.id]: { success: false, error: msg } }))
    } finally {
      setTestPendingId(null)
    }
  }

  const handleEdit = (connection: ConnectionRow) => {
    setEditingConnection(connection)
    setFormTestResult(null)
    setView('edit')
  }

  const handleCancelForm = () => {
    setView('list')
    setEditingConnection(null)
    setFormTestResult(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="conn-settings">
      {/* Toast notifications */}
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
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="conn-section-header">
        <div>
          <h2 className="conn-section-title">ClickHouse Connections</h2>
          <p className="conn-section-desc">
            Manage connections to your ClickHouse databases. Passwords are encrypted at rest using AES-256-GCM.
          </p>
        </div>
        {view === 'list' && (
          <button
            className="conn-btn conn-btn--primary"
            onClick={() => {
              setFormTestResult(null)
              setView('create')
            }}
            id="conn-add-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Connection
          </button>
        )}
      </div>

      {/* Create form */}
      {view === 'create' && (
        <div className="conn-form-wrapper">
          <h3 className="conn-form-title">New Connection</h3>
          <ConnectionForm
            onSubmit={handleCreate}
            onCancel={handleCancelForm}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Connection"
            onTest={handleTestFromForm}
            isTestPending={isFormTestPending}
            testResult={formTestResult}
          />
        </div>
      )}

      {/* Edit form */}
      {view === 'edit' && editingConnection && (
        <div className="conn-form-wrapper">
          <h3 className="conn-form-title">Edit Connection</h3>
          <ConnectionForm
            initial={{
              name: editingConnection.name,
              host: editingConnection.host,
              port: String(editingConnection.port ?? 8443),
              database: editingConnection.database,
              username: editingConnection.username,
              password: '', // don't pre-fill password
              isDefault: editingConnection.isDefault ?? false,
            }}
            onSubmit={handleUpdate}
            onCancel={handleCancelForm}
            isSubmitting={updateMutation.isPending}
            submitLabel="Save Changes"
            connectionId={editingConnection.id}
            onTest={handleTestFromForm}
            isTestPending={isFormTestPending}
            testResult={formTestResult}
          />
        </div>
      )}

      {/* Connection list */}
      {view === 'list' && (
        <div className="conn-list-section">
          {isLoading && (
            <div className="conn-loading">
              <div className="conn-loading-dots">
                <span /><span /><span />
              </div>
              <span>Loading connections…</span>
            </div>
          )}

          {error && (
            <div className="conn-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Failed to load connections. Please refresh.
            </div>
          )}

          {!isLoading && !error && connectionList.length === 0 && (
            <div className="conn-empty">
              <div className="conn-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <h3 className="conn-empty-title">No connections yet</h3>
              <p className="conn-empty-desc">
                Add a ClickHouse connection to start querying your data warehouse.
              </p>
              <button
                className="conn-btn conn-btn--primary"
                onClick={() => setView('create')}
              >
                Add your first connection
              </button>
            </div>
          )}

          {!isLoading && connectionList.length > 0 && (
            <div className="conn-grid">
              {connectionList.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  onEdit={handleEdit}
                  onDelete={setDeletingConnection}
                  onSetDefault={(c) => setDefaultMutation.mutate(c.id)}
                  onTest={handleTestFromCard}
                  isTestPending={testPendingId === connection.id}
                  testResult={testResults[connection.id] ?? null}
                  isSettingDefault={setDefaultMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingConnection && (
        <DeleteModal
          connection={deletingConnection}
          onConfirm={() => deleteMutation.mutate(deletingConnection.id)}
          onCancel={() => setDeletingConnection(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
