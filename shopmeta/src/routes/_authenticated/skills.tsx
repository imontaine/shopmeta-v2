// src/routes/_authenticated/skills.tsx
// Skills management page - accessible at /skills
// Structure conforms to settings-page design system:
//   settings-page > settings-header + settings-layout > settings-tabs + settings-content
import { createFileRoute } from '@tanstack/react-router'
import { SkillManager } from '#/components/skills/SkillManager'

export const Route = createFileRoute('/_authenticated/skills')({
  component: SkillsPage,
})

function SkillsPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Skills</h1>
        <p className="settings-subtitle">
          Upload and manage knowledge documents and instruction sets for your AI agents.
        </p>
      </div>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Skill sections">
          <button className="settings-tab settings-tab--active" id="skills-tab-manager">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Skills
          </button>
        </nav>
        <div className="settings-content">
          <SkillManager />
        </div>
      </div>
    </div>
  )
}
