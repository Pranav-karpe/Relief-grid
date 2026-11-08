import { useState, useEffect, useCallback } from 'react'
import { AuthApiError } from '../../api/auth'
import { getTaskHistory, type VolunteerTask } from '../../api/volunteer'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const ASSIGNMENT_TONE: Record<string, BadgeTone> = {
  assigned: 'warning', accepted: 'success', declined: 'neutral', cancelled: 'error', reassigned: 'info',
}
const DELIVERY_TONE: Record<string, BadgeTone> = {
  pending: 'neutral', in_transit: 'info', delivered: 'success', failed: 'error',
}

type Props = { token: string }

export default function VolunteerHistorySection({ token }: Props) {
  const [tasks, setTasks] = useState<VolunteerTask[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await getTaskHistory(token, { cursor })
      setTasks((prev) => cursor ? [...prev, ...result.data] : result.data)
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not load history.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  return (
    <Card className="p-6 md:p-8 bg-surface border-line glow-card">
      <SectionHeading title="Mission & Transit History" description="Historical archive of delivered, reconciled, and completed field missions." />

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading history…</p>
      ) : error ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm text-error" role="alert">{error}</p>
          <Button variant="secondary" onClick={() => load()}>Retry</Button>
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No task history yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {tasks.map((task) => (
            <li key={task._id} className="rounded-lg border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-medium text-content">
                  {task.taskDetails.slice(0, 80)}{task.taskDetails.length > 80 ? '…' : ''}
                </span>
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
            </li>
          ))}
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
