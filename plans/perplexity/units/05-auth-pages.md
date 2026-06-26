# Unit 5: Auth Pages

**Build:** Update login, register, forgot-password, and reset-password pages to Perplexity light style with teal accent.

**Depends on:** Unit 3

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/routes/login.tsx` | Replace emerald/purple colors with teal. White bg, centered card. |
| `shopmeta/src/routes/register.tsx` | Same as login. |
| `shopmeta/src/routes/forgot-password.tsx` | Replace `#8b5cf6`, `#6366f1` with teal. |
| `shopmeta/src/routes/reset-password.tsx` | Replace `#8b5cf6`, `#6366f1` with teal. |
| `shopmeta/src/styles.css` | Auth section CSS (`.auth-*` classes). |

## Checklist

### Login page

- [ ] White background, centered card
- [ ] No `#3ecf8e` / `#00c573` (old emerald)
- [ ] No `#6366f1` / `#8b5cf6` (old purple)
- [ ] Primary button: teal `var(--accent)` background
- [ ] Logo gradient: teal-based, not emerald
- [ ] Inputs: `var(--bg-surface)`, `var(--border)`, `var(--radius-md)`

### Register page

- [ ] Same rules as login
- [ ] No old emerald or purple accents

### Forgot password page

- [ ] No `#8b5cf6` (currently present — failing test)
- [ ] No `#6366f1` (currently present — failing test)
- [ ] Use teal accent for CTA button

### Reset password page

- [ ] No `#8b5cf6` (currently present — failing test)
- [ ] No `#6366f1` (currently present — failing test)
- [ ] Use teal accent for CTA button

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L3 | login.tsx exists | File exists |
| L3 | register.tsx exists | File exists |
| L3 | Login uses teal | `login.tsx` does not contain `#3ecf8e`, `#00c573`, `#6366f1`, `#8b5cf6` |
| L3 | Register uses teal | `register.tsx` does not contain `#3ecf8e`, `#00c573`, `#6366f1`, `#8b5cf6` |
| L2 | No purple in TSX | No `.tsx` contains `#a855f7`, `#7c3aed`, `#8b5cf6`, `#6366f1` |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L3: Auth|L2: TSX.*purple"
```

## Gate

All L3 Auth tests pass. No old accent colors in any route file.

## Status: ✅
