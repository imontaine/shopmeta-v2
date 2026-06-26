# Unit 1: Design Tokens + Typography

**Build:** Replace all CSS custom properties with Perplexity tokens. Add Inter + JetBrains Mono fonts.

**Depends on:** —

## Files to modify

| File | Change |
|------|--------|
| `shopmeta/src/styles.css` | Replace `:root` block with Perplexity light tokens. Add `.dark` override. Add `--space-*`, `--radius-*`, `--motion-*` declarations. |
| `shopmeta/src/routes/__root.tsx` | Add Google Fonts `<link>` for Inter + JetBrains Mono in `head()` config. |

## Checklist

### Light mode tokens (`:root`)

- [ ] `--bg-base: #ffffff`
- [ ] `--bg-surface: #f8f8f8`
- [ ] `--bg-elevated: #f0f0f0`
- [ ] `--border: #e5e5e5`
- [ ] `--text-primary: #191a1a`
- [ ] `--text-secondary: #6b6b6b`
- [ ] `--accent: #21808D`

### Dark mode tokens (`.dark`)

- [ ] `--bg-base: #0f0f10`
- [ ] `--bg-surface: #19191a`
- [ ] `--bg-elevated: #232325`
- [ ] `--border: #2e2e30`
- [ ] `--text-primary: #f0f0f0`
- [ ] `--text-secondary: #9b9b9b`
- [ ] `--accent: #2ba3b0`

### Typography

- [ ] Google Fonts `<link>` in `__root.tsx` head: Inter (400, 500, 600) + JetBrains Mono (400, 500)
- [ ] `--font-body: "Inter", ui-sans-serif, system-ui, sans-serif`
- [ ] `--font-mono: "JetBrains Mono", ui-monospace, monospace`
- [ ] Body: `font-size: 15px; line-height: 1.65;`

### Spacing (8px base)

- [ ] `--space-1: 4px` through `--space-8: 32px` (7 tokens)

### Radius

- [ ] `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`

### Motion

- [ ] `--motion-fast: 120ms`
- [ ] `prefers-reduced-motion` media query present

## Tests

| Type | What to test | Assertion |
|------|-------------|-----------|
| L1 | Light tokens present | `styles.css` contains `#ffffff`, `#f8f8f8`, `#f0f0f0`, `#e5e5e5`, `#191a1a`, `#6b6b6b`, `#21808d` |
| L1 | Dark tokens present | `styles.css` contains `#0f0f10`, `#19191a`, `#232325`, `#2e2e30`, `#f0f0f0`, `#9b9b9b`, `#2ba3b0` |
| L1 | Typography | `styles.css` matches `Inter`, `JetBrains Mono`, `15px` |
| L1 | Spacing | `styles.css` defines `--space-1: 4px` through `--space-8: 32px` |
| L1 | Radius | `styles.css` defines `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px` |
| L1 | Motion | `styles.css` contains `120ms` and `prefers-reduced-motion` |

```bash
pnpm vitest run --config vitest.config.ts tests/unit/design/ -t "L1:"
```

## Gate

All 32 L1 tests pass. Existing 520 tests still pass.

## Status: ✅
