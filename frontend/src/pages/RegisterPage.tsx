import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../lib/useAuthContext'
import { ROLE_DASHBOARD, ROLE_LABELS, isValidRole } from '../lib/roles'
import AuthForm from '../components/auth/AuthForm'
import ReliefGridLogo from '../components/ui/ReliefGridLogo'
import type { UserRole } from '../api/auth'

const CURRENT_YEAR = new Date().getFullYear()

export default function RegisterPage() {
  const { state, signIn, signOut } = useAuthContext()
  const [searchParams] = useSearchParams()

  const roleParam = searchParams.get('role')
  const validRole = isValidRole(roleParam) && roleParam !== 'admin' ? (roleParam as Exclude<UserRole, 'admin'>) : undefined

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Restoring session&hellip;</p>
      </div>
    )
  }

  if (state.status === 'authenticated') {
    const userRole = state.user.role

    // If no role requested or user already has that role, route to their dashboard
    if (!validRole || validRole === userRole) {
      return <Navigate to={ROLE_DASHBOARD[userRole]} replace />
    }

    // Role mismatch: user is authenticated under a different role
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-page px-4 py-12">
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 0%, var(--color-orange-glow), transparent)' }}
          aria-hidden="true"
        />

        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 sm:p-8 text-center shadow-surface animate-fade-up">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 text-2xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white">Signed in under a different role</h2>
          <p className="mt-2 text-sm text-muted">
            You are currently signed in as <span className="font-semibold text-white">{ROLE_LABELS[userRole]}</span> ({state.user.email}).
          </p>
          <p className="mt-3 text-xs text-muted/90 bg-surface-raised border border-line/60 rounded-xl p-3">
            To register or operate as <span className="font-semibold text-orange">{ROLE_LABELS[validRole]}</span>, please sign out first.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={ROLE_DASHBOARD[userRole]}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-surface-raised border border-line px-5 text-sm font-medium text-white hover:bg-surface-hover transition-colors"
            >
              Go to my dashboard
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-orange px-5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Sign out & continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-between items-center bg-page px-4 py-8 sm:py-12">
      {/* Background ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 0%, var(--color-orange-glow), transparent)' }}
        aria-hidden="true"
      />

      {/* Main card column */}
      <div className="w-full max-w-md sm:max-w-[28rem] my-auto">
        {/* Centered prominent logo */}
        <div className="mb-7 flex justify-center">
          <Link to="/" aria-label="ReliefGrid home" className="focus-visible:outline-none">
            <ReliefGridLogo size="lg" />
          </Link>
        </div>

        {/* Polished authentication card */}
        <div
          className="rounded-2xl border border-line bg-surface p-7 sm:p-9 shadow-surface"
        >
          <AuthForm onSuccess={signIn} initialMode="register" initialRole={validRole} />
        </div>

        {/* Neatly separated back-to-home navigation */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-white transition-colors py-2 px-4 rounded-xl hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden="true">←</span>
            <span>Back to home</span>
          </Link>
        </div>
      </div>

      {/* Subtle bottom disclaimer */}
      <footer className="mt-8 text-center text-xs text-muted/60">
        &copy; {CURRENT_YEAR} ReliefGrid · Coordinated Disaster Response Network
      </footer>
    </div>
  )
}
