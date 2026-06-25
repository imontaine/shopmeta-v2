// src/components/layout/AppLayout.tsx
// Root authenticated app layout: sidebar + main content area.
// Manages sidebar collapse state (desktop) and open/close (mobile).
// Includes hamburger button visible at mobile widths.

import { useState, useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  // Desktop: sidebar collapsed to icon-only
  const [collapsed, setCollapsed] = useState(false)
  // Mobile: sidebar drawer open
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar when window resizes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="app-layout">
      {/* Hamburger button — only visible on mobile (≤768px) */}
      <button
        id="hamburger-btn"
        className="hamburger-btn"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        aria-controls="sidebar"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((c) => !c)}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <main
        id="main-content"
        className={['app-main', collapsed ? 'app-main--expanded' : ''].filter(Boolean).join(' ')}
        aria-label="Main content"
      >
        <Outlet />
      </main>
    </div>
  )
}
