// tests/unit/skills/form-validation.test.ts
// Unit tests for Skill form Zod validation schemas.
// Mirrors the Zod schemas from src/lib/skills.ts.

import { describe, test, expect } from 'vitest'
import { z } from 'zod'

// ─── Mirror the Zod schemas from skills.ts ─────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Skill form validation', () => {
  test('empty name returns error', () => {
    expect(() =>
      CreateSkillInput.parse({ name: '', body: 'Some content' }),
    ).toThrow()
  })

  test('empty body returns error', () => {
    expect(() =>
      CreateSkillInput.parse({ name: 'My Skill', body: '' }),
    ).toThrow()
  })

  test('valid form passes validation', () => {
    const result = CreateSkillInput.parse({
      name: 'ClickHouse Best Practices',
      body: '# Best practices\n\nUse MergeTree engines.',
    })
    expect(result.name).toBe('ClickHouse Best Practices')
    expect(result.alwaysApply).toBe(false)
  })

  test('name exceeding 255 chars fails', () => {
    expect(() =>
      CreateSkillInput.parse({ name: 'x'.repeat(256), body: 'valid body' }),
    ).toThrow()
  })

  test('body exceeding 500,000 chars fails', () => {
    expect(() =>
      CreateSkillInput.parse({ name: 'Large Skill', body: 'x'.repeat(500_001) }),
    ).toThrow()
  })

  test('valid form with all optional fields', () => {
    const result = CreateSkillInput.parse({
      name: 'Full Skill',
      description: 'A comprehensive skill for testing',
      body: '# Skill body content',
      alwaysApply: true,
    })
    expect(result.name).toBe('Full Skill')
    expect(result.description).toBe('A comprehensive skill for testing')
    expect(result.alwaysApply).toBe(true)
  })

  test('alwaysApply defaults to false when not provided', () => {
    const result = CreateSkillInput.parse({
      name: 'Default Skill',
      body: 'content',
    })
    expect(result.alwaysApply).toBe(false)
  })
})

describe('UpdateSkillInput validation', () => {
  test('valid update with ID passes', () => {
    const result = UpdateSkillInput.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Updated Name',
    })
    expect(result.name).toBe('Updated Name')
  })

  test('invalid UUID fails', () => {
    expect(() =>
      UpdateSkillInput.parse({ id: 'not-a-uuid', name: 'test' }),
    ).toThrow()
  })

  test('empty update (just ID) passes', () => {
    const result = UpdateSkillInput.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  test('description max length (1000) enforced', () => {
    expect(() =>
      UpdateSkillInput.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        description: 'x'.repeat(1001),
      }),
    ).toThrow()
  })
})
