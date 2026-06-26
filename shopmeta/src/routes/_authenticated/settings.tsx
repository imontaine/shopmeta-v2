// src/routes/_authenticated/settings.tsx
// Settings page — hosts the ClickHouse Connections management UI.
// Allows users to create, edit, delete, test, and set a default ClickHouse connection.

import { createFileRoute } from '@tanstack/react-router'
import { ConnectionsSettings } from '#/components/settings/ConnectionsSettings'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your workspace configuration</p>
      </div>

      <div className="settings-layout">
        {/* Tabs sidebar */}
        <nav className="settings-tabs" aria-label="Settings sections">
          <button className="settings-tab settings-tab--active" id="settings-tab-connections">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            ClickHouse Connections
          </button>
        </nav>

        {/* Tab content */}
        <div className="settings-content">
          <ConnectionsSettings />
        </div>
      </div>
    </div>
  )
}
