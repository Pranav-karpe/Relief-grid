import { useState, useEffect, useCallback } from 'react'
import { getAdminTasks, type AdminTask } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type Props = { token: string }

function assignmentTone(s: string): 'warning' | 'success' | 'error' | 'neutral' {
  if (s === 'accepted') return 'success'
  if (s === 'assigned' || s === 'reassigned') return 'warning'
  if (s === 'declined' || s === 'cancelled') return 'error'
  return 'neutral'
}

function deliveryTone(s: string): 'warning' | 'info' | 'success' | 'error' | 'neutral' {
  if (s === 'delivered') return 'success'
  if (s === 'in_transit') return 'info'
  if (s === 'pending') return 'warning'
  if (s === 'failed') return 'error'
  return 'neutral'
}

export default function AdminVolunteerOversightSection({ token }: Props) {
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [assignmentStatus, setAssignmentStatus] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null)

  const loadTasks = useCallback((cur?: string) => {
    setLoading(true)
    setError(null)
    getAdminTasks(token, {
      cursor: cur,
      assignmentStatus: assignmentStatus || undefined,
      deliveryStatus: deliveryStatus || undefined,
    })
      .then(({ data, page }) => {
        setTasks(data)
        setNextCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        setError(err instanceof AuthApiError ? err.message : 'Failed to load volunteer tasks.')
      })
      .finally(() => setLoading(false))
  }, [token, assignmentStatus, deliveryStatus])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  return (
    <Card>
      <SectionHeading
        title="Volunteer/Task Oversight"
        description="Monitor field volunteer task assignments, transit checkpoints, and proof-of-delivery references."
      />

      {/* Filter toolbar */}
      <div className="mt-4 flex flex-wrap items-end gap-3 border-b border-line pb-4">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Assignment Status</label>
          <select
            value={assignmentStatus}
            onChange={(e) => { setAssignmentStatus(e.target.value); setSelectedTask(null) }}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
          >
            <option value="">All assignment statuses</option>
            <option value="assigned">Assigned</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
            <option value="reassigned">Reassigned</option>
          </select>
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Delivery Status</label>
          <select
            value={deliveryStatus}
            onChange={(e) => { setDeliveryStatus(e.target.value); setSelectedTask(null) }}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
          >
            <option value="">All delivery statuses</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <Button variant="secondary" onClick={() => loadTasks()}>Refresh</Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Task List */}
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted" aria-live="polite">Loading field tasks…</p>}
          {error && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error">{error}</p>
              <Button variant="outline" onClick={() => loadTasks()}>Retry</Button>
            </div>
          )}

          {!loading && !error && tasks.length === 0 && (
            <p className="text-sm text-muted">No volunteer tasks found matching criteria.</p>
          )}

          {!loading && !error && tasks.map((task) => (
            <button
              key={task._id}
              type="button"
              onClick={() => setSelectedTask(task)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                selectedTask?._id === task._id
                  ? 'border-orange/50 bg-orange/5'
                  : 'border-line bg-surface-raised hover:border-line/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-content truncate">ID: {task._id}</span>
                <div className="flex items-center gap-1.5">
                  <Badge tone={assignmentTone(task.assignmentStatus)}>{task.assignmentStatus}</Badge>
                  <Badge tone={deliveryTone(task.deliveryStatus)}>{task.deliveryStatus}</Badge>
                </div>
              </div>

              <div className="mt-2 text-xs text-muted flex items-center justify-between">
                <span>Volunteer: <strong className="text-content">{task.volunteer?.displayName || 'Unassigned'}</strong></span>
                <span>{new Date(task.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}

          {nextCursor && (
            <div className="pt-2">
              <Button variant="secondary" onClick={() => loadTasks(nextCursor)}>Load more</Button>
            </div>
          )}
        </div>

        {/* Task Detail Pane */}
        <div>
          {!selectedTask ? (
            <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
              Select a task from the list to view field details, checkpoint timeline, and delivery evidence references.
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface-raised p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <p className="text-xs text-muted font-mono">Task ID: {selectedTask._id}</p>
                  <h3 className="text-base font-semibold text-content mt-0.5">Field Dispatch Details</h3>
                </div>
                <div className="flex gap-1.5">
                  <Badge tone={assignmentTone(selectedTask.assignmentStatus)}>{selectedTask.assignmentStatus}</Badge>
                  <Badge tone={deliveryTone(selectedTask.deliveryStatus)}>{selectedTask.deliveryStatus}</Badge>
                </div>
              </div>

              {/* Volunteer Info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded border border-line/50 p-2.5 bg-surface">
                  <p className="text-muted">Assigned Volunteer</p>
                  <p className="font-semibold text-content text-sm mt-0.5">{selectedTask.volunteer?.displayName || '—'}</p>
                  <p className="text-subtle truncate">{selectedTask.volunteer?.email || '—'}</p>
                </div>
                <div className="rounded border border-line/50 p-2.5 bg-surface">
                  <p className="text-muted">Pickup Status</p>
                  <p className="font-semibold text-content text-sm mt-0.5 capitalize">{selectedTask.pickupStatus}</p>
                  <p className="text-subtle">{selectedTask.collectedAt ? new Date(selectedTask.collectedAt).toLocaleTimeString() : 'Not collected'}</p>
                </div>
              </div>

              {/* Task Details & Scope */}
              <div className="text-xs space-y-1">
                <p className="text-muted font-medium">Task Instructions</p>
                <div className="rounded border border-line/50 p-2.5 bg-surface text-content text-xs whitespace-pre-wrap">
                  {selectedTask.taskDetails}
                </div>
              </div>

              {/* Associated Entities */}
              <div className="text-xs space-y-1">
                <p className="text-muted font-medium">Related Records</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded border border-line/40 p-2 bg-surface">
                    <span className="text-subtle">Resource:</span>{' '}
                    <span className="text-content font-medium">{selectedTask.donation?.resourceCategory || 'Donation Item'}</span>
                  </div>
                  <div className="rounded border border-line/40 p-2 bg-surface">
                    <span className="text-subtle">Report:</span>{' '}
                    <span className="text-content font-medium truncate inline-block max-w-[120px]" title={selectedTask.report?.title}>
                      {selectedTask.report?.title || 'Relief Report'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delivery Proof Reference (Accurately labeled) */}
              <div className="text-xs space-y-1">
                <p className="text-muted font-medium">Proof of Delivery Reference</p>
                <div className="rounded border border-line/50 p-2.5 bg-surface">
                  {selectedTask.proofOfDeliveryRef ? (
                    <div>
                      <p className="font-mono text-accent">{selectedTask.proofOfDeliveryRef}</p>
                      <p className="text-[11px] text-muted mt-1">
                        Delivered timestamp: {selectedTask.deliveredAt ? new Date(selectedTask.deliveredAt).toLocaleString() : 'Recorded'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted italic">No delivery evidence reference attached yet.</p>
                  )}
                </div>
              </div>

              {/* Checkpoint Audit History */}
              {selectedTask.history && selectedTask.history.length > 0 && (
                <div className="text-xs space-y-1 border-t border-line pt-3">
                  <p className="text-muted font-medium">Task Transition History</p>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {selectedTask.history.map((h, i) => (
                      <li key={i} className="flex items-start justify-between rounded bg-surface p-2 border border-line/30">
                        <div>
                          <Badge tone="neutral" className="text-[10px]">{h.status}</Badge>
                          {h.reason && <p className="text-muted text-[11px] mt-0.5">{h.reason}</p>}
                        </div>
                        <span className="text-subtle text-[11px]">{new Date(h.changedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
