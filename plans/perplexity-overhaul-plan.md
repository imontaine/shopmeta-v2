# Perplexity Overhaul — Phased Implementation

> Each phase is **discrete and independently testable**. After each phase, run the
> compliance check and verify the expected tests go green before moving on.
>
> ```bash
> pnpm vitest run --config vitest.config.ts tests/unit/design/perplexity-compliance.test.ts
> ```
>
> **Current baseline:** 20/57 pass (35%)
> **Target:** 57/57 pass (100%)

---

## Phase 1 — Design Tokens & Typography Foundation

> **Goal:** Replace all CSS custom properties with Perplexity tokens. Add Inter + JetBrains Mono.
> No visual component changes yet — just the token layer.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `styles.css` (`:root` block), `__root.tsx` (Google Fonts `<link>`) |
| **What changes** | Replace `:root` color vars with Perplexity light tokens. Add `--space-*`, `--radius-*`, `--motion-*` token declarations. Add Google Fonts link for Inter + JetBrains Mono. Set body font to Inter 15px/1.65. |
| **What does NOT change** | No component CSS yet. No TSX files (except `__root.tsx` for font link). |

### Exact token values to add to `:root`

```css
/* Perplexity Light (default) */
--bg-base: #ffffff;
--bg-surface: #f8f8f8;
--bg-elevated: #f0f0f0;
--border: #e5e5e5;
--text-primary: #191a1a;
--text-secondary: #6b6b6b;
--text-tertiary: #9a9a9a;
--accent: #21808D;
--accent-hover: #1a6b76;
--accent-subtle: rgba(33, 128, 141, 0.08);

/* Typography */
--font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
--text-base: 15px;

/* Spacing (8px base) */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-5: 20px; --space-6: 24px;
--space-8: 32px; --space-12: 48px;

/* Radius */
--radius-sm: 4px;  --radius-md: 8px;
--radius-lg: 12px; --radius-xl: 16px;

/* Motion */
--motion-fast: 120ms; --motion-base: 200ms;

/* Focus */
--focus-ring: 0 0 0 2px var(--accent);
```

### Dark mode override (`.dark` block)

```css
--bg-base: #0f0f10;
--bg-surface: #19191a;
--bg-elevated: #232325;
--border: #2e2e30;
--text-primary: #f0f0f0;
--text-secondary: #9b9b9b;
--text-tertiary: #5c5c5e;
--accent: #2ba3b0;
```

### Tests that should go green (21 tests)
- `L1: light mode tokens` — all 7
- `L1: dark mode tokens` — all 7
- `L1: spacing tokens` — all 7
- ~~Currently passing: 3~~ → **After: 24 pass**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1:"
# Expected: 32/32 pass (all L1 tests)
```

### Commit checkpoint
```
feat(design): Phase 1 — Perplexity design tokens + Inter/JetBrains Mono fonts
```

---

## Phase 2 — CSS Anti-Pattern Cleanup

> **Goal:** Remove all Supabase-era patterns from `styles.css`: gradients, box-shadows,
> uppercase transforms, emerald hex values. Replace with Perplexity-compliant equivalents.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `styles.css` only |
| **What changes** | Remove `linear-gradient()` from non-skeleton rules. Replace `box-shadow` with border-based elevation. Remove `text-transform: uppercase`. Replace all `#3ecf8e` / `#00c573` with `var(--accent)`. Remove `font-weight: 700` → use 600 max. |
| **What does NOT change** | No TSX files. No layout structure. |

### Specific replacements
| Find | Replace with |
|------|-------------|
| `#3ecf8e` anywhere | `var(--accent)` |
| `#00c573` anywhere | `var(--accent-hover)` |
| `rgba(62, 207, 142, ...)` | `var(--accent)` / `var(--accent-subtle)` |
| `box-shadow: 0 4px 16px ...` | Remove or use `box-shadow: var(--elev-ring)` |
| `text-transform: uppercase` | Remove |
| `font-weight: 700` | `font-weight: 600` |

### Tests that should go green (8 tests)
- `L1: typography` → `font-weight ≤ 600` — 1 test
- `L1: radius tokens` — 3 tests
- `L1: motion tokens` — 1 test
- `L2: CSS anti-patterns` — all 5
- ~~Currently passing: 0~~ → **After: 33 pass total**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1:|L2: CSS"
```

### Commit checkpoint
```
refactor(design): Phase 2 — remove Supabase anti-patterns from CSS
```

---

## Phase 3 — Layout Shell & Sidebar

> **Goal:** Restructure the app shell to Perplexity's layout: white background,
> sidebar with correct width, 720px reading column.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `styles.css` (sidebar, app-layout sections), `Sidebar.tsx`, `AppLayout.tsx` |
| **What changes** | Sidebar background → white/`--bg-surface`. Sidebar width → 260px (collapsed: icon-only). Main content max-width → 720px centered. App shell bg → `--bg-base` (#fff). Default theme → light (change fallback in `__root.tsx`). |
| **What does NOT change** | No chat component changes. No auth pages. |

### Key CSS changes
- `.sidebar` → `background: var(--bg-surface); width: 260px; border-right: 1px solid var(--border);`
- `.main-content` → `max-width: 720px; margin: 0 auto;`
- Nav links → `color: var(--text-secondary)`, active → `color: var(--text-primary)` + teal left border

### Tests that should go green (4 tests)
- `L1: layout tokens` — 720px + sidebar width — 2 tests
- `L3: Sidebar` — no emerald — 2 tests (already passing, must stay green)
- ~~Currently passing: 33~~ → **After: 35 pass total**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity layout|L3: Sidebar"
# Plus run component tests to check nothing broke:
pnpm test:component
```

### Commit checkpoint
```
feat(design): Phase 3 — Perplexity layout shell + sidebar restyle
```

---

## Phase 4 — Chat Components (Thread + Composer + Empty State)

> **Goal:** Transform the chat UI to Perplexity's centered, clean style.
> Centered welcome screen, search-card composer, clean message threads.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `Thread.tsx`, `Composer.tsx`, `ChatLayout.tsx`, `styles.css` (chat sections) |
| **What changes** | 1) Empty state → centered "Ask anything." text, no Sparkles icon, no emoji. 2) Composer → rounded card style with `--bg-surface`, `--border`, `--radius-lg`. Send button → dark/teal, not emerald. Focus → teal border. 3) Messages → no emerald user bubble, clean text. Assistant → subtle `--bg-surface` card. 4) Reading width → 720px max. |

### Key TSX changes
- **Thread.tsx**: Remove `Sparkles` import. Empty state text → "Ask anything." Remove emerald `#3ecf8e` from user message bubble. Remove `rgba(62, 207, 142, ...)` from assistant avatar.
- **Composer.tsx**: Replace `#3ecf8e` send button → `var(--accent)`. Replace emerald focus border → teal. Update placeholder → "Ask anything."

### Tests that should go green (9 tests)
- `L3: Thread` — empty state "Ask anything", no emerald, no Sparkles, no rgba emerald — 4 tests
- `L3: Composer` — no emerald send, no emerald focus — 2 tests
- `L2: TSX anti-patterns` → no emerald in components — 1 test
- `L2: TSX anti-patterns` → no emoji — 1 test
- `L3: Global font import` → Inter referenced — 1 test
- ~~Currently passing: 35~~ → **After: 44 pass total**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Thread|L3: Composer|L2: TSX"
pnpm test:component  # Verify all 332 component tests still pass
```

### Commit checkpoint
```
feat(design): Phase 4 — Perplexity chat UI (thread, composer, empty state)
```

---

## Phase 5 — Auth Pages & Remaining Routes

> **Goal:** Update login, register, forgot-password, reset-password to use
> teal accent, Inter font, and clean Perplexity light card style.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `styles.css` (auth section) |
| **What changes** | Replace emerald logo gradient → teal. Replace emerald link colors → teal. Auth card → `--bg-surface`, `--border`, `--radius-lg`. Input fields → Perplexity style. Primary button → teal bg. Remove any remaining `#6366f1`, `#8b5cf6` (old purple from before Supabase). |

### Tests that should go green (4 tests)
- `L3: Auth pages` — login uses teal — 1 test
- `L3: Auth pages` — register uses teal — 1 test
- `L2: TSX anti-patterns` → no purple/violet — 1 test
- `L3: Global font import` → JetBrains Mono — 1 test (if not already)
- ~~Currently passing: 44~~ → **After: 48 pass total**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Auth|L2: TSX"
```

### Commit checkpoint
```
feat(design): Phase 5 — auth pages restyled with teal accent
```

---

## Phase 6 — Conversation List, Settings & Agent Pages

> **Goal:** Clean up the remaining Supabase-era styled components:
> conversation list, settings page, connections, agent builder.

### Scope
| Item | Detail |
|------|--------|
| **Files** | `ConversationList.tsx`, `styles.css` (conversation, settings, connections, agents sections) |
| **What changes** | Conv items → clean text, `--bg-elevated` on active + teal left border. Settings inputs → Perplexity style. Agent builder → remove emerald chips/badges. All remaining `#3ecf8e` in CSS → `var(--accent)`. All remaining `rgba(62, 207, 142, ...)` → teal equivalents. |

### Tests that should go green (remaining L2 CSS tests)
- Any remaining `L2: CSS anti-patterns` that weren't resolved in Phase 2
- Ensure `L2: CSS anti-patterns → no old Supabase emerald in CSS` passes
- ~~Currently passing: 48~~ → **After: ~53 pass total**

### Verification
```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/
# Target: ≥53/57 pass
pnpm test:unit    # All 188+ unit tests pass
pnpm test:component  # All 332 component tests pass
```

### Commit checkpoint
```
feat(design): Phase 6 — conversation list, settings, agents restyled
```

---

## Phase 7 — Polish, Voice & Final Compliance

> **Goal:** Final sweep — fix any remaining test failures, apply voice/copy rules,
> verify reduced-motion, deploy.

### Scope
| Item | Detail |
|------|--------|
| **Files** | Any remaining files with violations |
| **What changes** | 1) Fix any remaining emoji in UI copy. 2) Fix any remaining filler phrases. 3) Ensure `prefers-reduced-motion` collapses all transitions. 4) Verify 120ms hover transitions. 5) Default theme → light in `__root.tsx`. 6) Final visual review via browser. |

### Tests that should go green (remaining)
- ALL 57 tests pass
- ~~Currently passing: ~53~~ → **After: 57/57 (100%)**

### Verification
```bash
# Full compliance
pnpm vitest run --config vitest.config.ts tests/unit/design/
# 57/57 must pass

# All existing tests still pass
pnpm test:unit
pnpm test:component
# 520+ tests pass

# Visual check
# Browser → https://app.shopmeta.app → verify Perplexity look
```

### Commit + Deploy
```
feat(design): Phase 7 — Perplexity overhaul complete (57/57 compliance)
npm run deploy
```

---

## Summary

| Phase | Scope | Files | Tests Go Green | Cumulative |
|-------|-------|-------|---------------|------------|
| 1 | Tokens + fonts | `styles.css`, `__root.tsx` | +12 | 32/57 |
| 2 | CSS anti-patterns | `styles.css` | +3 | 35/57 |
| 3 | Layout + sidebar | `styles.css`, `Sidebar.tsx`, `AppLayout.tsx` | +2 | 37/57 |
| 4 | Chat UI | `Thread.tsx`, `Composer.tsx`, `ChatLayout.tsx` | +9 | 46/57 |
| 5 | Auth pages | `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx` | +4 | 50/57 |
| 6 | Conv list + settings | `ConversationList.tsx`, `styles.css` sections | +5 | 55/57 |
| 7 | Polish + deploy | Any remaining | +2 | **57/57** |

> [!TIP]
> Each phase can be paused and resumed. After each commit, run the full test suite
> to make sure nothing regressed. The compliance test file is the single source of
> truth for progress tracking.
