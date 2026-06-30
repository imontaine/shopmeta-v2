// src/routes/_authenticated/dev/style-tester.tsx
// Stylesheet Conformity Tester — dev-only tool to verify config pages follow
// the canonical design system (settings-* / conn-* / shared CSS variable tokens).
//
// Route: /dev/style-tester
// Purpose: Catch visual drift before it reaches production.

import { createFileRoute } from '@tanstack/react-router'
import { StyleTesterPage } from '#/components/dev/StyleTesterPage'

export const Route = createFileRoute('/_authenticated/dev/style-tester')({
  component: StyleTesterPage,
})
