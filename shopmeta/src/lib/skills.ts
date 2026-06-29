// src/lib/skills.ts
// Server functions for Skills CRUD.
// Security: all operations scoped to orgId via shared requireOrgSession().
// Bundled skills (source='bundled', orgId='*') are read-only — no edit/delete.

import { createServerFn } from '@tanstack/react-start'
import { eq, and, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '#/lib/db/index'
import { skills, agentSkills, agents } from '#/lib/db/schema'
import { requireOrgSession } from '#/lib/auth/require-org-session'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillRow {
  id: string
  orgId: string
  slug: string
  name: string
  description: string | null
  body: string
  source: string
  alwaysApply: boolean
  createdAt: string | null
  updatedAt: string | null
}

function serializeSkill(s: typeof skills.$inferSelect): SkillRow {
  return {
    id: s.id,
    orgId: s.orgId,
    slug: s.slug,
    name: s.name,
    description: s.description,
    body: s.body,
    source: s.source,
    alwaysApply: s.alwaysApply,
    createdAt: s.createdAt ? s.createdAt.toISOString() : null,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  }
}

// ─── Frontmatter Parser ──────────────────────────────────────────────────────

export interface SkillMetadata {
  name: string
  description: string | null
  alwaysApply: boolean
}

export interface ParsedSkill {
  metadata: SkillMetadata
  body: string
}

/**
 * Parses a SKILL.md file with optional YAML frontmatter.
 * Pure function — no DB, no side effects.
 */
export function parseSkillMarkdown(raw: string): ParsedSkill {
  const normalized = raw.replace(/\r\n/g, '\n')
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

  if (!frontmatterMatch) {
    return {
      metadata: { name: '', description: null, alwaysApply: false },
      body: normalized.trim(),
    }
  }

  const frontmatter = frontmatterMatch[1]!
  const body = frontmatterMatch[2]!.trim()

  // Simple YAML key-value parser (no nested objects)
  const meta: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^(\S+):\s*(.*)$/)
    if (match) {
      meta[match[1]!] = match[2]!.replace(/^["']|["']$/g, '').trim()
    }
  }

  return {
    metadata: {
      name: meta['name'] || '',
      description: meta['description'] || null,
      alwaysApply: meta['always-apply'] === 'true' || meta['alwaysApply'] === 'true',
    },
    body,
  }
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

const CreateSkillInput = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  body: z.string().min(1, 'Body is required').max(500_000),
  alwaysApply: z.boolean().optional().default(false),
})

const UpdateSkillInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  body: z.string().min(1).max(500_000).optional(),
  alwaysApply: z.boolean().optional(),
})

const DeleteSkillInput = z.object({
  id: z.string().uuid(),
})

// ─── CRUD Server Functions ────────────────────────────────────────────────────

/** List all skills visible to the current org (own + bundled) */
export const listSkills = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({}).parse(data ?? {}))
  .handler(async () => {
    const { orgId } = await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select()
      .from(skills)
      .where(or(eq(skills.orgId, orgId), eq(skills.orgId, '*')))
      .orderBy(skills.name)
    return rows.map(serializeSkill)
  })

/** Create a new user skill */
export const createSkill = createServerFn({ method: 'POST' })
  .validator((data: unknown) => CreateSkillInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()
    const slug = slugify(data.name)

    const [created] = await db
      .insert(skills)
      .values({
        orgId,
        slug,
        name: data.name,
        description: data.description || null,
        body: data.body,
        source: 'user',
        alwaysApply: data.alwaysApply,
      })
      .returning()
    return serializeSkill(created!)
  })

/** Update an existing user skill (bundled skills are read-only) */
export const updateSkill = createServerFn({ method: 'POST' })
  .validator((data: unknown) => UpdateSkillInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify skill exists and belongs to org (not bundled for edit)
    const [existing] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, data.id), eq(skills.orgId, orgId)))

    if (!existing) throw new Error(`Skill not found: ${data.id}`)
    if (existing.source === 'bundled') throw new Error('Cannot edit bundled skills')

    const updates: Record<string, unknown> = {}
    if (data.name !== undefined) {
      updates['name'] = data.name
      updates['slug'] = slugify(data.name)
    }
    if (data.description !== undefined) updates['description'] = data.description
    if (data.body !== undefined) updates['body'] = data.body
    if (data.alwaysApply !== undefined) updates['alwaysApply'] = data.alwaysApply

    if (Object.keys(updates).length === 0) return serializeSkill(existing)

    updates['updatedAt'] = new Date()
    const [updated] = await db
      .update(skills)
      .set(updates)
      .where(and(eq(skills.id, data.id), eq(skills.orgId, orgId)))
      .returning()
    return serializeSkill(updated!)
  })

/** Delete a user skill (bundled skills cannot be deleted) */
export const deleteSkill = createServerFn({ method: 'POST' })
  .validator((data: unknown) => DeleteSkillInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify it's not a bundled skill
    const [existing] = await db
      .select({ source: skills.source })
      .from(skills)
      .where(and(eq(skills.id, data.id), eq(skills.orgId, orgId)))

    if (existing?.source === 'bundled') throw new Error('Cannot delete bundled skills')

    // Cascade: agent_skills rows are deleted via FK onDelete cascade
    await db
      .delete(skills)
      .where(and(eq(skills.id, data.id), eq(skills.orgId, orgId)))
    return { deleted: true, id: data.id }
  })

// ─── Agent–Skill Linking ──────────────────────────────────────────────────────

const SetAgentSkillsInput = z.object({
  agentId: z.string().uuid(),
  skillIds: z.array(z.string().uuid()),
})

/** Replaces all skill attachments for an agent (delete-all + insert) */
export const setAgentSkills = createServerFn({ method: 'POST' })
  .validator((data: unknown) => SetAgentSkillsInput.parse(data))
  .handler(async ({ data }) => {
    const { orgId } = await requireOrgSession()
    const db = getDb()

    // Verify agent belongs to org
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, data.agentId), eq(agents.orgId, orgId)))
    if (!agent) throw new Error(`Agent not found: ${data.agentId}`)

    // Delete existing links
    await db.delete(agentSkills).where(eq(agentSkills.agentId, data.agentId))

    // Insert new links
    if (data.skillIds.length > 0) {
      await db.insert(agentSkills).values(
        data.skillIds.map((skillId) => ({ agentId: data.agentId, skillId })),
      )
    }

    return { agentId: data.agentId, skillIds: data.skillIds }
  })

/** Gets skill IDs currently attached to an agent */
export const getAgentSkillIds = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ agentId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select({ skillId: agentSkills.skillId })
      .from(agentSkills)
      .where(eq(agentSkills.agentId, data.agentId))
    return rows.map((r) => r.skillId)
  })

/** Gets full skill rows attached to an agent */
export const getAgentSkills = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ agentId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireOrgSession()
    const db = getDb()
    const rows = await db
      .select({
        id: skills.id,
        orgId: skills.orgId,
        slug: skills.slug,
        name: skills.name,
        description: skills.description,
        body: skills.body,
        source: skills.source,
        alwaysApply: skills.alwaysApply,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
      })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(eq(agentSkills.agentId, data.agentId))
    return rows.map(serializeSkill)
  })
