import { useState, useEffect, useCallback } from 'react'
import { AuthApiError } from '../../api/auth'
import { getMyTasks, acceptTask, declineTask, type VolunteerTask } from '../../api/volunteer'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { useLiveSync } from '../../lib/live-sync'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const ASSIGNMENT_TONE: Record<string, BadgeTone> = {
  assigned: 'warning',
  accepted: 'success',
  declined: 'neutral',
  cancelled: 'error',
  reassigned: 'info',
}

const DELIVERY_TONE: Record<string, BadgeTone> = {
  pending: 'neutral',
  in_transit: 'info',
  delivered: 'success',
  failed: 'error',
}

type Props = {
  token: string
  onSelectTask: (task: VolunteerTask) => void
}

export default function VolunteerTaskList({ token, onSelectTask }: Props) {
  const [tasks, setTasks] = useState<VolunteerTask[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await getMyTasks(token, { cursor })
      setTasks((prev) => cursor ? [...prev, ...result.data] : result.data)
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not load tasks.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Live real-time sync when a new task is assigned by an NGO
  useLiveSync((event) => {
    if (event.type === 'TASK_ASSIGNED' || event.type === 'DELIVERY_UPDATED') {
      load()
    }
  })

  async function handleAccept(taskId: string) {
    setActionLoading(taskId)
    setActionError(null)
    try {
      const updated = await acceptTask(token, taskId)
      setTasks((prev) => prev.map((t) => t._id === taskId ? updated : t))
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Could not accept task.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDecline(taskId: string) {
    setActionLoading(`decline-${taskId}`)
    setActionError(null)
    try {
      const updated = await declineTask(token, taskId)
      setTasks((prev) => prev.map((t) => t._id === taskId ? updated : t))
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Could not decline task.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Card className="p-6 md:p-8 bg-surface border-line glow-card">
      <SectionHeading
        title="Field Missions & Transit Tasks"
        description="Assigned disaster relief transport, supply mobilization, and delivery verification tasks."
      />

      {actionError && (
        <div className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3.5 text-sm font-medium text-error" role="alert">
          {actionError}
        </div>
      )}

      {loading ? (
        <p className="mt-8 type-body text-muted">Loading assigned field tasks…</p>
      ) : error ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm font-medium text-error" role="alert">{error}</p>
          <Button variant="secondary" className="h-10 px-4 text-xs font-semibold w-fit" onClick={() => load()}>Retry</Button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="type-card-heading text-content">No active field tasks assigned</p>
          <p className="type-sm text-muted mt-1.5">
            Tasks will be dispatched by accredited NGO coordinators in your sector as relief supplies are matched.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {tasks.map((task) => {
            const busy = actionLoading === task._id || actionLoading === `decline-${task._id}`
            return (
              <li key={task._id}>
                <div className="rounded-xl border border-line bg-surface-raised p-5 md:p-6 transition-all hover:border-orange/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="text-left type-card-heading text-content hover:text-orange transition-colors focus-visible:outline-none"
                    >
                      {task.taskDetails}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={ASSIGNMENT_TONE[task.assignmentStatus] ?? 'neutral'}>
                        {task.assignmentStatus.replace('_', ' ')}
                      </Badge>
                      <Badge tone={DELIVERY_TONE[task.deliveryStatus] ?? 'neutral'}>
                        {task.deliveryStatus.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 type-sm text-muted font-mono">
                    Assigned on: {new Date(task.createdAt).toLocaleString()}
                  </p>

                  {(task.assignmentStatus === 'assigned' || task.assignmentStatus === 'reassigned') && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        variant="primary"
                        className="h-10 px-5 text-sm font-semibold"
                        onClick={() => handleAccept(task._id)}
                        loading={actionLoading === task._id}
                        disabled={busy}
                      >
                        Accept Mission
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-10 px-4 text-sm font-semibold text-error hover:bg-error/10"
                        onClick={() => handleDecline(task._id)}
                        loading={actionLoading === `decline-${task._id}`}
                        disabled={busy}
                      >
                        Decline
                      </Button>
                    </div>
                  )}

                  {task.assignmentStatus === 'accepted' && (
                    <div className="mt-4">
                      <Button
                        variant="secondary"
                        className="h-10 px-5 text-sm font-semibold"
                        onClick={() => onSelectTask(task)}
                      >
                        Log Checkpoints & Proof of Delivery →
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {nextCursor && !loading && (
        <div className="mt-6 pt-4 border-t border-line">
          <Button variant="secondary" className="h-10 px-5 text-sm font-semibold" onClick={() => load(nextCursor)} loading={loadingMore} disabled={loadingMore}>
            Load more tasks
          </Button>
        </div>
      )}
    </Card>
  )
}
