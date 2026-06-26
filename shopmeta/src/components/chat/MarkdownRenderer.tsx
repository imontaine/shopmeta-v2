// src/components/chat/MarkdownRenderer.tsx
// Renders markdown content with syntax highlighting for code blocks.
// Includes a copy-to-clipboard button for each code block.

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Components } from 'react-markdown'

// ─── Copy Button ──────────────────────────────────────────────────────────────

interface CopyButtonProps {
  code: string
}

function CopyButton({ code }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea')
      el.value = code
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [code])

  return (
    <button
      data-testid="copy-code-button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy code'}
      className="code-copy-btn"
      style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        padding: '0.25rem 0.5rem',
        fontSize: '0.7rem',
        borderRadius: '0.25rem',
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(0,0,0,0.4)',
        color: copied ? 'hsl(142 76% 73%)' : 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1,
        zIndex: 1,
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

// ─── Code Block ───────────────────────────────────────────────────────────────

interface CodeBlockProps {
  language: string
  code: string
}

function CodeBlock({ language, code }: CodeBlockProps) {
  return (
    <div
      data-testid="code-block"
      style={{ position: 'relative', marginBottom: '1rem', borderRadius: '0.5rem', overflow: 'hidden' }}
    >
      {/* Language label */}
      {language && (
        <div
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.7rem',
            background: 'hsl(220 13% 18%)',
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'monospace',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {language}
        </div>
      )}
      <CopyButton code={code} />
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: language ? '0 0 0.5rem 0.5rem' : '0.5rem',
          fontSize: '0.875rem',
          padding: '1rem',
        }}
        codeTagProps={{ style: { fontFamily: 'monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const components: Components = {
    code({ className: cls, children, ...props }) {
      const match = /language-(\w+)/.exec(cls || '')
      const language = match ? match[1] : ''
      const codeString = String(children).replace(/\n$/, '')

      // Multi-line code (fenced block) → syntax highlighted
      const isBlock = codeString.includes('\n') || !!language

      if (isBlock) {
        return <CodeBlock language={language ?? ''} code={codeString} />
      }

      // Inline code
      return (
        <code
          className={cls}
          style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '0.1em 0.4em',
            borderRadius: '0.25rem',
            fontSize: '0.875em',
            fontFamily: 'monospace',
          }}
          {...props}
        >
          {children}
        </code>
      )
    },
    // Style headings
    h1: ({ children }) => (
      <h1 style={{ fontSize: '1.5rem', fontWeight: 500, marginBottom: '0.75rem', marginTop: '1.25rem' }}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', marginTop: '1rem' }}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.4rem', marginTop: '0.75rem' }}>{children}</h3>
    ),
    // Style lists
    ul: ({ children }) => (
      <ul style={{ paddingLeft: '1.5rem', marginBottom: '0.75rem', listStyleType: 'disc' }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.75rem', listStyleType: 'decimal' }}>{children}</ol>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: '0.25rem' }}>{children}</li>
    ),
    // Style links
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'hsl(217 91% 70%)', textDecoration: 'underline' }}
      >
        {children}
      </a>
    ),
    // Style blockquotes
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '3px solid hsl(217 91% 60%)',
          paddingLeft: '1rem',
          margin: '0.75rem 0',
          opacity: 0.8,
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    ),
    // Style tables
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '2px solid rgba(255,255,255,0.15)',
          textAlign: 'left',
          fontWeight: 600,
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {children}
      </td>
    ),
    // Style horizontal rules
    hr: () => (
      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1rem 0' }} />
    ),
    // Style paragraphs
    p: ({ children }) => (
      <p style={{ marginBottom: '0.75rem', lineHeight: 1.7 }}>{children}</p>
    ),
    // Style strong / em
    strong: ({ children }) => (
      <strong style={{ fontWeight: 600 }}>{children}</strong>
    ),
    em: ({ children }) => (
      <em style={{ fontStyle: 'italic' }}>{children}</em>
    ),
  }

  return (
    <div
      data-testid="markdown-renderer"
      className={className}
      style={{ fontSize: '0.9rem', lineHeight: 1.6 }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
