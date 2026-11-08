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

// Development / Demo accounts verified in database
const DEMO_PASSWORD = 'DemoRelief@2026!'

type DemoRoleKey = 'admin' | 'citizen' | 'ngo' | 'donor' | 'volunteer'

type DemoAccount = {
  name: string
  email: string
  subLabel?: string
}

const DEMO_ROLES: Record<
  DemoRoleKey,
  {
    label: string
    icon: string
    tone: string
    accounts: DemoAccount[]
  }
> = {
  admin: {
    label: 'Admin',
    icon: '🛡️',
    tone: 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
    accounts: [
      { name: 'Admin Demo', email: 'admin.demo@reliefgrid.org' },
    ],
  },
  citizen: {
    label: 'Citizen',
    icon: '🏘️',
    tone: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
    accounts: [
      { name: 'Rahul Sharma', email: 'citizen.rahul@reliefgrid.org', subLabel: 'Reporter' },
      { name: 'Priya Patel', email: 'citizen.priya@reliefgrid.org', subLabel: 'Community Lead' },
    ],
  },
  ngo: {
    label: 'NGO',
    icon: '🤝',
    tone: 'border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25',
    accounts: [
      { name: 'SEWA Foundation', email: 'ngo.sewa@reliefgrid.org', subLabel: 'Primary' },
      { name: 'Goonj Mission', email: 'ngo.goonj@reliefgrid.org', subLabel: 'Mumbai' },
    ],
  },
  donor: {
    label: 'Donor',
    icon: '📦',
    tone: 'border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25',
    accounts: [
      { name: 'Tata Relief Trust', email: 'donor.tata@reliefgrid.org', subLabel: 'Corporate' },
      { name: 'Anita Desai', email: 'donor.anita@reliefgrid.org', subLabel: 'Philanthropist' },
    ],
  },
  volunteer: {
    label: 'Volunteer',
    icon: '🚑',
    tone: 'border-purple-500/40 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25',
    accounts: [
      { name: 'Arjun Verma', email: 'vol.arjun@reliefgrid.org', subLabel: 'Field Responder' },
      { name: 'Kavita Nair', email: 'vol.kavita@reliefgrid.org', subLabel: 'Logistics' },
      { name: 'Rohit Deshmukh', email: 'vol.rohit@reliefgrid.org', subLabel: 'Transit' },
    ],
  },
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
  const [selectedDemoRole, setSelectedDemoRole] = useState<DemoRoleKey>('admin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isDemoAvailable = Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true')

  function switchMode(next: Mode) {
    setError(null)
    setSuccess(null)
    setMode(next)
  }

  function handleSelectDemoAccount(roleKey: DemoRoleKey, account: DemoAccount) {
    setSelectedDemoRole(roleKey)
    setEmail(account.email)
    setPassword(DEMO_PASSWORD)
    setError(null)
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

        {mode === 'login' && isDemoAvailable && (
          <div className="rounded-xl border border-line bg-surface-raised/80 p-3.5 mb-1 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                1-Click Demo Login (Tab-Isolated)
              </span>
              <span className="text-[11px] font-mono text-orange">DemoRelief@2026!</span>
            </div>

            {/* Primary role tabs */}
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(DEMO_ROLES) as DemoRoleKey[]).map((rKey) => {
                const r = DEMO_ROLES[rKey]
                const isSelected = selectedDemoRole === rKey
                return (
                  <button
                    key={rKey}
                    type="button"
                    onClick={() => handleSelectDemoAccount(rKey, r.accounts[0])}
                    title={`Fill credentials for ${r.label}`}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-xs font-semibold transition-all duration-150 active:scale-95 ${
                      isSelected
                        ? `${r.tone} ring-1 ring-orange/60 font-bold`
                        : 'border-line/70 bg-surface/60 text-muted hover:text-content hover:bg-surface-raised'
                    }`}
                  >
                    <span className="text-base mb-0.5">{r.icon}</span>
                    <span>{r.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Sub-account selection if role has multiple accounts */}
            {DEMO_ROLES[selectedDemoRole].accounts.length > 1 && (
              <div className="pt-2 border-t border-line/60 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted font-medium">Select Persona:</span>
                {DEMO_ROLES[selectedDemoRole].accounts.map((acc) => {
                  const isActive = email === acc.email
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => handleSelectDemoAccount(selectedDemoRole, acc)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        isActive
                          ? 'bg-orange text-white shadow-xs font-bold'
                          : 'bg-surface border border-line text-muted hover:text-content'
                      }`}
                    >
                      {acc.name} {acc.subLabel ? `(${acc.subLabel})` : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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
