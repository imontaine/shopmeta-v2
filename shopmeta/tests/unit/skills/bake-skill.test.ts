// tests/unit/skills/bake-skill.test.ts
// Unit tests for the bakeSkillIntoInstructions() pure function.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bakeSkillIntoInstructions } from '#/lib/ai/compile-system-prompt'

describe('bakeSkillIntoInstructions', () => {
  // Pin Date.now for deterministic timestamps in the comment header
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends skill body to empty instructions', () => {
    const result = bakeSkillIntoInstructions('', 'ClickHouse', 'Use CollapsingMergeTree.')
    expect(result).toContain('Use CollapsingMergeTree.')
  })

  it('appends skill body after existing instructions', () => {
    const existing = 'You are a data analyst.'
    const result = bakeSkillIntoInstructions(existing, 'Analytics', 'Always use UTC.')
    expect(result).toContain('You are a data analyst.')
    expect(result).toContain('Always use UTC.')
    // Existing instructions should come first
    expect(result.indexOf('You are a data analyst.')).toBeLessThan(
      result.indexOf('Always use UTC.'),
    )
  })

  it('includes comment header with skill name', () => {
    const result = bakeSkillIntoInstructions('base', 'My Skill', 'body content')
    expect(result).toContain('<!-- Baked from: My Skill')
  })

  it('includes timestamp in comment header', () => {
    const result = bakeSkillIntoInstructions('base', 'Test', 'body')
    expect(result).toContain('2026-06-15T12:00:00.000Z')
  })

  it('preserves existing baked content from other skills', () => {
    const alreadyBaked =
      'Base instructions\n\n<!-- Baked from: Skill A (2026-01-01T00:00:00.000Z) -->\n\nSkill A body'
    const result = bakeSkillIntoInstructions(alreadyBaked, 'Skill B', 'Skill B body')
    expect(result).toContain('Skill A body')
    expect(result).toContain('Skill B body')
    expect(result).toContain('<!-- Baked from: Skill A')
    expect(result).toContain('<!-- Baked from: Skill B')
  })
})
