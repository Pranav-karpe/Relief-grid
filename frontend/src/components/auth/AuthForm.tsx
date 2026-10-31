import { useState, type FormEvent } from 'react'
import { login, register, AuthApiError, type SafeUser, type UserRole } from '../../api/auth'
import Input from '../ui/Input'
import Button from '../ui/Button'

type Mode = 'login' | 'register'

type Props = {
  onSuccess: (user: SafeUser, token: string) => void
  initialMode?: Mode
  initialRole?: Exclude<UserRole, 'admin'>
}

const PUBLIC_ROLES: Exclude<UserRole, 'admin'>[] = ['citizen', 'donor', 'volunteer', 'ngo']

const ROLE_DESCRIPTIONS: Record<Exclude<UserRole, 'admin'>, string> = {
  citizen: 'Report relief needs in your area',
  donor: 'Offer resources and supplies',
  volunteer: 'Help deliver aid on the ground',
  ngo: 'Coordinate large-scale relief operations',
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function AuthForm({ onSuccess, initialMode = 'login', initialRole }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>(initialRole || 'citizen')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setError(null)
    setSuccess(null)
    setMode(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await login(email, password)
        setSuccess(`Welcome back, ${result.user.displayName}.`)
        onSuccess(result.user, result.token)
      } else {
        const user = await register(displayName, email, password, role)
        setSuccess(`Account created for ${user.displayName}. You can now sign in.`)
        switchMode('login')
      }
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      className="text-muted hover:text-content transition-colors"
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      tabIndex={0}
    >
      <EyeIcon open={showPassword} />
    </button>
  )

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-content">
          {mode === 'login' ? 'Sign in to ReliefGrid' : 'Create your account'}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {mode === 'login'
            ? 'Enter your credentials to access your relief dashboard.'
            : 'Join the coordinated network for emergency disaster relief.'}
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-4">
        {mode === 'register' && (
          <>
            <Input
              label="Display name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Your full name"
            />

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content" htmlFor="role-select">
                Intended Role
              </label>
              <select
                id="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<UserRole, 'admin'>)}
                className="min-h-10 w-full rounded-xl border border-line bg-surface-raised px-3.5 text-content transition-colors focus:border-orange focus:outline-none focus:ring-1 focus:ring-orange/30"
              >
                {PUBLIC_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.toUpperCase()} — {ROLE_DESCRIPTIONS[r]}
                  </option>
                ))}
              </select>
            </div>

            {/* Role-specific transparent guidance */}
            {role === 'ngo' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90 leading-relaxed">
                <p className="font-semibold text-amber-400 mb-0.5">⚠️ NGO Verification Required</p>
                <p>
                  Newly registered NGO accounts require administrative review. Document verification must be approved before relief requirement publishing and dispatch features become active.
                </p>
              </div>
            )}

            {role === 'volunteer' && (
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent leading-relaxed">
                <p className="font-semibold text-accent mb-0.5">ℹ️ NGO Coordination Required</p>
                <p>
                  Volunteer task dispatches and transit assignments are coordinated through authorized relief organizations.
                </p>
              </div>
            )}

            {role === 'donor' && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange leading-relaxed">
                <p className="font-semibold text-orange mb-0.5">📦 Resource Contributions</p>
                <p>
                  Register to list essential medical supplies, food rations, water, and emergency equipment matched within a 10km radius.
                </p>
              </div>
            )}

            {role === 'citizen' && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 leading-relaxed">
                <p className="font-semibold text-emerald-400 mb-0.5">🚨 Emergency Assistance</p>
                <p>
                  Register to report urgent relief needs for yourself or your community with location tracking and status visibility.
                </p>
              </div>
            )}
          </>
        )}

        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete={mode === 'login' ? 'username' : 'email'}
          required
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={8}
          hint={mode === 'register' ? 'At least 8 characters.' : undefined}
          rightSlot={passwordToggle}
        />

        {error && (
          <p
            className="rounded-lg border border-error/30 bg-error/8 px-3 py-2.5 text-sm text-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            className="rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-sm text-success"
            role="status"
          >
            {success}
          </p>
        )}

        <Button type="submit" loading={loading} className="w-full mt-1">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          className="font-semibold text-orange hover:text-orange-400 transition-colors focus-visible:outline-none focus-visible:underline"
        >
          {mode === 'login' ? 'Create account' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}

export default AuthForm
