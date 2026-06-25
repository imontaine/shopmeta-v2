// src/routes/forgot-password.tsx
// Forgot Password page — request a password reset email

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { forgetPassword } from '#/lib/auth/client'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Read email from FormData — uncontrolled to avoid hydration race
    const form = e.currentTarget
    const data = new FormData(form)
    const email = (data.get('email') as string) ?? ''

    try {
      await forgetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      // Always show success — do not reveal if the email exists (security best practice)
      setSent(true)
    } catch {
      // Even on error, show success to prevent email enumeration attacks
      setSent(true)
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
              <rect width="32" height="32" rx="8" fill="url(#grad3)" />
              <path d="M16 10V22M10 16H22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <defs>
                <linearGradient id="grad3" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {sent ? (
          <div className="auth-success" role="status" id="reset-sent">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 10L9 13L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="auth-success-title">Check your inbox</p>
              <p className="auth-success-body">
                If an account exists for that email, a reset link has been sent. Check your spam folder if you don&apos;t see it.
              </p>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="auth-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form" id="forgot-password-form" noValidate>
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

              <button
                type="submit"
                id="forgot-password-submit"
                className="auth-btn-primary"
                disabled={loading}
              >
                {loading ? <span className="auth-spinner" aria-hidden="true" /> : null}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="auth-footer">
          Remember your password?{' '}
          <a href="/login" className="auth-link">Back to sign in</a>
        </p>
      </div>
    </div>
  )
}
