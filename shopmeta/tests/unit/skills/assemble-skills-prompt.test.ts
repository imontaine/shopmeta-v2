// tests/unit/skills/assemble-skills-prompt.test.ts
// Unit tests for assembleSkillsPrompt() — pure function, no mocks needed.

import { describe, it, expect } from 'vitest'
import { assembleSkillsPrompt, type SkillRecord } from '#/lib/ai/compile-system-prompt'

function makeSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'test-id',
    name: 'Test Skill',
    description: null,
    body: 'Test body content',
    alwaysApply: false,
    ...overrides,
  }
}

describe('assembleSkillsPrompt', () => {
  it('returns baseInstructions unchanged when skills array is empty', () => {
    const base = 'You are a helpful assistant.'
    const result = assembleSkillsPrompt(base, [])
    expect(result).toBe(base)
  })

  it('wraps skills in <skills> tags', () => {
    const result = assembleSkillsPrompt('', [makeSkill()])
    expect(result).toContain('<skills>')
    expect(result).toContain('</skills>')
  })

  it('includes skill name as ## heading', () => {
    const result = assembleSkillsPrompt('', [makeSkill({ name: 'My Skill' })])
    expect(result).toContain('## My Skill')
  })

  it('includes skill description when present', () => {
    const result = assembleSkillsPrompt('', [
      makeSkill({ description: 'A useful skill' }),
    ])
    expect(result).toContain('A useful skill')
  })

  it('omits description line when null', () => {
    const result = assembleSkillsPrompt('', [
      makeSkill({ name: 'NoDesc', description: null, body: 'Just body' }),
    ])
    // Should have the heading and body but no extra description line
    expect(result).toContain('## NoDesc')
    expect(result).toContain('Just body')
    // Count the lines between heading and body
    const lines = result.split('\n')
    const headingIdx = lines.findIndex((l) => l.includes('## NoDesc'))
    const bodyIdx = lines.findIndex((l) => l.includes('Just body'))
    // Body should follow heading directly (with possible blank line)
    expect(bodyIdx - headingIdx).toBeLessThanOrEqual(2)
  })

  it('includes skill body content', () => {
    const result = assembleSkillsPrompt('', [
      makeSkill({ body: 'Follow these rules:\n1. Be safe\n2. Be fast' }),
    ])
    expect(result).toContain('Follow these rules:')
    expect(result).toContain('1. Be safe')
    expect(result).toContain('2. Be fast')
  })

  it('handles multiple skills in order', () => {
    const skills = [
      makeSkill({ id: '1', name: 'First Skill', body: 'First body' }),
      makeSkill({ id: '2', name: 'Second Skill', body: 'Second body' }),
    ]
    const result = assembleSkillsPrompt('', skills)
    const firstIdx = result.indexOf('## First Skill')
    const secondIdx = result.indexOf('## Second Skill')
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(result).toContain('First body')
    expect(result).toContain('Second body')
  })

  it('preserves baseInstructions before <skills> block', () => {
    const base = 'You are a specialized assistant.\nAlways be polite.'
    const result = assembleSkillsPrompt(base, [makeSkill()])
    expect(result.startsWith(base)).toBe(true)
    expect(result.indexOf(base)).toBeLessThan(result.indexOf('<skills>'))
  })

  it('handles empty baseInstructions with skills', () => {
    const result = assembleSkillsPrompt('', [makeSkill({ name: 'Standalone' })])
    expect(result).toContain('<skills>')
    expect(result).toContain('## Standalone')
  })
})
