// tests/component/chat/markdown.test.tsx
// Component tests for the Markdown component (src/components/ui/markdown.tsx).
// Uses react-markdown + remark-gfm + remark-breaks under the hood.
// Tests: bold, italic, headings, lists, blockquotes, tables, inline code, code blocks, links.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ─── Mock CodeBlock (uses browser APIs not available in jsdom) ────────────────
vi.mock('@/components/ui/code-block', () => ({
  CodeBlock: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="code-block">{children}</div>
  ),
  CodeBlockCode: ({ code }: { code: string }) => (
    <pre data-testid="code-block-code"><code>{code}</code></pre>
  ),
}))

import React from 'react'
const { Markdown } = await import('@/components/ui/markdown')

describe('Markdown component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders without crashing', () => {
    const { container } = render(<Markdown>Hello</Markdown>)
    expect(container.firstChild).toBeInTheDocument()
  })

  test('renders bold text as <strong>', () => {
    const { container } = render(<Markdown>{'**bold text**'}</Markdown>)
    expect(container.querySelector('strong')).toBeInTheDocument()
    expect(container.querySelector('strong')?.textContent).toBe('bold text')
  })

  test('renders italic text as <em>', () => {
    const { container } = render(<Markdown>{'*italic text*'}</Markdown>)
    expect(container.querySelector('em')).toBeInTheDocument()
    expect(container.querySelector('em')?.textContent).toBe('italic text')
  })

  test('renders h1 heading', () => {
    const { container } = render(<Markdown>{'# Heading One'}</Markdown>)
    expect(container.querySelector('h1')).toBeInTheDocument()
    expect(container.querySelector('h1')?.textContent).toBe('Heading One')
  })

  test('renders h2 and h3 headings', () => {
    const { container } = render(<Markdown>{'## H2\n\n### H3'}</Markdown>)
    expect(container.querySelector('h2')).toBeInTheDocument()
    expect(container.querySelector('h3')).toBeInTheDocument()
  })

  test('renders unordered list', () => {
    const { container } = render(<Markdown>{'- item 1\n- item 2\n- item 3'}</Markdown>)
    expect(container.querySelector('ul')).toBeInTheDocument()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
  })

  test('renders ordered list', () => {
    const { container } = render(<Markdown>{'1. first\n2. second\n3. third'}</Markdown>)
    expect(container.querySelector('ol')).toBeInTheDocument()
  })

  test('renders links with correct href', () => {
    const { container } = render(<Markdown>{'[Click here](https://example.com)'}</Markdown>)
    const link = container.querySelector('a')
    expect(link).toBeInTheDocument()
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })

  test('renders inline code as styled span', () => {
    const { container } = render(<Markdown>{'Use `console.log()` to debug'}</Markdown>)
    // Inline code renders as <span> with font-mono class
    const inlineCode = container.querySelector('[class*="font-mono"]') ||
                       container.querySelector('code')
    expect(inlineCode).toBeInTheDocument()
  })

  test('renders fenced code block via CodeBlock', () => {
    const content = '```javascript\nconsole.log("hello")\n```'
    render(<Markdown>{content}</Markdown>)
    // CodeBlock mock uses data-testid="code-block"
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
  })

  test('renders blockquote', () => {
    const { container } = render(<Markdown>{'> This is a quote'}</Markdown>)
    expect(container.querySelector('blockquote')).toBeInTheDocument()
  })

  test('renders GFM table with remark-gfm', () => {
    const tableContent = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |'
    const { container } = render(<Markdown>{tableContent}</Markdown>)
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('th')).toBeInTheDocument()
  })

  test('accepts id prop without crashing', () => {
    const { container } = render(<Markdown id="test-md">Hello</Markdown>)
    expect(container.firstChild).toBeInTheDocument()
  })

  test('accepts className prop', () => {
    const { container } = render(<Markdown className="prose">Hello</Markdown>)
    expect(container.firstChild).toBeInTheDocument()
  })
})
