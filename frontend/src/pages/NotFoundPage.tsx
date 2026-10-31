import { Link } from 'react-router-dom'
import { useAuthContext } from '../lib/useAuthContext'
import { ROLE_DASHBOARD } from '../lib/roles'
import ReliefGridLogo from '../components/ui/ReliefGridLogo'

export default function NotFoundPage() {
  const { state } = useAuthContext()
  const isAuthenticated = state.status === 'authenticated'
  const dashboardLink = isAuthenticated ? ROLE_DASHBOARD[state.user.role] : '/login'

  return (
    <div className="relative min-h-screen flex flex-col justify-between items-center bg-page px-4 py-8 sm:py-12 text-content">
      {/* Background ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 0%, var(--color-orange-glow), transparent)' }}
        aria-hidden="true"
      />

      <div className="w-full max-w-md my-auto text-center">
        <div className="mb-8 flex justify-center">
          <Link to="/" aria-label="ReliefGrid home" className="focus-visible:outline-none">
            <ReliefGridLogo size="lg" />
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-8 shadow-surface">
          <span className="inline-flex rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange">
            404 Error
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-content">
            Page Not Found
          </h1>
          <p className="mt-2 text-sm text-muted">
            The page you requested does not exist or you do not have permission to view it.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            {isAuthenticated ? (
              <Link
                to={dashboardLink}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-orange px-5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Go to my console
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-orange px-5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Sign in
              </Link>
            )}
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface-raised px-5 text-sm font-medium text-muted hover:text-content hover:bg-surface-hover transition-colors"
            >
              Return to home
            </Link>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted/60">
        ReliefGrid · Coordinated Disaster Response Network
      </footer>
    </div>
  )
}
