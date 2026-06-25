// src/routes/reset-password.tsx
// Reset Password page — handles the token from the email link

import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { resetPassword } from '#/lib/auth/client'

type SearchParams = {
  token?: string
}

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search['token'] === 'string' ? search['token'] : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const router = useRouter()
  const { token } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <h1 className="auth-title">Invalid link</h1>
            <p className="auth-subtitle">This password reset link is invalid or has expired.</p>
          </div>
          <a href="/forgot-password" className="auth-btn-primary" style={{ display: 'block', textAlign: 'center' }}>
            Request a new link
          </a>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    // Read values from FormData — avoids hydration race condition
    const form = e.currentTarget
    const data = new FormData(form)
    const password = (data.get('new-password') as string) ?? ''
    const confirmPassword = (data.get('confirm-new-password') as string) ?? ''

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
      const result = await resetPassword({
        newPassword: password,
        token,
      })

      if (result.error) {
        setError(result.error.message ?? 'Failed to reset password. The link may have expired.')
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.navigate({ to: '/login' })
      }, 2000)
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="url(#grad4)" />
              <rect x="9" y="15" width="14" height="10" rx="2" stroke="white" strokeWidth="1.5" />
              <path d="M12 15V11a4 4 0 0 1 8 0v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <defs>
                <linearGradient id="grad4" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">New password</h1>
          <p className="auth-subtitle">Enter your new password below.</p>
        </div>

        {success ? (
          <div className="auth-success" role="status" id="reset-success">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 10L9 13L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="auth-success-title">Password updated!</p>
              <p className="auth-success-body">Redirecting you to sign in…</p>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="auth-error" role="alert" id="reset-error">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" id="reset-password-form" noValidate>
              <div className="auth-field">
                <label htmlFor="new-password" className="auth-label">New password</label>
                <input
                  id="new-password"
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="auth-input"
                  disabled={loading}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="confirm-new-password" className="auth-label">Confirm new password</label>
                <input
                  id="confirm-new-password"
                  type="password"
                  name="confirm-new-password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="auth-input"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                id="reset-password-submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? <span className="auth-spinner" aria-hidden="true" /> : null}
                {loading ? 'Saving…' : 'Reset password'}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer">
          <a href="/login" className="auth-link">Back to sign in</a>
        </p>
      </div>
    </div>
  )
}
