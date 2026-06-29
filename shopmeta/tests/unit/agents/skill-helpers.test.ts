// tests/unit/agents/skill-helpers.test.ts
// Unit tests for the client-safe skill helper functions.
// Also validates the compile-system-prompt re-exports chain (server side).

import { describe, it, expect } from 'vitest'
import {
  assembleSkillsPrompt,
  bakeSkillIntoInstructions,
  type SkillRecord,
} from '#/lib/ai/skill-helpers'

describe('assembleSkillsPrompt', () => {
  it('returns base instructions unchanged when no skills', () => {
    expect(assembleSkillsPrompt('Do good work.', [])).toBe('Do good work.')
  })

  it('appends skills block with name and body', () => {
    const skills: SkillRecord[] = [
      { id: '1', name: 'my-skill', description: null, body: 'Do things.', alwaysApply: false },
    ]
    const result = assembleSkillsPrompt('Base.', skills)
    expect(result).toContain('<skills>')
    expect(result).toContain('## my-skill')
    expect(result).toContain('Do things.')
    expect(result).toContain('</skills>')
  })

  it('includes description when present', () => {
    const skills: SkillRecord[] = [
      { id: '1', name: 'sk', description: 'Very helpful', body: 'body', alwaysApply: false },
    ]
    const result = assembleSkillsPrompt('', skills)
    expect(result).toContain('Very helpful')
  })

  it('handles multiple skills in order', () => {
    const skills: SkillRecord[] = [
      { id: '1', name: 'first', description: null, body: 'A', alwaysApply: false },
      { id: '2', name: 'second', description: null, body: 'B', alwaysApply: false },
    ]
    const result = assembleSkillsPrompt('', skills)
    expect(result.indexOf('## first')).toBeLessThan(result.indexOf('## second'))
  })
})

describe('bakeSkillIntoInstructions', () => {
  it('appends skill body to instructions', () => {
    const result = bakeSkillIntoInstructions('Be helpful.', 'my-skill', 'Always be kind.')
    expect(result).toContain('Be helpful.')
    expect(result).toContain('Always be kind.')
  })

  it('includes a baked-from comment with skill name', () => {
    const result = bakeSkillIntoInstructions('', 'clickhouse-expert', 'body')
    expect(result).toContain('Baked from: clickhouse-expert')
  })

  it('includes an ISO timestamp in the baked-from comment', () => {
    const result = bakeSkillIntoInstructions('', 'sk', 'body')
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('filters empty string from parts', () => {
    const result = bakeSkillIntoInstructions('', 'sk', 'the body')
    // Should not start with a blank line
    expect(result.startsWith('\n')).toBe(false)
  })
})

describe('compile-system-prompt re-exports (server-side)', () => {
  it('re-exports bakeSkillIntoInstructions from skill-helpers', async () => {
    const mod = await import('#/lib/ai/compile-system-prompt')
    expect(typeof mod.bakeSkillIntoInstructions).toBe('function')
  })

  it('re-exports assembleSkillsPrompt from skill-helpers', async () => {
    const mod = await import('#/lib/ai/compile-system-prompt')
    expect(typeof mod.assembleSkillsPrompt).toBe('function')
  })

  it('re-exported functions produce identical output to direct imports', async () => {
    const mod = await import('#/lib/ai/compile-system-prompt')
    const skills: SkillRecord[] = [
      { id: '1', name: 'sk', description: null, body: 'body', alwaysApply: false },
    ]
    expect(mod.assembleSkillsPrompt('base', skills)).toBe(assembleSkillsPrompt('base', skills))
  })
})
