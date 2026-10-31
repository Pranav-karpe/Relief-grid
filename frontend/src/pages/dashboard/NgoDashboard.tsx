import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import LocationMap from '../../components/ui/LocationMap'
import { useAuthContext } from '../../lib/useAuthContext'
import { AuthApiError } from '../../api/auth'
import {
  getNgoProfile,
  getNgoVerification,
  getMyRequirements,
  getNgoReports,
  type NgoProfile,
  type NgoVerification,
  type Requirement,
  type NgoReport,
} from '../../api/ngo'
import NgoProfileSection from '../../components/ngo/NgoProfileSection'
import NgoVerificationSection from '../../components/ngo/NgoVerificationSection'
import NgoReportsSection from '../../components/ngo/NgoReportsSection'
import NgoRequirementsSection from '../../components/ngo/NgoRequirementsSection'
import NgoVolunteerDispatchSection from '../../components/ngo/NgoVolunteerDispatchSection'
import NgoTasksOversightSection from '../../components/ngo/NgoTasksOversightSection'

type Section = 'overview' | 'profile' | 'verification' | 'reports' | 'requirements' | 'volunteers' | 'tasks'

const NAV: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'profile', label: 'Organisation Profile' },
  { id: 'verification', label: 'Verification' },
  { id: 'reports', label: 'Citizen Reports' },
  { id: 'requirements', label: 'Resource Requirements' },
  { id: 'volunteers', label: 'Find Volunteers' },
  { id: 'tasks', label: 'Field Tasks & Delivery' },
]

export default function NgoDashboard() {
  const { state } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const section = (searchParams.get('tab') as Section) || 'overview'

  const [profile, setProfile] = useState<NgoProfile | null>(null)
  const [verification, setVerification] = useState<NgoVerification | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const token = state.status === 'authenticated' ? state.token : ''

  function handleSetSection(s: Section) {
    if (s === 'overview') {
      setSearchParams({})
    } else {
      setSearchParams({ tab: s })
    }
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoadError(null)
    Promise.all([getNgoProfile(token), getNgoVerification(token)])
      .then(([p, v]) => {
        if (cancelled) return
        setProfile(p)
        setVerification(v)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof AuthApiError ? err.message : 'Could not load NGO data.')
      })
    return () => { cancelled = true }
  }, [token])

  if (state.status !== 'authenticated') return null

  const verStatus = profile?.organizationProfile?.verificationStatus ?? 'not_submitted'

  const titles: Record<Section, { title: string; subtitle: string }> = {
    overview: {
      title: 'NGO Operations Console',
      subtitle: 'Manage agency credentials, review citizen distress reports, dispatch volunteer deliveries, and coordinate essential resources.',
    },
    profile: {
      title: 'Organisation Profile',
      subtitle: 'Official NGO registration, administrative contacts, and operational scope.',
    },
    verification: {
      title: 'Platform Verification',
      subtitle: 'Official platform accreditation status, AI registration check, and compliance feedback.',
    },
    reports: {
      title: 'Citizen Relief Reports',
      subtitle: 'Prioritize incoming incident reports and assess immediate community relief needs.',
    },
    requirements: {
      title: 'Resource Requirements & Allocations',
      subtitle: 'Create resource requisition demands and review automated donation matches within 10 km.',
    },
    volunteers: {
      title: 'Nearby Verified Volunteers',
      subtitle: 'Discover active field volunteers within 10 km proximity and dispatch delivery operations.',
    },
    tasks: {
      title: 'Field Tasks & Delivery Confirmation',
      subtitle: 'Track delivery progress and perform NGO secondary confirmation to resolve citizen distress reports.',
    },
  }

  return (
    <DashboardLayout
      title={titles[section]?.title ?? 'NGO Dashboard'}
      subtitle={titles[section]?.subtitle}
    >
      {/* Top navigation tabs */}
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3" aria-label="NGO dashboard sections">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleSetSection(id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none interactive-popup ${
              section === id
                ? 'bg-orange text-white shadow-xs'
                : 'text-muted hover:text-content hover:bg-surface-raised'
            }`}
            aria-current={section === id ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {loadError && (
        <div className="mb-6 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error flex items-center justify-between" role="alert">
          <span>{loadError}</span>
          <Button variant="ghost" className="text-xs h-7 px-3" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {!profile && !loadError && (
        <div className="py-12 text-center text-sm text-muted">
          <svg className="mx-auto h-6 w-6 animate-spin text-orange mb-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading organisation details…
        </div>
      )}

      {profile && verification !== undefined && (
        <>
          {section === 'overview' && (
            <OverviewSection
              token={token}
              profile={profile}
              verStatus={verStatus}
              onNavigate={handleSetSection}
            />
          )}
          {section === 'profile' && (
            <NgoProfileSection token={token} profile={profile} onUpdated={setProfile} />
          )}
          {section === 'verification' && (
            <NgoVerificationSection
              token={token}
              profile={profile}
              verification={verification}
              onSubmitted={(v) => setVerification(v)}
            />
          )}
          {section === 'reports' && <NgoReportsSection token={token} />}
          {section === 'requirements' && <NgoRequirementsSection token={token} />}
          {section === 'volunteers' && (
            <NgoVolunteerDispatchSection token={token} isVerified={verStatus === 'verified'} />
          )}
          {section === 'tasks' && (
            <NgoTasksOversightSection token={token} isVerified={verStatus === 'verified'} />
          )}
        </>
      )}
    </DashboardLayout>
  )
}

// ---------------------------------------------------------------------------
// Overview section — utilizes full width with operational metrics & summaries
// ---------------------------------------------------------------------------

type OverviewProps = {
  token: string
  profile: NgoProfile
  verStatus: string
  onNavigate: (s: Section) => void
}

const VER_TONE: Record<string, string> = {
  not_submitted: 'text-muted',
  pending: 'text-warning',
  under_review: 'text-warning',
  verified: 'text-success',
  rejected: 'text-error',
  suspended: 'text-error',
}

const VER_LABEL: Record<string, string> = {
  not_submitted: 'Not Submitted',
  pending: 'Pending Review',
  under_review: 'Under Review',
  verified: 'Verified & Accredited',
  rejected: 'Application Rejected',
  suspended: 'Account Suspended',
}

function OverviewSection({ token, profile, verStatus, onNavigate }: OverviewProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [reports, setReports] = useState<NgoReport[]>([])
  const [loadingSummaries, setLoadingSummaries] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingSummaries(true)
    const fetchReports = verStatus === 'verified' ? getNgoReports(token, { status: 'submitted' }) : Promise.resolve({ data: [] })
    Promise.all([
      getMyRequirements(token),
      fetchReports,
    ])
      .then(([reqs, reps]) => {
        if (cancelled) return
        setRequirements(reqs.data)
        setReports(reps.data)
        setLoadingSummaries(false)
      })
      .catch(() => {
        if (!cancelled) setLoadingSummaries(false)
      })
    return () => { cancelled = true }
  }, [token, verStatus])

  const activeReqsCount = requirements.filter((r) => r.status === 'active').length
  const fulfilledReqsCount = requirements.filter((r) => r.status === 'fulfilled').length

  const reportMarkers = reports
    .filter((r) => r.location?.coordinates && r.location.coordinates.length === 2)
    .map((r) => ({
      id: r._id,
      coordinates: r.location.coordinates,
      label: r.title,
      detail: `${r.needCategory} · ${r.urgency}`,
      tone: r.urgency === 'critical' ? ('error' as const) : r.urgency === 'high' ? ('warning' as const) : ('default' as const),
    }))

  return (
    <div className="space-y-6">
      {/* Operational Highlights Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* NGO Profile Card */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Organisation</span>
            <p className="mt-2 text-lg font-bold text-content truncate">
              {profile.organizationProfile?.name || profile.displayName}
            </p>
            <p className="mt-1 text-xs text-muted truncate">
              Reg: {profile.organizationProfile?.registrationNumber || 'Not registered'}
            </p>
          </div>
          <Button variant="ghost" className="mt-4 text-xs px-0 text-accent hover:text-accent-strong justify-start" onClick={() => onNavigate('profile')}>
            Edit Profile →
          </Button>
        </div>

        {/* Verification Status Card */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Accreditation</span>
              <span className={`h-2 w-2 rounded-full ${verStatus === 'verified' ? 'bg-success' : verStatus === 'pending' ? 'bg-warning' : 'bg-muted'}`} />
            </div>
            <p className={`mt-2 text-lg font-bold ${VER_TONE[verStatus] ?? 'text-muted'}`}>
              {VER_LABEL[verStatus] ?? verStatus}
            </p>
            <p className="mt-1 text-xs text-muted">
              {verStatus === 'not_submitted' && 'Submit profile info to unlock coordination features.'}
              {verStatus === 'pending' && 'Application currently under administrator review.'}
              {verStatus === 'verified' && 'Accredited for crisis mobilization & volunteer dispatch.'}
              {verStatus === 'rejected' && 'Review feedback notes and update verification.'}
            </p>
          </div>
          <Button variant="ghost" className="mt-4 text-xs px-0 text-accent hover:text-accent-strong justify-start" onClick={() => onNavigate('verification')}>
            View Verification Status →
          </Button>
        </div>

        {/* Active Requirements Card */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Resource Demands</span>
              <span className="text-xs font-bold text-orange">{loadingSummaries ? '—' : activeReqsCount} Active</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-content">
              {loadingSummaries ? '—' : requirements.length}
            </p>
            <p className="mt-1 text-xs text-muted">
              {fulfilledReqsCount} fulfilled · {activeReqsCount} currently active
            </p>
          </div>
          <Button variant="ghost" className="mt-4 text-xs px-0 text-accent hover:text-accent-strong justify-start" onClick={() => onNavigate('requirements')}>
            Manage Requirements →
          </Button>
        </div>

        {/* Volunteer Dispatch Quick Action Card */}
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Field Delivery</span>
              <Badge tone={verStatus === 'verified' ? 'success' : 'neutral'}>
                {verStatus === 'verified' ? 'Active' : 'Locked'}
              </Badge>
            </div>
            <p className="mt-2 text-lg font-bold text-content">
              Volunteer Dispatch
            </p>
            <p className="mt-1 text-xs text-muted">
              Discover verified volunteers within 10 km and confirm deliveries.
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" className="text-xs px-0 text-accent hover:text-accent-strong justify-start" onClick={() => onNavigate('volunteers')}>
              Find Volunteers →
            </Button>
            <span className="text-muted/40">·</span>
            <Button variant="ghost" className="text-xs px-0 text-accent hover:text-accent-strong justify-start" onClick={() => onNavigate('tasks')}>
              Tasks →
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid: Sector Map & Recent Incident Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Map Column */}
        <div className="lg:col-span-2">
          <Card className="p-5 border-line bg-surface flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-content">Operational Sector Overview</h3>
                <p className="text-xs text-muted mt-0.5">Real-time geospatial distribution of citizen distress requests.</p>
              </div>
              <Badge tone="info" className="text-[10px]">
                {reportMarkers.length} Locations Mapped
              </Badge>
            </div>

            <div className="w-full rounded-xl overflow-hidden border border-line">
              <LocationMap
                markers={reportMarkers}
                height={380}
                listHeading="Distress Incident Coordinates"
              />
            </div>
          </Card>
        </div>

        {/* Recent Citizen Reports Column */}
        <div>
          <Card className="p-5 border-line bg-surface flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h3 className="text-sm font-semibold text-content">Citizen Distress Reports</h3>
                  <p className="text-xs text-muted mt-0.5">Needs submitted by citizens in nearby sectors.</p>
                </div>
                <Button variant="ghost" className="text-xs text-accent hover:text-accent-strong p-0" onClick={() => onNavigate('reports')}>
                  View all →
                </Button>
              </div>

              <div className="mt-4">
                {loadingSummaries ? (
                  <p className="py-6 text-sm text-muted text-center">Loading reports…</p>
                ) : reports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line/80 py-8 px-4 text-center">
                    <p className="text-sm font-medium text-content">No distress reports pending</p>
                    <p className="text-xs text-muted mt-1">New citizen submissions in your operational region will appear here.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {reports.slice(0, 4).map((r) => (
                      <li key={r._id} className="rounded-xl border border-line bg-surface-raised p-3.5 space-y-1.5 transition-all hover:border-accent/40">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-content text-xs line-clamp-1">{r.title}</p>
                          <Badge tone={r.urgency === 'critical' ? 'error' : r.urgency === 'high' ? 'warning' : 'neutral'} className="text-[10px]">
                            {r.urgency}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="capitalize font-medium text-content">{r.needCategory}</span>
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
