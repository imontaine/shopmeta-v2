# Unit 2: CSS Anti-Pattern Cleanup

**Build:** Remove all Supabase-era visual patterns from `styles.css` that violate the Perplexity design spec.

**Depends on:** Unit 1

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/styles.css` | Replace/remove gradients, box-shadows, uppercase, emerald hex, purple hex, font-weight 700. |

## Checklist

### Gradient removal

- [ ] No `linear-gradient()` in component styles (skeleton shimmer excepted)
- [ ] No `radial-gradient()` in component styles

### Shadow removal

- [ ] No `box-shadow` for elevation (only `0 0 0 1px/2px` focus rings allowed)
- [ ] Replace elevation shadows with `border: 1px solid var(--border)`

### Text transform

- [ ] No `text-transform: uppercase` on section labels / badges

### Old color removal

- [ ] No `#3ecf8e` anywhere → replace with `var(--accent)`
- [ ] No `#00c573` anywhere → replace with `var(--accent-hover)`
- [ ] No `rgba(62, 207, 142, ...)` → replace with `var(--accent-subtle)` or `var(--accent)`
- [ ] No `#a855f7`, `#7c3aed`, `#8b5cf6`, `#6366f1` (old purple)

### Font weight

- [ ] No `font-weight: 700` → replace with `600`

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L1 | Font weight max 600 | No `font-weight: \d+` where digit > 600 |
| L2 | No gradients | No `linear-gradient` in non-skeleton rules |
| L2 | No box-shadow elevation | No `box-shadow` outside focus ring patterns |
| L2 | No uppercase | No `text-transform: uppercase` |
| L2 | No emerald in CSS | `styles.css` does not contain `#3ecf8e` or `#00c573` |
| L2 | No purple in CSS | `styles.css` does not contain `#a855f7`, `#7c3aed`, etc. |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity typography|L2: CSS"
```

## Gate

All L2 CSS anti-pattern tests pass. No regressions in existing tests.

## Status: ⬜
