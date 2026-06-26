# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: layout.spec.ts >> Layout — Mobile (375px) >> hamburger button is visible on mobile
- Location: tests\e2e\layout.spec.ts:145:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/chat/
Received string:  "https://app.shopmeta.app/register"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    33 × unexpected value "https://app.shopmeta.app/register"

```

```yaml
- img
- heading "ShopMeta" [level=1]
- paragraph: Create your account
- alert:
  - img
  - text: Too many requests. Please try again later.
- text: Full name
- textbox "Full name":
  - /placeholder: Jane Smith
  - text: Layout E2E User
- text: Email address
- textbox "Email address":
  - /placeholder: you@example.com
  - text: layout-e2e-1782459697924-10@test.com
- text: Password
- textbox "Password":
  - /placeholder: At least 8 characters
  - text: Test1234!
- text: Confirm password
- textbox "Confirm password":
  - /placeholder: Repeat your password
  - text: Test1234!
- button "Create account"
- paragraph:
  - text: Already have an account?
  - link "Sign in":
    - /url: /login
```

# Test source

```ts
  1   | // tests/e2e/layout.spec.ts
  2   | // Playwright E2E tests for Unit 3: Layout + Theme
  3   | // Tests: responsive layout, hamburger menu, sidebar navigation, theme toggle
  4   | 
  5   | import { test, expect, type Page } from '@playwright/test'
  6   | 
  7   | // ─── Test helpers ─────────────────────────────────────────────────────────────
  8   | 
  9   | let uniqueCounter = 0
  10  | function uniqueEmail() {
  11  |   return `layout-e2e-${Date.now()}-${++uniqueCounter}@test.com`
  12  | }
  13  | 
  14  | const TEST_PASSWORD = 'Test1234!'
  15  | 
  16  | /**
  17  |  * Register a fresh user and land on /chat (authenticated).
  18  |  * Waits for full React hydration before returning.
  19  |  * Uses #app-layout[data-hydrated="true"] which is set in useEffect — this
  20  |  * guarantees all onClick handlers (hamburger, collapse, theme toggle) are attached.
  21  |  */
  22  | async function loginFreshUser(page: Page): Promise<string> {
  23  |   const email = uniqueEmail()
  24  |   await page.goto('/register')
  25  |   await page.fill('[name=name]', 'Layout E2E User')
  26  |   await page.fill('[name=email]', email)
  27  |   await page.fill('[name=password]', TEST_PASSWORD)
  28  |   await page.fill('[name=confirm-password]', TEST_PASSWORD)
  29  |   await page.click('button[type=submit]')
> 30  |   await expect(page).toHaveURL(/\/chat/, { timeout: 15000 })
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  31  |   // Wait for React to fully hydrate — data-hydrated="true" is set in useEffect
  32  |   await expect(page.locator('#app-layout')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  33  |   return email
  34  | }
  35  | 
  36  | /**
  37  |  * Locates a sidebar nav link by its exact label using the sidebar-nav-label span.
  38  |  */
  39  | function sidebarNavLink(page: Page, label: string) {
  40  |   return page.locator('.sidebar-nav-label', { hasText: label })
  41  | }
  42  | 
  43  | // ─── E2E Tests ────────────────────────────────────────────────────────────────
  44  | 
  45  | test.describe('Layout — Desktop (1440px)', () => {
  46  |   test.use({ viewport: { width: 1440, height: 900 } })
  47  | 
  48  |   test('authenticated user sees sidebar on desktop', async ({ page }) => {
  49  |     await loginFreshUser(page)
  50  | 
  51  |     // Sidebar should be visible
  52  |     const sidebar = page.locator('#sidebar')
  53  |     await expect(sidebar).toBeVisible()
  54  |   })
  55  | 
  56  |   test('sidebar contains navigation links', async ({ page }) => {
  57  |     await loginFreshUser(page)
  58  | 
  59  |     // Use specific sidebar-nav-label spans to avoid ambiguity with page content
  60  |     await expect(sidebarNavLink(page, 'Chat')).toBeVisible()
  61  |     await expect(sidebarNavLink(page, 'Dashboard')).toBeVisible()
  62  |     await expect(sidebarNavLink(page, 'Agents')).toBeVisible()
  63  |     await expect(sidebarNavLink(page, 'Settings')).toBeVisible()
  64  |   })
  65  | 
  66  |   test('hamburger menu is NOT visible on desktop', async ({ page }) => {
  67  |     await loginFreshUser(page)
  68  | 
  69  |     // Hamburger should be hidden at 1440px wide
  70  |     const hamburger = page.locator('#hamburger-btn')
  71  |     await expect(hamburger).toBeHidden()
  72  |   })
  73  | 
  74  |   test('sidebar can be collapsed via toggle button', async ({ page }) => {
  75  |     await loginFreshUser(page)
  76  | 
  77  |     // Wait for hydration via sidebar being interactable
  78  |     const collapseBtn = page.locator('#sidebar-collapse-btn')
  79  |     await expect(collapseBtn).toBeVisible({ timeout: 5000 })
  80  | 
  81  |     // Click collapse button
  82  |     await collapseBtn.click()
  83  | 
  84  |     // After collapse, sidebar should have the collapsed class
  85  |     const sidebar = page.locator('#sidebar')
  86  |     await expect(sidebar).toHaveClass(/sidebar--collapsed/, { timeout: 5000 })
  87  | 
  88  |     // Nav labels should be hidden (collapsed mode)
  89  |     await expect(sidebarNavLink(page, 'Chat')).toBeHidden()
  90  |   })
  91  | 
  92  |   test('clicking sidebar "Dashboard" navigates to /dashboard', async ({ page }) => {
  93  |     await loginFreshUser(page)
  94  | 
  95  |     await sidebarNavLink(page, 'Dashboard').click()
  96  |     await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  97  |   })
  98  | 
  99  |   test('sidebar navigation active link updates when route changes', async ({ page }) => {
  100 |     await loginFreshUser(page)
  101 | 
  102 |     // Click Dashboard
  103 |     await sidebarNavLink(page, 'Dashboard').click()
  104 |     await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
  105 | 
  106 |     // The Dashboard nav link should become active
  107 |     const dashLink = page.locator('.sidebar-nav-link--active')
  108 |     await expect(dashLink).toBeVisible()
  109 |     await expect(dashLink).toContainText('Dashboard')
  110 |   })
  111 | 
  112 |   test('theme toggle button is visible in sidebar footer', async ({ page }) => {
  113 |     await loginFreshUser(page)
  114 | 
  115 |     const themeBtn = page.locator('#theme-toggle')
  116 |     await expect(themeBtn).toBeVisible()
  117 |   })
  118 | 
  119 |   test('theme toggle switches dark/light class on <html>', async ({ page }) => {
  120 |     await loginFreshUser(page)
  121 | 
  122 |     // Evaluate initial html class
  123 |     const initialClass = await page.evaluate(() => document.documentElement.className)
  124 | 
  125 |     // Click theme toggle
  126 |     await page.locator('#theme-toggle').click()
  127 | 
  128 |     // After click, the class should have changed
  129 |     const newClass = await page.evaluate(() => document.documentElement.className)
  130 |     expect(newClass).not.toBe(initialClass)
```