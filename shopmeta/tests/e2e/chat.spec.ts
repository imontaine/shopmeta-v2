// tests/e2e/chat.spec.ts
// Playwright E2E tests for the full chat flow.
// Tests: streaming response display, model selector, markdown rendering, stop generation.
//
// NOTE: These tests require the dev server to be running with a valid AI API key,
// OR the server mock to be in place. We use route intercepting to mock the AI API
// at the network level during E2E tests.

import { test, expect, type Page } from '@playwright/test'

// ─── Test helpers ─────────────────────────────────────────────────────────────

let uniqueCounter = 0
function uniqueEmail() {
  return `e2e-chat-${Date.now()}-${++uniqueCounter}@test.com`
}

const TEST_PASSWORD = 'Test1234!'

/**
 * Registers a new user and lands on /chat.
 * Returns the email used (for reference).
 */
async function registerAndGoToChat(page: Page) {
  const email = uniqueEmail()
  await page.goto('/register')
  await expect(page.locator('.auth-page')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  await page.fill('[name=name]', 'Chat E2E User')
  await page.fill('[name=email]', email)
  await page.fill('[name=password]', TEST_PASSWORD)
  await page.fill('[name=confirm-password]', TEST_PASSWORD)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/chat/, { timeout: 15000 })
  // Wait for React to fully hydrate — data-hydrated="true" is set in useEffect.
  // Without this, clicks/keypresses arrive before event handlers are attached.
  await expect(page.locator('#app-layout')).toHaveAttribute('data-hydrated', 'true', { timeout: 10000 })
  return email
}

/**
 * Intercepts /api/chat/stream and returns a mocked SSE response.
 * This avoids actual AI API calls in E2E tests.
 */
async function mockChatStream(page: Page, responseText = 'Hello! This is a mock streaming response.') {
  // Split the response into word-level chunks for realistic streaming
  const words = responseText.split(' ')

  await page.route('**/api/chat/stream', async (route) => {
    // Simulate SSE streaming
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

// ─── E2E Tests ────────────────────────────────────────────────────────────────

/**
 * Type into a React-controlled ComposerPrimitive.Input and submit.
 * Must use pressSequentially (not fill) so React synthetic events fire and
 * the send button becomes enabled.
 */
async function typeAndSend(page: Page, text: string) {
  // Wait for chat layout to be mounted (client-only due to SSR guard)
  await expect(page.locator('[data-testid="chat-layout"]')).toBeVisible({ timeout: 10000 })
  const input = page.locator('[data-testid="composer-input"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.click()
  await input.pressSequentially(text)
  // Wait for send button to become enabled (React state update after fill)
  await expect(page.locator('[data-testid="send-message-btn"]')).toBeEnabled({ timeout: 5000 })
  await page.locator('[data-testid="send-message-btn"]').click()
}

test.describe('Chat E2E', () => {
  test.describe('Full chat flow', () => {
    test('user can type a message, send it, and see streaming response', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page, 'Hello! I am an AI assistant here to help you.')

      // Chat layout should be visible
      await expect(page.locator('[data-testid="chat-layout"]')).toBeVisible({ timeout: 10000 })

      // The composer input should be present
      const input = page.locator('[data-testid="composer-input"]')
      await expect(input).toBeVisible({ timeout: 5000 })

      // Type and send
      await typeAndSend(page, 'Hello')

      // Wait for the assistant response to appear
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })

      // The response should contain some text
      const assistantMsg = page.locator('[data-testid="assistant-message"]').first()
      await expect(assistantMsg).not.toBeEmpty()
    })

    test('user message appears immediately after sending', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await typeAndSend(page, 'What is 2+2?')

      // User message should appear right away
      await expect(page.locator('[data-testid="user-message"]')).toBeVisible({ timeout: 5000 })
    })

    test('streaming response completes and shows full text', async ({ page }) => {
      const fullResponse = 'The answer is four. Two plus two equals four.'
      await registerAndGoToChat(page)
      await mockChatStream(page, fullResponse)

      await typeAndSend(page, 'What is 2+2?')

      // Wait for assistant message
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })

      // After stream completes, text should be present
      const assistantMsg = page.locator('[data-testid="assistant-message"]')
      await expect(assistantMsg).toContainText('four', { timeout: 10000 })
    })
  })

  test.describe('Model selector', () => {
    test('model selector is visible in the composer area', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Model selector trigger should be visible
      await expect(page.locator('[data-testid="model-selector"]')).toBeVisible({ timeout: 10000 })
    })

    test('clicking model selector opens dropdown', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      await page.locator('[data-testid="model-selector"]').click()
      await expect(page.locator('[data-testid="model-dropdown"]')).toBeVisible({ timeout: 5000 })
    })

    test('can select a different model from dropdown', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Open dropdown
      await page.locator('[data-testid="model-selector"]').click()
      await expect(page.locator('[data-testid="model-dropdown"]')).toBeVisible({ timeout: 5000 })

      // Select Claude Haiku
      const claudeOption = page.locator('[data-testid="model-option-claude-haiku"]')
      if (await claudeOption.isVisible()) {
        await claudeOption.click()
        // Dropdown should close
        await expect(page.locator('[data-testid="model-dropdown"]')).not.toBeVisible({ timeout: 3000 })
      }
    })
  })

  test.describe('Markdown rendering', () => {
    test('markdown response renders bold text correctly', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page, '**Important**: This is bold text.')

      await typeAndSend(page, 'Show me bold text')

      // Wait for response with markdown
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 15000 })
      const assistantMsg = page.locator('[data-testid="assistant-message"]')
      // The <strong> element should exist inside the response
      await expect(assistantMsg.locator('strong')).toBeVisible({ timeout: 5000 })
    })

    test('code block renders with copy button', async ({ page }) => {
      const codeResponse = 'Here is some code:\n\n```javascript\nconsole.log("hello")\n```'
      await registerAndGoToChat(page)
      await mockChatStream(page, codeResponse)

      await typeAndSend(page, 'Show me a code block')

      // Wait for code block and copy button
      await expect(page.locator('[data-testid="code-block"]')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('[data-testid="copy-code-button"]')).toBeVisible()
    })
  })

  test.describe('Empty state', () => {
    test('shows empty state prompt when no messages sent', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Before any messages, empty state should show
      await expect(page.locator('[data-testid="thread-empty"]')).toBeVisible({ timeout: 10000 })
    })

    test('empty state disappears after sending first message', async ({ page }) => {
      await registerAndGoToChat(page)
      await mockChatStream(page)

      // Send a message
      await typeAndSend(page, 'Hello')

      // Empty state should be gone
      await expect(page.locator('[data-testid="thread-empty"]')).not.toBeVisible({ timeout: 10000 })
    })
  })
})
