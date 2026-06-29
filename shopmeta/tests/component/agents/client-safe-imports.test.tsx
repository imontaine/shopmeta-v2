// tests/component/agents/client-safe-imports.test.tsx
// Regression test: verifies that modules imported by client-side Agent components
// do NOT depend on Node.js-only globals (Buffer, process, node:crypto etc.)
// that would cause "Buffer is not defined" in the browser.
//
// These tests run in jsdom (simulated browser) where Buffer is NOT defined.
// If any import drags in postgres / node:crypto / node:buffer, these tests fail.

import { describe, it, expect, beforeAll } from 'vitest'

// Explicitly remove Buffer from the global scope so the jsdom environment
// matches a real browser as closely as possible.
beforeAll(() => {
  // @ts-expect-error — intentionally removing Node.js global to simulate browser
  delete globalThis.Buffer
})

describe('client-safe imports — AgentBuilder dependency chain', () => {
  it('skill-helpers.ts does not reference Buffer', async () => {
    // This will throw "Buffer is not defined" if the module transitively
    // imports any Node.js-only code.
    await expect(import('#/lib/ai/skill-helpers')).resolves.toBeDefined()
  })

  it('bakeSkillIntoInstructions works in browser environment', async () => {
    const { bakeSkillIntoInstructions } = await import('#/lib/ai/skill-helpers')
    const result = bakeSkillIntoInstructions('base instructions', 'my-skill', 'skill body')
    expect(result).toContain('base instructions')
    expect(result).toContain('Baked from: my-skill')
    expect(result).toContain('skill body')
  })

  it('assembleSkillsPrompt works in browser environment', async () => {
    const { assembleSkillsPrompt } = await import('#/lib/ai/skill-helpers')
    const result = assembleSkillsPrompt('base', [
      { id: '1', name: 'test-skill', description: 'A test', body: 'do things', alwaysApply: false },
    ])
    expect(result).toContain('<skills>')
    expect(result).toContain('## test-skill')
    expect(result).toContain('do things')
  })
})

// Note: compile-system-prompt.ts is SERVER-ONLY (imports postgres/drizzle).
// Its re-exports are tested separately in tests/unit/agents/ (node environment).
