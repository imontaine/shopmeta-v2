// src/routes/_authenticated/settings.tsx
// Settings page — account, organization, and billing preferences.
// Shell structure only; individual sections will be implemented incrementally.

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})

type SettingsTab = 'account' | 'organization' | 'billing'

function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage your account, organization, and billing preferences</p>
      </div>

      <div className="settings-layout">
        {/* Tabs sidebar */}
        <nav className="settings-tabs" aria-label="Settings sections">
          <button
            className={`settings-tab${activeTab === 'account' ? ' settings-tab--active' : ''}`}
            id="settings-tab-account"
            onClick={() => setActiveTab('account')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
            </svg>
            Account
          </button>
          <button
            className={`settings-tab${activeTab === 'organization' ? ' settings-tab--active' : ''}`}
            id="settings-tab-organization"
            onClick={() => setActiveTab('organization')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Organization
          </button>
          <button
            className={`settings-tab${activeTab === 'billing' ? ' settings-tab--active' : ''}`}
            id="settings-tab-billing"
            onClick={() => setActiveTab('billing')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Billing
          </button>
        </nav>

        {/* Tab content */}
        <div className="settings-content">
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'organization' && <OrganizationTab />}
          {activeTab === 'billing' && <BillingTab />}
        </div>
      </div>
    </div>
  )
}

// ── Placeholder tab panels ────────────────────────────────────────────────────

function AccountTab() {
  return (
    <div className="conn-settings">
      <div className="conn-settings-header">
        <h2 className="conn-settings-title">Account</h2>
        <p className="conn-settings-subtitle">Your personal profile and preferences</p>
      </div>
      <div className="settings-coming-soon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
        </svg>
        <p>Account settings coming soon</p>
        <span>Display name, avatar, email, and notification preferences</span>
      </div>
    </div>
  )
}

function OrganizationTab() {
  return (
    <div className="conn-settings">
      <div className="conn-settings-header">
        <h2 className="conn-settings-title">Organization</h2>
        <p className="conn-settings-subtitle">Manage your team and workspace</p>
      </div>
      <div className="settings-coming-soon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <p>Organization settings coming soon</p>
        <span>Org name, slug, members, roles, and permissions</span>
      </div>
    </div>
  )
}

function BillingTab() {
  return (
    <div className="conn-settings">
      <div className="conn-settings-header">
        <h2 className="conn-settings-title">Billing</h2>
        <p className="conn-settings-subtitle">Plan, usage, and invoices</p>
      </div>
      <div className="settings-coming-soon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
        <p>Billing settings coming soon</p>
        <span>Current plan, usage metrics, and invoice history</span>
      </div>
    </div>
  )
}
