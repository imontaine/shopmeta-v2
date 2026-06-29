// tests/unit/skills/frontmatter-parser.test.ts
// Unit tests for the SKILL.md frontmatter parser.
// Pure function — no mocks, no DB.

import { describe, it, expect } from 'vitest'
import { parseSkillMarkdown } from '#/lib/skills'

describe('parseSkillMarkdown', () => {
  it('parses valid frontmatter with name, description, always-apply', () => {
    const md = `---
name: Test Skill
description: A test skill
always-apply: true
---
# Body content`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.name).toBe('Test Skill')
    expect(result.metadata.description).toBe('A test skill')
    expect(result.metadata.alwaysApply).toBe(true)
    expect(result.body).toBe('# Body content')
  })

  it('returns body without frontmatter block', () => {
    const md = `---
name: My Skill
---
Line 1
Line 2`

    const result = parseSkillMarkdown(md)
    expect(result.body).toBe('Line 1\nLine 2')
    expect(result.body).not.toContain('---')
    expect(result.body).not.toContain('name:')
  })

  it('handles missing frontmatter (entire input becomes body)', () => {
    const md = '# Just a heading\n\nSome content here.'

    const result = parseSkillMarkdown(md)
    expect(result.metadata.name).toBe('')
    expect(result.metadata.description).toBeNull()
    expect(result.metadata.alwaysApply).toBe(false)
    expect(result.body).toBe('# Just a heading\n\nSome content here.')
  })

  it('extracts always-apply: true from frontmatter', () => {
    const md = `---
name: Always On
always-apply: true
---
Content`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.alwaysApply).toBe(true)
  })

  it('defaults alwaysApply to false when not present', () => {
    const md = `---
name: Normal Skill
---
Content`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.alwaysApply).toBe(false)
  })

  it('handles empty name (defaults to empty string)', () => {
    const md = `---
description: Has desc but no name
---
Content`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.name).toBe('')
  })

  it('handles quoted values in frontmatter', () => {
    const md = `---
name: "Quoted Name"
description: 'Single Quoted'
---
Content`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.name).toBe('Quoted Name')
    expect(result.metadata.description).toBe('Single Quoted')
  })

  it('handles multiline body after frontmatter', () => {
    const md = `---
name: Multiline
---
# Heading

Paragraph one.

Paragraph two with **bold**.

- List item 1
- List item 2`

    const result = parseSkillMarkdown(md)
    expect(result.body).toContain('# Heading')
    expect(result.body).toContain('Paragraph one.')
    expect(result.body).toContain('Paragraph two with **bold**.')
    expect(result.body).toContain('- List item 1')
    expect(result.body).toContain('- List item 2')
  })

  it('handles CRLF line endings', () => {
    const md = '---\r\nname: CRLF Skill\r\ndescription: Has CRLF\r\nalways-apply: false\r\n---\r\nBody with CRLF'

    const result = parseSkillMarkdown(md)
    expect(result.metadata.name).toBe('CRLF Skill')
    expect(result.metadata.description).toBe('Has CRLF')
    expect(result.metadata.alwaysApply).toBe(false)
    expect(result.body).toContain('Body with CRLF')
  })

  it('supports alwaysApply key (camelCase alternative)', () => {
    const md = `---
name: CamelCase
alwaysApply: true
---
Body`

    const result = parseSkillMarkdown(md)
    expect(result.metadata.alwaysApply).toBe(true)
  })
})
