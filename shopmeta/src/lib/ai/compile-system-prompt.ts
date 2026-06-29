// src/lib/ai/compile-system-prompt.ts
// Compiles the final system prompt by merging:
// 1. Agent's base systemInstructions
// 2. Always-apply skills for the org (+ bundled always-apply)
// 3. Skills explicitly attached to the agent
//
// Design: split into pure + DB functions for testability.

import { getDb } from '#/lib/db/index'
import { skills, agentSkills } from '#/lib/db/schema'
import { eq, and, or } from 'drizzle-orm'

// ─── Pure types (importable by tests without DB deps) ─────────────────────────

export interface SkillRecord {
  id: string
  name: string
  description: string | null
  body: string
  alwaysApply: boolean
}

// ─── Pure function (unit-testable, no DB) ─────────────────────────────────────

/**
 * Assembles skill content into the system prompt string.
 * Pure function — takes data in, returns string out. No side effects.
 */
export function assembleSkillsPrompt(
  baseInstructions: string,
  activeSkills: SkillRecord[],
): string {
  let result = baseInstructions
  if (activeSkills.length > 0) {
    result += '\n\n<skills>\n'
    for (const skill of activeSkills) {
      result += `\n## ${skill.name}\n`
      if (skill.description) result += `${skill.description}\n\n`
      result += `${skill.body}\n`
    }
    result += '\n</skills>\n'
  }
  return result
}

// ─── Bake helper (pure, unit-testable) ────────────────────────────────────────

/**
 * Bakes a skill's body into the agent's systemInstructions as a one-time copy.
 * Returns the updated instructions string.
 */
export function bakeSkillIntoInstructions(
  currentInstructions: string,
  skillName: string,
  skillBody: string,
): string {
  const parts = [
    currentInstructions,
    '',
    `<!-- Baked from: ${skillName} (${new Date().toISOString()}) -->`,
    '',
    skillBody,
  ].filter(Boolean)
  return parts.join('\n')
}

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
