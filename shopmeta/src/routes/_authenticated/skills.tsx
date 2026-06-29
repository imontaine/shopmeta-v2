// src/routes/_authenticated/skills.tsx
// Skills management page — list, create, edit, and delete skills.

import { createFileRoute } from '@tanstack/react-router'
import { SkillManager } from '#/components/skills/SkillManager'

export const Route = createFileRoute('/_authenticated/skills')({
  component: SkillsPage,
})

function SkillsPage() {
  return (
    <div className="skills-page">
      <div className="skills-page-header">
        <h1 className="skills-page-title">Skills</h1>
        <p className="skills-page-subtitle">
          Upload and manage knowledge documents for your AI agents
        </p>
      </div>
      <div className="skills-page-content">
        <SkillManager />
      </div>
    </div>
  )
}
