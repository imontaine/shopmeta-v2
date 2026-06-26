# Perplexity Design Overhaul — Checklist

> Transform ShopMeta from Supabase dark/emerald to Perplexity light/teal.
> Accent: **teal `#21808D`** (verified against perplexity.ai).
> Fonts: **Inter** (OFL 1.1) + **JetBrains Mono** (OFL 1.1).
>
> Each item maps to a compliance test in `tests/unit/design/perplexity-compliance.test.ts`.
> Run `pnpm vitest run --config vitest.config.ts tests/unit/design/` to check progress.
>
> **Current:** 20/57 tests pass (35%) · **Target:** 57/57 (100%)

---

## Phase 1 — Design Tokens & Typography

> Files: `styles.css`, `__root.tsx`

### Light mode tokens (`:root`)

- [ ] `--bg-base: #ffffff` — page background
- [ ] `--bg-surface: #f8f8f8` — card / sidebar surface
- [ ] `--bg-elevated: #f0f0f0` — hover / elevated
- [ ] `--border: #e5e5e5` — dividers, input borders
- [ ] `--text-primary: #191a1a` — body copy, headings
- [ ] `--text-secondary: #6b6b6b` — meta, captions
- [ ] `--accent: #21808D` — primary CTA (teal, NOT purple)

### Dark mode tokens (`.dark`)

- [ ] `--bg-base: #0f0f10` — dark page background
- [ ] `--bg-surface: #19191a` — dark card surface
- [ ] `--bg-elevated: #232325` — dark elevated
- [ ] `--border: #2e2e30` — dark dividers
- [ ] `--text-primary: #f0f0f0` — dark body copy
- [ ] `--text-secondary: #9b9b9b` — dark meta
- [ ] `--accent: #2ba3b0` — dark teal accent

### Typography

- [ ] Google Fonts `<link>` for Inter + JetBrains Mono in `__root.tsx`
- [ ] `--font-body: "Inter", ui-sans-serif, system-ui, sans-serif`
- [ ] `--font-mono: "JetBrains Mono", ui-monospace, monospace`
- [ ] Body font-size: 15px, line-height: 1.65

### Spacing (8px base)

- [ ] `--space-1: 4px`
- [ ] `--space-2: 8px`
- [ ] `--space-3: 12px`
- [ ] `--space-4: 16px`
- [ ] `--space-5: 20px`
- [ ] `--space-6: 24px`
- [ ] `--space-8: 32px`

### Border radius

- [ ] `--radius-sm: 4px` — badges, chips
- [ ] `--radius-md: 8px` — inputs, cards
- [ ] `--radius-lg: 12px` — modals, search bar

### Motion

- [ ] `--motion-fast: 120ms` — hover transitions
- [ ] `prefers-reduced-motion` media query present

---

## Phase 2 — CSS Anti-Pattern Cleanup

> Files: `styles.css`

### Remove Supabase patterns

- [ ] No `linear-gradient()` in component styles (skeleton shimmer excepted)
- [ ] No `box-shadow` for elevation (only focus rings + hairline `0 0 0 1px/2px`)
- [ ] No `text-transform: uppercase` on section labels
- [ ] No `#3ecf8e` or `#00c573` (old Supabase emerald) anywhere in CSS
- [ ] No `#a855f7`, `#7c3aed`, `#8b5cf6`, `#6366f1` (old purple/violet)
- [ ] No `font-weight: 700` — max is 600

---

## Phase 3 — Layout Shell & Sidebar

> Files: `styles.css`, `Sidebar.tsx`, `AppLayout.tsx`, `__root.tsx`

### App shell

- [ ] Page background: `var(--bg-base)` (#ffffff)
- [ ] Max content width: 720px centered (reading column)
- [ ] Default theme: light (change fallback in `__root.tsx`)

### Sidebar

- [ ] Sidebar width: ~260px
- [ ] Sidebar background: `var(--bg-surface)` with `1px solid var(--border)` right border
- [ ] Nav links: `var(--text-secondary)` default, `var(--text-primary)` + teal left border active
- [ ] No hardcoded emerald colors in Sidebar.tsx

---

## Phase 4 — Chat Components

> Files: `Thread.tsx`, `Composer.tsx`, `ChatLayout.tsx`, `styles.css`

### Empty state (Thread)

- [ ] Centered vertically + horizontally
- [ ] Text: "Ask anything." (no emoji, no exclamation)
- [ ] No `Sparkles` icon import (decorative — DESIGN.md §9)
- [ ] No emerald `#3ecf8e` in message bubbles
- [ ] No `rgba(62, 207, 142, ...)` (old emerald bubble)

### Composer

- [ ] Rounded card style: `var(--bg-surface)`, `1px solid var(--border)`, `var(--radius-lg)`
- [ ] No emerald `#3ecf8e` in send button
- [ ] No emerald focus border color
- [ ] Placeholder: "Ask anything."
- [ ] Focus border: `var(--accent)` (teal)

### Thread messages

- [ ] Max reading width: 720px
- [ ] User messages: clean text, no colored bubble
- [ ] Assistant messages: subtle `var(--bg-surface)` card
- [ ] Body text: 15px Inter, 1.65 line-height
- [ ] Code blocks: JetBrains Mono, `var(--bg-surface)` background

---

## Phase 5 — Auth Pages

> Files: `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `styles.css`

### Login

- [ ] White background, centered card
- [ ] No `#3ecf8e` / `#00c573` (old emerald)
- [ ] No `#6366f1` / `#8b5cf6` (old purple)
- [ ] Primary button: teal `#21808D` background
- [ ] Input fields: `var(--bg-surface)`, `var(--border)`, `var(--radius-md)`

### Register

- [ ] Same rules as login
- [ ] No old emerald or purple accents

### Forgot/Reset password

- [ ] No `#8b5cf6` / `#6366f1` (currently failing)
- [ ] Use teal accent

---

## Phase 6 — Conversation List, Settings & Agents

> Files: `ConversationList.tsx`, `styles.css` (connections, settings, agents sections)

### Conversation list

- [ ] Clean text items, no background on inactive
- [ ] Active: `var(--bg-elevated)` + teal left accent bar
- [ ] No emerald in conv item CSS

### Settings / Connections

- [ ] Input fields: Perplexity style (surface bg, border, radius-md)
- [ ] Buttons: ghost or primary teal
- [ ] No emerald in connection form CSS

### Agent builder

- [ ] Agent chips/badges: teal, not emerald
- [ ] No `#3ecf8e` in agent CSS
- [ ] Default badge: teal accent

---

## Phase 7 — Polish & Deploy

> Files: any remaining

### Voice & copy

- [ ] No emoji characters in visible UI strings (any `.tsx`)
- [ ] No filler phrases ("Great question!", "Glad you asked", etc.)
- [ ] Empty state: "Ask anything." (not "Start a conversation")
- [ ] Loading: "Searching…" (ellipsis only)
- [ ] Error: "Something went wrong. Try again."

### Global font verification

- [ ] Inter referenced in project styles/imports
- [ ] JetBrains Mono referenced in project styles/imports

### Final verification

- [ ] 57/57 compliance tests pass
- [ ] 188+ unit tests pass (no regressions)
- [ ] 332 component tests pass (no regressions)
- [ ] Visual review via browser — looks like Perplexity light mode
- [ ] Deployed to production

---

## Phase Summary

| Phase | Items | Compliance Tests | Cumulative Pass |
|-------|-------|-----------------|-----------------|
| 1. Tokens & typography | 28 | +12 | 32/57 |
| 2. CSS cleanup | 6 | +3 | 35/57 |
| 3. Layout & sidebar | 7 | +2 | 37/57 |
| 4. Chat components | 11 | +9 | 46/57 |
| 5. Auth pages | 8 | +4 | 50/57 |
| 6. Conv/settings/agents | 7 | +5 | 55/57 |
| 7. Polish & deploy | 9 | +2 | **57/57** |
| **Total** | **76** | **57** | **100%** |

---

> [!TIP]
> Run the compliance tests after each phase:
> ```bash
> pnpm vitest run --config vitest.config.ts tests/unit/design/perplexity-compliance.test.ts
> ```
> Each phase has a commit checkpoint. Deploy after Phase 7 passes 57/57.
