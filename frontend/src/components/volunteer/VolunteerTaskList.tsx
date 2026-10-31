import { useState, useEffect, useCallback } from 'react'
import { AuthApiError } from '../../api/auth'
import { getMyTasks, acceptTask, declineTask, type VolunteerTask } from '../../api/volunteer'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

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
    <Card>
      <SectionHeading title="My tasks" description="Tasks assigned to you by coordinators." />

      {actionError && (
        <p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading tasks…</p>
      ) : error ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm text-error" role="alert">{error}</p>
          <Button variant="secondary" onClick={() => load()}>Retry</Button>
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No tasks assigned yet. Tasks are assigned by coordinators when donations are matched to requirements.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {tasks.map((task) => {
            const busy = actionLoading === task._id || actionLoading === `decline-${task._id}`
            return (
              <li key={task._id}>
                <div className="rounded-lg border border-line bg-surface-raised p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="text-left font-medium text-content hover:text-accent transition-colors focus-visible:outline-none"
                    >
                      {task.taskDetails.slice(0, 80)}{task.taskDetails.length > 80 ? '…' : ''}
                    </button>
                    <div className="flex gap-2">
                      <Badge tone={ASSIGNMENT_TONE[task.assignmentStatus] ?? 'neutral'}>
                        {task.assignmentStatus.replace('_', ' ')}
                      </Badge>
                      <Badge tone={DELIVERY_TONE[task.deliveryStatus] ?? 'neutral'}>
                        {task.deliveryStatus.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{new Date(task.createdAt).toLocaleDateString()}</p>

                  {(task.assignmentStatus === 'assigned' || task.assignmentStatus === 'reassigned') && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="primary"
                        onClick={() => handleAccept(task._id)}
                        loading={actionLoading === task._id}
                        disabled={busy}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => handleDecline(task._id)}
                        loading={actionLoading === `decline-${task._id}`}
                        disabled={busy}
                      >
                        Decline
                      </Button>
                    </div>
                  )}

                  {task.assignmentStatus === 'accepted' && (
                    <div className="mt-3">
                      <Button variant="secondary" onClick={() => onSelectTask(task)}>
                        Update progress
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
        <div className="mt-4">
          <Button variant="secondary" onClick={() => load(nextCursor)} loading={loadingMore} disabled={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  )
}
