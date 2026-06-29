// tests/e2e/layout.spec.ts
// Playwright E2E tests for Unit 3: Layout + Theme
// Tests: responsive layout, hamburger menu, sidebar navigation, theme toggle

import { test, expect, type Page } from '@playwright/test'

// ─── Test helpers ─────────────────────────────────────────────────────────────

let uniqueCounter = 0
function uniqueEmail() {
  return `layout-e2e-${Date.now()}-${++uniqueCounter}@test.com`
}

const TEST_PASSWORD = 'Test1234!'

/**
 * Register a fresh user and land on /chat (authenticated).
 * Waits for full React hydration before returning.
 * Uses #app-layout[data-hydrated="true"] which is set in useEffect — this
 * guarantees all onClick handlers (hamburger, collapse, theme toggle) are attached.
 */
async function loginFreshUser(page: Page): Promise<string> {
  const email = uniqueEmail()
  await page.goto('/register')
  await expect(page.locator('.auth-page')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  await page.fill('[name=name]', 'Layout E2E User')
  await page.fill('[name=email]', email)
  await page.fill('[name=password]', TEST_PASSWORD)
  await page.fill('[name=confirm-password]', TEST_PASSWORD)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/chat/, { timeout: 15000 })
  // Wait for React to fully hydrate — data-hydrated="true" is set in useEffect
  await expect(page.locator('#app-layout')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  return email
}

/**
 * Locates a sidebar nav link by its exact label using the sidebar-nav-label span.
 */
function sidebarNavLink(page: Page, label: string) {
  return page.locator('.sidebar-nav-label', { hasText: label })
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

test.describe('Layout — Desktop (1440px)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('authenticated user sees sidebar on desktop', async ({ page }) => {
    await loginFreshUser(page)

    // Sidebar should be visible
    const sidebar = page.locator('#sidebar')
    await expect(sidebar).toBeVisible()
  })

  test('sidebar contains navigation links', async ({ page }) => {
    await loginFreshUser(page)

    // Use specific sidebar-nav-label spans to avoid ambiguity with page content
    await expect(sidebarNavLink(page, 'Chat')).toBeVisible()
    await expect(sidebarNavLink(page, 'Dashboard')).toBeVisible()
    await expect(sidebarNavLink(page, 'Agents')).toBeVisible()
    await expect(sidebarNavLink(page, 'Skills')).toBeVisible()
    await expect(sidebarNavLink(page, 'Settings')).toBeVisible()
  })

  test('hamburger menu is NOT visible on desktop', async ({ page }) => {
    await loginFreshUser(page)

    // Hamburger should be hidden at 1440px wide
    const hamburger = page.locator('#hamburger-btn')
    await expect(hamburger).toBeHidden()
  })

  test('sidebar can be collapsed via toggle button', async ({ page }) => {
    await loginFreshUser(page)

    // Wait for hydration via sidebar being interactable
    const collapseBtn = page.locator('#sidebar-collapse-btn')
    await expect(collapseBtn).toBeVisible({ timeout: 5000 })

    // Click collapse button
    await collapseBtn.click()

    // After collapse, sidebar should have the collapsed class
    const sidebar = page.locator('#sidebar')
    await expect(sidebar).toHaveClass(/sidebar--collapsed/, { timeout: 5000 })

    // Nav labels should be hidden (collapsed mode)
    await expect(sidebarNavLink(page, 'Chat')).toBeHidden()
  })

  test('clicking sidebar "Dashboard" navigates to /dashboard', async ({ page }) => {
    await loginFreshUser(page)

    await sidebarNavLink(page, 'Dashboard').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  })

  test('sidebar navigation active link updates when route changes', async ({ page }) => {
    await loginFreshUser(page)

    // Click Dashboard
    await sidebarNavLink(page, 'Dashboard').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // The Dashboard nav link should become active
    const dashLink = page.locator('.sidebar-nav-link--active')
    await expect(dashLink).toBeVisible()
    await expect(dashLink).toContainText('Dashboard')
  })

  test('theme toggle button is visible in sidebar footer', async ({ page }) => {
    await loginFreshUser(page)

    const themeBtn = page.locator('#theme-toggle')
    await expect(themeBtn).toBeVisible()
  })

  test('theme toggle switches dark/light class on <html>', async ({ page }) => {
    await loginFreshUser(page)

    // Evaluate initial html class
    const initialClass = await page.evaluate(() => document.documentElement.className)

    // Click theme toggle
    await page.locator('#theme-toggle').click()

    // After click, the class should have changed
    const newClass = await page.evaluate(() => document.documentElement.className)
    expect(newClass).not.toBe(initialClass)
  })
})

test.describe('Layout — Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('sidebar is hidden by default on mobile', async ({ page }) => {
    await loginFreshUser(page)

    // Sidebar should not be in mobile-open state
    const sidebar = page.locator('#sidebar')
    await expect(sidebar).not.toHaveClass(/sidebar--mobile-open/)
  })

  test('hamburger button is visible on mobile', async ({ page }) => {
    await loginFreshUser(page)

    const hamburger = page.locator('#hamburger-btn')
    await expect(hamburger).toBeVisible()
  })

  test('tapping hamburger opens the sidebar drawer', async ({ page }) => {
    await loginFreshUser(page)

    // Tap hamburger
    const hamburger = page.locator('#hamburger-btn')
    await hamburger.click()

    // Sidebar should now have the mobile-open class
    const sidebar = page.locator('#sidebar')
    await expect(sidebar).toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })
  })

  test('sidebar drawer shows nav links after opening', async ({ page }) => {
    await loginFreshUser(page)

    await page.locator('#hamburger-btn').click()
    await expect(page.locator('#sidebar')).toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })

    // Nav labels should now be visible (sidebar is open, not collapsed)
    await expect(sidebarNavLink(page, 'Chat')).toBeVisible()
    await expect(sidebarNavLink(page, 'Dashboard')).toBeVisible()
  })

  test('tapping the overlay closes the sidebar drawer', async ({ page }) => {
    await loginFreshUser(page)

    // Open sidebar
    await page.locator('#hamburger-btn').click()
    await expect(page.locator('#sidebar')).toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })

    // Click overlay to close
    const overlay = page.locator('#sidebar-overlay')
    await expect(overlay).toBeVisible()
    await overlay.click()

    // Sidebar should close
    await expect(page.locator('#sidebar')).not.toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })
  })

  test('clicking a nav link closes the mobile sidebar', async ({ page }) => {
    await loginFreshUser(page)

    await page.locator('#hamburger-btn').click()
    await expect(page.locator('#sidebar')).toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })

    // Click Dashboard link (use specific selector to avoid page content match)
    await sidebarNavLink(page, 'Dashboard').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Sidebar should have closed
    await expect(page.locator('#sidebar')).not.toHaveClass(/sidebar--mobile-open/, { timeout: 5000 })
  })

  test('main content is accessible on mobile (not obscured by sidebar)', async ({ page }) => {
    await loginFreshUser(page)

    // Main content area exists and is visible
    const main = page.locator('#main-content')
    await expect(main).toBeVisible()
  })
})

test.describe('Protected Route — Middleware', () => {
  test('unauthenticated user visiting /chat is redirected to /login', async ({ page }) => {
    await page.goto('/chat')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
