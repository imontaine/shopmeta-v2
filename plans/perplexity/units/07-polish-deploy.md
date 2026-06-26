# Unit 7: Polish + Deploy

**Build:** Final sweep — fix any remaining test failures, apply voice/copy rules, visual review, deploy to production.

**Depends on:** Unit 6

## Files to modify

| File | Change |
|------|--------|
| Any remaining files with violations | Fix per test output |

## Checklist

### Voice & copy (DESIGN.md §8)

- [ ] No emoji characters in visible UI strings (any `.tsx`)
- [ ] No filler phrases ("Great question!", "Glad you asked", etc.)
- [ ] Empty state text: "Ask anything." (not "Start a conversation")
- [ ] Loading text: "Searching…" (ellipsis only)
- [ ] Error text: "Something went wrong. Try again."
- [ ] CTA labels: verb-only — "Search", "Ask", "Sign in"

### Global font verification

- [ ] Inter referenced in project styles/imports
- [ ] JetBrains Mono referenced in project styles/imports

### Accessibility

- [ ] `prefers-reduced-motion` collapses all transitions to `0s`
- [ ] Focus ring: `0 0 0 2px var(--accent)` (teal)
- [ ] All interactive elements: min 44×44px touch target

### Final test suite

- [ ] 57/57 design compliance tests pass
- [ ] 188+ unit tests pass (no regressions)
- [ ] 332 component tests pass (no regressions)

### Visual review

- [ ] Open https://app.shopmeta.app in browser
- [ ] Login page: white bg, teal button, Inter font
- [ ] Chat empty state: centered "Ask anything." text
- [ ] Chat with messages: 720px column, clean text
- [ ] Sidebar: light surface, teal active state
- [ ] Dark mode toggle: works, uses dark Perplexity tokens

### Deploy

- [ ] `npm run deploy` (bumps version, pushes to main)
- [ ] Dokploy auto-builds from GitHub push
- [ ] Verify deployed version matches local

## Test command (full suite)

```bash
# All compliance tests
pnpm vitest run --config vitest.config.ts tests/unit/design/
# Expected: 57/57 pass

# All existing tests
pnpm test:unit        # 188+
pnpm test:component   # 332

# Total: 577+ tests pass, 0 fail
```

## Gate

57/57 compliance tests pass. All existing tests pass. Visual review confirms Perplexity light mode look. Deployed to production.

## Status: ✅
