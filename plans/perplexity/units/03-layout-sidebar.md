# Unit 3: Layout Shell + Sidebar

**Build:** Restructure the app shell to Perplexity's layout. White background, correct sidebar width, 720px reading column, default to light theme.

**Depends on:** Unit 1, Unit 2

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/styles.css` | Sidebar CSS: width, background, border. Main content: max-width 720px centered. |
| `shopmeta/src/components/layout/Sidebar.tsx` | Remove any hardcoded emerald. Use CSS classes. |
| `shopmeta/src/components/layout/AppLayout.tsx` | Shell background → `var(--bg-base)`. |
| `shopmeta/src/routes/__root.tsx` | Default theme → light (change fallback from `dark` to `light`). |

## Checklist

### App shell

- [ ] Page background: `var(--bg-base)` (#ffffff in light)
- [ ] Max content width: 720px centered for reading column
- [ ] Default theme: light (update fallback in `__root.tsx` line 89)

### Sidebar

- [ ] Width: ~260px
- [ ] Background: `var(--bg-surface)` (#f8f8f8)
- [ ] Right border: `1px solid var(--border)` (#e5e5e5)
- [ ] Nav links default: `color: var(--text-secondary)`
- [ ] Nav links active: `color: var(--text-primary)` + teal left border
- [ ] No hardcoded emerald in `Sidebar.tsx`
- [ ] Collapse behavior: icon-only at narrow viewports

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L1 | 720px reading width | `styles.css` contains `720px` |
| L1 | Sidebar width | `styles.css` contains a value in 240–280px range |
| L3 | Sidebar no emerald | `Sidebar.tsx` does not contain `#3ecf8e` or `rgba(62, 207, 142, ...)` |
| Component | Sidebar renders | `render(<Sidebar />)` → sidebar element exists |
| Component | Theme default | Default theme class is `light`, not `dark` |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1: Perplexity layout|L3: Sidebar"
pnpm test:component
```

## Gate

Layout + sidebar L1/L3 tests pass. All 332 component tests still pass.

## Status: ⬜
