// tests/component/chat/composer.test.tsx
// Component tests for the Composer chat input component.
// Tests: send on Enter, stop button visibility, input behavior.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock assistant-ui primitives ─────────────────────────────────────────────
// Since assistant-ui requires a runtime context, we mock the primitives
// to isolate the Composer component behavior.

let mockIsRunning = false
const mockSend = vi.fn()
const mockInputValue = { current: '' }

vi.mock('@assistant-ui/react', async () => {
  const React = await import('react')
  return {
    ComposerPrimitive: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement('div', { 'data-testid': 'composer-root' }, children),
      Input: React.forwardRef(
        ({ placeholder, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>, ref) =>
          React.createElement('textarea', {
            role: 'textbox',
            'data-testid': 'composer-input',
            placeholder,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
              mockInputValue.current = e.target.value
            },
            ...props,
            ref,
          }),
      ),
      Send: ({ _asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
        React.createElement(
          'div',
          {
            onClick: () => {
              if (mockInputValue.current) {
                mockSend({ content: mockInputValue.current })
              }
            },
          },
          children,
        ),
      Cancel: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    },
    ThreadPrimitive: {
      If: ({ running, children }: { running?: boolean; children: React.ReactNode }) =>
        running === mockIsRunning ? React.createElement(React.Fragment, null, children) : null,
    },
    useComposerRuntime: () => ({
      send: mockSend,
      setText: vi.fn(),
      value: mockInputValue.current,
    }),
  }
})

// Mock ModelSelector since it imports providers
vi.mock('#/components/chat/ModelSelector', () => ({
  ModelSelector: ({ currentModel }: { currentModel: string; currentProvider: string; onModelChange: () => void }) => (
    <div data-testid="model-selector-mock">{currentModel}</div>
  ),
}))

// Mock providers
vi.mock('#/lib/ai/providers', () => ({
  DEFAULT_MODEL: 'gpt-4o',
  DEFAULT_PROVIDER: 'openai',
  modelList: [
    { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  ],
}))

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Send: () => <span data-testid="send-icon">→</span>,
  Square: () => <span data-testid="stop-icon">■</span>,
  Plus: () => <span>+</span>,
  MessageSquare: () => <span>💬</span>,
}))

const { Composer } = await import('#/components/chat/Composer')

describe('Composer component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRunning = false
    mockInputValue.current = ''
  })

  test('renders the input textarea', () => {
    render(<Composer />)
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
  })

  test('renders with correct placeholder', () => {
    render(<Composer placeholder="Type your message here…" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', 'Type your message here…')
  })

  test('send button is visible when not streaming', () => {
    mockIsRunning = false
    render(<Composer />)
    const sendBtn = screen.getByTestId('send-message-btn')
    expect(sendBtn).toBeInTheDocument()
  })

  test('stop button is visible during streaming', () => {
    mockIsRunning = true
    render(<Composer />)
    const stopBtn = screen.getByTestId('stop-generation-btn')
    expect(stopBtn).toBeInTheDocument()
  })

  test('stop button is not visible when not streaming', () => {
    mockIsRunning = false
    render(<Composer />)
    expect(screen.queryByTestId('stop-generation-btn')).not.toBeInTheDocument()
  })

  test('calls onSend when send button is clicked', async () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'Hello AI')

    // Click the send button
    const sendBtn = screen.getByTestId('send-message-btn')
    await userEvent.click(sendBtn)

    // When onSend prop is provided, the component calls onSend({ content })
    // directly instead of composerRuntime.send()
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello AI' }),
    )
  })

  test('model selector shows current model when onModelChange provided', () => {
    render(
      <Composer
        provider="openai"
        model="gpt-4o"
        onModelChange={vi.fn()}
      />,
    )
    const modelSelector = screen.getByTestId('model-selector-mock')
    expect(modelSelector).toBeInTheDocument()
    expect(modelSelector).toHaveTextContent('gpt-4o')
  })

  test('disabled prop disables the textarea', () => {
    render(<Composer disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })
})
