# Unit 6: Remaining Components

**Build:** Clean up conversation list, settings, connections, and agent builder. Remove all remaining Supabase-era emerald and purple references.

**Depends on:** Unit 4, Unit 5

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/components/layout/ConversationList.tsx` | Remove emerald active states. Use `var(--bg-elevated)` + teal left border. |
| `shopmeta/src/styles.css` | Conversation list CSS, settings CSS, connections CSS, agent builder CSS. All remaining `#3ecf8e` → `var(--accent)`. |

## Checklist

### Conversation list

- [ ] Clean text items, no background on inactive
- [ ] Active state: `var(--bg-elevated)` + teal left accent bar
- [ ] No emerald in conv item CSS
- [ ] Hover: `var(--bg-elevated)`

### Settings / Connections CSS

- [ ] Input fields: `var(--bg-surface)`, `var(--border)`, `var(--radius-md)`
- [ ] Buttons: ghost or primary teal
- [ ] No `#3ecf8e` in connection form CSS
- [ ] No `rgba(62, 207, 142, ...)` in connections CSS

### Agent builder CSS

- [ ] Agent chips/badges: teal, not emerald
- [ ] No `#3ecf8e` in agent CSS
- [ ] Default badge: teal accent
- [ ] Loading dots: teal, not emerald

### Full CSS sweep

- [ ] Zero instances of `#3ecf8e` in `styles.css`
- [ ] Zero instances of `#00c573` in `styles.css`
- [ ] Zero instances of `rgba(62, 207, 142, ...)` in `styles.css`

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L2 | No emerald in CSS | `styles.css` does not contain `#3ecf8e` or `#00c573` |
| L2 | No purple in CSS | `styles.css` does not contain old purple hex values |
| L2 | No emerald in TSX | No `.tsx` file contains `#3ecf8e` |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L2:"
pnpm test:component
```

## Gate

All L2 tests pass. All 332 component tests still pass.

## Status: ⬜
