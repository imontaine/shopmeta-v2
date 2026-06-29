// src/components/skills/SkillManager.tsx
// Skills management UI — list, create, edit, delete, upload.
// Bundled skills (source='bundled') are read-only.

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  parseSkillMarkdown,
} from '#/lib/skills'
import type { SkillRow } from '#/lib/skills'

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

// ─── Form State ───────────────────────────────────────────────────────────────

interface SkillFormData {
  name: string
  description: string
  body: string
  alwaysApply: boolean
}

const EMPTY_FORM: SkillFormData = {
  name: '',
  description: '',
  body: '',
  alwaysApply: false,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SkillManager() {
  const queryClient = useQueryClient()
  const { toasts, addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillRow | null>(null)
  const [form, setForm] = useState<SkillFormData>(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Queries
  const { data: skillsList = [], isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: () => listSkills({ data: {} }),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: SkillFormData) =>
      createSkill({
        data: {
          name: data.name,
          description: data.description || undefined,
          body: data.body,
          alwaysApply: data.alwaysApply,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      addToast('success', 'Skill created')
      resetForm()
    },
    onError: (err) => addToast('error', `Create failed: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SkillFormData> }) =>
      updateSkill({
        data: {
          id,
          name: data.name,
          description: data.description,
          body: data.body,
          alwaysApply: data.alwaysApply,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      addToast('success', 'Skill updated')
      resetForm()
    },
    onError: (err) => addToast('error', `Update failed: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSkill({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
      addToast('success', 'Skill deleted')
      setDeleteConfirmId(null)
    },
    onError: (err) => addToast('error', `Delete failed: ${err.message}`),
  })

  // Helpers
  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingSkill(null)
    setShowForm(false)
  }

  function startEdit(skill: SkillRow) {
    setEditingSkill(skill)
    setForm({
      name: skill.name,
      description: skill.description || '',
      body: skill.body,
      alwaysApply: skill.alwaysApply,
    })
    setShowForm(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.body.trim()) {
      addToast('error', 'Name and body are required')
      return
    }
    if (editingSkill) {
      updateMutation.mutate({ id: editingSkill.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const parsed = parseSkillMarkdown(text)
      setForm({
        name: parsed.metadata.name || file.name.replace(/\.md$/, ''),
        description: parsed.metadata.description || '',
        body: parsed.body,
        alwaysApply: parsed.metadata.alwaysApply,
      })
      setShowForm(true)
    }
    reader.readAsText(file)
    // Reset input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  // Separate bundled vs user skills
  const bundledSkills = skillsList.filter((s) => s.source === 'bundled')
  const userSkills = skillsList.filter((s) => s.source !== 'bundled')

  return (
    <div className="skill-manager">
      {/* Toast container */}
      <div className="agent-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`agent-toast agent-toast--${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Actions bar */}
      <div className="skill-actions-bar">
        <button
          data-testid="create-skill-btn"
          className="agent-btn agent-btn--primary"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          + Create Skill
        </button>
        <label className="agent-btn agent-btn--secondary" style={{ cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 12 15 15" /></svg>
          Upload .md
          <input
            ref={fileInputRef}
            data-testid="skill-upload-input"
            type="file"
            accept=".md,.markdown"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form className="skill-form" onSubmit={handleSubmit}>
          <h3 className="skill-form-title">
            {editingSkill ? `Edit: ${editingSkill.name}` : 'New Skill'}
          </h3>

          <div className="agent-field">
            <label className="agent-label">Name *</label>
            <input
              data-testid="skill-name-input"
              className="agent-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. clickhouse-best-practices"
              disabled={isMutating}
            />
          </div>

          <div className="agent-field">
            <label className="agent-label">Description</label>
            <input
              data-testid="skill-description-input"
              className="agent-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of what this skill teaches"
              disabled={isMutating}
            />
          </div>

          <div className="agent-field">
            <label className="agent-label">Body (Markdown) *</label>
            <textarea
              data-testid="skill-body-input"
              className="skill-editor"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="# Skill content in Markdown..."
              rows={12}
              disabled={isMutating}
            />
          </div>

          <div className="agent-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input
              data-testid="skill-always-apply-toggle"
              type="checkbox"
              checked={form.alwaysApply}
              onChange={(e) => setForm({ ...form, alwaysApply: e.target.checked })}
              disabled={isMutating}
              id="always-apply-toggle"
            />
            <label htmlFor="always-apply-toggle" className="agent-label" style={{ marginBottom: 0 }}>
              Always apply (auto-include in all conversations)
            </label>
          </div>

          <div className="skill-form-actions">
            <button
              data-testid="skill-save-btn"
              type="submit"
              className="agent-btn agent-btn--primary"
              disabled={isMutating}
            >
              {isMutating ? 'Saving...' : editingSkill ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              className="agent-btn agent-btn--secondary"
              onClick={resetForm}
              disabled={isMutating}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Skills list */}
      {isLoading ? (
        <p className="skills-loading">Loading skills...</p>
      ) : skillsList.length === 0 ? (
        <div className="skills-empty">
          <p>No skills yet. Create one or upload a .md file to get started.</p>
        </div>
      ) : (
        <>
          {/* Bundled skills */}
          {bundledSkills.length > 0 && (
            <div className="skills-section">
              <h3 className="skills-section-title">Bundled Skills</h3>
              <div className="skill-cards">
                {bundledSkills.map((skill) => (
                  <div key={skill.id} data-testid={`skill-card-${skill.id}`} className="skill-card skill-card--bundled">
                    <div className="skill-card-header">
                      <div className="skill-card-title-row">
                        <span className="skill-card-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                        <h4 className="skill-card-name">{skill.name}</h4>
                        <span className="skill-badge skill-badge--bundled">Bundled</span>
                        {skill.alwaysApply && (
                          <span className="skill-badge skill-badge--always-apply">Always Apply</span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="skill-card-description">{skill.description}</p>
                      )}
                    </div>
                    <div className="skill-card-footer">
                      <span className="skill-card-meta">
                        {skill.body.length.toLocaleString()} chars
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User skills */}
          {userSkills.length > 0 && (
            <div className="skills-section">
              <h3 className="skills-section-title">
                {bundledSkills.length > 0 ? 'Your Skills' : ''}
              </h3>
              <div className="skill-cards">
                {userSkills.map((skill) => (
                  <div key={skill.id} data-testid={`skill-card-${skill.id}`} className="skill-card">
                    <div className="skill-card-header">
                      <div className="skill-card-title-row">
                        <h4 className="skill-card-name">{skill.name}</h4>
                        {skill.alwaysApply && (
                          <span className="skill-badge skill-badge--always-apply">Always Apply</span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="skill-card-description">{skill.description}</p>
                      )}
                    </div>
                    <div className="skill-card-footer">
                      <span className="skill-card-meta">
                        {skill.body.length.toLocaleString()} chars
                        {skill.updatedAt && ` · Updated ${new Date(skill.updatedAt).toLocaleDateString()}`}
                      </span>
                      <div className="skill-card-actions">
                        <button
                          data-testid={`skill-edit-btn-${skill.id}`}
                          className="agent-btn agent-btn--secondary agent-btn--sm"
                          onClick={() => startEdit(skill)}
                        >
                          Edit
                        </button>
                        <button
                          data-testid={`skill-delete-btn-${skill.id}`}
                          className="agent-btn agent-btn--danger agent-btn--sm"
                          onClick={() => setDeleteConfirmId(skill.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div className="agent-modal-overlay" data-testid="skill-delete-confirm">
          <div className="agent-modal">
            <h3 className="agent-modal-title">Delete Skill?</h3>
            <p className="agent-modal-text">
              This will permanently remove this skill and detach it from all agents.
            </p>
            <div className="agent-modal-actions">
              <button
                className="agent-btn agent-btn--danger"
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button
                className="agent-btn agent-btn--secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
