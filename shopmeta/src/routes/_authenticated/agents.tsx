// src/routes/_authenticated/agents.tsx
// Agent builder page — accessible at /agents

import { createFileRoute } from '@tanstack/react-router'
import { AgentBuilder } from '#/components/agents/AgentBuilder'

export const Route = createFileRoute('/_authenticated/agents')({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <div className="agents-page">
      <div className="agents-page-header">
        <h1 className="agents-page-title">Agents</h1>
        <p className="agents-page-subtitle">
          Build and manage AI agents for your organization
        </p>
      </div>
      <div className="agents-page-content">
        <AgentBuilder />
      </div>
    </div>
  )
}
