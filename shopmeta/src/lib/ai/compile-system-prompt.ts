// src/lib/ai/compile-system-prompt.ts
// Compiles the final system prompt by merging:
// 1. Agent's base systemInstructions
// 2. Always-apply skills for the org (+ bundled always-apply)
// 3. Skills explicitly attached to the agent
//
// ⚠️  SERVER-ONLY — imports DB + drizzle. Do NOT import this file from client components.
//     Client-safe pure helpers live in ./skill-helpers.ts
//
// Design: split into pure + DB functions for testability.

import { getDb } from '#/lib/db/index'
import { skills, agentSkills } from '#/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'

// ─── Re-export pure helpers from client-safe module ───────────────────────────
// Server-side callers can still import everything from this single file.
export type { SkillRecord } from '#/lib/ai/skill-helpers'
export { assembleSkillsPrompt, bakeSkillIntoInstructions } from '#/lib/ai/skill-helpers'

// Local alias for use below
import type { SkillRecord } from '#/lib/ai/skill-helpers'

// ─── DB fetcher (integration-testable) ────────────────────────────────────────

/**
 * Fetches the active skills for a given agent + org.
 * Includes bundled skills (orgId='*') that have alwaysApply.
 * Returns deduplicated list: always-apply skills first, then agent-specific.
 */
export async function fetchSkillsForPrompt(
  agentId: string | null,
  orgId: string,
): Promise<SkillRecord[]> {
  const db = getDb()
  const activeSkills: SkillRecord[] = []

  // 1. Always-apply skills for this org + bundled always-apply
  const alwaysApply = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      body: skills.body,
      alwaysApply: skills.alwaysApply,
    })
    .from(skills)
    .where(
      and(
        or(eq(skills.orgId, orgId), eq(skills.orgId, '*')),
        eq(skills.alwaysApply, true),
      ),
    )
  activeSkills.push(...alwaysApply)

  // 2. Agent-specific skills
  if (agentId) {
    const attached = await db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        body: skills.body,
        alwaysApply: skills.alwaysApply,
      })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(eq(agentSkills.agentId, agentId))

    const existing = new Set(activeSkills.map((s) => s.id))
    for (const s of attached) {
      if (!existing.has(s.id)) activeSkills.push(s)
    }
  }

  return activeSkills
}

// ─── Orchestrator (calls both) ────────────────────────────────────────────────

export async function compileSystemPrompt(
  agentId: string | null,
  orgId: string,
  baseInstructions: string = '',
): Promise<string> {
  const activeSkills = await fetchSkillsForPrompt(agentId, orgId)
  return assembleSkillsPrompt(baseInstructions, activeSkills)
}
