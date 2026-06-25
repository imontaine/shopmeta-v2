// tests/e2e/auth.spec.ts
// Playwright E2E tests for authentication flows

import { test, expect } from '@playwright/test'

// ─── Test helpers ────────────────────────────────────────────────────────────

let uniqueCounter = 0
function uniqueEmail() {
  return `e2e-${Date.now()}-${++uniqueCounter}@test.com`
}

const TEST_PASSWORD = 'Test1234!'

// ─── E2E Tests ────────────────────────────────────────────────────────────────

test.describe('Authentication E2E', () => {
  test.describe('Registration', () => {
    test('user can register and land on /chat', async ({ page }) => {
      const email = uniqueEmail()

      await page.goto('/register')
      await expect(page).toHaveTitle(/ShopMeta/)

      // Fill the registration form
      await page.fill('[name=name]', 'E2E Test User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)

      // Submit
      await page.click('button[type=submit]')

      // Should redirect to /chat
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })
    })

    test('shows error when passwords do not match', async ({ page }) => {
      await page.goto('/register')

      await page.fill('[name=name]', 'Test User')
      await page.fill('[name=email]', uniqueEmail())
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', 'DifferentPassword!')

      await page.click('button[type=submit]')

      // Should show error, not redirect
      await expect(page.locator('#register-error')).toBeVisible()
      await expect(page).not.toHaveURL(/\/chat/)
    })

    test('shows error for already-used email', async ({ page }) => {
      const email = uniqueEmail()

      // First registration
      await page.goto('/register')
      await page.fill('[name=name]', 'First User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

      // Logout
      await page.click('#logout-btn')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

      // Try to register again with same email
      await page.goto('/register')
      await page.fill('[name=name]', 'Second User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')

      await expect(page.locator('#register-error')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Login', () => {
    test('registered user can log in and land on /chat', async ({ page }) => {
      const email = uniqueEmail()

      // Register first
      await page.goto('/register')
      await page.fill('[name=name]', 'Login Test User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

      // Logout
      await page.click('#logout-btn')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

      // Log back in
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.click('#login-submit')

      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })
    })

    test('shows error with wrong password', async ({ page }) => {
      const email = uniqueEmail()

      // Register first
      await page.goto('/register')
      await page.fill('[name=name]', 'Bad Login User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

      // Logout
      await page.click('#logout-btn')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

      // Try wrong password
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', 'WrongPassword!')
      await page.click('#login-submit')

      await expect(page.locator('#login-error')).toBeVisible({ timeout: 5000 })
      await expect(page).not.toHaveURL(/\/chat/)
    })
  })

  test.describe('Logout', () => {
    test('logout redirects to /login and clears session', async ({ page }) => {
      const email = uniqueEmail()

      // Register + land on chat
      await page.goto('/register')
      await page.fill('[name=name]', 'Logout Test User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

      // Click logout
      await page.click('#logout-btn')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

      // Try to visit /chat — should redirect back to /login
      await page.goto('/chat')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })
  })

  test.describe('Protected routes', () => {
    test('unauthenticated user visiting /chat is redirected to /login', async ({ page }) => {
      // Navigate without any session
      await page.goto('/chat')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })

    test('unauthenticated user visiting / is redirected to /login', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
    })
  })

  test.describe('Password reset', () => {
    test('forgot password page shows success state after submission', async ({ page }) => {
      const email = uniqueEmail()

      // Register a user first so the email exists
      await page.goto('/register')
      await page.fill('[name=name]', 'Reset Test User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })
      await page.click('#logout-btn')
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

      // Go to forgot password
      await page.goto('/forgot-password')
      await page.fill('[name=email]', email)
      await page.click('#forgot-password-submit')

      // Should show success message
      await expect(page.locator('#reset-sent')).toBeVisible({ timeout: 5000 })
    })

    test('reset-password page without token shows invalid link', async ({ page }) => {
      await page.goto('/reset-password')
      // Should show "Invalid link" since no token param
      await expect(page.locator('h1')).toContainText(/invalid link/i)
    })
  })

  test.describe('Auth page redirects', () => {
    test('already-logged-in user visiting /login is redirected to /chat', async ({ page }) => {
      const email = uniqueEmail()

      // Register
      await page.goto('/register')
      await page.fill('[name=name]', 'Redirect Test User')
      await page.fill('[name=email]', email)
      await page.fill('[name=password]', TEST_PASSWORD)
      await page.fill('[name=confirm-password]', TEST_PASSWORD)
      await page.click('button[type=submit]')
      await expect(page).toHaveURL(/\/chat/, { timeout: 10000 })

      // Try to go to /login while logged in
      await page.goto('/login')
      await expect(page).toHaveURL(/\/chat/, { timeout: 5000 })
    })
  })
})
