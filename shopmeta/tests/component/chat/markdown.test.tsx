// tests/component/chat/markdown.test.tsx
// Component tests for MarkdownRenderer (now a thin wrapper over prompt-kit Markdown).
// Tests: bold, italic, headings, lists, blockquotes, tables, inline code, code blocks, links.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock shiki to avoid async syntax highlighting in tests
vi.mock('shiki', () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre><code>mock highlighted</code></pre>'),
}))

// Mock marked to simplify block parsing — just return the full string as one block
vi.mock('marked', () => ({
  marked: {
    lexer: (text: string) => [{ raw: text }],
  },
}))

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

  test('renders code block with syntax highlighting', () => {
    const content = '```javascript\nconsole.log("hello")\n```'
    const { container } = render(<MarkdownRenderer content={content} />)
    // prompt-kit CodeBlock renders as a div with rounded-xl border class
    const codeBlock = container.querySelector('[class*="overflow-clip"]') ||
                      container.querySelector('pre') ||
                      container.querySelector('code')
    expect(codeBlock).toBeInTheDocument()
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

  test('renders links', () => {
    const { container } = render(
      <MarkdownRenderer content={'[Click here](https://example.com)'} />,
    )
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })

  test('renders inline code', () => {
    const { container } = render(
      <MarkdownRenderer content={'Use `console.log()` to debug'} />,
    )
    // prompt-kit renders inline code as <span> with font-mono class
    const inlineCode = container.querySelector('[class*="font-mono"]') ||
                       container.querySelector('code')
    expect(inlineCode).toBeInTheDocument()
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
