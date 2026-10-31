import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthContext } from '../lib/useAuthContext'
import type { UserRole } from '../api/auth'
import { ROLE_DASHBOARD } from '../lib/roles'
import Card from './ui/Card'

/** Blocks unauthenticated access. Shows a loading state during session restoration. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { state, retryRestore, signOut } = useAuthContext()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <Card className="flex flex-col items-center justify-center p-8 max-w-sm text-center shadow-surface">
          <div
            className="mb-4 h-9 w-9 animate-spin rounded-full border-2 border-orange border-t-transparent"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-content" aria-live="polite" aria-busy="true">
            Restoring session&hellip;
          </p>
          <p className="mt-1 text-xs text-muted">
            Verifying credentials with ReliefGrid secure enclave
          </p>
        </Card>
      </div>
    )
  }

  if (state.status === 'restore_failed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-4">
        <Card className="max-w-md p-7 text-center shadow-surface">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-error/15 text-error text-xl font-bold">
            !
          </div>
          <h2 className="text-base font-bold text-content">Session restoration failed</h2>
          <p className="mt-2 text-sm text-muted" role="alert">{state.error}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
            <button
              type="button"
              onClick={retryRestore}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-orange px-5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98] transition-all focus-visible:outline-none"
            >
              Retry connection
            </button>
            <button
              type="button"
              onClick={() => { signOut(); }}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface-raised px-5 text-sm font-medium text-muted hover:text-content hover:bg-surface-hover transition-colors focus-visible:outline-none"
            >
              Sign out
            </button>
          </div>
        </Card>
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}

/** Enforces that the authenticated user has the required role. */
export function RoleRoute({ role, children }: { role: UserRole; children: ReactNode }) {
  const { state } = useAuthContext()

  if (state.status !== 'authenticated') return null

  if (state.user.role !== role) {
    // Redirect to their own dashboard — not to login
    return <Navigate to={ROLE_DASHBOARD[state.user.role]} replace />
  }

  return <>{children}</>
}
