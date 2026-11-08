import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import LocationMap from '../../components/ui/LocationMap'
import { GlowingMetricCard, GlowingDonutChart, GlowingProgressMeter } from '../../components/ui/GlowingCharts'
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
import { useLiveSync } from '../../lib/live-sync'

type Section = 'overview' | 'profile' | 'verification' | 'reports' | 'requirements' | 'volunteers' | 'tasks'

const NAV: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Operations Overview' },
  { id: 'profile', label: 'Organisation Profile' },
  { id: 'verification', label: 'Platform Accreditation' },
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

  const loadProfileAndVerification = useCallback(() => {
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

  useEffect(() => {
    loadProfileAndVerification()
  }, [loadProfileAndVerification])

  // Live real-time cross-dashboard synchronization
  useLiveSync((event) => {
    if (
      event.type === 'REPORT_CREATED' ||
      event.type === 'DONATION_CREATED' ||
      event.type === 'REQUIREMENT_CREATED' ||
      event.type === 'DELIVERY_UPDATED' ||
      event.type === 'DELIVERY_CONFIRMED'
    ) {
      loadProfileAndVerification()
    }
  })

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
      title: 'Platform Accreditation & Darpan Verification',
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
      <nav className="mb-6 flex flex-wrap gap-2.5 border-b border-line pb-3.5" aria-label="NGO dashboard sections">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleSetSection(id)}
            className={`rounded-xl px-4 py-2 type-nav font-semibold transition-all focus-visible:outline-none interactive-popup ${
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
        <div className="mb-6 rounded-2xl border border-error/30 bg-error/10 p-5 text-sm font-medium text-error flex items-center justify-between" role="alert">
          <span>{loadError}</span>
          <Button variant="ghost" className="h-9 px-4 text-xs font-semibold" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      {/* Loading skeleton */}
      {!profile && !loadError && (
        <div className="py-16 text-center text-muted type-body">
          <svg className="mx-auto h-8 w-8 animate-spin text-orange mb-3" viewBox="0 0 24 24" fill="none">
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
// Overview section — operational metrics, glowing charts, and sector map
// ---------------------------------------------------------------------------

type OverviewProps = {
  token: string
  profile: NgoProfile
  verStatus: string
  onNavigate: (s: Section) => void
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

  const loadOverviewData = useCallback(() => {
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

  useEffect(() => {
    loadOverviewData()
  }, [loadOverviewData])

  useLiveSync((event) => {
    if (event.type === 'REPORT_CREATED' || event.type === 'REQUIREMENT_CREATED' || event.type === 'DELIVERY_CONFIRMED') {
      loadOverviewData()
    }
  })

  const activeReqsCount = requirements.filter((r) => r.status === 'active').length
  const fulfilledReqsCount = requirements.filter((r) => r.status === 'fulfilled').length
  const totalQuantityRequested = requirements.reduce((acc, r) => acc + (r.quantityRequested || 0), 0)
  const totalQuantityFulfilled = requirements.reduce((acc, r) => acc + (r.quantityFulfilled || 0), 0)

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <GlowingMetricCard
          title="Organisation"
          value={profile.organizationProfile?.name || profile.displayName}
          subtitle={`Reg: ${profile.organizationProfile?.registrationNumber || 'Not registered'}`}
          tone="orange"
        />
        <GlowingMetricCard
          title="Accreditation"
          value={VER_LABEL[verStatus] ?? verStatus}
          subtitle={verStatus === 'verified' ? 'Accredited for crisis dispatch' : 'Pending admin review'}
          tone={verStatus === 'verified' ? 'emerald' : 'amber'}
        />
        <GlowingMetricCard
          title="Active Requisitions"
          value={loadingSummaries ? '—' : activeReqsCount}
          subtitle={`${fulfilledReqsCount} fulfilled • ${requirements.length} total`}
          tone="blue"
        />
        <GlowingMetricCard
          title="Distress Requests"
          value={loadingSummaries ? '—' : reports.length}
          subtitle="Awaiting response in sector"
          tone="purple"
        />
      </div>

      {/* Analytics & Pipeline Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-2xl border border-line bg-surface p-6 glow-card">
          <h3 className="type-card-heading text-content mb-1">Requisition Status Distribution</h3>
          <p className="type-sm text-muted mb-4">Breakdown of resource requisition demands</p>
          <GlowingDonutChart
            segments={[
              { label: 'Active Demands', value: activeReqsCount, color: '#f97316' },
              { label: 'Fulfilled', value: fulfilledReqsCount, color: '#10b981' },
              { label: 'Expired/Cancelled', value: Math.max(requirements.length - activeReqsCount - fulfilledReqsCount, 0), color: '#64748b' },
            ]}
            centerValue={String(requirements.length)}
            centerTitle="Demands"
          />
        </div>

        <div className="lg:col-span-6 rounded-2xl border border-line bg-surface p-6 glow-card flex flex-col justify-between">
          <div>
            <h3 className="type-card-heading text-content mb-1">Resource Fulfillment Metrics</h3>
            <p className="type-sm text-muted mb-4">Aggregated units delivered vs. requested</p>

            <div className="space-y-4">
              <GlowingProgressMeter
                label="Total Quantity Fulfillment"
                value={totalQuantityFulfilled}
                total={Math.max(totalQuantityRequested, 1)}
                color="orange"
              />
              <GlowingProgressMeter
                label="Requisitions Completed"
                value={fulfilledReqsCount}
                total={Math.max(requirements.length, 1)}
                color="emerald"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-line mt-4">
            <Button variant="secondary" className="h-10 px-4 text-xs font-semibold" onClick={() => onNavigate('requirements')}>
              Create Requisition Demand →
            </Button>
            <Button variant="primary" className="h-10 px-4 text-xs font-semibold" onClick={() => onNavigate('volunteers')}>
              Scan Nearby Volunteers →
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid: Sector Map & Recent Incident Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Map Column */}
        <div className="lg:col-span-2">
          <Card className="p-6 border-line bg-surface flex flex-col glow-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="type-card-heading text-content">Operational Sector Geospatial Grid</h3>
                <p className="type-sm text-muted mt-0.5">Real-time geospatial distribution of citizen distress requests.</p>
              </div>
              <Badge tone="info" className="text-xs font-medium">
                {reportMarkers.length} Incidents Mapped
              </Badge>
            </div>

            <div className="w-full rounded-2xl overflow-hidden border border-line">
              <LocationMap
                markers={reportMarkers}
                height={400}
                listHeading="Distress Incident Coordinates"
              />
            </div>
          </Card>
        </div>

        {/* Recent Citizen Reports Column */}
        <div>
          <Card className="p-6 border-line bg-surface flex flex-col justify-between h-full glow-card">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-line">
                <div>
                  <h3 className="type-card-heading text-content">Distress Queue</h3>
                  <p className="type-sm text-muted mt-0.5">Submissions in active sectors.</p>
                </div>
                <Button variant="ghost" className="h-8 px-2 text-xs font-semibold text-orange hover:text-orange-strong" onClick={() => onNavigate('reports')}>
                  View all →
                </Button>
              </div>

              <div className="mt-4">
                {loadingSummaries ? (
                  <p className="py-8 text-sm text-muted text-center">Loading incident reports…</p>
                ) : reports.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line/80 py-10 px-4 text-center">
                    <p className="type-card-heading text-content">No distress reports pending</p>
                    <p className="type-sm text-muted mt-1">New citizen submissions in your sector will stream here via live sync.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {reports.slice(0, 4).map((r) => (
                      <li key={r._id} className="rounded-xl border border-line bg-surface-raised p-4 space-y-1.5 transition-all hover:border-orange/50">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-content type-body line-clamp-1">{r.title}</p>
                          <Badge tone={r.urgency === 'critical' ? 'error' : r.urgency === 'high' ? 'warning' : 'neutral'} className="text-[11px]">
                            {r.urgency}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between type-sm text-muted">
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
