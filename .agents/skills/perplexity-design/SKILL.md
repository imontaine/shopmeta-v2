---
name: perplexity-design
description: >
  Perplexity AI design system — light mode focus. Tokens, components, typography (Inter + JetBrains Mono),
  spacing (8px base), accent teal (#21808D), layout patterns (centered search-first column, 720px reading
  width, rounded search card). Anti-patterns: no gradients, no drop shadows, no colorful icons, no accent
  overuse. Use for all ShopMeta UI theming decisions.
---

# Perplexity Design System Skill

## Purpose

This skill provides the **corrected** Perplexity AI design system as the source of truth for all
ShopMeta UI/UX decisions. The accent color, layout, and defaults have been verified against the
live perplexity.ai production site (June 2025).

> [!IMPORTANT]
> The open-design community repo incorrectly listed violet/purple as the accent. The **actual**
> Perplexity brand accent is **teal `#21808D`**. All references below use the corrected value.

## Reference Files

| File | Purpose |
|------|---------|
| `references/DESIGN.md` | Visual spec — **read with corrections below in mind** |
| `references/tokens.css` | CSS custom properties — **use corrected tokens below** |
| `references/components.html` | Component reference for layout patterns |

## Corrected Color Tokens

### Light mode (DEFAULT — what Perplexity actually uses)

| Token | Value | Role |
|-------|-------|------|
| `--bg-base` | `#ffffff` | Page background — clean white |
| `--bg-surface` | `#f8f8f8` | Card / sidebar / search bar surface |
| `--bg-elevated` | `#f0f0f0` | Hover / elevated states |
| `--border` | `#e5e5e5` | Dividers, input borders |
| `--text-primary` | `#191a1a` | Body copy, headings — near-black |
| `--text-secondary` | `#6b6b6b` | Meta, captions, sidebar labels |
| `--text-tertiary` | `#9a9a9a` | Placeholder, disabled |
| `--accent` | `#21808D` | Primary CTA, focus ring, active tab — TEAL |
| `--accent-hover` | `#1a6b76` | Darker teal hover |
| `--accent-subtle` | `rgba(33, 128, 141, 0.08)` | Subtle accent tint background |

### Dark mode (secondary)

| Token | Value | Role |
|-------|-------|------|
| `--bg-base` | `#0f0f10` | Page background |
| `--bg-surface` | `#19191a` | Card surface |
| `--bg-elevated` | `#232325` | Elevated |
| `--border` | `#2e2e30` | Dividers |
| `--text-primary` | `#f0f0f0` | Body copy |
| `--text-secondary` | `#9b9b9b` | Meta |
| `--accent` | `#2ba3b0` | Teal accent (lighter for dark bg) |

## Typography (unchanged from open-design)

- **UI / body**: `Inter` (Google Fonts)
- **Code**: `JetBrains Mono`
- **Weight cap**: 600 for display, never 700
- **Body**: 15px, line-height 1.65
- **Display**: 32px, weight 600, letter-spacing -0.01em

## Layout (from actual perplexity.ai)

- **Search-first centered layout**: Large centered search card on empty state
- **"perplexity enterprise" heading**: Clean, thin-weight brand text above search
- **Search bar**: Rounded card (radius ~16px), subtle border, toolbar below with
  Search/Computer toggles, Model selector, mic, and submit button
- **Max reading width**: ~720px for answer column
- **Sidebar**: ~170px, clean white/light gray, simple text links
- **Sidebar items**: History list with truncated titles, no icons per item

## Design Prompt Pattern

When writing prompts to enforce this design system:

```
You are building UI for ShopMeta using the Perplexity design system (light mode).

MANDATORY RULES:
1. Colors: bg=#ffffff, surface=#f8f8f8, elevated=#f0f0f0, border=#e5e5e5,
   text=#191a1a, accent=TEAL #21808D (NOT purple/violet)
2. Font: Inter for UI/body, JetBrains Mono for code. Weight cap: 600.
3. Spacing: 8px base unit.
4. Radius: sm=4px, md=8px, lg=12px, xl=16px (search bar)
5. NO gradients, NO drop shadows, NO colorful icons
6. Elevation = border contrast only (base→surface→elevated)
7. Search bar: centered card, surface fill, subtle border, xl radius
8. Max reading width: 720px. Sidebar: ~170px.
9. Voice: precise, neutral. No emoji, no exclamation marks.
10. Motion: 120ms hover, 200ms modal. No bounce/spring.
```

## Anti-Patterns

- **No violet/purple** — the open-design repo was wrong. Accent is TEAL #21808D
- **No gradient backgrounds** — flat colors only
- **No drop shadows** — elevation via background color steps
- **No colorful icons** — monochrome at --text-secondary
- **No accent overuse** — teal appears once per view
- **No ALL CAPS labels** — sentence case only
- **No font-weight 700** — max is 600
- **No emoji in UI copy**
