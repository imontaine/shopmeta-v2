// src/components/skills/SkillManager.tsx
// Skills management UI — list, create, edit, delete, upload.
// Supports:
//   • Single .md / .markdown file upload (legacy)
//   • Multi-file upload — select all files of a skill folder at once
//   • ZIP upload — drop a .zip containing the full skill folder structure
//
// Allowed file extensions inside a skill folder (mirrors ClickHouse agent-skills):
//   .md  .markdown  .json
//
// Bundled skills (source='bundled') are read-only.

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unzipSync, strFromU8 } from 'fflate'
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  parseSkillMarkdown,
} from '#/lib/skills'
import type { SkillRow } from '#/lib/skills'

// ─── Constants ────────────────────────────────────────────────────────────────

/** File extensions accepted for individual file / multi-file upload */
const ALLOWED_EXTS = ['.md', '.markdown', '.json']

// ─── Types ────────────────────────────────────────────────────────────────────

interface StagedFile {
  /** Relative path inside the skill folder, e.g. "rules/01-basics.md" */
  path: string
  content: string
}

interface StagedSkill {
  name: string
  description: string
  body: string
  alwaysApply: boolean
  files: StagedFile[]
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error' | 'info'; message: string }
let toastId = 0

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastId
    setToasts((p) => [...p, { id, type, message }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000)
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

// ─── Skill Assembly Helpers ───────────────────────────────────────────────────

function isAllowedFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return ALLOWED_EXTS.some((ext) => lower.endsWith(ext))
}

/**
 * Given a flat list of {path, content} files from a skill folder,
 * assemble a SkillFormData by:
 *  1. Parsing SKILL.md frontmatter for name / description / alwaysApply
 *  2. Extracting name from metadata.json as fallback
 *  3. Building body = SKILL.md body + AGENTS.md + rules/*.md (sorted)
 */
function assembleSkillFromFiles(files: StagedFile[], fallbackName: string): SkillFormData {
  // Normalise paths: strip a leading directory prefix if all paths share one
  // e.g. "my-skill/SKILL.md" → "SKILL.md"
  const normalised = (() => {
    const parts = files.map((f) => f.path.split('/').filter(Boolean))
    const firstSeg = parts[0]?.[0]
    const allShareRoot = firstSeg && parts.every((p) => p[0] === firstSeg)
    if (allShareRoot && parts.every((p) => p.length > 1)) {
      return files.map((f) => ({
        ...f,
        path: f.path.split('/').slice(1).join('/'),
      }))
    }
    return files
  })()

  const byPath: Record<string, string> = {}
  for (const f of normalised) byPath[f.path] = f.content

  // --- Parse SKILL.md ---
  const skillMd = byPath['SKILL.md'] ?? byPath['skill.md'] ?? ''
  const parsed = skillMd ? parseSkillMarkdown(skillMd) : null

  // --- Parse metadata.json for fallback name ---
  let metaName = ''
  const metaJson = byPath['metadata.json']
  if (metaJson) {
    try {
      const meta = JSON.parse(metaJson) as Record<string, unknown>
      if (typeof meta['name'] === 'string') metaName = meta['name']
    } catch {
      // ignore
    }
  }

  // --- Build body ---
  const bodyParts: string[] = []

  // 1. SKILL.md body
  if (parsed?.body) bodyParts.push(parsed.body)

  // 2. AGENTS.md (if present and different from SKILL.md)
  const agentsMd = byPath['AGENTS.md'] ?? byPath['agents.md']
  if (agentsMd) bodyParts.push(`\n\n---\n\n## AGENTS\n\n${agentsMd.trim()}`)

  // 3. README.md (if present)
  const readmeMd = byPath['README.md'] ?? byPath['readme.md']
  if (readmeMd) bodyParts.push(`\n\n---\n\n## README\n\n${readmeMd.trim()}`)

  // 4. rules/*.md sorted
  const rulePaths = Object.keys(byPath)
    .filter((p) => p.startsWith('rules/') && (p.endsWith('.md') || p.endsWith('.markdown')))
    .sort()
  for (const rp of rulePaths) {
    const ruleName = rp.replace(/^rules\//, '').replace(/\.(md|markdown)$/, '')
    bodyParts.push(`\n\n---\n\n### ${ruleName}\n\n${byPath[rp]!.trim()}`)
  }

  const body = bodyParts.join('').trim()

  return {
    name: parsed?.metadata.name || metaName || fallbackName,
    description: parsed?.metadata.description ?? '',
    body: body || skillMd.trim(),
    alwaysApply: parsed?.metadata.alwaysApply ?? false,
  }
}

/**
 * Read a FileList into StagedFile[], filtering to allowed extensions.
 * For multi-file uploads, webkitRelativePath gives the folder-relative path.
 */
async function readFileList(fileList: FileList): Promise<StagedFile[]> {
  const results: StagedFile[] = []
  const files = Array.from(fileList)

  for (const file of files) {
    if (!isAllowedFile(file.name)) continue
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const content = await file.text()
    results.push({ path, content })
  }

  return results
}

/**
 * Read a ZIP file and extract all allowed files.
 */
async function readZipFile(file: File): Promise<StagedFile[]> {
  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)
  const unzipped = unzipSync(uint8, {
    filter: (f) => !f.name.startsWith('__MACOSX') && isAllowedFile(f.name),
  })

  const results: StagedFile[] = []
  for (const [path, data] of Object.entries(unzipped)) {
    // Skip directory entries (size 0, path ends with /)
    if (path.endsWith('/')) continue
    results.push({ path, content: strFromU8(data) })
  }
  return results
}

// ─── SkillUploadZone ──────────────────────────────────────────────────────────

interface SkillUploadZoneProps {
  onStaged: (staged: StagedSkill) => void
  onError: (msg: string) => void
}

function SkillUploadZone({ onStaged, onError }: SkillUploadZoneProps) {
  const singleMdRef = useRef<HTMLInputElement>(null)
  const multiFileRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  async function processFiles(files: StagedFile[], fallbackName: string) {
    if (files.length === 0) {
      onError('No supported files found (.md, .markdown, .json)')
      return
    }
    const form = assembleSkillFromFiles(files, fallbackName)
    onStaged({ ...form, files })
  }

  // Single .md file (legacy)
  async function handleSingleMd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const content = await file.text()
    await processFiles([{ path: file.name, content }], file.name.replace(/\.(md|markdown)$/i, ''))
    if (singleMdRef.current) singleMdRef.current.value = ''
  }

  // Multi-file (folder contents)
  async function handleMultiFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files
    if (!fl || fl.length === 0) return
    const files = await readFileList(fl)
    // Guess skill name from shared root directory
    const firstPath = (fl[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
    const folderName = firstPath.split('/')[0] ?? 'my-skill'
    await processFiles(files, folderName)
    if (multiFileRef.current) multiFileRef.current.value = ''
  }

  // ZIP
  async function handleZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const files = await readZipFile(file)
      const zipName = file.name.replace(/\.zip$/i, '')
      await processFiles(files, zipName)
    } catch (err) {
      onError(`ZIP parse error: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (zipRef.current) zipRef.current.value = ''
  }

  // Drag & drop (accepts ZIP or individual files)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const dt = e.dataTransfer
    if (!dt.files.length) return

    // Check if it's a ZIP
    const firstFile = dt.files[0]!
    if (firstFile.name.toLowerCase().endsWith('.zip')) {
      try {
        const files = await readZipFile(firstFile)
        const zipName = firstFile.name.replace(/\.zip$/i, '')
        await processFiles(files, zipName)
      } catch (err) {
        onError(`ZIP parse error: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      // Treat as multi-file
      const files = await readFileList(dt.files)
      await processFiles(files, 'my-skill')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`skill-upload-zone ${isDragOver ? 'skill-upload-zone--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="skill-upload-zone-icon" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <polyline points="9 15 12 12 15 15" />
        </svg>
      </div>
      <p className="skill-upload-zone-label">
        Drop a <strong>.zip</strong> or files here
      </p>
      <p className="skill-upload-zone-hint">
        Accepted: <code>.md</code> · <code>.markdown</code> · <code>.json</code>
      </p>
      <div className="skill-upload-btns">
        {/* ZIP */}
        <label className="agent-btn agent-btn--secondary" style={{ cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}>
            <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
          </svg>
          Upload .zip
          <input
            ref={zipRef}
            data-testid="skill-zip-input"
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleZip}
          />
        </label>

        {/* Multi-file (folder picker) */}
        <label className="agent-btn agent-btn--secondary" style={{ cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Upload Folder
          <input
            ref={multiFileRef}
            data-testid="skill-folder-input"
            type="file"
            // @ts-expect-error — non-standard but widely supported
            webkitdirectory=""
            multiple
            style={{ display: 'none' }}
            onChange={handleMultiFile}
          />
        </label>

        {/* Single .md */}
        <label className="agent-btn agent-btn--secondary" style={{ cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          Upload .md
          <input
            ref={singleMdRef}
            data-testid="skill-upload-input"
            type="file"
            accept=".md,.markdown"
            style={{ display: 'none' }}
            onChange={handleSingleMd}
          />
        </label>
      </div>
    </div>
  )
}

// ─── StagedSkillPreview ───────────────────────────────────────────────────────

interface StagedSkillPreviewProps {
  staged: StagedSkill
  onConfirm: (form: SkillFormData) => void
  onDiscard: () => void
  isSaving: boolean
}

function StagedSkillPreview({ staged, onConfirm, onDiscard, isSaving }: StagedSkillPreviewProps) {
  const [form, setForm] = useState<SkillFormData>({
    name: staged.name,
    description: staged.description,
    body: staged.body,
    alwaysApply: staged.alwaysApply,
  })

  return (
    <div className="skill-staged-preview">
      <div className="skill-staged-header">
        <h3 className="skill-staged-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: '-3px', marginRight: '6px' }}>
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          Review Uploaded Skill
        </h3>
        {/* File list */}
        {staged.files.length > 0 && (
          <div className="skill-staged-files">
            <span className="skill-staged-files-label">{staged.files.length} file{staged.files.length !== 1 ? 's' : ''} detected:</span>
            <ul className="skill-staged-file-list">
              {staged.files.map((f) => (
                <li key={f.path} className="skill-staged-file">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <code>{f.path}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form className="skill-form" onSubmit={(e) => { e.preventDefault(); onConfirm(form) }}>
        <div className="agent-field">
          <label className="agent-label">Name *</label>
          <input
            data-testid="skill-name-input"
            className="agent-input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. clickhouse-best-practices"
            disabled={isSaving}
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
            disabled={isSaving}
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
            rows={14}
            disabled={isSaving}
          />
        </div>

        <div className="agent-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <input
            data-testid="skill-always-apply-toggle"
            type="checkbox"
            checked={form.alwaysApply}
            onChange={(e) => setForm({ ...form, alwaysApply: e.target.checked })}
            disabled={isSaving}
            id="staged-always-apply-toggle"
          />
          <label htmlFor="staged-always-apply-toggle" className="agent-label" style={{ marginBottom: 0 }}>
            Always apply (auto-include in all conversations)
          </label>
        </div>

        <div className="skill-form-actions">
          <button
            data-testid="skill-save-btn"
            type="submit"
            className="agent-btn agent-btn--primary"
            disabled={isSaving || !form.name.trim() || !form.body.trim()}
          >
            {isSaving ? 'Saving...' : 'Create Skill'}
          </button>
          <button
            type="button"
            className="agent-btn agent-btn--secondary"
            onClick={onDiscard}
            disabled={isSaving}
          >
            Discard
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SkillManager() {
  const queryClient = useQueryClient()
  const { toasts, addToast } = useToast()

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillRow | null>(null)
  const [form, setForm] = useState<SkillFormData>(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [stagedSkill, setStagedSkill] = useState<StagedSkill | null>(null)

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
      setStagedSkill(null)
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
    setStagedSkill(null)
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

  const isMutating = createMutation.isPending || updateMutation.isPending

  // Separate bundled vs user skills
  const bundledSkills = skillsList.filter((s) => s.source === 'bundled')
  const userSkills = skillsList.filter((s) => s.source !== 'bundled')

  return (
    <div className="conn-settings" data-testid="skill-manager">
      {/* Toast container */}
      <div className="conn-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`conn-toast conn-toast--${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="conn-section-header">
        <div>
          <h2 className="conn-section-title">Skill Library</h2>
          <p className="conn-section-desc">
            Skills are instruction sets and knowledge documents that agents can draw on.
            Upload .md files, folders, or .zip archives.
          </p>
        </div>
        {!showForm && !stagedSkill && (
          <button
            data-testid="create-skill-btn"
            className="conn-btn conn-btn--primary"
            onClick={() => {
              resetForm()
              setStagedSkill(null)
              setShowForm(true)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Skill
          </button>
        )}
      </div>

      {/* Upload zone — shown when no form/staged skill is open */}
      {!showForm && !stagedSkill && (
        <SkillUploadZone
          onStaged={(staged) => {
            setStagedSkill(staged)
            addToast('info', `Loaded ${staged.files.length} file(s) — review before saving`)
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {/* Staged skill preview */}
      {stagedSkill && !showForm && (
        <StagedSkillPreview
          staged={stagedSkill}
          onConfirm={(f) => createMutation.mutate(f)}
          onDiscard={() => setStagedSkill(null)}
          isSaving={createMutation.isPending}
        />
      )}

      {/* Create / Edit form (manual) */}
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
        <div className="conn-loading">
          <div className="conn-loading-dots"><span /><span /><span /></div>
          <span>Loading skills…</span>
        </div>
      ) : skillsList.length === 0 ? (
        <div className="conn-empty">
          <div className="conn-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <h3 className="conn-empty-title">No skills yet</h3>
          <p className="conn-empty-desc">
            Create a skill or upload a skill folder / .zip to get started.
          </p>
          <button
            className="conn-btn conn-btn--primary"
            onClick={() => { resetForm(); setShowForm(true) }}
          >
            Create your first skill
          </button>
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
                          className="conn-btn conn-btn--secondary conn-btn--sm"
                          onClick={() => startEdit(skill)}
                        >
                          Edit
                        </button>
                        <button
                          data-testid={`skill-delete-btn-${skill.id}`}
                          className="conn-btn conn-btn--danger conn-btn--sm"
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
