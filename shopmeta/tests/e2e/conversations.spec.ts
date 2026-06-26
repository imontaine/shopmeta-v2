// tests/e2e/conversations.spec.ts
// E2E tests for conversation CRUD flow:
// - Create (New Chat button)
// - Rename (context menu → rename)
// - Appears in sidebar
// - Delete (context menu → delete)
// - Gone from sidebar

import { test, expect, type Page } from '@playwright/test'

// ─── Test helpers ────────────────────────────────────────────────────────────

let uniqueCounter = 0
function uniqueEmail() {
  return `conv-e2e-${Date.now()}-${++uniqueCounter}@test.com`
}

const TEST_PASSWORD = 'Test1234!'

/**
 * Registers a fresh user and lands on /chat.
 * Waits for React hydration so all onClick handlers are attached.
 */
async function registerAndLandOnChat(page: Page) {
  const email = uniqueEmail()
  await page.goto('/register')
  await page.fill('[name=name]', 'Conversation E2E User')
  await page.fill('[name=email]', email)
  await page.fill('[name=password]', TEST_PASSWORD)
  await page.fill('[name=confirm-password]', TEST_PASSWORD)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/chat/, { timeout: 15000 })
  // Wait for React to fully hydrate — data-hydrated="true" is set in useEffect
  await expect(page.locator('#app-layout')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  return { email }
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

test.describe('Conversation CRUD E2E', () => {
  test.describe('New Chat', () => {
    test('clicking New Chat creates a conversation and navigates to it', async ({ page }) => {
      await registerAndLandOnChat(page)

      // Click New Chat button
      await page.click('#new-chat-btn')

      // Should navigate to /chat?conversationId=...
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })

      // Conversation view should be visible
      await expect(page.locator('#conversation-view')).toBeVisible({ timeout: 5000 })
    })

    test('new chat appears in the conversation list', async ({ page }) => {
      await registerAndLandOnChat(page)

      // Click New Chat
      await page.click('#new-chat-btn')
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })

      // The conversation list should show at least one item
      const convList = page.locator('#conversation-list')
      await expect(convList).toBeVisible({ timeout: 5000 })

      const items = convList.locator('[data-conversation-id]')
      await expect(items).toHaveCount(1, { timeout: 5000 })
    })
  })

  test.describe('Create + Rename + Delete flow', () => {
    test('full flow: new chat → rename → appears in sidebar → delete → gone', async ({ page }) => {
      await registerAndLandOnChat(page)

      // ── Step 1: Create new conversation ──────────────────────────────────
      await page.click('#new-chat-btn')
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })

      // Wait for conversation to appear in the list
      const convList = page.locator('#conversation-list')
      await expect(convList).toBeVisible({ timeout: 5000 })

      const convItem = convList.locator('[data-conversation-id]').first()
      await expect(convItem).toBeVisible({ timeout: 10000 })

      // ── Step 2: Rename the conversation ──────────────────────────────────
      // Hover to reveal the menu button
      await convItem.hover()

      // Get the conversation ID from the data attribute for stable targeting
      const convId = await convItem.getAttribute('data-conversation-id')
      expect(convId).toBeTruthy()

      // Click the context menu (⋮) button
      const menuBtn = page.locator(`#conv-menu-${convId}`)
      await expect(menuBtn).toBeVisible({ timeout: 5000 })
      await menuBtn.click()

      // Click "Rename" in the dropdown
      const renameBtn = page.locator(`#conv-rename-btn-${convId}`)
      await expect(renameBtn).toBeVisible({ timeout: 5000 })
      await renameBtn.click()

      // Rename input should appear
      const renameInput = page.locator(`#conv-rename-${convId}`)
      await expect(renameInput).toBeVisible({ timeout: 5000 })

      // Clear and type new name
      await renameInput.fill('Revenue Analysis Chat')
      await renameInput.press('Enter')

      // ── Step 3: Verify new name appears in sidebar ────────────────────────
      // The conversation item should now show the new title.
      // Allow up to 10s for the remote DB renameMutation + invalidateQueries + refetch.
      await expect(convList.locator('[data-conversation-id]').first()).toContainText(
        'Revenue Analysis Chat',
        { timeout: 10000 },
      )

      // ── Step 4: Delete the conversation ──────────────────────────────────
      await convList.locator('[data-conversation-id]').first().hover()

      const menuBtnAfterRename = page.locator(`#conv-menu-${convId}`)
      await expect(menuBtnAfterRename).toBeVisible({ timeout: 5000 })
      await menuBtnAfterRename.click()

      const deleteBtn = page.locator(`#conv-delete-btn-${convId}`)
      await expect(deleteBtn).toBeVisible({ timeout: 5000 })
      await deleteBtn.click()

      // ── Step 5: Verify conversation is gone ──────────────────────────────
      // After delete, the conversation should no longer appear in the list
      await expect(page.locator(`[data-conversation-id="${convId}"]`)).not.toBeVisible({
        timeout: 5000,
      })

      // The conversation list should be empty (since this was the only one)
      const remainingItems = convList.locator('[data-conversation-id]')
      await expect(remainingItems).toHaveCount(0, { timeout: 5000 })
    })
  })

  test.describe('Multiple conversations', () => {
    test('creates multiple conversations and all appear in sidebar', async ({ page }) => {
      await registerAndLandOnChat(page)

      const convList = page.locator('#conversation-list')
      const newChatBtn = page.locator('#new-chat-btn')

      // Create 3 conversations — wait for button re-enable between clicks.
      // The button has disabled={createMutation.isPending}; clicking while
      // disabled is silently ignored, resulting in fewer conversations.
      await newChatBtn.click()
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })
      await expect(newChatBtn).toBeEnabled({ timeout: 5000 })

      await newChatBtn.click()
      await expect(convList.locator('[data-conversation-id]')).toHaveCount(2, { timeout: 10000 })
      await expect(newChatBtn).toBeEnabled({ timeout: 5000 })

      await newChatBtn.click()
      await expect(convList.locator('[data-conversation-id]')).toHaveCount(3, { timeout: 10000 })
    })

    test('clicking a conversation in sidebar navigates to it', async ({ page }) => {
      await registerAndLandOnChat(page)

      const newChatBtn = page.locator('#new-chat-btn')

      // Create two conversations, waiting for button re-enable between clicks.
      await newChatBtn.click()
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })
      const firstUrl = page.url()
      const firstId = new URL(firstUrl).searchParams.get('conversationId')
      await expect(newChatBtn).toBeEnabled({ timeout: 5000 })

      await newChatBtn.click()
      // Wait for URL to change to a *different* conversationId.
      await page.waitForURL(
        (url) => {
          const id = url.searchParams.get('conversationId')
          return id !== null && id !== firstId
        },
        { timeout: 10000 },
      )
      const secondUrl = page.url()

      // The URLs should be different (different conversation IDs)
      expect(firstUrl).not.toBe(secondUrl)

      // Click the first conversation in the sidebar (the second one created appears at top since ordered by updatedAt)
      const convList = page.locator('#conversation-list')
      const items = convList.locator('[data-conversation-id]')
      
      // Get ID of the bottom item (older)
      const olderConvId = await items.last().getAttribute('data-conversation-id')
      await items.last().locator('.conv-item-btn').click()

      // Should navigate to that conversation
      await expect(page).toHaveURL(new RegExp(`conversationId=${olderConvId}`), {
        timeout: 5000,
      })
    })
  })

  test.describe('Search', () => {
    test('searching filters conversation list', async ({ page }) => {
      await registerAndLandOnChat(page)

      // Create first conversation and rename it
      await page.click('#new-chat-btn')
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })

      const convList = page.locator('#conversation-list')
      const firstItem = convList.locator('[data-conversation-id]').first()
      await firstItem.hover()

      const firstId = await firstItem.getAttribute('data-conversation-id')
      await page.locator(`#conv-menu-${firstId}`).click()
      await page.locator(`#conv-rename-btn-${firstId}`).click()
      await page.locator(`#conv-rename-${firstId}`).fill('Revenue Report Q4')
      await page.locator(`#conv-rename-${firstId}`).press('Enter')

      // Create second conversation
      await page.click('#new-chat-btn')
      await expect(convList.locator('[data-conversation-id]')).toHaveCount(2, { timeout: 5000 })

      const secondItem = convList.locator('[data-conversation-id]').first()
      await secondItem.hover()
      const secondId = await secondItem.getAttribute('data-conversation-id')
      await page.locator(`#conv-menu-${secondId}`).click()
      await page.locator(`#conv-rename-btn-${secondId}`).click()
      await page.locator(`#conv-rename-${secondId}`).fill('Customer Churn Analysis')
      await page.locator(`#conv-rename-${secondId}`).press('Enter')

      // Search for "revenue"
      await page.fill('#conv-search-input', 'revenue')

      // Should show only the Revenue conv (search is debounced via state — wait a moment)
      await expect(
        convList.locator('[data-conversation-id]').filter({ hasText: 'Revenue Report Q4' }),
      ).toBeVisible({ timeout: 5000 })

      await expect(
        convList.locator('[data-conversation-id]').filter({ hasText: 'Customer Churn Analysis' }),
      ).not.toBeVisible({ timeout: 3000 })
    })
  })

  test.describe('Sidebar persistence', () => {
    test('conversation list persists after page navigation', async ({ page }) => {
      await registerAndLandOnChat(page)

      // Create a conversation
      await page.click('#new-chat-btn')
      await expect(page).toHaveURL(/\/chat\?conversationId=/, { timeout: 10000 })

      const convId = page.url().split('conversationId=')[1]!.split('&')[0]
      expect(convId).toBeTruthy()

      // Navigate to /chat (no conversation selected)
      await page.goto('/chat')
      await expect(page).toHaveURL(/\/chat$/, { timeout: 5000 })

      // Conversation should still be in the sidebar
      const convList = page.locator('#conversation-list')
      await expect(convList).toBeVisible({ timeout: 5000 })
      await expect(convList.locator(`[data-conversation-id="${convId}"]`)).toBeVisible({
        timeout: 5000,
      })
    })
  })
})
