import { useState, useEffect, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthContext } from '../../lib/useAuthContext'
import { ROLE_LABELS, ROLE_DASHBOARD } from '../../lib/roles'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import ReliefGridLogo from '../ui/ReliefGridLogo'
import NotificationPanel from './NotificationPanel'
import { offlineStorage } from '../../lib/offline-storage'
import { EmergencyBroadcastBanner } from '../ui/EmergencyBroadcastBanner'
import { liveSync, useLiveConnectionStatus } from '../../lib/live-sync'

type NavItem = {
  label: string
  to: string
  tab?: string
  icon?: ReactNode
}

// Crisp inline SVG icons for sidebar items
const DashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const GiftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
  </svg>
)
const ReportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)
const BuildingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/>
    <line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/>
    <line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/>
  </svg>
)
const ShieldCheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)
const ListTodoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="6" height="6" rx="1"/><path d="M14 6h7"/><path d="M14 12h7"/>
    <rect x="3" y="13" width="6" height="6" rx="1"/><path d="M14 18h7"/>
  </svg>
)
const TruckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1" y="3" width="15" height="13"/>
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
)
const HistoryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
  </svg>
)
const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const AlertCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const ScrollTextIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/>
    <path d="M19 17V5a2 2 0 0 0-2-2H4"/>
    <path d="M15 8h-5"/><path d="M15 12h-5"/>
  </svg>
)

const ROLE_NAV: Record<string, NavItem[]> = {
  citizen: [
    { label: 'Dashboard', to: '/dashboard/citizen', tab: 'overview', icon: <DashIcon /> },
    { label: 'Create Relief Request', to: '/dashboard/citizen?tab=create', tab: 'create', icon: <PlusIcon /> },
    { label: 'My Relief Reports', to: '/dashboard/citizen?tab=reports', tab: 'reports', icon: <ReportIcon /> },
  ],
  donor: [
    { label: 'Dashboard', to: '/dashboard/donor', tab: 'overview', icon: <DashIcon /> },
    { label: 'Offer Resources', to: '/dashboard/donor?tab=create', tab: 'create', icon: <PlusIcon /> },
    { label: 'My Donation Listings', to: '/dashboard/donor?tab=list', tab: 'list', icon: <GiftIcon /> },
  ],
  ngo: [
    { label: 'Overview', to: '/dashboard/ngo', tab: 'overview', icon: <DashIcon /> },
    { label: 'Organisation Profile', to: '/dashboard/ngo?tab=profile', tab: 'profile', icon: <BuildingIcon /> },
    { label: 'Verification', to: '/dashboard/ngo?tab=verification', tab: 'verification', icon: <ShieldCheckIcon /> },
    { label: 'Citizen Reports', to: '/dashboard/ngo?tab=reports', tab: 'reports', icon: <ReportIcon /> },
    { label: 'Requirements', to: '/dashboard/ngo?tab=requirements', tab: 'requirements', icon: <ListTodoIcon /> },
  ],
  volunteer: [
    { label: 'Overview', to: '/dashboard/volunteer', tab: 'overview', icon: <DashIcon /> },
    { label: 'My Tasks', to: '/dashboard/volunteer?tab=tasks', tab: 'tasks', icon: <TruckIcon /> },
    { label: 'Task History', to: '/dashboard/volunteer?tab=history', tab: 'history', icon: <HistoryIcon /> },
  ],
  admin: [
    { label: 'Overview', to: '/dashboard/admin', tab: 'overview', icon: <DashIcon /> },
    { label: 'NGO Verification', to: '/dashboard/admin?tab=ngos', tab: 'ngos', icon: <ShieldCheckIcon /> },
    { label: 'User Management', to: '/dashboard/admin?tab=users', tab: 'users', icon: <UsersIcon /> },
    { label: 'Relief Reports', to: '/dashboard/admin?tab=reports', tab: 'reports', icon: <ReportIcon /> },
    { label: 'Resource & Allocation Oversight', to: '/dashboard/admin?tab=resources', tab: 'resources', icon: <GiftIcon /> },
    { label: 'Volunteer/Task Oversight', to: '/dashboard/admin?tab=volunteers', tab: 'volunteers', icon: <TruckIcon /> },
    { label: 'Activity/Audit Log', to: '/dashboard/admin?tab=audit', tab: 'audit', icon: <ScrollTextIcon /> },
    { label: 'Complaints', to: '/dashboard/admin?tab=complaints', tab: 'complaints', icon: <AlertCircleIcon /> },
  ],
}

function NavItems({ items, onClick }: { items: NavItem[]; onClick?: () => void }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const currentTab = searchParams.get('tab') ?? 'overview'

  return (
    <nav aria-label="Console navigation" className="w-full">
      <ul className="grid gap-1.5">
        {items.map((item) => {
          const itemTab = item.tab ?? 'overview'
          const isBasePath = location.pathname === item.to.split('?')[0]
          const isOverviewMatch = itemTab === 'overview' && (currentTab === 'overview' || !searchParams.get('tab'))
          const isExactTabMatch = itemTab !== 'overview' && currentTab === itemTab
          const isActive = isBasePath && (isOverviewMatch || isExactTabMatch)

          return (
            <li key={`${item.to}-${item.label}`}>
              <NavLink
                to={item.to}
                onClick={onClick}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[15.5px] font-medium transition-all duration-150 interactive-popup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive
                    ? 'bg-orange/15 text-orange font-semibold border border-orange/40 shadow-xs shadow-orange-500/15'
                    : 'text-muted hover:bg-surface-raised hover:text-content border border-transparent'
                }`}
              >
                <span className={`shrink-0 transition-colors ${isActive ? 'text-orange' : 'text-muted group-hover:text-content'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'U'

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-xs"
      style={{ background: 'linear-gradient(135deg, var(--color-orange), var(--color-accent))' }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

type DashboardLayoutProps = {
  children: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function DashboardLayout({ children, title, subtitle, actions }: DashboardLayoutProps) {
  const { state, signOut } = useAuthContext()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingSync, setPendingSync] = useState(0)
  const sseStatus = useLiveConnectionStatus()

  useEffect(() => {
    return offlineStorage.subscribe((online, count) => {
      setIsOnline(online)
      setPendingSync(count)
    })
  }, [])

  // Connect live sync when authenticated
  useEffect(() => {
    if (state.status === 'authenticated' && state.token) {
      liveSync.connect(state.token)
    }
  }, [state])

  // Accessible Escape-key listener and scroll-lock for mobile drawer
  useEffect(() => {
    if (!mobileOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  if (state.status !== 'authenticated') return null

  const { user } = state
  const navItems = ROLE_NAV[user.role] ?? []
  const roleLabel = ROLE_LABELS[user.role] ?? user.role
  const dashboardHome = ROLE_DASHBOARD[user.role]

  function handleSignOut() {
    liveSync.disconnect()
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-page text-content">
      {/* Desktop sidebar — comfortable 288px width prevents any label clipping */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface md:flex shadow-surface" aria-label="Dashboard sidebar">
        {/* Brand header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <ReliefGridLogo size="md" linkTo={dashboardHome} />
        </div>

        {/* User identification */}
        <div className="p-4">
          <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface-raised p-3.5 shadow-xs">
            <UserAvatar name={user.displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15.5px] font-bold text-content tracking-tight" title={user.displayName}>
                {user.displayName}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone="info" className="text-xs uppercase tracking-wider py-0.5 px-2.5 font-bold">
                  {roleLabel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3.5 py-2">
          <p className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-subtle">
            Console Navigation
          </p>
          <NavItems items={navItems} />
        </div>

        {/* Sidebar footer */}
        <div className="border-t border-line p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-[15px] font-medium text-muted hover:text-error hover:bg-error/10 py-2.5"
            onClick={handleSignOut}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main wrapper */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="dash-header-glow flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <ReliefGridLogo size="sm" linkTo={dashboardHome} />
          <div className="flex items-center gap-2">
            <NotificationPanel token={state.token} />
            <button
              type="button"
              aria-label={mobileOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation-drawer"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Mobile accessible backdrop and sliding drawer */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation drawer"
            id="mobile-navigation-drawer"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-in drawer */}
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-4 shadow-2xl animate-fade-up">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <ReliefGridLogo size="sm" linkTo={dashboardHome} />
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-content transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* User info */}
              <div className="my-3 flex items-center gap-3 rounded-xl border border-line bg-surface-raised p-3">
                <UserAvatar name={user.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">{user.displayName}</p>
                  <Badge tone="info" className="mt-0.5 text-[10px] py-0 px-2 uppercase tracking-wider">{roleLabel}</Badge>
                </div>
              </div>

              {/* Navigation items */}
              <div className="flex-1 overflow-y-auto py-2">
                <NavItems items={navItems} onClick={() => setMobileOpen(false)} />
              </div>

              {/* Drawer footer */}
              <div className="border-t border-line pt-3">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2.5 text-sm text-error hover:bg-error/10"
                  onClick={handleSignOut}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop top context header */}
        <div className="dash-header-glow hidden items-center justify-between border-b border-line bg-surface/70 px-8 py-3.5 backdrop-blur-xs md:flex">
          <div className="flex items-center gap-2.5 text-sm text-muted">
            <span className="font-semibold text-content">ReliefGrid Console</span>
            <span aria-hidden="true" className="text-muted/60">/</span>
            <span className="capitalize font-medium text-orange/90">{roleLabel}</span>
            <span aria-hidden="true" className="text-muted/60">/</span>
            <span className="text-content font-semibold">{title}</span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationPanel token={state.token} />
            <span
              className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3 py-1 rounded-full border shadow-xs ${
                !isOnline
                  ? 'border-amber-800/40 bg-amber-950/30 text-amber-400'
                  : sseStatus === 'connected'
                  ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
                  : 'border-amber-800/40 bg-amber-950/30 text-amber-400'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  !isOnline
                    ? 'bg-amber-500'
                    : sseStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-amber-500 animate-ping'
                }`}
              ></span>
              {!isOnline
                ? `Offline Mode ${pendingSync > 0 ? `(${pendingSync} queued)` : ''}`
                : sseStatus === 'connected'
                ? 'Live Connected'
                : 'Reconnecting…'}
            </span>
          </div>
        </div>

        {/* Emergency Alert Broadcast Banner */}
        <EmergencyBroadcastBanner role={user.role} />

        {/* Main page content — uses available space intelligently */}
        <main className="flex-1 overflow-x-hidden px-4 py-7 sm:px-7 md:px-9 lg:px-11" id="main-content">
          <div className="mx-auto w-full max-w-[1720px]">
            {/* Dashboard header banner */}
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
              <div>
                <h1 className="type-dash-title text-content tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1.5 text-[15.5px] text-muted leading-relaxed max-w-4xl">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
            </div>

            {/* Page content */}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
