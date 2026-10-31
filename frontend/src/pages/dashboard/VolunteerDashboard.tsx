import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthApiError } from '../../api/auth'
import { getMyTasks, getTaskHistory, getVolunteerProfile, type VolunteerTask, type VolunteerProfile } from '../../api/volunteer'
import { useAuthContext } from '../../lib/useAuthContext'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import VolunteerTaskList from '../../components/volunteer/VolunteerTaskList'
import VolunteerTaskDetail from '../../components/volunteer/VolunteerTaskDetail'
import VolunteerHistorySection from '../../components/volunteer/VolunteerHistorySection'

type Section = 'overview' | 'tasks' | 'history'

const NAV: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'My Tasks' },
  { id: 'history', label: 'History' },
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
      title="Volunteer Console"
      subtitle="Accept transit assignments, record pickup and delivery checkpoints, and review task history."
    >
      {/* Navigation tabs */}
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3" aria-label="Volunteer dashboard sections">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
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
// Overview section — derives counts from real API responses
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

  useEffect(() => {
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
        const delivered = history.data.filter((t) => t.deliveryStatus === 'delivered').length
        const declined = history.data.filter((t) => t.assignmentStatus === 'declined').length
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const verStatus = volProfile?.volunteerProfile?.verificationStatus ?? 'pending'
  const isAuthorized = accountStatus === 'active' && verStatus === 'verified'

  return (
    <div className="w-full space-y-6">
      {/* Membership & Authorization Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-content">Field Volunteer Accreditation</h2>
            <Badge tone={isAuthorized ? 'success' : verStatus === 'rejected' ? 'error' : 'warning'}>
              {isAuthorized
                ? 'Authorized & Verified Active Volunteer'
                : verStatus === 'rejected'
                  ? 'Application Rejected'
                  : 'Verification In Progress (Pending Admin Review)'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted leading-relaxed max-w-2xl">
            {isAuthorized
              ? 'Your account is actively authorized to receive and execute emergency relief transit and delivery dispatches from verified NGO coordinators within your service radius.'
              : verStatus === 'rejected'
                ? 'Your volunteer application was not approved. Please contact platform administrators or review your profile credentials.'
                : 'Your volunteer registration is currently pending administrator verification. Task dispatch acceptance will unlock immediately upon administrator verification.'}
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Loading overview…</p>}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      {counts && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Awaiting response" value={counts.assigned} tone="warning" />
          <StatCard label="In progress" value={counts.accepted} tone="success" />
          <StatCard label="Delivered" value={counts.delivered} tone="info" />
          <StatCard label="Declined" value={counts.declined} tone="neutral" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-line bg-surface-raised p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-content">Active Mission Tasks</h3>
              <p className="text-xs text-muted">Tasks currently requiring acceptance, pickup, or delivery</p>
            </div>
            <Button variant="secondary" onClick={() => onNavigate('tasks')} className="text-xs">
              View all tasks →
            </Button>
          </div>

          {activeTasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted">No pending tasks assigned right now.</p>
              <p className="text-xs text-muted/70 mt-1">You will receive assignments as matched resources are allocated.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTasks.map((task) => (
                <div
                  key={task._id}
                  onClick={() => onSelectTask(task)}
                  className="cursor-pointer rounded-lg border border-line bg-surface p-4 transition-all hover:border-accent flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-content">{task.taskDetails}</p>
                    <p className="text-xs text-muted font-mono mt-1">
                      Assigned: {new Date(task.createdAt).toLocaleDateString()} · Status: {task.assignmentStatus}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={task.assignmentStatus === 'assigned' ? 'warning' : 'success'}>
                      {task.assignmentStatus}
                    </Badge>
                    <span className="text-xs text-accent">Open task →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-xl border border-line bg-surface-raised p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Field Protocols</p>
            <p className="mt-2 text-sm text-content leading-relaxed">
              Volunteer delivery verification follows strict chain-of-custody protocols:
            </p>
            <ul className="mt-3 space-y-2 text-xs text-muted">
              <li className="flex items-start gap-2">
                <span className="text-accent font-bold">1.</span>
                <span>Confirm task acceptance when ready to deploy.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent font-bold">2.</span>
                <span>Update status upon resource pickup at donor location.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent font-bold">3.</span>
                <span>Record delivery reference upon safe arrival at distribution hub.</span>
              </li>
            </ul>
          </div>
          <Button variant="ghost" className="mt-4 text-xs px-0 text-left" onClick={() => onNavigate('tasks')}>
            Manage active tasks →
          </Button>
        </div>
      </div>
    </div>
  )
}

type StatCardProps = { label: string; value: number; tone: 'neutral' | 'warning' | 'success' | 'error' | 'info' }

const TONE_CLASS: Record<string, string> = {
  neutral: 'text-muted',
  warning: 'text-warning',
  success: 'text-success',
  error: 'text-error',
  info: 'text-accent',
}

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${TONE_CLASS[tone] ?? 'text-content'}`}>{value}</p>
    </div>
  )
}
