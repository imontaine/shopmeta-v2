// tests/component/setup.ts
// Global setup for component tests using React Testing Library + jsdom.

import '@testing-library/dom'
import '@testing-library/jest-dom'

// Polyfill ResizeObserver — jsdom doesn't implement it
// Required by use-stick-to-bottom (prompt-kit ChatContainer dependency)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

// Polyfill IntersectionObserver — jsdom doesn't implement it
class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}
globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver


// Polyfill matchMedia — jsdom doesn't implement it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_: string, handler: EventListener) => {
      // Store handler so tests can trigger it
      if (!window.__mediaQueryListeners) window.__mediaQueryListeners = {}
      window.__mediaQueryListeners[query] = handler
    },
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Polyfill localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    length: 0,
    key: () => null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock,
})

// Extend Window interface
declare global {
  interface Window {
    __mediaQueryListeners?: Record<string, EventListener>
  }
}
