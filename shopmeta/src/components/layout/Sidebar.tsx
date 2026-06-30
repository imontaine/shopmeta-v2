// src/components/layout/Sidebar.tsx
// Collapsible navigation sidebar for ShopMeta.
// - Renders navigation links with active state highlighting.
// - Can be collapsed to icon-only mode (desktop) or hidden (mobile).
// - Exposes a hamburger toggle for mobile via onMobileToggle.
// - Shows conversation list below navigation.
// - id="logout-btn" on the sign-out link is required by E2E tests.

import { Link, useLocation } from '@tanstack/react-router'
import { ThemeToggle } from './ThemeToggle'
import { ConversationList } from './ConversationList'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/chat',
    label: 'Chat',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    to: '/agents',
    label: 'Agents',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
      </svg>
    ),
  },
  {
    to: '/skills',
    label: 'Skills',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    to: '/mcp-servers',
    label: 'MCP Servers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

interface SidebarProps {
  /** Whether the sidebar is collapsed to icon-only (desktop) */
  collapsed: boolean
  /** Whether the sidebar is visible in mobile mode */
  mobileOpen: boolean
  /** Toggle desktop collapse */
  onToggle: () => void
  /** Close mobile sidebar */
  onMobileClose: () => void
}

export function Sidebar({ collapsed, mobileOpen, onToggle, onMobileClose }: SidebarProps) {
  const location = useLocation()

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          id="sidebar-overlay"
          className="sidebar-overlay"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        id="sidebar"
        className={[
          'sidebar',
          collapsed ? 'sidebar--collapsed' : '',
          mobileOpen ? 'sidebar--mobile-open' : '',
        ].filter(Boolean).join(' ')}
        aria-label="Main navigation"
      >
        {/* Branding */}
        <div className="sidebar-brand">
          {!collapsed && (
            <span className="sidebar-brand-name">ShopMeta</span>
          )}
          {/* Desktop collapse toggle */}
          <button
            id="sidebar-collapse-btn"
            className="sidebar-collapse-btn"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <ul className="sidebar-nav-list" role="list">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname.startsWith(item.to)
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={['sidebar-nav-link', isActive ? 'sidebar-nav-link--active' : ''].filter(Boolean).join(' ')}
                    onClick={onMobileClose}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="sidebar-nav-icon">{item.icon}</span>
                    {!collapsed && (
                      <span className="sidebar-nav-label">{item.label}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Conversation list — shows recent chats below main nav */}
        <div className="sidebar-conversations" aria-label="Recent conversations">
          {!collapsed && (
            <p className="sidebar-section-label">Conversations</p>
          )}
          <ConversationList
            collapsed={collapsed}
            onMobileClose={onMobileClose}
          />
        </div>

        {/* Footer: theme toggle + logout + version */}
        <div className="sidebar-footer">
          <ThemeToggle />
          {/*
            Sign-out link. id="logout-btn" is required by E2E tests to:
            1. Confirm the user is authenticated (button visible = logged in)
            2. Trigger logout and verify redirect to /login
            Uses a plain <a> so it works before React hydrates.
          */}
          <a
            href="/sign-out"
            id="logout-btn"
            className="sidebar-logout-btn"
            aria-label="Sign out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!collapsed && <span>Sign out</span>}
          </a>
          {!collapsed && (
            <span
              className="sidebar-version"
              title={`ShopMeta v${__APP_VERSION__}`}
            >
              v{__APP_VERSION__}
            </span>
          )}
        </div>
      </aside>
    </>
  )
}
