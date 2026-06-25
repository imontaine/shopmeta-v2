// tests/unit/lib/env.test.ts
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateEnv } from '#/lib/env'

describe('Environment config validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset env to a clean copy before each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original env
    process.env = originalEnv
  })

  test('passes when DATABASE_URL is set', () => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'
    expect(() => validateEnv()).not.toThrow()
  })

  test('returns correct env object when all required vars are set', () => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'
    const env = validateEnv()
    expect(env.DATABASE_URL).toBe('postgresql://test:test@localhost:5432/test')
  })

  test('throws when DATABASE_URL is missing', () => {
    delete process.env['DATABASE_URL']
    expect(() => validateEnv()).toThrow()
  })

  test('throws descriptive error mentioning DATABASE_URL when it is missing', () => {
    delete process.env['DATABASE_URL']
    expect(() => validateEnv()).toThrowError(/DATABASE_URL/)
  })

  test('error message lists the missing variable name', () => {
    delete process.env['DATABASE_URL']
    try {
      validateEnv()
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect((error as Error).message).toContain('DATABASE_URL')
    }
  })

  test('includes optional vars when they are set', () => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'
    process.env['OPENAI_API_KEY'] = 'sk-test-key'
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
    
    const env = validateEnv()
    expect(env.OPENAI_API_KEY).toBe('sk-test-key')
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test')
  })

  test('optional vars are undefined when not set', () => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test'
    delete process.env['OPENAI_API_KEY']
    delete process.env['ENCRYPTION_KEY']
    
    const env = validateEnv()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ENCRYPTION_KEY).toBeUndefined()
  })

  test('error is an instance of Error', () => {
    delete process.env['DATABASE_URL']
    expect(() => validateEnv()).toThrowError(Error)
  })
})
