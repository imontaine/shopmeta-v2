// tests/component/chat/markdown.test.tsx
// Component tests for MarkdownRenderer.
// Tests: bold, code blocks, copy button, tables, links.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock react-syntax-highlighter to avoid complex rendering in tests
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language }: { children: string; language: string }) => (
    <pre data-testid={`syntax-${language}`}>
      <code>{children}</code>
    </pre>
  ),
}))

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}))

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(global.navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
})

const { MarkdownRenderer } = await import('#/components/chat/MarkdownRenderer')

describe('MarkdownRenderer component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders the markdown container', () => {
    render(<MarkdownRenderer content="Hello" />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
  })

  test('renders bold text as <strong>', () => {
    const { container } = render(<MarkdownRenderer content="**bold text**" />)
    expect(container.querySelector('strong')).toBeInTheDocument()
    expect(container.querySelector('strong')?.textContent).toBe('bold text')
  })

  test('renders italic text as <em>', () => {
    const { container } = render(<MarkdownRenderer content="*italic text*" />)
    expect(container.querySelector('em')).toBeInTheDocument()
    expect(container.querySelector('em')?.textContent).toBe('italic text')
  })

  test('renders code block with copy button', () => {
    const content = '```javascript\nconsole.log("hello")\n```'
    render(<MarkdownRenderer content={content} />)
    expect(screen.getByTestId('copy-code-button')).toBeInTheDocument()
  })

  test('code block copy button copies code to clipboard', async () => {
    const code = 'const x = 42'
    const content = `\`\`\`javascript\n${code}\n\`\`\``
    render(<MarkdownRenderer content={content} />)

    const copyBtn = screen.getByTestId('copy-code-button')
    await userEvent.click(copyBtn)

    expect(mockWriteText).toHaveBeenCalledWith(code)
  })

  test('copy button shows "Copied" after click', async () => {
    vi.useFakeTimers()

    const content = '```js\nconst x = 1\n```'
    const { rerender } = render(<MarkdownRenderer content={content} />)

    const copyBtn = screen.getByTestId('copy-code-button')

    // Click triggers async clipboard.writeText then setState
    await act(async () => {
      fireEvent.click(copyBtn)
      // Let the promise resolve
      await mockWriteText.mock.results[mockWriteText.mock.results.length - 1]?.value
    })

    // After async state update, should show "Copied"
    expect(copyBtn).toHaveTextContent('Copied')

    // Advance fake timers to trigger the 2s timeout
    act(() => {
      vi.advanceTimersByTime(2100)
    })

    // After timeout, reverts to "Copy"
    expect(copyBtn).toHaveTextContent('Copy')
    vi.useRealTimers()
  })

  test('renders multiple code blocks each with their own copy button', () => {
    const content = `\`\`\`js\nconst a = 1\n\`\`\`\n\n\`\`\`python\nprint("hi")\n\`\`\``
    render(<MarkdownRenderer content={content} />)
    const copyBtns = screen.getAllByTestId('copy-code-button')
    expect(copyBtns.length).toBe(2)
  })

  test('renders headings', () => {
    const { container } = render(
      <MarkdownRenderer content={'# H1\n\n## H2\n\n### H3'} />,
    )
    expect(container.querySelector('h1')).toBeInTheDocument()
    expect(container.querySelector('h2')).toBeInTheDocument()
    expect(container.querySelector('h3')).toBeInTheDocument()
  })

  test('renders unordered list', () => {
    const { container } = render(
      <MarkdownRenderer content={'- item 1\n- item 2\n- item 3'} />,
    )
    expect(container.querySelector('ul')).toBeInTheDocument()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
  })

  test('renders ordered list', () => {
    const { container } = render(
      <MarkdownRenderer content={'1. first\n2. second\n3. third'} />,
    )
    expect(container.querySelector('ol')).toBeInTheDocument()
  })

  test('renders links with target=_blank', () => {
    const { container } = render(
      <MarkdownRenderer content={'[Click here](https://example.com)'} />,
    )
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toContain('noopener')
  })

  test('renders inline code', () => {
    const { container } = render(
      <MarkdownRenderer content={'Use `console.log()` to debug'} />,
    )
    expect(container.querySelector('code')).toBeInTheDocument()
  })

  test('renders blockquote', () => {
    const { container } = render(
      <MarkdownRenderer content={'> This is a quote'} />,
    )
    expect(container.querySelector('blockquote')).toBeInTheDocument()
  })

  test('renders GFM table with remark-gfm', () => {
    const tableContent = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |'
    const { container } = render(<MarkdownRenderer content={tableContent} />)
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('th')).toBeInTheDocument()
  })
})
