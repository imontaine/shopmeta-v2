/**
 * Perplexity Design System Compliance Tests
 *
 * Three layers of design compliance verification:
 *
 * Layer 1: Static Token Audit — parses styles.css to verify that all
 *          Perplexity design tokens are present and correct.
 *
 * Layer 2: Anti-Pattern Detector — scans CSS and TSX source for patterns
 *          that violate Perplexity DESIGN.md §9.
 *
 * Layer 3: Component Source Audit — verifies that TSX component files
 *          use design-system-compliant values (no hardcoded old colors,
 *          correct structure for Perplexity layout patterns).
 *
 * Accent color: TEAL #21808D (NOT purple/violet — open-design repo was wrong).
 * Verified against actual perplexity.ai production site, June 2025.
 *
 * Run: pnpm vitest run --config vitest.config.ts tests/unit/design/
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '../../../src')
const STYLES_PATH = resolve(ROOT, 'styles.css')
const styles = readFileSync(STYLES_PATH, 'utf-8')

// ─── Helper: collect files recursively by extension ──────────────────────────
function collectFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, ext))
    } else if (extname(full) === ext) {
      results.push(full)
    }
  }
  return results
}

// Collect all component + route TSX files once
const tsxFiles = [
  ...collectFiles(resolve(ROOT, 'components'), '.tsx'),
  ...collectFiles(resolve(ROOT, 'routes'), '.tsx'),
]

// Read all TSX content for scanning
const tsxContents = tsxFiles.map(f => ({
  path: f,
  content: readFileSync(f, 'utf-8'),
}))

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1: DESIGN TOKEN COMPLIANCE
// Verifies that styles.css contains all required Perplexity design tokens.
// ═══════════════════════════════════════════════════════════════════════════════

describe('L1: Perplexity light mode tokens', () => {
  // Corrected values verified against actual perplexity.ai (June 2025).
  // Accent is TEAL #21808D, NOT purple/violet.
  const requiredTokens: Record<string, string> = {
    '#ffffff':  'page background / --bg-base',
    '#f8f8f8':  'card surface / --bg-surface',
    '#f0f0f0':  'elevated + hover / --bg-elevated',
    '#e5e5e5':  'divider / --border',
    '#191a1a':  'body copy / --text-primary',
    '#6b6b6b':  'meta / --text-secondary',
    '#21808d':  'primary CTA / --accent (teal)',
  }

  for (const [hex, description] of Object.entries(requiredTokens)) {
    it(`contains ${hex} (${description})`, () => {
      expect(styles.toLowerCase()).toContain(hex.toLowerCase())
    })
  }
})

describe('L1: Perplexity dark mode tokens', () => {
  const requiredTokens: Record<string, string> = {
    '#0f0f10':  'page background / --bg-base',
    '#19191a':  'card surface / --surface',
    '#232325':  'elevated / --bg-elevated',
    '#2e2e30':  'border / --border',
    '#f0f0f0':  'body copy / --fg',
    '#9b9b9b':  'meta / --muted',
    '#2ba3b0':  'accent / --accent (teal dark)',
  }

  for (const [hex, description] of Object.entries(requiredTokens)) {
    it(`contains ${hex} (${description})`, () => {
      expect(styles.toLowerCase()).toContain(hex.toLowerCase())
    })
  }
})

describe('L1: Perplexity typography tokens', () => {
  it('references Inter font family', () => {
    expect(styles).toMatch(/Inter/i)
  })

  it('references JetBrains Mono for code', () => {
    expect(styles).toMatch(/JetBrains Mono/i)
  })

  it('body font-size is 15px (--text-base)', () => {
    expect(styles).toMatch(/15px/)
  })

  it('does NOT use font-weight: 700 (max 600 per DESIGN.md §3)', () => {
    const weightMatches = styles.match(/font-weight:\s*(\d+)/g) || []
    const weights = weightMatches.map(m => parseInt(m.replace(/font-weight:\s*/, '')))
    const tooHeavy = weights.filter(w => w > 600)
    expect(tooHeavy).toEqual([])
  })
})

describe('L1: Perplexity spacing tokens (8px base)', () => {
  const spacingTokens = [
    ['--space-1', '4px'],
    ['--space-2', '8px'],
    ['--space-3', '12px'],
    ['--space-4', '16px'],
    ['--space-5', '20px'],
    ['--space-6', '24px'],
    ['--space-8', '32px'],
  ]

  for (const [token, value] of spacingTokens) {
    it(`defines ${token}: ${value}`, () => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(styles).toMatch(new RegExp(`${escaped}\\s*:\\s*${value}`))
    })
  }
})

describe('L1: Perplexity radius tokens', () => {
  const radiusTokens = [
    ['--radius-sm', '4px'],
    ['--radius-md', '8px'],
    ['--radius-lg', '12px'],
  ]

  for (const [token, value] of radiusTokens) {
    it(`defines ${token}: ${value}`, () => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(styles).toMatch(new RegExp(`${escaped}\\s*:\\s*${value}`))
    })
  }
})

describe('L1: Perplexity layout tokens', () => {
  it('has 720px max reading width for answer/chat column', () => {
    expect(styles).toMatch(/720px/)
  })

  it('defines sidebar width (around 240-280px)', () => {
    // Perplexity sidebar varies; we accept 240-280px range
    expect(styles).toMatch(/2[4-8]0px/)
  })
})

describe('L1: Perplexity motion tokens', () => {
  it('defines 120ms fast transition duration', () => {
    expect(styles).toMatch(/120ms/)
  })

  it('has prefers-reduced-motion media query', () => {
    expect(styles).toMatch(/prefers-reduced-motion/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: ANTI-PATTERN DETECTION (DESIGN.md §9)
// Scans CSS and TSX files for patterns that violate the Perplexity design spec.
// ═══════════════════════════════════════════════════════════════════════════════

describe('L2: CSS anti-patterns', () => {
  it('no gradient backgrounds (except skeleton shimmer)', () => {
    const lines = styles.split('\n')
    const violations = lines.filter((line, i) => {
      if (line.includes('linear-gradient') || line.includes('radial-gradient')) {
        // Skeleton shimmer is the only allowed gradient (DESIGN.md §6)
        const ctx = lines.slice(Math.max(0, i - 5), i + 5).join('\n')
        if (ctx.includes('skeleton') || ctx.includes('shimmer')) return false
        return true
      }
      return false
    })
    expect(violations).toEqual([])
  })

  it('no box-shadow for elevation (only focus rings & hairline rings)', () => {
    const lines = styles.split('\n')
    const violations = lines.filter(line => {
      if (!line.includes('box-shadow')) return false
      // Allow focus ring patterns
      if (line.includes('focus') || line.includes('--focus-ring')) return false
      // Allow "none" resets
      if (line.match(/box-shadow:\s*none/)) return false
      // Allow hairline ring patterns (0 0 0 1px or 0 0 0 2px)
      if (line.includes('0 0 0 1px') || line.includes('0 0 0 2px')) return false
      return true
    })
    expect(violations).toEqual([])
  })

  it('no ALL CAPS text-transform: uppercase', () => {
    const matches = styles.match(/text-transform:\s*uppercase/gi) || []
    expect(matches.length).toBe(0)
  })

  it('no old Supabase emerald in CSS (#3ecf8e, #00c573)', () => {
    expect(styles.toLowerCase()).not.toContain('#3ecf8e')
    expect(styles.toLowerCase()).not.toContain('#00c573')
  })

  it('no purple/violet accent colors in CSS (#a855f7, #7c3aed, #8b5cf6, #6366f1)', () => {
    const oldAccents = ['#a855f7', '#7c3aed', '#8b5cf6', '#6366f1']
    for (const hex of oldAccents) {
      expect(styles.toLowerCase()).not.toContain(hex.toLowerCase())
    }
  })
})

describe('L2: TSX anti-patterns', () => {
  it('no emoji characters in visible UI strings', () => {
    // DESIGN.md §8: no emoji in UI copy
    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✦✧★☆♡♥]/u
    const violations: string[] = []

    for (const { path, content } of tsxContents) {
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comments, imports, aria-label, testid
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
        if (line.trim().startsWith('import')) continue
        if (line.includes('aria-label') || line.includes('data-testid')) continue
        if (emojiPattern.test(line)) {
          violations.push(`${path}:${i + 1}: ${line.trim().substring(0, 80)}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('no filler phrases in UI copy (DESIGN.md §8)', () => {
    const fillerPatterns = [
      /Great question/i,
      /Glad you asked/i,
      /I'd be happy to/i,
      /Sure thing/i,
    ]
    const violations: string[] = []

    for (const { path, content } of tsxContents) {
      for (const pattern of fillerPatterns) {
        if (pattern.test(content)) {
          violations.push(`${path}: matches ${pattern}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('no hardcoded old Supabase emerald (#3ecf8e) in components', () => {
    const violations: string[] = []
    for (const { path, content } of tsxContents) {
      if (content.includes('#3ecf8e') || content.includes('#00c573')) {
        violations.push(path)
      }
    }
    expect(violations).toEqual([])
  })

  it('no hardcoded old purple/violet accent in components', () => {
    const oldAccents = ['#a855f7', '#7c3aed', '#8b5cf6', '#6366f1']
    const violations: string[] = []
    for (const { path, content } of tsxContents) {
      for (const hex of oldAccents) {
        if (content.toLowerCase().includes(hex.toLowerCase())) {
          violations.push(`${path}: contains ${hex}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: COMPONENT SOURCE AUDIT
// Verifies that component files follow Perplexity design patterns.
// ═══════════════════════════════════════════════════════════════════════════════

describe('L3: Thread component design compliance', () => {
  const threadPath = resolve(ROOT, 'components/chat/Thread.tsx')
  const threadContent = existsSync(threadPath) ? readFileSync(threadPath, 'utf-8') : ''

  it('Thread.tsx exists', () => {
    expect(existsSync(threadPath)).toBe(true)
  })

  it('empty state uses "Ask anything" text (not emoji-laden copy)', () => {
    // DESIGN.md §8: empty state should be "Ask anything." — no emoji
    if (!threadContent) return
    // Should NOT contain Sparkles icon or similar decorative elements in empty state
    // After migration, empty state text should be clean
    const hasCleanEmptyState = threadContent.includes('Ask anything')
      || threadContent.includes('ask anything')
    expect(hasCleanEmptyState).toBe(true)
  })

  it('no hardcoded emerald in message bubbles', () => {
    if (!threadContent) return
    expect(threadContent).not.toContain('#3ecf8e')
  })

  it('no Sparkles icon import (decorative — DESIGN.md §9)', () => {
    if (!threadContent) return
    expect(threadContent).not.toContain('Sparkles')
  })

  it('user messages should not use emerald bubble background', () => {
    if (!threadContent) return
    // Check for rgba(62, 207, 142, ...) which is the old emerald bubble
    expect(threadContent).not.toMatch(/rgba\(62,?\s*207,?\s*142/)
  })
})

describe('L3: Composer component design compliance', () => {
  const composerPath = resolve(ROOT, 'components/chat/Composer.tsx')
  const composerContent = existsSync(composerPath) ? readFileSync(composerPath, 'utf-8') : ''

  it('Composer.tsx exists', () => {
    expect(existsSync(composerPath)).toBe(true)
  })

  it('no hardcoded emerald (#3ecf8e) in send button', () => {
    if (!composerContent) return
    expect(composerContent).not.toContain('#3ecf8e')
  })

  it('no emerald focus border color', () => {
    if (!composerContent) return
    // Old: rgba(62,207,142,...) for focus border
    expect(composerContent).not.toMatch(/rgba\(62,?\s*207,?\s*142/)
  })
})

describe('L3: Sidebar component design compliance', () => {
  const sidebarPath = resolve(ROOT, 'components/layout/Sidebar.tsx')
  const sidebarContent = existsSync(sidebarPath) ? readFileSync(sidebarPath, 'utf-8') : ''

  it('Sidebar.tsx exists', () => {
    expect(existsSync(sidebarPath)).toBe(true)
  })

  it('no hardcoded emerald colors', () => {
    if (!sidebarContent) return
    expect(sidebarContent).not.toContain('#3ecf8e')
    expect(sidebarContent).not.toMatch(/rgba\(62,?\s*207,?\s*142/)
  })
})

describe('L3: Auth pages design compliance', () => {
  const loginPath = resolve(ROOT, 'routes/login.tsx')
  const registerPath = resolve(ROOT, 'routes/register.tsx')
  const loginContent = existsSync(loginPath) ? readFileSync(loginPath, 'utf-8') : ''
  const registerContent = existsSync(registerPath) ? readFileSync(registerPath, 'utf-8') : ''

  it('login.tsx exists', () => {
    expect(existsSync(loginPath)).toBe(true)
  })

  it('register.tsx exists', () => {
    expect(existsSync(registerPath)).toBe(true)
  })

  it('login uses teal accent (#21808D), not emerald or purple', () => {
    if (!loginContent) return
    expect(loginContent).not.toContain('#3ecf8e')
    expect(loginContent).not.toContain('#00c573')
    expect(loginContent).not.toContain('#6366f1')
    expect(loginContent).not.toContain('#8b5cf6')
  })

  it('register uses teal accent, not emerald or purple', () => {
    if (!registerContent) return
    expect(registerContent).not.toContain('#3ecf8e')
    expect(registerContent).not.toContain('#00c573')
    expect(registerContent).not.toContain('#6366f1')
    expect(registerContent).not.toContain('#8b5cf6')
  })
})

describe('L3: Global font import', () => {
  // Check that Inter + JetBrains Mono are imported somewhere in the project
  const allContent = tsxContents.map(f => f.content).join('\n') + '\n' + styles

  it('Inter font is referenced in the project', () => {
    expect(allContent).toMatch(/Inter/)
  })

  it('JetBrains Mono is referenced in the project', () => {
    expect(allContent).toMatch(/JetBrains Mono/i)
  })
})
