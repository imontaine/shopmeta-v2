---
version: alpha
name: "OpenAI"
website: "https://openai.com"
description: >-
  An AI lab whose marketing surface has shrunk to almost nothing — a pure-white canvas with a single editorial-weight black headline, a centered chat-style input pill in the hero, and an asymmetric grid of full-bleed product screenshots below. OpenAI Sans carries every tier from 13px nav labels up to a 48px display in weight 500. The system has exactly one structural color (ink black on canvas white) plus a hairline gray, and trusts the model-generated imagery in the grid cards to do every chromatic job the brand chrome refuses to do.

seo:
  title: "OpenAI Design System for React — ink-on-white, OpenAI Sans, 16 components"
  metaDescription: "OpenAI's marketing system is built around a single pure-black headline on white, a chat-style input pill in the hero, and an asymmetric grid of product-screenshot cards. Tokens for React, Next.js, and AI coding tools."
  highlights:
    - "Two-color structure — pure black ink on pure white canvas, with a single hairline gray for card outlines; no brand color is held in reserve"
    - "Input-as-hero — the only above-fold interactive element is a fully-rounded chat-style input pill, not a CTA button; the brand fronts the product UX, not a slogan"
    - "OpenAI Sans across every tier — 13px nav up to 48px display in weight 500, with a single weight-600 small-caps moment for the wordmark"
    - "Asymmetric screenshot grid — a large 16:9 product card sits beside two stacked square cards, then a 3-up image row below; the imagery is the marketing"
    - "Pill input plus 40px CTA radius — both interactive surfaces are fully-rounded; cards use a tight 6px rounding instead of the warm rounding the product brand uses"
  tags:
    - "AI & LLM Platforms"
  lastUpdated: "2026-05-18"
  author:
    name: "Dov Azencot"
    url: "https://x.com/dovazencot"
  opening: |
    OpenAI's marketing site does something almost no other AI-lab brand attempts: it deletes the marketing. The above-fold is a near-empty white canvas with a thin top-nav, a small "What can I help you with?" prompt, a fully-rounded chat-style input pill underneath, and a row of suggestion chips. There is no hero headline, no chest-pounding tagline, no gradient mesh, no product mockup overlay. The page IS the conversational onboarding affordance — type and you are already in product flow. Below the fold, an asymmetric grid of full-bleed product screenshots (GPT-5.5 announcement, sample outputs, customer stories) does every chromatic job the brand chrome refuses to do.

    The DESIGN.md file packages the system into a machine-readable spec for React tooling. Inside: a deliberately tiny color set — pure black ink with usage 563 (the dominant text and background voltage), pure white canvas, and a single light hairline gray with 535 border occurrences. Every other declared CSS variable in the source (an entire pink / blue / green / orange / yellow / lime / magenta palette mapped to `--color-hue-*` and `--color-syntax-*`) sits at usage 0 in the captured marketing surface; those tokens belong to the in-product chat interface, not the marketing chrome. Typography runs OpenAI Sans across nine tiers — 13px nav labels at weight 500, 17px nav links at weight 400, 48px display at weight 500 with tight -1.44px tracking. There is no second typeface, no serif tier, no monospace moment on the page.

    Feed this file to Claude or Cursor and it reproduces OpenAI's specific moves: pure-white canvas instead of cream or off-white, ink-on-canvas with no held-in-reserve brand color, OpenAI Sans at weight 400-500 across every tier, fully-rounded pill for the single interactive hero element, and 6.08px small-step rounding on every card. The one thing worth borrowing only if your product is itself a conversational interface: the willingness to put a chat input where most brands put a CTA. Most teams need a headline.
  related:
    - href: "/design"
      title: "Browse all design systems"
      description: "The full directory of DESIGN.md files on shadcn.io, with live mockups for each."
    - href: "https://openai.com"
      title: "OpenAI — official site"
      description: "OpenAI's public marketing site — the source of truth for the live tokens captured in this file."
    - href: "https://github.com/google-labs-code/design.md"
      title: "The DESIGN.md specification"
      description: "Google Labs' open spec for machine-readable design system files — the format this page is built on."
  questions:
    - id: "primary-color"
      title: "What is OpenAI's primary brand color?"
      answer: "OpenAI's marketing surface has no held-in-reserve brand color. The system runs on pure black ink and pure white canvas — black appears 563 times in the captured page (521 as text, 24 as background fill, 13 as shadow, 5 as border), with white as the dominant page floor. A light hairline gray carries 535 of the page's border occurrences. Every other color in the declared CSS (an extensive pink, green, blue, orange, magenta, lime palette wired to `--color-hue-*` variables) belongs to the product chat interface and never appears in marketing chrome. The brand voltage is the absence of voltage."
    - id: "typography"
      title: "What typeface does OpenAI use, and what should I use as a substitute?"
      answer: "OpenAI runs a custom proprietary sans named OpenAI Sans across every tier of the marketing system — display, heading, body, button, nav, and metadata labels share the family. Display headlines sit at 48px in weight 500 with tight -1.44px letter-spacing; section h2 at 22px / 500; body at 14-16px / 500; nav links at 17px / 400; small labels at 13px / 500. The hero h1 'Get started with ChatGPT' at 48px / 500 is the loudest typographic moment. The closest open-source substitute is Inter at the same weights with a touch of negative tracking on the display tier; Geist transfers cleanly at the 48px display moment if you need tighter cap height."
    - id: "canvas-color"
      title: "Why is OpenAI's canvas pure white instead of a warm off-white?"
      answer: "The canvas is pure #ffffff, never cream or off-white. The choice tracks with the absence of any brand chromatic accent: when the page floor carries no warmth and the ink carries no softening, the only thing that brings color to the surface is the full-bleed product imagery in the screenshot grid. A cream canvas would force every screenshot card to compete with the page warmth; a pure-white floor recedes and lets the GPT-5.5 announcement card and the sample-output thumbnails own every chromatic moment on the page. The hairline gray for card outlines is the same logic — quiet enough to disappear under the imagery."
    - id: "rounded-style"
      title: "What is OpenAI's corner-radius philosophy?"
      answer: "The radius scale is a deliberate two-tier split. Cards use a tight 6.08px rounding (the dominant radius at 39 of the 60 captured occurrences) for the asymmetric product-screenshot grid, the news cards, and the announcement strip. Interactive elements use a fully-rounded pill (9999px) — the hero input field, the suggestion chips, and the 40px-radius primary CTA in the nav. The contrast is the system's only shape gesture: cards are quiet rectangles with barely-visible rounding, interactive surfaces are warm tappable pills. There is no 8 / 12 / 16px middle tier."
    - id: "use-in-project"
      title: "Can I use this DESIGN.md to build my own AI-product marketing site?"
      answer: "Yes — the file is designed to be fed into Claude, Cursor, or any AI tool that reads structured design tokens. The agent will reproduce OpenAI's specific moves: pure-white canvas instead of cream or off-white, ink-on-canvas with no brand accent, OpenAI Sans-equivalent typography at weight 400-500 across every tier, fully-rounded pill for the single interactive hero element, and 6px small-step rounding on every card. The tokens resolve cleanly: every hex, font name, radius, and spacing value is a quoted scalar you can paste into Tailwind config or CSS variables. One caveat: the input-as-hero move only works if your product is itself a conversational interface. For most SaaS this would feel hollow."

mockups:
  - "marketing-hero"
  - "chat-conversation"

colors:
  ink: "#000000"
  ink-soft: "#47484f"
  ink-muted: "#707070"
  canvas: "#ffffff"
  surface-1: "#f1f1f1"
  surface-2: "#1f1f1f"
  hairline: "#e5e7eb"
  gray-60: "#bcbec4"
  gray-80: "#767881"
  syntax-keyword: "#1e60e4"
  syntax-string: "#027f41"
  syntax-operator: "#c93b00"
  syntax-function: "#7a4ff5"
  syntax-data: "#1d7899"
  syntax-error: "#f53255"

typography:
  display-xl:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 48px
    fontWeight: 500
    lineHeight: 55.68px
    letterSpacing: "-1.44px"
  display-md:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: "0.3px"
  heading-md:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 22px
    fontWeight: 500
    lineHeight: 27.72px
    letterSpacing: "-0.22px"
  heading-sm:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 23.76px
    letterSpacing: "-0.18px"
  nav-link:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: "-0.17px"
  body-md:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: "-0.16px"
  body-sm:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 19.6px
    letterSpacing: 0
  label-md:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 19.68px
    letterSpacing: 0
  button-md:
    fontFamily: "\"OpenAI Sans\", system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0
  mono-sm:
    fontFamily: "\"SF Mono\", Consolas, \"Liberation Mono\", ui-monospace, monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0

rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "24px"
  pill: "40px"
  full: "9999px"

spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "40px"
  3xl: "64px"

components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px 20px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "0px 20px"
    height: "36px"
    borderColor: "{colors.hairline}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    padding: "0px 32px"
    height: "64px"
  nav-link:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    padding: "0px 12px"
    height: "64px"
  hero-heading:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "0px"
  section-heading:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    padding: "0px"
  body-paragraph:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  body-paragraph-muted:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "10px 24px 10px 52px"
    height: "40px"
    borderColor: "{colors.hairline}"
  card-screenshot:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0px"
    borderColor: "{colors.hairline}"
  card-news:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px"
    borderColor: "{colors.hairline}"
  suggestion-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
    height: "32px"
    borderColor: "{colors.hairline}"
  wordmark:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    padding: "32px 0px"
  code-block:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.sm}"
    padding: "16px"
---

## Overview

OpenAI's marketing site does something almost no other AI-lab brand attempts. **Marketing as input.** The above-fold is a near-empty white canvas with a thin top-nav, a small "What can I help you with?" prompt, a fully-rounded chat-style input pill underneath, and a row of suggestion chips. There is no hero headline, no chest-pounding tagline, no gradient mesh, no product mockup overlay — the page IS the conversational onboarding affordance. Where Anthropic frames Claude with editorial display in a serif moment and Google paints the Gemini hero with brand-saturated imagery, OpenAI inverts the relationship: type and you are already inside ChatGPT.

The system's chromatic restraint reinforces the move. There is exactly one structural color stack — pure ink (`{colors.ink}` — #000000) and pure canvas (`{colors.canvas}` — #ffffff), with a single hairline (`{colors.hairline}` — #e5e7eb) marking card edges. Ink appears 563 times across the page (521 as text, 24 as background, 13 as shadow, 5 as border); the hairline carries 535 of the border occurrences. Every other color declared in the source CSS — an extensive `{colors.syntax-keyword}` / `{colors.syntax-string}` / `{colors.syntax-operator}` / `{colors.syntax-function}` / `{colors.syntax-data}` set wired to `--color-hue-*` and `--color-syntax-*` variables — sits at usage 0 in the captured marketing surface. Those tokens belong to the in-product chat interface, not the brand chrome.

Typography is OpenAI Sans across every tier — a custom proprietary sans that does the work of display, heading, body, button, nav, and label. Display tops out at 48px in weight 500 with tight -1.44px tracking; body and nav sit at 14-17px in weight 400-500; the only weight-600 moment on the page is the OpenAI wordmark itself at 28px. The hero h2 "Get started with ChatGPT" at 48px / 500 is the loudest typographic moment in the system, deliberately measured so the asymmetric product-screenshot grid below it remains visually dominant.

**Key Characteristics:**
- Pure white canvas (`{colors.canvas}` — #ffffff), not the warm cream Cloudflare or Patagonia use — the page floor recedes so the model-generated imagery in the screenshot grid can carry every chromatic moment.
- Ink (`{colors.ink}` — #000000) for every text, button fill, and shadow tone — 563 total occurrences, 521 as text. No softened off-black.
- Hairline (`{colors.hairline}` — #e5e7eb) for every card outline, input field border, and divider — 535 of 540 border occurrences in the captured page.
- OpenAI Sans across nine tiers — 13px label / 14px button / 17px nav / 22px section / 48px display — with the wordmark as the lone weight-600 moment.
- Binary radius split: 6.08px on cards (39 of 60 occurrences), fully-rounded pill on interactive surfaces (input, suggestion chips, primary CTA at 40px).
- Asymmetric screenshot grid below the fold: a large 16:9 announcement card beside two stacked square cards, then a 3-up image row, then a 3-up news strip.
- No second typeface, no serif tier, no in-marketing monospace — mono is reserved for the in-product chat code blocks.
- The entire `{colors.syntax-keyword}` / `{colors.syntax-string}` / `{colors.syntax-operator}` family is declared in CSS but never rendered on the marketing surface.

## Colors

### Structural

- **Ink** (`{colors.ink}` — #000000): frequency 563 — used as text (521), background (24), shadow (13), border (5). The dominant voltage of the system. Wired as `--color-black`, `--color-primary-100`, `--color-primary-solid-100`, and `--color-syntax-copy`. Every headline, every body paragraph, every wordmark, the primary CTA fill, and every shadow ink resolves to pure black.
- **Ink Soft** (`{colors.ink-soft}` — #47484f): declared as `--color-gray-100`. Not rendered as a primary running-text tone in the captured page — reserved for secondary text in the in-product surfaces.
- **Ink Muted** (`{colors.ink-muted}` — #707070): declared as `--color-primary-solid-inactive`, `--color-secondary-solid-44`, `--color-primary-solid-nav`, and `--color-tertiary-solid-hint`. The inactive-state ink tone for nav links and disabled buttons.
- **Canvas** (`{colors.canvas}` — #ffffff): the page floor below and above the fold. Wired as `--color-background`, `--color-white`, `--color-secondary-100`, and `--color-primary-nav`. Pure white, never softened.
- **Surface-1** (`{colors.surface-1}` — #f1f1f1): the warm-gray surface for the dark-tertiary fills. Used inside in-product code blocks (`--color-tertiary-100`, `--color-gray-20`). Not rendered as a primary marketing surface.
- **Surface-2** (`{colors.surface-2}` — #1f1f1f): declared as `--color-secondary-solid-12`. The dark variant for dark-mode product surfaces; absent from the captured light-mode marketing chrome.

### Hairline

- **Hairline** (`{colors.hairline}` — #e5e7eb): frequency 535, all as border. The dominant — and effectively only — border tone in the system. Wired as `--color-primary-solid-12`, `--color-gray-40`, and `--color-gray-200`. Marks every card outline, input field edge, divider rule, and dropdown border.
- **Gray-60** (`{colors.gray-60}` — #bcbec4): declared as `--color-gray-60` and `--color-tertiary-solid-80`. Reserved for secondary chrome states; not rendered on the captured marketing surface.
- **Gray-80** (`{colors.gray-80}` — #767881): declared as `--color-gray-80`. The mid-gray for product surface text labels.

### Syntax (product surface)

The captured CSS exposes a full syntax-highlighting palette wired into the in-product chat code blocks. None of these tokens appears on the marketing surface; all carry usage 0 in the extraction.

- **Syntax Keyword** (`{colors.syntax-keyword}` — #1e60e4): wired as `--color-syntax-keyword`. The cobalt-blue tone for `function` / `const` / `import` keywords inside in-product code blocks.
- **Syntax String** (`{colors.syntax-string}` — #027f41): wired as `--color-syntax-string` and `--color-green-700`. String literals in chat code.
- **Syntax Operator** (`{colors.syntax-operator}` — #c93b00): wired as `--color-syntax-operator` and `--color-orange-700`. Operators and punctuation in chat code.
- **Syntax Function** (`{colors.syntax-function}` — #7a4ff5): wired as `--color-syntax-function`. The violet-blue tone for function calls.
- **Syntax Data** (`{colors.syntax-data}` — #1d7899): wired as `--color-syntax-data`. Property names and identifiers.
- **Syntax Error** (`{colors.syntax-error}` — #f53255): wired as `--color-hue-red` and `--color-syntax-error`. The error-state red — distinct from the syntax-operator orange.

## Typography

### Font Family

The system runs **OpenAI Sans** for everything — a custom proprietary sans-serif OpenAI ships with the marketing site. Fallbacks walk `system-ui, -apple-system, sans-serif`. There is no separate display family, no serif tier, no in-marketing monospace voice; one variable-weight sans does every job. The only place a second family appears is inside in-product code blocks (`SF Mono, Consolas, Liberation Mono, ui-monospace`), which are not rendered on the captured marketing surface.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 48px | 500 | 55.68px | -1.44px | Hero h2 ("Get started with ChatGPT"), section openers |
| `{typography.display-md}` | 28px | 600 | 34px | 0.3px | OpenAI wordmark — the single weight-600 moment on the page |
| `{typography.heading-md}` | 22px | 500 | 27.72px | -0.22px | Section h2 ("Recent news", "Stories") |
| `{typography.heading-sm}` | 18px | 500 | 23.76px | -0.18px | Card titles in the news + announcement grid |
| `{typography.nav-link}` | 17px | 400 | 28px | -0.17px | Top-nav link labels ("Research", "Safety", "ChatGPT") |
| `{typography.body-md}` | 16px | 400 | 24px | -0.16px | Default running text below the screenshot grid |
| `{typography.body-sm}` | 14px | 500 | 19.6px | 0 | Card metadata, dateline rows, "5 min read" tags |
| `{typography.label-md}` | 13px | 500 | 19.68px | 0 | Small labels, category chips, footer link rows |
| `{typography.button-md}` | 14px | 500 | 14px | 0 | Primary CTA label ("Try ChatGPT"), suggestion chips |
| `{typography.mono-sm}` | 14px | 400 | 21px | 0 | In-product code blocks only — never on marketing |

### Principles

Display weight tops out at 500, never 700+. The 48px hero with -1.44px tracking is editorial confidence by tracking and color contrast, not by weight. The wordmark at 28px in weight 600 is the single semibold moment on the page — every other tier holds at 400 or 500. The absence of a 700+ tier reinforces the "marketing is product UX" stance: the page never raises its voice because the input field is already doing the work a hero headline would do elsewhere.

### Note on Font Substitutes

OpenAI Sans is proprietary. **Inter** at the same weights is the closest open-source substitute; the proportions transfer cleanly and Inter's slightly looser counters read close to OpenAI Sans at the 16-17px body sizes. For the 48px display tier with -1.44px tracking, **Geist** (Vercel's open-source sans) has comparable cap height; **General Sans** is closer in proportion but not free. The mono tier is already a system stack (`SF Mono, Consolas`) and needs no substitution.

## Layout

### Spacing System

- **Base unit:** 4px (with 8px and 16px as the dominant modules).
- **Tokens:** `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.base}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.2xl}` 40px · `{spacing.3xl}` 64px.
- **Section padding (vertical):** ~80px between major editorial bands, tightening to ~48px between row groups inside the screenshot grid.
- **Card internal padding:** `{spacing.base}` (16px) inside news cards; 0 on the screenshot tiles — the image fills the card edge to edge.
- **Nav padding:** `{spacing.xl}` (32px) horizontal, 0 vertical — the 64px nav height is set by the nav-link line height alone.
- **Hero padding:** ~96px top, ~64px bottom — the only generous band on the page.

### Grid & Container

- **Max content width:** 1440px (`--document-width: 1440px`), with a 200px nav rail on desktop.
- **Hero:** centered single column at ~720px max-width, holding the "What can I help you with?" prompt + input pill + suggestion chip row.
- **Screenshot grid:** asymmetric — a large 16:9 announcement card on the left (~720px wide) beside two stacked ~360x300 square cards on the right; below that a 3-up image row of square cards, then a 3-up news strip.
- **Stories band:** 3-column layout of full-bleed photographic cards at ~480x300 each.
- **Latest research:** 3-up of taller mixed-media cards, each with a thumbnail at top and metadata strip below.

### Rhythm

The page alternates between **empty above-fold** and **dense image-packed below**. The hero is generous (single input, three chips, vast surrounding white space). The screenshot grid immediately below is dense (asymmetric 5-card composition with zero gaps between groups). The news strip returns to a tighter grid. There is no atmospheric gradient between bands — every section terminates on the same pure-white canvas, and depth comes from the screenshot imagery itself, never from background-color shifts.

## Elevation

The system has essentially **no shadow tier**. The captured page has 13 occurrences of `{colors.ink}` used as shadow ink, almost all confined to faint card-elevation halos on the news cards and the suggestion chip row. The single hairline `{colors.hairline}` carries 535 of the page's 540 captured border occurrences and does the entire elevation job that a layered shadow tier would do on a typical dashboard product.

- **Flat (no shadow):** hero, screenshot grid, stories band, footer — 95% of surfaces.
- **Hairline outlines:** every card, input, and suggestion chip uses a 1px `{colors.hairline}` border. The hairline IS the elevation.
- **Faint card shadows:** news cards and the input pill carry a sub-pixel `rgba(0,0,0,0.04)` halo — readable only as a soft seat against the canvas, not as a layered shadow.

## Shapes

The radius scale is **binary**: small-step rounding on cards, full pill on interactive surfaces.

- **Small-step:** `{rounded.sm}` 4px (4 occurrences — sub-corners on small chips), `{rounded.md}` 6.08px (39 occurrences — the dominant card radius across the screenshot grid, news cards, and editorial tiles), `{rounded.lg}` 24px (1 occurrence — a single large feature card).
- **Pill:** `{rounded.pill}` 40px (3 occurrences — the primary CTA "Try ChatGPT" in the nav), `{rounded.full}` 9999px (13 occurrences — the hero input pill, suggestion chips, sub-nav indicators).
- **No middle tier:** the scale skips 8 / 12 / 16 / 20px entirely. Either a surface uses the 6.08px card radius or it goes to a fully-rounded pill — there is no rounded-but-not-pill middle.

The pill treatment is the warmest surface in the system. The fully-rounded input pill in the hero is the single most-tappable element on the page; the 40px-radius primary CTA in the nav is the second.

## Components

**`button-primary`** — The signature CTA. Pure-ink `{colors.ink}` fill, white text, `{rounded.pill}` 40px radius, 0x20 padding, 36px height. "Try ChatGPT" in the top-right of the nav is the canonical instance.

**`button-secondary`** — White `{colors.canvas}` fill, ink text, 1px `{colors.hairline}` border, `{rounded.pill}` 40px radius. Used for the "Log in" link beside the primary CTA.

**`top-nav`** — White surface flush with the page floor (no bottom hairline), 64px height, 32px horizontal padding. Houses the OpenAI wordmark flush left, the product / research / safety / company / news link rail center, and the log-in + primary CTA cluster flush right.

**`nav-link`** — Transparent background, ink text in `{typography.nav-link}` (17px / 400), 0x12 padding, 64px height. The active state carries no visible underline or fill in the captured surface — the link itself just sits in ink.

**`hero-heading`** — Ink text on the white canvas, `{typography.display-xl}` (48px / 500). 0 horizontal padding because the hero content is centered in the viewport via container width alone.

**`section-heading`** — Ink text, `{typography.heading-md}` (22px / 500). Used for "Recent news", "Stories", "Latest research" section openers.

**`body-paragraph`** — Default ink running-text at `{typography.body-md}` (16px / 400) below the screenshot grid.

**`body-paragraph-muted`** — `{colors.ink-muted}` (#707070) variant for caption rows and metadata strips under news cards.

**`text-input`** — White `{colors.canvas}` fill, ink text, 1px `{colors.hairline}` border, `{rounded.full}` 9999px (fully-rounded pill), 10x24x10x52 padding (the left padding leaves room for the search-icon glyph), 40px height. The single most-tappable element on the page — the hero "What can I help you with?" pill.

**`card-screenshot`** — White surface with a 1px `{colors.hairline}` outline, `{rounded.md}` 6.08px radius, 0 padding. The screenshot image fills the card edge to edge; titles sit beneath the card, not inside it. Used for the asymmetric announcement grid (GPT-5.5 card + two stacked product cards) and the 3-up image strip.

**`card-news`** — White surface, 1px hairline border, `{rounded.md}` radius, 16px internal padding. Holds a "Product / N min read" metadata row at top, then a single-line headline, then a Lucide-style external-link icon flush right.

**`suggestion-chip`** — White fill, ink text, 1px hairline border, `{rounded.full}` pill, 8x12 padding, 32px height. The row of suggestion prompts directly beneath the hero input.

**`wordmark`** — Plain ink text at `{typography.display-md}` (28px / 600) — the only weight-600 typographic moment on the page. No icon mark, no logotype glyph.

**`footer`** — White canvas, ink-muted text at `{typography.label-md}` (13px / 500), 32x0 padding. No surface contrast against the page floor — the footer continues the canvas with a single hairline rule at the top.

**`code-block`** — `{colors.surface-1}` warm-gray fill, ink text in `{typography.mono-sm}`, `{rounded.sm}` 4px radius. Reserved for the in-product chat surface; not rendered on the captured marketing page.

## Do's and Don'ts

**Do** delete the hero headline entirely if your product is a conversational interface. The defining move of this system is the absent hero — a chat input pill where most brands put a tagline. Adding a 48px hero "Build with AI" sentence above the input dilutes the input-as-hero principle.

**Do** keep the canvas pure `{colors.canvas}` (#ffffff). The page floor must recede so the model-generated imagery in the screenshot grid carries every chromatic moment. Warming the canvas to cream forces every screenshot card to compete with the surface.

**Do** use the `{colors.hairline}` (#e5e7eb) for every card edge. The single hairline tone carries 535 of 540 captured borders; introducing a darker divider tone breaks the quiet-card discipline.

**Do** restrict OpenAI Sans weight 600 to the wordmark only. Every other tier holds at 400-500. A second weight-600 moment (e.g. on a CTA or section heading) flattens the wordmark's status as the lone semibold voice.

**Don't** use the syntax-highlight colors (`{colors.syntax-keyword}`, `{colors.syntax-string}`, `{colors.syntax-operator}`, `{colors.syntax-function}`) anywhere outside in-product code blocks. They are wired as `--color-hue-*` and `--color-syntax-*` for the chat surface, not the brand palette.

**Don't** introduce a brand voltage. The marketing system has no held-in-reserve accent. Adding a teal or cobalt CTA color reads as borrowed from another infra brand and breaks the two-color structural discipline.

**Don't** add a middle radius tier between 6.08px and the fully-rounded pill. The binary split is the system's only shape gesture — a 12 or 16px middle softens the contrast between quiet cards and warm interactive pills.

**Don't** add a tinted shadow layer. The system has 13 captured shadow occurrences and they all use neutral ink at very low opacity. Tinting shadows or layering elevation reads decorative rather than structural.

## Known Gaps

- **Hover and focus states:** the primary CTA, nav links, and input pill carry resting-state styling only; the full hover / active / focus matrix lives inside the ChatGPT product surface and is not captured here.
- **Form input error states:** `{component.text-input}` carries the resting state; error / validation styling lives inside the product surface.
- **Dark mode:** the captured marketing surface is light-only. The declared `{colors.surface-2}` (#1f1f1f) and `--color-secondary-*` family belong to the dark-mode product chrome but are absent from the rendered marketing page.
- **Motion:** the hero input field has subtle placeholder-text cycling and the screenshot grid animates on scroll-into-view, but the spec captures end-state values only. Easing curves and duration live in the live runtime.
- **Product surfaces:** this DESIGN.md captures the marketing site only. ChatGPT itself (`chat.openai.com`) carries a much richer token system — sidebar layouts, message-bubble surfaces, code-block syntax highlighting, model-selector chrome — that is not represented here.
- **The full hue palette:** the CSS exposes `--color-hue-blue`, `--color-hue-magenta`, `--color-hue-lime`, `--color-hue-yellow` and their corresponding 20 / 40 / 60 / 80 / 100 / 200 ramps. None of these tokens render on marketing chrome — they belong to in-product chart and badge surfaces.
- **API platform surface:** `platform.openai.com` carries its own brand chrome (a separate top-nav, dashboard cards, API key management surfaces) that is not represented here.
