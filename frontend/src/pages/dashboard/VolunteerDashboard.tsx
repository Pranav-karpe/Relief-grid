import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthApiError } from '../../api/auth'
import { getMyTasks, getTaskHistory, getVolunteerProfile, type VolunteerTask, type VolunteerProfile } from '../../api/volunteer'
import { useAuthContext } from '../../lib/useAuthContext'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { GlowingMetricCard, GlowingDonutChart, GlowingProgressMeter } from '../../components/ui/GlowingCharts'
import VolunteerTaskList from '../../components/volunteer/VolunteerTaskList'
import VolunteerTaskDetail from '../../components/volunteer/VolunteerTaskDetail'
import VolunteerHistorySection from '../../components/volunteer/VolunteerHistorySection'
import { useLiveSync } from '../../lib/live-sync'

type Section = 'overview' | 'tasks' | 'history'

const NAV: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'My Tasks' },
  { id: 'history', label: 'Mission History' },
]

export default function VolunteerDashboard() {
  const { state } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = (searchParams.get('tab') as Section) || 'overview'
  const section = (['overview', 'tasks', 'history'] as Section[]).includes(tabParam)
    ? tabParam
    : 'overview'

  const [selectedTask, setSelectedTask] = useState<VolunteerTask | null>(null)

  function setSection(id: Section) {
    setSearchParams({ tab: id })
    if (id !== 'tasks') setSelectedTask(null)
  }

  if (state.status !== 'authenticated') return null
  const { token } = state

  function handleSelectTask(task: VolunteerTask) {
    setSelectedTask(task)
    setSection('tasks')
  }

  function handleTaskUpdated(updated: VolunteerTask) {
    setSelectedTask(updated)
  }

  return (
    <DashboardLayout
      title="Field Volunteer Console"
      subtitle="Accept emergency transit assignments, log waypoint checkpoints, record proof-of-delivery, and review mission track records."
    >
      {/* Navigation tabs */}
      <nav className="mb-6 flex flex-wrap gap-2.5 border-b border-line pb-3.5" aria-label="Volunteer dashboard sections">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
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

      {section === 'overview' && (
        <OverviewSection
          token={token}
          accountStatus={state.user.accountStatus}
          onNavigate={setSection}
          onSelectTask={handleSelectTask}
        />
      )}

      {section === 'tasks' && !selectedTask && (
        <VolunteerTaskList token={token} onSelectTask={handleSelectTask} />
      )}

      {section === 'tasks' && selectedTask && (
        <VolunteerTaskDetail
          token={token}
          task={selectedTask}
          onBack={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
        />
      )}

      {section === 'history' && (
        <VolunteerHistorySection token={token} />
      )}
    </DashboardLayout>
  )
}

// ---------------------------------------------------------------------------
// Overview section — derives counts and telemetry from real API responses
// ---------------------------------------------------------------------------

type OverviewProps = {
  token: string
  accountStatus: string
  onNavigate: (s: Section) => void
  onSelectTask: (task: VolunteerTask) => void
}

type Counts = { assigned: number; accepted: number; delivered: number; declined: number }

function OverviewSection({ token, accountStatus, onNavigate, onSelectTask }: OverviewProps) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [volProfile, setVolProfile] = useState<VolunteerProfile | null>(null)
  const [activeTasks, setActiveTasks] = useState<VolunteerTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getMyTasks(token, { assignmentStatus: 'assigned' }),
      getMyTasks(token, { assignmentStatus: 'accepted' }),
      getTaskHistory(token),
      getVolunteerProfile(token).catch(() => null),
    ])
      .then(([assigned, accepted, history, prof]) => {
        if (cancelled) return
        const delivered = history.data.filter((t: VolunteerTask) => t.deliveryStatus === 'delivered').length
        const declined = history.data.filter((t: VolunteerTask) => t.assignmentStatus === 'declined').length
        setCounts({
          assigned: assigned.data.length,
          accepted: accepted.data.length,
          delivered,
          declined,
        })
        setActiveTasks([...assigned.data, ...accepted.data])
        if (prof) setVolProfile(prof)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof AuthApiError ? err.message : 'Could not load overview.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Live real-time sync when an NGO dispatches a task or status updates
  useLiveSync((event) => {
    if (event.type === 'TASK_ASSIGNED' || event.type === 'DELIVERY_UPDATED' || event.type === 'DELIVERY_CONFIRMED') {
      loadData()
    }
  })

  const verStatus = volProfile?.volunteerProfile?.verificationStatus ?? 'pending'
  const isAuthorized = accountStatus === 'active' && verStatus === 'verified'

  const totalMissions = counts ? counts.assigned + counts.accepted + counts.delivered + counts.declined : 0
  const completionRate = totalMissions > 0 && counts ? Math.round((counts.delivered / totalMissions) * 100) : 100

  return (
    <div className="w-full space-y-6">
      {/* Membership & Authorization Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6 shadow-xs glow-card">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="type-dash-section text-content">Field Volunteer Accreditation</h2>
            <Badge tone={isAuthorized ? 'success' : verStatus === 'rejected' ? 'error' : 'warning'}>
              {isAuthorized
                ? 'Authorized & Verified Active Responder'
                : verStatus === 'rejected'
                  ? 'Application Rejected'
                  : 'Verification In Progress (Admin Review)'}
            </Badge>
          </div>
          <p className="mt-2 type-body text-muted leading-relaxed max-w-3xl">
            {isAuthorized
              ? 'Your account is actively certified to receive, transport, and hand off critical disaster relief dispatches from accredited NGO emergency coordinators in your radius.'
              : verStatus === 'rejected'
                ? 'Your volunteer application was not approved. Please review credential guidelines or contact platform administration.'
                : 'Your responder profile is queued for administrator credential review. Field task acceptance triggers immediately upon verification.'}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-6 text-muted type-body">
          <svg className="h-5 w-5 animate-spin text-orange" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading telemetry and mission updates…
        </div>
      )}
      {error && <p className="text-sm font-medium text-error" role="alert">{error}</p>}

      {counts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <GlowingMetricCard
            title="Awaiting Response"
            value={counts.assigned}
            subtitle="Missions queued for acceptance"
            tone="amber"
          />
          <GlowingMetricCard
            title="Active In Transit"
            value={counts.accepted}
            subtitle="Accepted / In progress"
            tone="orange"
          />
          <GlowingMetricCard
            title="Confirmed Delivered"
            value={counts.delivered}
            subtitle="Verified safe delivery"
            tone="emerald"
          />
          <GlowingMetricCard
            title="Completion Rate"
            value={`${completionRate}%`}
            subtitle="Mission reliability index"
            tone="blue"
          />
        </div>
      )}

      {/* Analytics Visualizations */}
      {counts && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 rounded-2xl border border-line bg-surface p-6 glow-card">
            <h3 className="type-card-heading text-content mb-1">Mission Pipeline Distribution</h3>
            <p className="type-sm text-muted mb-4">Breakdown of volunteer dispatch assignments by status</p>
            <GlowingDonutChart
              segments={[
                { label: 'Awaiting', value: counts.assigned, color: '#f59e0b' },
                { label: 'Active Transit', value: counts.accepted, color: '#f97316' },
                { label: 'Delivered', value: counts.delivered, color: '#10b981' },
                { label: 'Declined', value: counts.declined, color: '#64748b' },
              ]}
              centerValue={String(totalMissions)}
              centerTitle="Missions"
            />
          </div>

          <div className="lg:col-span-6 rounded-2xl border border-line bg-surface p-6 glow-card flex flex-col justify-between">
            <div>
              <h3 className="type-card-heading text-content mb-1">Operational Readiness & Field Protocols</h3>
              <p className="type-sm text-muted mb-4">Chain-of-custody compliance & safety protocols</p>

              <div className="space-y-4">
                <GlowingProgressMeter
                  label="Delivery Success Ratio"
                  value={counts.delivered}
                  total={Math.max(counts.delivered + counts.declined, 1)}
                  color="emerald"
                />

                <div className="pt-2">
                  <span className="type-label block text-content mb-2 font-semibold">Standard Operating Protocol:</span>
                  <ul className="space-y-2 type-sm text-muted">
                    <li className="flex items-start gap-2">
                      <span className="text-orange font-bold">1.</span>
                      <span>Review cargo weight, vehicle requirement, and route before accepting.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange font-bold">2.</span>
                      <span>Submit GPS check-in at pickup point upon loading relief supplies.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange font-bold">3.</span>
                      <span>Acquire digital signature / photo proof-of-delivery at the final hub.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              variant="secondary"
              className="mt-6 w-full h-11 type-body font-semibold"
              onClick={() => onNavigate('tasks')}
            >
              Go to Mission Task Board →
            </Button>
          </div>
        </div>
      )}

      {/* Active Tasks Table/List */}
      <div className="rounded-2xl border border-line bg-surface p-6 glow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-line pb-4">
          <div>
            <h3 className="type-dash-section text-content">Active Mission Board</h3>
            <p className="type-body text-sm text-muted">Field tasks currently requiring acceptance, transit, or delivery confirmation</p>
          </div>
          <Button variant="secondary" onClick={() => onNavigate('tasks')} className="h-10 px-4 text-sm font-semibold">
            View all tasks →
          </Button>
        </div>

        {activeTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="type-body text-muted">No pending tasks assigned right now.</p>
            <p className="type-sm text-muted/70 mt-1">You will receive assignments in real time as nearby NGOs dispatch relief materials.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <div
                key={task._id}
                onClick={() => onSelectTask(task)}
                className="cursor-pointer rounded-xl border border-line bg-surface-raised p-4 md:p-5 transition-all hover:border-orange flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <p className="type-card-heading text-content">{task.taskDetails}</p>
                  <p className="type-sm text-muted font-mono mt-1.5">
                    Assigned: {new Date(task.createdAt).toLocaleDateString()} • Priority: <span className="uppercase text-orange font-semibold">{task.priority}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={task.assignmentStatus === 'assigned' ? 'warning' : 'success'}>
                    {task.assignmentStatus}
                  </Badge>
                  <span className="type-body text-sm text-orange font-semibold">Open Task Details →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
