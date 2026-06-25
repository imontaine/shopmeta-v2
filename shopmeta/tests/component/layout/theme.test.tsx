// tests/component/layout/theme.test.tsx
// Component tests for ThemeProvider, useTheme, and ThemeToggle.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, useTheme } from '#/lib/theme'
import { ThemeToggle } from '#/components/layout/ThemeToggle'

// Helper: wrap in ThemeProvider
function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

// ─── ThemeToggle component ────────────────────────────────────────────────────

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset html class and localStorage before each test
    document.documentElement.classList.remove('dark', 'light')
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('renders a button with accessible name containing "theme"', () => {
    renderWithTheme(<ThemeToggle />)
    const btn = screen.getByRole('button', { name: /theme/i })
    expect(btn).toBeDefined()
  })

  test('theme toggle switches from dark to light', async () => {
    // Default matchMedia returns dark (see setup.ts)
    const user = userEvent.setup()
    renderWithTheme(<ThemeToggle />)

    // Initial state is dark (matchMedia mock returns dark)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    const btn = screen.getByRole('button', { name: /theme/i })
    await user.click(btn)

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  test('theme toggle switches back from light to dark', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ThemeToggle />)

    const btn = screen.getByRole('button', { name: /theme/i })

    // First click: dark → light
    await user.click(btn)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Second click: light → dark
    await user.click(btn)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  test('persists theme to localStorage on toggle', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ThemeToggle />)

    const btn = screen.getByRole('button', { name: /theme/i })
    await user.click(btn)

    // After toggle from dark → light, localStorage should have 'light'
    expect(localStorage.getItem('shopmeta-theme')).toBe('light')
  })
})

// ─── System preference detection ─────────────────────────────────────────────

describe('System preference auto-detection', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'light')
    localStorage.clear()
  })

  test('applies dark class when prefers-color-scheme is dark', () => {
    // matchMedia mock in setup.ts returns matches=true when query includes 'dark'
    renderWithTheme(<ThemeToggle />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  test('applies light class when prefers-color-scheme is light', () => {
    // Override matchMedia to return light
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false, // light preference
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })

    document.documentElement.classList.remove('dark', 'light')
    renderWithTheme(<ThemeToggle />)
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  test('reads stored preference from localStorage over system preference', () => {
    // Store 'light' explicitly
    localStorage.setItem('shopmeta-theme', 'light')
    // matchMedia still returns dark, but stored pref should win
    renderWithTheme(<ThemeToggle />)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

// ─── useTheme hook ────────────────────────────────────────────────────────────

describe('useTheme hook', () => {
  test('throws when used outside ThemeProvider', () => {
    // Suppress console.error from React's error boundary
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function BadComponent() {
      useTheme() // Should throw
      return null
    }

    expect(() => render(<BadComponent />)).toThrow(/ThemeProvider/)
    consoleSpy.mockRestore()
  })

  test('provides setTheme function that applies the theme', () => {
    // Reset state before this test to avoid bleed from other tests
    document.documentElement.classList.remove('dark', 'light')
    localStorage.clear()

    function ThemeDisplay() {
      const { setTheme } = useTheme()
      return (
        <div>
          <button onClick={() => setTheme('light')}>Set Light</button>
          <button onClick={() => setTheme('dark')}>Set Dark</button>
        </div>
      )
    }

    renderWithTheme(<ThemeDisplay />)

    // Set light explicitly
    act(() => {
      screen.getByText('Set Light').click()
    })
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Set dark explicitly
    act(() => {
      screen.getByText('Set Dark').click()
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })
})
