// tests/e2e/chat-features.spec.ts
// Playwright E2E tests for Sprint 1–3 chat features.
// Tests: edit & resubmit, copy on user messages, stop generation,
//        feedback (👍/👎), file upload UI, keyboard shortcuts.
//
// All tests mock the AI API at the network level via route interception.

import { test, expect, type Page } from '@playwright/test'

// ─── Test helpers ─────────────────────────────────────────────────────────────

let uniqueCounter = 0
function uniqueEmail() {
  return `e2e-features-${Date.now()}-${++uniqueCounter}@test.com`
}

const TEST_PASSWORD = 'Test1234!'

/**
 * Registers a new user and lands on /chat.
 * Waits for full React hydration before returning.
 */
async function registerAndGoToChat(page: Page) {
  const email = uniqueEmail()
  await page.goto('/register')
  await expect(page.locator('.auth-page')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  await page.fill('[name=name]', 'Features E2E User')
  await page.fill('[name=email]', email)
  await page.fill('[name=password]', TEST_PASSWORD)
  await page.fill('[name=confirm-password]', TEST_PASSWORD)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/chat/, { timeout: 15000 })
  await expect(page.locator('#app-layout')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  return email
}

/**
 * Intercepts /api/chat/stream with a mocked SSE response.
 * Optionally delay to simulate slow streaming (for stop-generation tests).
 */
async function mockChatStream(
  page: Page,
  responseText = 'Hello! This is a mock response.',
  options?: { delayMs?: number },
) {
  const words = responseText.split(' ')

  await page.route('**/api/chat/stream', async (route) => {
    if (options?.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    }

    const chunks = words.map((w, i) => {
      const token = i === 0 ? w : ` ${w}`
      return `data: ${JSON.stringify({ delta: token })}\n\n`
    })
    chunks.push('data: [DONE]\n\n')

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
      body: chunks.join(''),
    })
  })
}

/**
 * Type into the composer and submit.
 * Uses pressSequentially so React synthetic events fire properly.
 */
async function typeAndSend(page: Page, text: string) {
  await expect(page.locator('[data-testid="chat-layout"]')).toBeVisible({ timeout: 10000 })
  const input = page.locator('[data-testid="composer-input"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.click()
  await input.pressSequentially(text)
  await expect(page.locator('[data-testid="send-message-btn"]')).toBeEnabled({ timeout: 5000 })
  await page.locator('[data-testid="send-message-btn"]').click()
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

test.describe('Chat Features — Sprint 1', () => {
  test.describe('Edit & Resubmit', () => {
    test('edit button appears on user message hover', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await typeAndSend(page, 'Test message for editing')

      // Wait for user message to render
      const userMsg = page.locator('[data-testid="user-message"]').first()
      await expect(userMsg).toBeVisible({ timeout: 5000 })

      // Hover on the message group to reveal action buttons
      await userMsg.hover()

      // Edit button should become visible
      const editBtn = page.locator('[data-testid="edit-message-btn"]').first()
      await expect(editBtn).toBeVisible({ timeout: 5000 })
    })

    test('clicking edit shows inline edit composer', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await typeAndSend(page, 'Original message')

      // Wait for assistant response to complete
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })

      // Hover + click edit
      const userMsg = page.locator('[data-testid="user-message"]').first()
      await userMsg.hover()
      await page.locator('[data-testid="edit-message-btn"]').first().click()

      // Edit composer should appear
      await expect(page.locator('[data-testid="edit-composer"]')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-testid="edit-composer-input"]')).toBeVisible()
      await expect(page.locator('[data-testid="edit-save-btn"]')).toBeVisible()
      await expect(page.locator('[data-testid="edit-cancel-btn"]')).toBeVisible()
    })

    test('cancel edit returns to normal message display', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await typeAndSend(page, 'Message to cancel edit')
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })

      // Enter edit mode
      const userMsg = page.locator('[data-testid="user-message"]').first()
      await userMsg.hover()
      await page.locator('[data-testid="edit-message-btn"]').first().click()
      await expect(page.locator('[data-testid="edit-composer"]')).toBeVisible({ timeout: 5000 })

      // Cancel
      await page.locator('[data-testid="edit-cancel-btn"]').click()

      // Should return to normal message display
      await expect(page.locator('[data-testid="edit-composer"]')).not.toBeVisible({ timeout: 5000 })
      await expect(page.locator('[data-testid="user-message"]')).toBeVisible()
    })
  })

  test.describe('Copy on User Messages', () => {
    test('copy button appears on user message hover', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await typeAndSend(page, 'Message to copy')

      const userMsg = page.locator('[data-testid="user-message"]').first()
      await expect(userMsg).toBeVisible({ timeout: 5000 })
      await userMsg.hover()

      const copyBtn = page.locator('[data-testid="copy-user-message-btn"]').first()
      await expect(copyBtn).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Stop Generation', () => {
    test('stop button is visible in composer area', async ({ page }) => {
      await registerAndGoToChat(page)

      // Use a slow response so we can see the stop button
      await page.route('**/api/chat/stream', async (route) => {
        // Hold the connection open for a long time (simulating slow streaming)
        await new Promise((resolve) => setTimeout(resolve, 30000))
        await route.fulfill({ status: 200, body: 'data: [DONE]\n\n' })
      })

      // Type and send — this will start a long-running stream
      await typeAndSend(page, 'Tell me a long story')

      // Stop button should appear while streaming
      await expect(page.locator('[data-testid="stop-generation-btn"]')).toBeVisible({
        timeout: 5000,
      })
    })
  })
})

test.describe('Chat Features — Sprint 2', () => {
  test.describe('Feedback buttons', () => {
    test('thumbs up and thumbs down appear on assistant message hover', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page, 'Here is a helpful response for you.')

      await typeAndSend(page, 'Help me')

      // Wait for assistant message
      const assistantMsg = page.locator('[data-testid="assistant-message"]').first()
      await expect(assistantMsg).toBeVisible({ timeout: 15000 })

      // Hover to reveal action buttons
      await assistantMsg.hover()

      // Feedback buttons should be visible
      await expect(page.locator('[data-testid="feedback-positive-btn"]').first()).toBeVisible({
        timeout: 5000,
      })
      await expect(page.locator('[data-testid="feedback-negative-btn"]').first()).toBeVisible({
        timeout: 5000,
      })
    })

    test('copy and regenerate buttons still work on assistant messages', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page, 'Response with all action buttons.')

      await typeAndSend(page, 'Show me buttons')

      const assistantMsg = page.locator('[data-testid="assistant-message"]').first()
      await expect(assistantMsg).toBeVisible({ timeout: 15000 })
      await assistantMsg.hover()

      // Existing buttons should still be there alongside new feedback buttons
      await expect(page.locator('[data-testid="copy-message-btn"]').first()).toBeVisible({
        timeout: 5000,
      })
      await expect(page.locator('[data-testid="regenerate-btn"]').first()).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Keyboard shortcuts', () => {
    test('Ctrl+/ focuses the composer input', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Click somewhere else first to blur the input
      await page.locator('[data-testid="chat-layout"]').click()

      // Press Ctrl+/
      await page.keyboard.press('Control+/')

      // Composer input should be focused
      const input = page.locator('[data-testid="composer-input"]')
      await expect(input).toBeFocused({ timeout: 3000 })
    })
  })
})

test.describe('Chat Features — Sprint 3', () => {
  test.describe('File upload UI', () => {
    test('file upload button is visible in the composer', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await expect(page.locator('[data-testid="file-upload-btn"]')).toBeVisible({ timeout: 10000 })
    })

    test('file upload button triggers file input on click', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Listen for the file chooser event
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })
      await page.locator('[data-testid="file-upload-btn"]').click()
      const fileChooser = await fileChooserPromise

      // The file chooser should be open
      expect(fileChooser).toBeTruthy()
    })
  })
})

test.describe('Chat Features — Regression', () => {
  test('send button exists and can be used after all feature changes', async ({ page }) => {
    await registerAndGoToChat(page)
    await mockChatStream(page, 'Regression test response.')

    // The composer and send button should still work
    await typeAndSend(page, 'Regression test')

    // User message appears
    await expect(page.locator('[data-testid="user-message"]')).toBeVisible({ timeout: 5000 })

    // Assistant message appears
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })
  })

  test('model selector still works after feature additions', async ({ page }) => {
    await registerAndGoToChat(page)
    await mockChatStream(page)

    // Model selector should be visible
    await expect(page.locator('[data-testid="model-selector"]')).toBeVisible({ timeout: 10000 })

    // Should be clickable
    await page.locator('[data-testid="model-selector"]').click()
    await expect(page.locator('[data-testid="model-dropdown"]')).toBeVisible({ timeout: 5000 })
  })

  test('empty state still shows before first message', async ({ page }) => {
    await registerAndGoToChat(page)
    await mockChatStream(page)

    // Empty state should be visible
    await expect(page.locator('[data-testid="thread-empty"]')).toBeVisible({ timeout: 10000 })
  })

  test('multiple messages can be sent in sequence', async ({ page }) => {
    await registerAndGoToChat(page)
    await mockChatStream(page, 'First response from AI.')

    await typeAndSend(page, 'First question')
    await expect(page.locator('[data-testid="assistant-message"]').first()).toBeVisible({
      timeout: 15000,
    })

    // Re-mock for second response
    await mockChatStream(page, 'Second response from AI.')
    await typeAndSend(page, 'Second question')

    // Should have 2 user messages and 2 assistant messages
    await expect(page.locator('[data-testid="user-message"]')).toHaveCount(2, { timeout: 10000 })
    await expect(page.locator('[data-testid="assistant-message"]')).toHaveCount(2, {
      timeout: 15000,
    })
  })
})
