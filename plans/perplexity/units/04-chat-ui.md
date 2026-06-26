# Unit 4: Chat UI Components

**Build:** Transform Thread, Composer, and ChatLayout to Perplexity's centered, clean style. Centered welcome, search-card composer, clean message threads.

**Depends on:** Unit 3

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/components/chat/Thread.tsx` | Remove Sparkles icon. Empty state → "Ask anything." centered. Remove emerald from user bubbles + assistant avatar. |
| `shopmeta/src/components/chat/Composer.tsx` | Rounded card style. Replace emerald send button → teal. Replace emerald focus → teal. |
| `shopmeta/src/components/chat/ChatLayout.tsx` | Centered layout wrapper with 720px max-width. |
| `shopmeta/src/styles.css` | Any chat-specific CSS updates. |

## Checklist

### Thread — empty state

- [ ] Centered vertically + horizontally
- [ ] Text: "Ask anything." (no emoji, no exclamation)
- [ ] Remove `Sparkles` icon import — decorative (DESIGN.md §9)
- [ ] Remove `MessageSquarePlus` icon or replace with monochrome version

### Thread — messages

- [ ] No `#3ecf8e` emerald in user message bubble background
- [ ] No `rgba(62, 207, 142, ...)` in assistant avatar
- [ ] User messages: clean text alignment, no colored bubble
- [ ] Assistant messages: subtle `var(--bg-surface)` card with `var(--radius-lg)`
- [ ] Max reading width: 720px
- [ ] Body text: 15px Inter, 1.65 line-height

### Composer

- [ ] Rounded card style: `var(--bg-surface)`, `1px solid var(--border)`, `var(--radius-lg)`
- [ ] No `#3ecf8e` in send button — use `var(--accent)` (teal)
- [ ] No `rgba(62, 207, 142, ...)` for focus border — use `var(--accent)`
- [ ] Placeholder: "Ask anything."
- [ ] Focus border: `var(--accent)` (teal)
- [ ] Send button: dark circle, teal on active/hover

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L3 | Thread exists | `Thread.tsx` file exists |
| L3 | "Ask anything" text | `Thread.tsx` contains "Ask anything" |
| L3 | No emerald in thread | `Thread.tsx` does not contain `#3ecf8e` |
| L3 | No Sparkles import | `Thread.tsx` does not contain `Sparkles` |
| L3 | No emerald rgba | `Thread.tsx` does not match `rgba(62, 207, 142, ...)` |
| L3 | Composer exists | `Composer.tsx` file exists |
| L3 | No emerald send btn | `Composer.tsx` does not contain `#3ecf8e` |
| L3 | No emerald focus | `Composer.tsx` does not match `rgba(62, 207, 142, ...)` |
| L2 | No emerald in components | No `.tsx` file contains `#3ecf8e` |
| L2 | No emoji in UI | No `.tsx` file has emoji in visible strings |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Thread|L3: Composer|L2: TSX"
pnpm test:component
```

## Gate

All L3 Thread + Composer tests pass. All L2 TSX anti-pattern tests pass. 332 component tests still pass.

## Status: ⬜
