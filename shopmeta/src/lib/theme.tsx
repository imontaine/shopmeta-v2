// src/lib/theme.tsx
// Theme provider — manages dark/light mode with system-preference auto-detection.
// Persists user preference to localStorage and applies a `.dark` class to <html>.

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'

interface ThemeContextValue {
  /** The user's explicit preference (dark | light | system) */
  theme: Theme
  /** The currently rendered theme after resolving 'system' */
  resolvedTheme: ResolvedTheme
  /** Update the user's theme preference */
  setTheme: (theme: Theme) => void
  /** Toggle between dark and light (ignores 'system' — picks the opposite of resolvedTheme) */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'shopmeta-theme'

/** Detect the OS/browser colour scheme preference */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Read the stored preference, defaulting to 'system' */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
  return 'system'
}

/** Apply the resolved theme to the <html> element */
function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.remove('dark')
    root.classList.add('light')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')

  // On mount: read stored preference and resolve it
  useEffect(() => {
    const stored = getStoredTheme()
    const resolved = stored === 'system' ? getSystemTheme() : stored
    setThemeState(stored)
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  // Watch for OS preference changes when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolvedTheme(resolved)
      applyTheme(resolved)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (next: Theme) => {
    const resolved: ResolvedTheme = next === 'system' ? getSystemTheme() : next
    setThemeState(next)
    setResolvedTheme(resolved)
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(resolved)
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
