// src/routes/_authenticated/data-sources.tsx
// Data Sources page — hosts the ClickHouse Connections management UI.
// Allows users to create, edit, delete, test, and set a default ClickHouse connection.
// As new connectors are added (Postgres, MySQL, MongoDB, etc.) they appear as additional tabs here.

import { createFileRoute } from '@tanstack/react-router'
import { ConnectionsSettings } from '#/components/settings/ConnectionsSettings'

export const Route = createFileRoute('/_authenticated/data-sources')({
  component: DataSourcesPage,
})

function DataSourcesPage() {
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Data Sources</h1>
        <p className="settings-subtitle">Manage database connections that power your dashboards</p>
      </div>

      <div className="settings-layout">
        {/* Tabs sidebar */}
        <nav className="settings-tabs" aria-label="Data source types">
          <button className="settings-tab settings-tab--active" id="data-sources-tab-clickhouse">
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
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            ClickHouse
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
