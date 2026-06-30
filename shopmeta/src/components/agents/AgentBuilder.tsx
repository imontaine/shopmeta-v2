// src/components/agents/AgentBuilder.tsx
// Agent Builder UI — full CRUD for agents.
// Features: create, list, edit, delete, set-default, MCP server config editor.
// All server calls go through TanStack Query + server functions from src/lib/agents.ts

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  setDefaultAgent,
} from '#/lib/agents'
import type { AgentRow, McpServerConfig } from '#/lib/agents'
import { modelList } from '#/lib/ai/providers'
import {
  listSkills,
  getAgentSkillIds,
  setAgentSkills,
} from '#/lib/skills'
import type { SkillRow } from '#/lib/skills'
import { bakeSkillIntoInstructions } from '#/lib/ai/skill-helpers'
import {
  listMcpServers,
  setAgentMcpServers,
  getAgentMcpServerIds,
} from '#/lib/mcp-servers'

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error'; message: string }
let toastId = 0

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastId
    setToasts((p) => [...p, { id, type, message }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000)
  }
  return { toasts, addToast }
}

// ─── Agent form ───────────────────────────────────────────────────────────────

interface AgentFormData {
  name: string
  description: string
  model: string
  provider: string
  systemInstructions: string
  mcpServers: McpServerConfig[]         // Legacy inline JSON (advanced/override)
  mcpServerIds: string[]                // Catalog-selected server IDs
  isDefault: boolean
  skillIds: string[]
}

const emptyForm: AgentFormData = {
  name: '',
  description: '',
  model: 'gpt-4o',
  provider: 'openai',
  systemInstructions: '',
  mcpServers: [],
  mcpServerIds: [],
  isDefault: false,
  skillIds: [],
}

interface ValidationErrors {
  name?: string
  model?: string
  provider?: string
  systemInstructions?: string
}

function validate(form: AgentFormData): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  if (!form.model.trim()) errors.model = 'Model is required'
  if (!form.provider.trim()) errors.provider = 'Provider is required'
  return errors
}

interface AgentFormProps {
  initial?: Partial<AgentFormData>
  onSubmit: (data: AgentFormData) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
  submitLabel: string
  agentId?: string  // For loading existing skill attachments
}

function AgentForm({ initial, onSubmit, onCancel, isSubmitting, submitLabel, agentId }: AgentFormProps) {
  const [form, setForm] = useState<AgentFormData>({ ...emptyForm, ...initial })
  const [touched, setTouched] = useState<Partial<Record<keyof AgentFormData, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const errors = validate(form)
  const showError = (field: keyof ValidationErrors) =>
    (touched[field] || submitAttempted) ? errors[field] : undefined

  const set = <K extends keyof AgentFormData>(k: K, v: AgentFormData[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const touch = (k: keyof AgentFormData) =>
    setTouched((p) => ({ ...p, [k]: true }))

  const handleModelChange = (model: string) => {
    const info = modelList.find((m) => m.model === model)
    set('model', model)
    if (info) set('provider', info.provider)
    touch('model')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)
    if (Object.keys(errors).length > 0) return
    await onSubmit(form)
  }

  return (
    <form
      className="agent-form"
      onSubmit={handleSubmit}
      noValidate
      data-testid="agent-form"
      aria-label="Agent configuration form"
    >
      {/* Name */}
      <div className="agent-field">
        <label className="agent-label" htmlFor="agent-name">
          Name <span className="agent-required" aria-hidden="true">*</span>
        </label>
        <input
          id="agent-name"
          data-testid="agent-name-input"
          className={`agent-input ${showError('name') ? 'agent-input--error' : ''}`}
          type="text"
          placeholder="e.g. Sales Assistant"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => touch('name')}
          disabled={isSubmitting}
          required
          aria-describedby={showError('name') ? 'agent-name-error' : undefined}
        />
        {showError('name') && (
          <p id="agent-name-error" className="agent-field-error" role="alert">
            {showError('name')}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="agent-field">
        <label className="agent-label" htmlFor="agent-description">
          Description <span className="agent-label-optional">(optional)</span>
        </label>
        <input
          id="agent-description"
          data-testid="agent-description-input"
          className="agent-input"
          type="text"
          placeholder="Short description of what this agent does"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={isSubmitting}
          maxLength={1000}
        />
      </div>

      {/* Model picker */}
      <div className="agent-field">
        <label className="agent-label" htmlFor="agent-model">
          Model <span className="agent-required" aria-hidden="true">*</span>
        </label>
        <select
          id="agent-model"
          data-testid="agent-model-select"
          className={`agent-select ${showError('model') ? 'agent-input--error' : ''}`}
          value={form.model}
          onChange={(e) => handleModelChange(e.target.value)}
          onBlur={() => touch('model')}
          disabled={isSubmitting}
          aria-describedby={showError('model') ? 'agent-model-error' : undefined}
        >
          <option value="">— Select a model —</option>
          {['openai', 'anthropic', 'google'].map((provider) => (
            <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
              {modelList
                .filter((m) => m.provider === provider)
                .map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.label}
                    {m.description ? ` — ${m.description}` : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {showError('model') && (
          <p id="agent-model-error" className="agent-field-error" role="alert">
            {showError('model')}
          </p>
        )}
      </div>

      {/* System instructions */}
      <div className="agent-field">
        <label className="agent-label" htmlFor="agent-system-instructions">
          System Instructions
          <span className="agent-label-optional"> (optional)</span>
        </label>
        <textarea
          id="agent-system-instructions"
          data-testid="agent-system-instructions-input"
          className="agent-input agent-textarea"
          placeholder="You are a helpful assistant specialized in ecommerce analytics. Always respond concisely..."
          value={form.systemInstructions}
          onChange={(e) => set('systemInstructions', e.target.value)}
          disabled={isSubmitting}
          rows={6}
          maxLength={100_000}
        />
        <p className="agent-field-hint">
          Instructions sent as the system message at the start of every conversation.
        </p>
      </div>

      {/* MCP Servers — Catalog Picker (primary) + inline override (advanced) */}
      <AgentMcpSection
        selectedMcpServerIds={form.mcpServerIds}
        onMcpServersChange={(ids) => set('mcpServerIds', ids)}
        agentId={agentId}
        disabled={isSubmitting}
      />

      {/* Advanced: inline MCP override (raw JSON) — collapsible */}
      <AgentMcpInlineEditor
        value={form.mcpServers}
        onChange={(v) => set('mcpServers', v)}
        disabled={isSubmitting}
      />

      {/* Skills */}
      <AgentSkillsSection
        selectedSkillIds={form.skillIds}
        onSkillsChange={(ids) => set('skillIds', ids)}
        onBakeSkill={(skill) => {
          set('systemInstructions', bakeSkillIntoInstructions(
            form.systemInstructions,
            skill.name,
            skill.body,
          ))
          // Remove from dynamic attachments after baking
          set('skillIds', form.skillIds.filter((id) => id !== skill.id))
        }}
        agentId={agentId}
        disabled={isSubmitting}
      />

      {/* Set as default */}
      <div className="agent-field agent-field--checkbox">
        <label className="agent-checkbox-label">
          <input
            type="checkbox"
            className="agent-checkbox"
            id="agent-is-default"
            data-testid="agent-is-default-checkbox"
            checked={form.isDefault}
            onChange={(e) => set('isDefault', e.target.checked)}
            disabled={isSubmitting}
          />
          <span>Set as default agent for this organization</span>
        </label>
      </div>

      {/* Actions */}
      <div className="agent-form-actions">
        <button
          type="button"
          className="agent-btn agent-btn--cancel"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="agent-btn agent-btn--primary"
          disabled={isSubmitting}
          id="agent-submit-btn"
          data-testid="agent-submit-btn"
        >
          {isSubmitting ? <span className="agent-spinner" /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
// ─── Agent MCP Section (catalog picker) ──────────────────────────────────────
// Picker only — users manage the catalog on the /mcp-servers page.

interface AgentMcpSectionProps {
  selectedMcpServerIds: string[]
  onMcpServersChange: (ids: string[]) => void
  agentId?: string
  disabled?: boolean
}

function AgentMcpSection({
  selectedMcpServerIds,
  onMcpServersChange,
  agentId,
  disabled,
}: AgentMcpSectionProps) {
  const { data: allServers = [] } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: () => listMcpServers({ data: {} }),
  })

  // Load existing catalog attachments when editing an agent
  const { data: existingIds } = useQuery({
    queryKey: ['agent-mcp-servers', agentId],
    queryFn: () => getAgentMcpServerIds({ data: { agentId: agentId! } }),
    enabled: !!agentId,
  })

  // Sync existing IDs into form state once the query resolves
  useEffect(() => {
    if (existingIds && existingIds.length > 0 && selectedMcpServerIds.length === 0) {
      onMcpServersChange(existingIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingIds])

  const toggleServer = (id: string) => {
    if (selectedMcpServerIds.includes(id)) {
      onMcpServersChange(selectedMcpServerIds.filter((sid) => sid !== id))
    } else {
      onMcpServersChange([...selectedMcpServerIds, id])
    }
  }

  const transportLabel = (t: string) =>
    t === 'streamable-http' ? 'Streamable HTTPS' : t === 'sse' ? 'SSE' : t

  return (
    <div className="agent-field" data-testid="agent-mcp-section">
      <div className="agent-mcp-header">
        <label className="agent-label">MCP Servers</label>
        <a
          href="/mcp-servers"
          className="agent-btn agent-btn--secondary agent-btn--sm"
          target="_blank"
          rel="noreferrer"
        >
          Manage catalog ↗
        </a>
      </div>
      <p className="agent-field-hint" style={{ marginBottom: '0.5rem' }}>
        Select MCP servers from your catalog. Add or manage servers on the{' '}
        <a href="/mcp-servers" className="agent-link">MCP Servers</a> page.
      </p>

      {allServers.length > 0 ? (
        <div className="agent-mcp-list" data-testid="agent-mcp-list">
          {allServers.map((server) => (
            <div key={server.id} className="agent-mcp-row" data-testid={`agent-mcp-row-${server.id}`}>
              <label className="agent-mcp-checkbox-label">
                <input
                  data-testid={`agent-mcp-checkbox-${server.id}`}
                  type="checkbox"
                  checked={selectedMcpServerIds.includes(server.id)}
                  onChange={() => toggleServer(server.id)}
                  disabled={disabled}
                  className="agent-checkbox"
                />
                <div className="agent-mcp-server-info">
                  <span className="agent-mcp-server-name">{server.name}</span>
                  <span className="agent-mcp-server-meta">
                    <span className="agent-mcp-tag">{server.serverName}</span>
                    <span className="agent-mcp-url">{server.url}</span>
                    <span className={`agent-mcp-transport agent-mcp-transport--${server.transport}`}>
                      {transportLabel(server.transport)}
                    </span>
                  </span>
                  {server.description && (
                    <span className="agent-mcp-server-desc">{server.description}</span>
                  )}
                </div>
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div className="agent-mcp-empty" data-testid="agent-mcp-empty">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>
            No MCP servers in catalog.{' '}
            <a href="/mcp-servers" className="agent-link">Add one on the MCP Servers page.</a>
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Inline MCP Override Editor (advanced / legacy) ───────────────────────────

interface AgentMcpInlineEditorProps {
  value: McpServerConfig[]
  onChange: (v: McpServerConfig[]) => void
  disabled?: boolean
}

function AgentMcpInlineEditor({ value, onChange, disabled }: AgentMcpInlineEditorProps) {
  const [open, setOpen] = useState(false)
  const [rawJson, setRawJson] = useState(() => (value.length > 0 ? JSON.stringify(value, null, 2) : ''))
  const [jsonError, setJsonError] = useState<string | null>(null)

  const handleChange = (text: string) => {
    setRawJson(text)
    if (!text.trim()) {
      setJsonError(null)
      onChange([])
      return
    }
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) { setJsonError('Must be a JSON array'); return }
      setJsonError(null)
      onChange(parsed)
    } catch {
      setJsonError('Invalid JSON')
    }
  }

  return (
    <div className="agent-field">
      <button
        type="button"
        className="agent-mcp-advanced-toggle"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        data-testid="agent-mcp-advanced-toggle"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Advanced: Inline MCP Server Override
        {value.length > 0 && (
          <span className="agent-mcp-override-badge">{value.length} inline</span>
        )}
      </button>
      {open && (
        <div className="agent-mcp-advanced-body">
          <p className="agent-field-hint" style={{ marginBottom: '0.5rem' }}>
            Optional raw JSON to append extra MCP servers not in the catalog. These are merged with catalog selections at runtime.
          </p>
          <textarea
            id="agent-mcp-servers"
            data-testid="mcp-servers-input"
            className={`agent-input agent-textarea agent-mono ${jsonError ? 'agent-input--error' : ''}`}
            value={rawJson}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={`[\n  {\n    "name": "clickhouse",\n    "url": "https://mcp.example.com",\n    "transport": "http"\n  }\n]`}
            disabled={disabled}
            rows={5}
            spellCheck={false}
          />
          {jsonError && <p className="agent-field-error">{jsonError}</p>}
          <p className="agent-field-hint">
            Each entry: <code>{`{ "name", "url", "transport"? }`}</code>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Agent Skills Section ─────────────────────────────────────────────────────

interface AgentSkillsSectionProps {
  selectedSkillIds: string[]
  onSkillsChange: (ids: string[]) => void
  onBakeSkill: (skill: SkillRow) => void
  agentId?: string
  disabled?: boolean
}

function AgentSkillsSection({
  selectedSkillIds,
  onSkillsChange,
  onBakeSkill,
  agentId,
  disabled,
}: AgentSkillsSectionProps) {
  const { data: allSkills = [] } = useQuery({
    queryKey: ['skills'],
    queryFn: () => listSkills({ data: {} }),
  })

  // Load existing skill attachments when editing an agent
  const { data: existingSkillIds } = useQuery({
    queryKey: ['agent-skills', agentId],
    queryFn: () => getAgentSkillIds({ data: { agentId: agentId! } }),
    enabled: !!agentId,
  })

  // Sync existing skills into form state once the query resolves (runs on data arrival)
  useEffect(() => {
    if (existingSkillIds && existingSkillIds.length > 0 && selectedSkillIds.length === 0) {
      onSkillsChange(existingSkillIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSkillIds])

  const toggleSkill = (skillId: string) => {
    if (selectedSkillIds.includes(skillId)) {
      onSkillsChange(selectedSkillIds.filter((id) => id !== skillId))
    } else {
      onSkillsChange([...selectedSkillIds, skillId])
    }
  }

  if (allSkills.length === 0) return null

  return (
    <div className="agent-field" data-testid="agent-skills-section">
      <label className="agent-label">Skills</label>
      <p className="agent-field-hint" style={{ marginBottom: '0.5rem' }}>
        Attach knowledge skills to this agent. Always-apply skills are included automatically.
      </p>
      <div className="agent-skills-list">
        {allSkills.map((skill) => (
          <div
            key={skill.id}
            className="agent-skill-row"
          >
            <label className="agent-skill-checkbox-label">
              <input
                data-testid={`agent-skill-checkbox-${skill.id}`}
                type="checkbox"
                checked={selectedSkillIds.includes(skill.id) || skill.alwaysApply}
                onChange={() => toggleSkill(skill.id)}
                disabled={disabled || skill.alwaysApply}
                className="agent-checkbox"
              />
              <span className="agent-skill-name">{skill.name}</span>
              {skill.source === 'bundled' && (
                <span
                  data-testid={`agent-skill-bundled-${skill.id}`}
                  className="skill-badge skill-badge--bundled"
                >
                  Bundled
                </span>
              )}
              {skill.alwaysApply && (
                <span
                  data-testid={`agent-skill-always-apply-${skill.id}`}
                  className="skill-badge skill-badge--always-apply"
                >
                  Always Apply
                </span>
              )}
            </label>
            {skill.description && (
              <span className="agent-skill-desc">{skill.description}</span>
            )}
            <button
              data-testid={`agent-skill-bake-btn-${skill.id}`}
              type="button"
              className="agent-btn agent-btn--secondary agent-btn--sm"
              onClick={() => onBakeSkill(skill)}
              disabled={disabled}
              title="Copy skill content into System Instructions"
            >
              Bake
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Agent card ───────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentRow
  onEdit: (a: AgentRow) => void
  onDelete: (a: AgentRow) => void
  onSetDefault: (a: AgentRow) => void
  isSettingDefault: boolean
  isDeleting: boolean
}

function AgentCard({ agent, onEdit, onDelete, onSetDefault, isSettingDefault, isDeleting }: AgentCardProps) {
  const modelInfo = modelList.find((m) => m.model === agent.model)
  // Total MCP count = inline JSON servers + catalog-attached servers
  const mcpCount = (agent.mcpServers?.length ?? 0) + (agent.catalogMcpServerCount ?? 0)

  return (
    <div
      className={`agent-card ${agent.isDefault ? 'agent-card--default' : ''}`}
      data-agent-id={agent.id}
      data-testid={`agent-card-${agent.id}`}
    >
      <div className="agent-card-header">
        <div className="agent-card-title-row">
          <span className="agent-card-name">{agent.name}</span>
          {agent.isDefault && (
            <span className="agent-default-badge" aria-label="Default agent">Default</span>
          )}
        </div>
        <div className="agent-card-actions">
          <button
            className="agent-card-btn"
            onClick={() => onEdit(agent)}
            aria-label={`Edit ${agent.name}`}
            title="Edit agent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          {!agent.isDefault && (
            <button
              className="agent-card-btn"
              onClick={() => onSetDefault(agent)}
              disabled={isSettingDefault}
              aria-label={`Set ${agent.name} as default`}
              title="Set as default"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          <button
            className="agent-card-btn agent-card-btn--danger"
            onClick={() => onDelete(agent)}
            disabled={isDeleting}
            aria-label={`Delete ${agent.name}`}
            title="Delete agent"
            id={`agent-delete-btn-${agent.id}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>

      {agent.description && (
        <p className="agent-card-description">{agent.description}</p>
      )}

      <div className="agent-card-meta">
        <span className="agent-meta-chip agent-meta-chip--model">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          {modelInfo?.label ?? agent.model}
        </span>
        <span className="agent-meta-chip">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11M9 14H5a2 2 0 0 1-2-2V5m6 9h10a2 2 0 0 0 2-2V5M9 14v7h10v-7" />
          </svg>
          {agent.provider}
        </span>
        {mcpCount > 0 && (
          <span className="agent-meta-chip agent-meta-chip--mcp">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            {mcpCount} MCP server{mcpCount !== 1 ? 's' : ''}
          </span>
        )}
        {agent.systemInstructions && (
          <span className="agent-meta-chip agent-meta-chip--instructions">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="17" y1="10" x2="3" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="17" y1="18" x2="3" y2="18" />
            </svg>
            Has system prompt
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteModalProps {
  agent: AgentRow
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}

function DeleteModal({ agent, onConfirm, onCancel, isDeleting }: DeleteModalProps) {
  return (
    <div className="agent-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm deletion">
      <div className="agent-modal">
        <div className="agent-modal-icon agent-modal-icon--danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
        <h2 className="agent-modal-title">Delete Agent</h2>
        <p className="agent-modal-body">
          Are you sure you want to delete <strong>{agent.name}</strong>?
          Conversations that used this agent will retain the reference but the agent will no longer be available.
          This action cannot be undone.
        </p>
        <div className="agent-modal-actions">
          <button className="agent-btn agent-btn--cancel" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button
            className="agent-btn agent-btn--danger"
            onClick={onConfirm}
            disabled={isDeleting}
            id="agent-delete-confirm-btn"
            data-testid="agent-delete-confirm-btn"
          >
            {isDeleting ? <span className="agent-spinner" /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type View = 'list' | 'create' | 'edit'

export function AgentBuilder() {
  const queryClient = useQueryClient()
  const { toasts, addToast } = useToast()

  const [view, setView] = useState<View>('list')
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null)
  const [deletingAgent, setDeletingAgent] = useState<AgentRow | null>(null)

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: agentList = [], isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ data: {} }),
  })

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof createAgent>[0]) => createAgent(d),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      addToast('success', `Agent "${agent.name}" created`)
      setView('list')
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to create agent'),
  })

  const updateMutation = useMutation({
    mutationFn: (d: Parameters<typeof updateAgent>[0]) => updateAgent(d),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      addToast('success', `Agent "${agent.name}" updated`)
      setView('list')
      setEditingAgent(null)
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to update agent'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAgent({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      addToast('success', 'Agent deleted')
      setDeletingAgent(null)
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete agent')
      setDeletingAgent(null)
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultAgent({ data: { id } }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      addToast('success', `"${agent.name}" is now the default agent`)
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to set default'),
  })

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = async (form: AgentFormData) => {
    const agent = await createMutation.mutateAsync({
      data: {
        name: form.name,
        description: form.description || undefined,
        model: form.model,
        provider: form.provider,
        systemInstructions: form.systemInstructions || undefined,
        mcpServers: form.mcpServers,
        isDefault: form.isDefault,
      },
    })
    if (!agent?.id) return
    // Save skill attachments if any were selected
    if (form.skillIds.length > 0) {
      try {
        await setAgentSkills({ data: { agentId: agent.id, skillIds: form.skillIds } })
      } catch {
        addToast('error', 'Agent created but skills attachment failed')
      }
    }
    // Save catalog MCP server selections
    if (form.mcpServerIds.length > 0) {
      try {
        await setAgentMcpServers({ data: { agentId: agent.id, mcpServerIds: form.mcpServerIds } })
      } catch {
        addToast('error', 'Agent created but MCP server attachment failed')
      }
    }
  }

  const handleUpdate = async (form: AgentFormData) => {
    if (!editingAgent) return
    await updateMutation.mutateAsync({
      data: {
        id: editingAgent.id,
        name: form.name,
        description: form.description || undefined,
        model: form.model,
        provider: form.provider,
        systemInstructions: form.systemInstructions || undefined,
        mcpServers: form.mcpServers,
      },
    })
    // Save skill attachments
    try {
      await setAgentSkills({ data: { agentId: editingAgent.id, skillIds: form.skillIds } })
    } catch {
      addToast('error', 'Agent updated but skills attachment failed')
    }
    // Save catalog MCP server selections
    try {
      await setAgentMcpServers({ data: { agentId: editingAgent.id, mcpServerIds: form.mcpServerIds } })
    } catch {
      addToast('error', 'Agent updated but MCP server attachment failed')
    }
  }

  const handleEdit = (agent: AgentRow) => {
    setEditingAgent(agent)
    setView('edit')
  }

  const handleCancelForm = () => {
    setView('list')
    setEditingAgent(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="agent-builder">
      {/* Toasts */}
      <div className="agent-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`agent-toast agent-toast--${t.type}`}>
            {t.type === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {t.message}
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="agent-section-header">
        <div>
          <h2 className="agent-section-title">Agent Builder</h2>
          <p className="agent-section-desc">
            Create AI agents with custom system instructions, model selection, and MCP server integrations.
          </p>
        </div>
        {view === 'list' && (
          <button
            className="agent-btn agent-btn--primary"
            onClick={() => setView('create')}
            id="agent-add-btn"
            data-testid="agent-add-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Agent
          </button>
        )}
      </div>

      {/* Create form */}
      {view === 'create' && (
        <div className="agent-form-wrapper">
          <h3 className="agent-form-title">New Agent</h3>
          <AgentForm
            onSubmit={handleCreate}
            onCancel={handleCancelForm}
            isSubmitting={createMutation.isPending}
            submitLabel="Create Agent"
          />
        </div>
      )}

      {/* Edit form */}
      {view === 'edit' && editingAgent && (
        <div className="agent-form-wrapper">
          <h3 className="agent-form-title">Edit Agent</h3>
          <AgentForm
            agentId={editingAgent.id}
            initial={{
              name: editingAgent.name,
              description: editingAgent.description ?? '',
              model: editingAgent.model,
              provider: editingAgent.provider,
              systemInstructions: editingAgent.systemInstructions ?? '',
              mcpServers: editingAgent.mcpServers ?? [],
              isDefault: editingAgent.isDefault ?? false,
            }}
            onSubmit={handleUpdate}
            onCancel={handleCancelForm}
            isSubmitting={updateMutation.isPending}
            submitLabel="Save Changes"
          />
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="agent-list-section">
          {isLoading && (
            <div className="agent-loading">
              <div className="agent-loading-dots">
                <span /><span /><span />
              </div>
              <span>Loading agents…</span>
            </div>
          )}

          {error && (
            <div className="agent-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Failed to load agents. Please refresh.
            </div>
          )}

          {!isLoading && !error && agentList.length === 0 && (
            <div className="agent-empty">
              <div className="agent-empty-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2a10 10 0 1 0 10 10" />
                  <path d="M12 8v4l3 3" />
                </svg>
              </div>
              <h3 className="agent-empty-title">No agents yet</h3>
              <p className="agent-empty-desc">
                Create your first AI agent with custom system instructions and model configuration.
              </p>
              <button
                className="agent-btn agent-btn--primary"
                onClick={() => setView('create')}
                data-testid="agent-create-first-btn"
              >
                Create your first agent
              </button>
            </div>
          )}

          {!isLoading && agentList.length > 0 && (
            <div className="agent-grid" data-testid="agent-grid">
              {agentList.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onEdit={handleEdit}
                  onDelete={setDeletingAgent}
                  onSetDefault={(a) => setDefaultMutation.mutate(a.id)}
                  isSettingDefault={setDefaultMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete modal */}
      {deletingAgent && (
        <DeleteModal
          agent={deletingAgent}
          onConfirm={() => deleteMutation.mutate(deletingAgent.id)}
          onCancel={() => setDeletingAgent(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
