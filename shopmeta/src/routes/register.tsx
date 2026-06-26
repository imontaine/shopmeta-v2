// src/routes/register.tsx
// Register page — create a new account

import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { signUp } from '#/lib/auth/client'

export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context }) => {
    if (context && 'user' in context && context.user) {
      throw redirect({ to: '/chat' })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Disabled until React hydrates — prevents native GET form submission
  // when Playwright clicks before onSubmit is attached.
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => { setIsHydrated(true) }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Read values from FormData — works whether or not React state is hydrated
    const form = e.currentTarget
    const data = new FormData(form)
    const name = (data.get('name') as string) ?? ''
    const email = (data.get('email') as string) ?? ''
    const password = (data.get('password') as string) ?? ''
    const confirmPassword = (data.get('confirm-password') as string) ?? ''

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const result = await signUp.email({
        name,
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message ?? 'Failed to create account')
        setLoading(false)
        return
      }

      // Use hard navigation to ensure SSR re-runs with the new session cookie.
      // This bypasses TanStack Router's client-side context caching.
      window.location.href = '/chat'
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="url(#grad2)" />
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="grad2" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3ecf8e" />
                  <stop offset="1" stopColor="#00c573" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">ShopMeta</h1>
          <p className="auth-subtitle">Create your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="auth-error" role="alert" id="register-error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form" id="register-form" noValidate>
          <div className="auth-field">
            <label htmlFor="name" className="auth-label">Full name</label>
            <input
              id="name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Jane Smith"
              className="auth-input"
              disabled={loading}
            />
          </div>

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
            <label htmlFor="password" className="auth-label">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="auth-input"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirm-password" className="auth-label">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              className="auth-input"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            id="register-submit"
            className="auth-btn-primary"
            disabled={loading || !isHydrated}
          >
            {loading ? (
              <span className="auth-spinner" aria-hidden="true" />
            ) : null}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        {/* Footer */}
        <p className="auth-footer">
          Already have an account?{' '}
          <a href="/login" className="auth-link">Sign in</a>
        </p>

        {/* Version */}
        <span className="auth-version">v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
