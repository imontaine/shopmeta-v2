// src/routes/_authenticated/agents.tsx
// Agent builder page - accessible at /agents
// Structure conforms to settings-page design system:
//   settings-page > settings-header + settings-layout > settings-tabs + settings-content
import { createFileRoute } from '@tanstack/react-router'
import { AgentBuilder } from '#/components/agents/AgentBuilder'

export const Route = createFileRoute('/_authenticated/agents')({
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Agents</h1>
        <p className="settings-subtitle">
          Build and manage AI agents with custom instructions, model selection, and tool integrations.
        </p>
      </div>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Agent sections">
          <button className="settings-tab settings-tab--active" id="agents-tab-builder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10" />
              <path d="M12 8v4l3 3" />
            </svg>
            Agents
          </button>
        </nav>
        <div className="settings-content">
          <AgentBuilder />
        </div>
      </div>
    </div>
  )
}
