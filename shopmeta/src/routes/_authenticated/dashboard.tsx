// src/routes/_authenticated/dashboard.tsx
// Dashboard placeholder — allows E2E sidebar navigation test to pass.
// Full dashboard implementation comes in Unit 12.

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="page-placeholder">
      <h1>Dashboard</h1>
      <p>Dashboard builder coming in Unit 12.</p>
    </div>
  )
}
