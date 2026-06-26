// tests/component/chat/ToolCallStatus.test.tsx
// Component tests for the ToolCallStatus UI components.
// Tests running spinner, success result display, and error with retry button.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import {
  ToolCallStatus,
  ToolCallRunning,
  ToolCallSuccess,
  ToolCallError,
} from '#/components/chat/ToolCallStatus'

// ─── ToolCallRunning (spinner) ────────────────────────────────────────────────

describe('ToolCallRunning', () => {
  it('renders a spinner (running state)', () => {
    render(<ToolCallRunning />)

    const container = screen.getByTestId('tool-call-running')
    expect(container).toBeInTheDocument()
  })

  it('shows "running" status role', () => {
    render(<ToolCallRunning />)

    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
  })

  it('shows tool name when provided', () => {
    render(<ToolCallRunning toolName="clickhouse__run_select_query" />)

    const status = screen.getByTestId('tool-call-running')
    expect(status).toHaveTextContent('clickhouse__run_select_query')
  })

  it('shows generic message when no tool name', () => {
    render(<ToolCallRunning />)

    const status = screen.getByTestId('tool-call-running')
    expect(status.textContent).toMatch(/running tool/i)
  })

  it('has accessible aria-label with tool name', () => {
    render(<ToolCallRunning toolName="my_tool" />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-label', 'Running tool: my_tool')
  })
})

// ─── ToolCallSuccess ──────────────────────────────────────────────────────────

describe('ToolCallSuccess', () => {
  it('renders in success state with result content', () => {
    const result = { rows: [{ id: 1, name: 'Alice' }] }
    render(<ToolCallSuccess toolName="clickhouse__list_tables" result={result} />)

    const container = screen.getByTestId('tool-call-success')
    expect(container).toBeInTheDocument()
  })

  it('shows the tool name in the header', () => {
    render(<ToolCallSuccess toolName="clickhouse__run_select_query" result={{ rows: [] }} />)

    const container = screen.getByTestId('tool-call-success')
    expect(container.textContent).toMatch(/clickhouse__run_select_query/)
  })

  it('renders result as formatted JSON', () => {
    const result = { rows: [{ num: 1, greeting: 'hello' }] }
    render(<ToolCallSuccess result={result} />)

    const content = screen.getByTestId('tool-result-content')
    expect(content.textContent).toContain('"num": 1')
    expect(content.textContent).toContain('"greeting": "hello"')
  })

  it('renders string results directly', () => {
    render(<ToolCallSuccess result="Query returned 0 rows." />)

    const content = screen.getByTestId('tool-result-content')
    expect(content.textContent).toContain('Query returned 0 rows.')
  })

  it('renders without result when undefined', () => {
    render(<ToolCallSuccess toolName="my_tool" />)

    const container = screen.getByTestId('tool-call-success')
    expect(container).toBeInTheDocument()
    // Should not have result-content element
    expect(screen.queryByTestId('tool-result-content')).toBeNull()
  })

  it('has accessible region label', () => {
    render(<ToolCallSuccess toolName="my_tool" result={{}} />)

    const region = screen.getByRole('region')
    expect(region).toHaveAttribute('aria-label', 'Tool result: my_tool')
  })
})

// ─── ToolCallError ────────────────────────────────────────────────────────────

describe('ToolCallError', () => {
  it('renders in error state with error message', () => {
    render(
      <ToolCallError
        toolName="clickhouse__run_select_query"
        error="Syntax error: unexpected token"
      />,
    )

    const container = screen.getByTestId('tool-call-error')
    expect(container).toBeInTheDocument()
  })

  it('shows error message text', () => {
    render(
      <ToolCallError
        error="DB_PARSE_ERROR: Invalid SQL syntax"
      />,
    )

    const errMsg = screen.getByTestId('tool-error-message')
    expect(errMsg.textContent).toContain('DB_PARSE_ERROR: Invalid SQL syntax')
  })

  it('shows retry button when onRetry is provided', () => {
    const onRetry = vi.fn()
    render(
      <ToolCallError
        error="Connection timeout"
        onRetry={onRetry}
      />,
    )

    const retryBtn = screen.getByTestId('tool-retry-button')
    expect(retryBtn).toBeInTheDocument()
    expect(retryBtn).toHaveTextContent(/retry/i)
  })

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn()
    render(
      <ToolCallError
        error="Connection timeout"
        onRetry={onRetry}
      />,
    )

    const retryBtn = screen.getByTestId('tool-retry-button')
    fireEvent.click(retryBtn)

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does NOT show retry button when onRetry is not provided', () => {
    render(
      <ToolCallError
        error="Some error"
      />,
    )

    expect(screen.queryByTestId('tool-retry-button')).toBeNull()
  })

  it('shows tool name in the error header', () => {
    render(
      <ToolCallError
        toolName="clickhouse__run_select_query"
        error="Query failed"
      />,
    )

    const container = screen.getByTestId('tool-call-error')
    expect(container.textContent).toMatch(/clickhouse__run_select_query/)
  })

  it('has accessible alert role', () => {
    render(<ToolCallError error="Something went wrong" />)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
  })

  it('has accessible aria-label with tool name', () => {
    render(<ToolCallError toolName="my_tool" error="Error!" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-label', 'Tool error: my_tool')
  })
})

// ─── Unified ToolCallStatus ────────────────────────────────────────────────────

describe('ToolCallStatus (unified)', () => {
  it('renders running state', () => {
    render(
      <ToolCallStatus
        status={{ type: 'running' }}
        toolName="clickhouse__run_select_query"
      />,
    )

    expect(screen.getByTestId('tool-call-running')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-success')).toBeNull()
    expect(screen.queryByTestId('tool-call-error')).toBeNull()
  })

  it('renders success state', () => {
    render(
      <ToolCallStatus
        status={{ type: 'success', result: { rows: [{ id: 1 }] } }}
        toolName="clickhouse__list_tables"
      />,
    )

    expect(screen.getByTestId('tool-call-success')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-running')).toBeNull()
    expect(screen.queryByTestId('tool-call-error')).toBeNull()
  })

  it('renders error state', () => {
    render(
      <ToolCallStatus
        status={{ type: 'error', error: 'Query failed: connection reset' }}
        toolName="clickhouse__run_select_query"
      />,
    )

    expect(screen.getByTestId('tool-call-error')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-running')).toBeNull()
    expect(screen.queryByTestId('tool-call-success')).toBeNull()
  })

  it('passes onRetry through to error component', () => {
    const onRetry = vi.fn()
    render(
      <ToolCallStatus
        status={{ type: 'error', error: 'Timeout', onRetry }}
        toolName="my_tool"
      />,
    )

    fireEvent.click(screen.getByTestId('tool-retry-button'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('transitions correctly from running to success', () => {
    const { rerender } = render(
      <ToolCallStatus
        status={{ type: 'running' }}
        toolName="my_tool"
      />,
    )

    expect(screen.getByTestId('tool-call-running')).toBeInTheDocument()

    rerender(
      <ToolCallStatus
        status={{ type: 'success', result: { ok: true } }}
        toolName="my_tool"
      />,
    )

    expect(screen.getByTestId('tool-call-success')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-running')).toBeNull()
  })

  it('transitions correctly from running to error', () => {
    const { rerender } = render(
      <ToolCallStatus
        status={{ type: 'running' }}
        toolName="my_tool"
      />,
    )

    expect(screen.getByTestId('tool-call-running')).toBeInTheDocument()

    rerender(
      <ToolCallStatus
        status={{ type: 'error', error: 'Network timeout' }}
        toolName="my_tool"
      />,
    )

    expect(screen.getByTestId('tool-call-error')).toBeInTheDocument()
    expect(screen.queryByTestId('tool-call-running')).toBeNull()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ToolCallStatus
        status={{ type: 'running' }}
        className="custom-tool-status"
      />,
    )

    expect(container.firstChild).toHaveClass('custom-tool-status')
  })

  it('sets data-tool-name attribute', () => {
    const { container } = render(
      <ToolCallStatus
        status={{ type: 'running' }}
        toolName="clickhouse__run_select_query"
      />,
    )

    expect(container.firstChild).toHaveAttribute('data-tool-name', 'clickhouse__run_select_query')
  })
})
