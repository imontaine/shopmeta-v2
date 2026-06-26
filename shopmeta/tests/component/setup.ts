// tests/component/setup.ts
// Global setup for component tests using React Testing Library + jsdom.

import '@testing-library/dom'
import '@testing-library/jest-dom'


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
