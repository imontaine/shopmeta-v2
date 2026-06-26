// tests/component/chat/thread.test.tsx
// Component tests for the Thread message display component.
// Tests: user/assistant message rendering, empty state.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ─── Mock assistant-ui primitives ─────────────────────────────────────────────

vi.mock('@assistant-ui/react', async () => {
  const React = await import('react')

  interface Message {
    role: 'user' | 'assistant'
    content: string
  }

  let mockMessages: Message[] = []

  return {
    __setMessages: (msgs: Message[]) => { mockMessages = msgs },
    ThreadPrimitive: {
      Root: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
        React.createElement('div', { 'data-testid': 'thread', ...props }, children),
      Messages: ({ components }: { components: { UserMessage: React.FC; AssistantMessage: React.FC } }) =>
        React.createElement(
          React.Fragment,
          null,
          mockMessages.map((msg, i) =>
            msg.role === 'user'
              ? React.createElement(components.UserMessage, { key: i })
              : React.createElement(components.AssistantMessage, { key: i }),
          ),
        ),
      Empty: ({ children }: { children: React.ReactNode }) =>
        mockMessages.length === 0 ? React.createElement(React.Fragment, null, children) : null,
    },
    MessagePrimitive: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Content: ({ components }: { components?: { Text?: React.FC<{ text: string }> } }) => {
        const currentMsg = mockMessages[0]
        if (components?.Text && currentMsg) {
          return React.createElement(components.Text, { text: currentMsg.content })
        }
        return React.createElement('span', null, currentMsg?.content ?? '')
      },
      InProgress: ({ children }: { children: React.ReactNode }) =>
        React.createElement('span', { 'data-testid': 'in-progress' }, children),
      // If — renders children unconditionally in test context
      If: ({ children }: { children: React.ReactNode; last?: boolean }) =>
        React.createElement(React.Fragment, null, children),
      // Last — renders children only when this is the last message in the thread
      Last: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    },
    // ActionBarPrimitive — used by the Regenerate button
    ActionBarPrimitive: {
      Root: ({ children }: { children: React.ReactNode; hideWhenRunning?: boolean; autohide?: string }) =>
        React.createElement(React.Fragment, null, children),
      Reload: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
        React.createElement(React.Fragment, null, children),
    },
    useThreadRuntime: () => ({
      subscribe: (_cb: () => void) => {
        return () => {}
      },
    }),
  }
})


// Mock MarkdownRenderer
vi.mock('#/components/chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Send: () => <span>→</span>,
  Square: () => <span>■</span>,
  Plus: () => <span>+</span>,
  MessageSquare: () => <span data-testid="message-square-icon">msg</span>,
  MessageSquarePlus: ({ size, style }: { size?: number; style?: React.CSSProperties }) => (
    <span data-testid="empty-state-icon" style={style}>msg+</span>
  ),
  RefreshCw: () => <span>↺</span>,
  Sparkles: ({ size }: { size?: number }) => <span data-testid="sparkles-icon">✦</span>,
}))


const { Thread } = await import('#/components/chat/Thread')

// Helper to set mock messages (uses the module's internal state)
async function setMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const mod = await import('@assistant-ui/react') as { __setMessages?: (msgs: Array<{ role: 'user' | 'assistant'; content: string }>) => void }
  if (mod.__setMessages) mod.__setMessages(messages)
}

describe('Thread component', () => {
  beforeEach(async () => {
    await setMessages([])
  })

  test('renders thread container', () => {
    render(<Thread />)
    expect(screen.getByTestId('thread')).toBeInTheDocument()
  })

  test('shows empty state when no messages', async () => {
    await setMessages([])
    render(<Thread />)
    expect(screen.getByTestId('thread-empty')).toBeInTheDocument()
  })

  test('renders user message bubble', async () => {
    await setMessages([{ role: 'user', content: 'Hello!' }])
    render(<Thread />)
    expect(screen.getByTestId('user-message')).toBeInTheDocument()
  })

  test('renders assistant message bubble', async () => {
    await setMessages([{ role: 'assistant', content: 'Hello back!' }])
    render(<Thread />)
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument()
  })

  test('renders multiple messages in sequence', async () => {
    await setMessages([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ])
    render(<Thread />)
    expect(screen.getByTestId('user-message')).toBeInTheDocument()
    expect(screen.getByTestId('assistant-message')).toBeInTheDocument()
  })

  test('assistant message uses MarkdownRenderer', async () => {
    await setMessages([{ role: 'assistant', content: '**Bold** text' }])
    render(<Thread />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
  })

  test('does not show empty state when messages exist', async () => {
    await setMessages([{ role: 'user', content: 'Test' }])
    render(<Thread />)
    expect(screen.queryByTestId('thread-empty')).not.toBeInTheDocument()
  })
})
