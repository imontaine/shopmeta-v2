// src/lib/ai/skill-helpers.ts
// Pure, client-safe skill helper functions.
// NO server-only imports (no node:crypto, no DB, no postgres).
//
// ⚠️  Keep this file free of any Node.js / server-only imports.
//     It is imported by client-side React components (AgentBuilder).
//     The DB-dependent functions live in compile-system-prompt.ts (server-only).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillRecord {
  id: string
  name: string
  description: string | null
  body: string
  alwaysApply: boolean
}

// ─── Pure helpers (unit-testable, no side effects) ────────────────────────────

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

/**
 * Bakes a skill's body into the agent's systemInstructions as a one-time copy.
 * Returns the updated instructions string.
 * Pure function — safe to call on the client.
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
