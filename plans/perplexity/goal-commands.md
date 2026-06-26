# Perplexity Overhaul /goal Commands

> Run these **one at a time**, in order. Verify the gate passes before moving to the next.
> Each unit has a compliance test gate — the tests MUST pass before proceeding.
>
> **Design system source of truth:** `.agents/skills/perplexity-design/SKILL.md`
> **Compliance tests:** `shopmeta/tests/unit/design/perplexity-compliance.test.ts`
> **Accent:** teal `#21808D` (NOT purple/violet). **Fonts:** Inter + JetBrains Mono (both SIL OFL 1.1).

---

## Unit 1: Design Tokens + Typography

```
/goal Complete Unit 1: Design Tokens + Typography. Read plans/perplexity/units/01-design-tokens.md for the full checklist. Read .agents/skills/perplexity-design/SKILL.md for the corrected Perplexity design system (accent is TEAL #21808D, NOT purple). In shopmeta/src/styles.css, replace the existing :root color variables with Perplexity light-mode tokens: --bg-base: #ffffff, --bg-surface: #f8f8f8, --bg-elevated: #f0f0f0, --border: #e5e5e5, --text-primary: #191a1a, --text-secondary: #6b6b6b, --accent: #21808D. Add the .dark override block with: --bg-base: #0f0f10, --bg-surface: #19191a, --bg-elevated: #232325, --border: #2e2e30, --text-primary: #f0f0f0, --text-secondary: #9b9b9b, --accent: #2ba3b0. Add spacing tokens --space-1: 4px through --space-8: 32px (8px base). Add radius tokens --radius-sm: 4px, --radius-md: 8px, --radius-lg: 12px. Add motion tokens --motion-fast: 120ms, --motion-base: 200ms. Ensure prefers-reduced-motion media query exists. In shopmeta/src/routes/__root.tsx, add a Google Fonts link for Inter (400, 500, 600) and JetBrains Mono (400, 500) in the head() config. Set body font to Inter 15px with line-height 1.65. Do NOT change any component TSX files yet — this unit is tokens only. Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1:" and all 32 L1 tests pass. Also run pnpm test:unit and pnpm test:component to verify no regressions (520+ tests pass). Commit with message "feat(design): Unit 1 — Perplexity design tokens + Inter/JetBrains Mono". Update plans/perplexity/units/01-design-tokens.md status to ✅.
```

---

## Unit 2: CSS Anti-Pattern Cleanup

```
/goal Complete Unit 2: CSS Anti-Pattern Cleanup. Read plans/perplexity/units/02-css-cleanup.md for the full checklist. In shopmeta/src/styles.css ONLY (do not touch TSX files yet), perform a full sweep to remove Supabase-era patterns: 1) Replace every instance of #3ecf8e with var(--accent). 2) Replace every instance of #00c573 with var(--accent-hover). 3) Replace every rgba(62, 207, 142, ...) with var(--accent) or var(--accent-subtle). 4) Remove all linear-gradient() and radial-gradient() from component styles (skeleton shimmer is excepted). 5) Remove all box-shadow for elevation — replace with border: 1px solid var(--border). Keep box-shadow only for focus rings (0 0 0 1px/2px patterns). 6) Remove all text-transform: uppercase. 7) Replace all font-weight: 700 with font-weight: 600. Do NOT touch any TSX component files in this unit. Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity typography|L2: CSS" and all tests in those groups pass. Run pnpm test:component to verify no regressions. Commit with message "refactor(design): Unit 2 — remove Supabase anti-patterns from CSS". Update plans/perplexity/units/02-css-cleanup.md status to ✅.
```

---

## Unit 3: Layout Shell + Sidebar

```
/goal Complete Unit 3: Layout Shell + Sidebar. Read plans/perplexity/units/03-layout-sidebar.md for the full checklist. Read .agents/skills/perplexity-design/SKILL.md for layout specs. Modify these files: 1) In shopmeta/src/styles.css — update sidebar CSS: width ~260px, background var(--bg-surface), border-right 1px solid var(--border). Nav links: color var(--text-secondary) default, color var(--text-primary) with teal left border on active. Update main content area to max-width 720px centered. 2) In shopmeta/src/components/layout/Sidebar.tsx — remove any remaining hardcoded emerald colors or rgba(62, 207, 142, ...) values. Use CSS classes that reference the new tokens. 3) In shopmeta/src/components/layout/AppLayout.tsx — ensure shell background uses var(--bg-base). 4) In shopmeta/src/routes/__root.tsx — change the default theme fallback from 'dark' to 'light' (line ~89, change the else branch). Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity layout|L3: Sidebar" and all pass. Run pnpm test:component to verify all 332 component tests still pass. Commit with message "feat(design): Unit 3 — Perplexity layout shell + sidebar". Update plans/perplexity/units/03-layout-sidebar.md status to ✅.
```

---

## Unit 4: Chat UI Components

```
/goal Complete Unit 4: Chat UI Components. Read plans/perplexity/units/04-chat-ui.md for the full checklist. Read .agents/skills/perplexity-design/SKILL.md for component patterns. Modify these files: 1) shopmeta/src/components/chat/Thread.tsx — Remove the Sparkles import entirely (decorative icons violate DESIGN.md §9). In the empty state (ThreadPrimitive.Empty), change "Start a conversation" to "Ask anything." with no emoji, no exclamation mark, centered vertically and horizontally. Remove the MessageSquarePlus icon or replace with a subtle monochrome icon. Remove #3ecf8e from user message bubble background — make user messages clean text with no colored bubble. Remove rgba(62, 207, 142, ...) from assistant avatar — use var(--accent) or a neutral monochrome style. 2) shopmeta/src/components/chat/Composer.tsx — Replace #3ecf8e send button color with var(--accent) for enabled state. Replace the emerald focus border rgba(62,207,142,0.5) with var(--accent). Give the input area a rounded card style: var(--bg-surface) background, 1px solid var(--border), var(--radius-lg) border-radius. 3) shopmeta/src/components/chat/ChatLayout.tsx — Ensure the chat content area has max-width 720px centered. Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Thread|L3: Composer|L2: TSX" and all pass. Run pnpm test:component to verify all 332 component tests pass. Commit with message "feat(design): Unit 4 — Perplexity chat UI (thread, composer, empty state)". Update plans/perplexity/units/04-chat-ui.md status to ✅.
```

---

## Unit 5: Auth Pages

```
/goal Complete Unit 5: Auth Pages. Read plans/perplexity/units/05-auth-pages.md for the full checklist. Modify these files: 1) shopmeta/src/routes/login.tsx — Replace any emerald accent (#3ecf8e, #00c573) with var(--accent) or #21808D. Replace any purple/violet (#6366f1, #8b5cf6) with teal. Update logo gradient from emerald to teal. Ensure white background, centered card, Inter font, teal primary button. 2) shopmeta/src/routes/register.tsx — Same changes as login. 3) shopmeta/src/routes/forgot-password.tsx — Replace #8b5cf6 and #6366f1 with teal equivalents (#21808D, #1a6b76). Use teal accent for CTA button. 4) shopmeta/src/routes/reset-password.tsx — Same changes as forgot-password. 5) In shopmeta/src/styles.css — update the auth section CSS (.auth-* classes) to use Perplexity tokens: inputs with var(--bg-surface), var(--border), var(--radius-md). Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Auth|L2: TSX.*purple" and all pass. Run pnpm test:component to verify no regressions. Commit with message "feat(design): Unit 5 — auth pages restyled with teal accent". Update plans/perplexity/units/05-auth-pages.md status to ✅.
```

---

## Unit 6: Remaining Components

```
/goal Complete Unit 6: Remaining Components. Read plans/perplexity/units/06-remaining-components.md for the full checklist. This is the final CSS sweep — after this unit, zero instances of #3ecf8e, #00c573, or rgba(62, 207, 142, ...) should exist anywhere in the codebase. 1) In shopmeta/src/styles.css — do a comprehensive find-and-replace for ALL remaining instances of #3ecf8e → var(--accent), #00c573 → var(--accent-hover), rgba(62, 207, 142, ...) → var(--accent) / var(--accent-subtle). This covers conversation list CSS, settings page CSS, connections CSS, and agent builder CSS. Update conversation list active state to use var(--bg-elevated) + teal left accent bar. 2) In shopmeta/src/components/layout/ConversationList.tsx — remove any hardcoded emerald if present. 3) Verify: run grep -r "#3ecf8e" shopmeta/src/ and grep -r "#00c573" shopmeta/src/ — both must return zero results. Gate: run pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L2:" and ALL L2 tests pass. Run pnpm test:unit and pnpm test:component — all 520+ tests pass. Commit with message "feat(design): Unit 6 — remaining components restyled, zero emerald". Update plans/perplexity/units/06-remaining-components.md status to ✅.
```

---

## Unit 7: Polish + Deploy

```
/goal Complete Unit 7: Polish + Deploy. Read plans/perplexity/units/07-polish-deploy.md for the full checklist. This is the final polish pass. 1) Fix any remaining compliance test failures — run pnpm vitest run --config vitest.config.ts tests/unit/design/ and fix every failure. 2) Voice & copy: scan all TSX files for emoji in visible UI strings and remove them. Replace any filler phrases ("Great question!", etc.) with neutral text. Ensure empty state says "Ask anything." and loading says "Searching…" 3) Verify fonts: Inter and JetBrains Mono must both be referenced in the project. 4) Verify accessibility: prefers-reduced-motion collapses transitions, focus ring uses var(--accent). 5) Run the FULL test suite: pnpm vitest run --config vitest.config.ts tests/unit/design/ must show 57/57 pass. pnpm test:unit must show 188+ pass. pnpm test:component must show 332 pass. If any test fails, fix it before proceeding. 6) Commit with message "feat(design): Unit 7 — Perplexity overhaul complete (57/57 compliance)". 7) Deploy: run npm run deploy to bump version, push to main, and trigger Dokploy auto-build. Update plans/perplexity/units/07-polish-deploy.md status to ✅.
```

---

## Execution Order

```
U1  →  U2  →  U3  →  U4  →  U7
                  →  U5  →  U6  →  U7
```

> **Sequential order (recommended):** 1 → 2 → 3 → 4 → 5 → 6 → 7
>
> Units 4 and 5 can run in parallel after Unit 3, but sequential is safest.

---

## Quick Reference

| Unit | Gate Command | Expected |
|------|-------------|----------|
| 1 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1:"` | 32/32 pass |
| 2 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L2: CSS"` | 5/5 pass |
| 3 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity layout\|L3: Sidebar"` | 4/4 pass |
| 4 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Thread\|L3: Composer"` | 7/7 pass |
| 5 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Auth"` | 4/4 pass |
| 6 | `pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L2:"` | 9/9 pass |
| 7 | `pnpm vitest run --config vitest.config.ts tests/unit/design/` | **57/57 pass** |
