// src/routes/login.tsx
// Login page — email + password auth

import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { signIn } from '#/lib/auth/client'

export const Route = createFileRoute('/login')({
  // Redirect to /chat if already authenticated
  beforeLoad: async ({ context }) => {
    if (context && 'user' in context && context.user) {
      throw redirect({ to: '/chat' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  // Disabled until React hydrates — prevents native GET form submission
  const [isHydrated, setIsHydrated] = React.useState(false)
  React.useEffect(() => { setIsHydrated(true) }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Read values from FormData — works regardless of hydration state
    const form = e.currentTarget
    const data = new FormData(form)
    const email = (data.get('email') as string) ?? ''
    const password = (data.get('password') as string) ?? ''

    try {
      const result = await signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Invalid email or password')
        setLoading(false)
        return
      }

      // Use hard navigation to ensure SSR re-runs with the new session cookie.
      window.location.href = '/chat'
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" data-hydrated={isHydrated ? 'true' : 'false'}>
      <div className="auth-card">
        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="url(#grad)" />
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#000000" />
                  <stop offset="1" stopColor="#47484f" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">ShopMeta</h1>
          <p className="auth-subtitle">Sign in to your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error" role="alert" id="login-error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" id="login-form" noValidate>
          <div className="auth-field">
            <label htmlFor="email" className="auth-label">Email address</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="auth-input"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label htmlFor="password" className="auth-label">Password</label>
              <a href="/forgot-password" className="auth-link-sm">Forgot password?</a>
            </div>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="auth-input"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            id="login-submit"
            className="auth-btn-primary"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-spinner" aria-hidden="true" />
            ) : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <a href="/register" className="auth-link">Create one</a>
        </p>

        {/* Version */}
        <span className="auth-version">v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
