import { useState, useEffect } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import {
  getNgoTasks,
  confirmNgoTaskDelivery,
  type NgoTask,
} from '../../api/ngo'

type NgoTasksOversightSectionProps = {
  token: string
  isVerified: boolean
}

export default function NgoTasksOversightSection({
  token,
  isVerified,
}: NgoTasksOversightSectionProps) {
  const [tasks, setTasks] = useState<NgoTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Confirmation modal
  const [actionTask, setActionTask] = useState<NgoTask | null>(null)
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'dispute'>('confirm')
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function loadTasks() {
    if (!token || !isVerified) return
    setLoading(true)
    setError(null)

    getNgoTasks(token)
      .then((data) => {
        setTasks(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load dispatched tasks.')
        setLoading(false)
      })
  }

  useEffect(() => {
    if (isVerified) {
      loadTasks()
    }
  }, [isVerified])

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!actionTask) return

    setActionLoading(true)
    setActionError(null)

    try {
      await confirmNgoTaskDelivery(token, actionTask._id, confirmAction, notes.trim())
      setActionTask(null)
      setNotes('')
      loadTasks()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setActionLoading(false)
    }
  }

  if (!isVerified) {
    return (
      <Card className="p-8 text-center border-warning/30 bg-surface">
        <h3 className="text-base font-semibold text-content">Task Oversight Locked</h3>
        <p className="mt-2 text-xs text-muted max-w-md mx-auto">
          Please complete official NGO verification to dispatch tasks and confirm field deliveries.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-content">Dispatched Volunteer Tasks</h3>
          <p className="text-xs text-muted mt-0.5">
            Monitor real-time progress and perform secondary delivery confirmation to resolve citizen reports.
          </p>
        </div>
        <Button variant="secondary" className="text-xs self-start" onClick={loadTasks} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Tasks'}
        </Button>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {tasks.length === 0 && !loading && (
        <Card className="p-8 text-center text-muted text-xs border-dashed border-line">
          No field tasks dispatched yet. Use the "Find Volunteers" tab to dispatch relief delivery tasks.
        </Card>
      )}

      <div className="space-y-4">
        {tasks.map((task) => {
          const isAwaiting =
            task.confirmationStatus === 'awaiting_confirmation' ||
            task.deliveryStatus === 'delivered_pending_confirmation'

          return (
            <Card key={task._id} className="p-5 border-line bg-surface space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-content">Task #{task._id.slice(-6)}</span>
                    <Badge tone={task.priority === 'critical' ? 'error' : task.priority === 'high' ? 'warning' : 'neutral'}>
                      {task.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Assigned to: <strong className="text-content">{task.volunteer?.displayName}</strong>
                    {task.volunteer?.volunteerProfile?.phone && ` (${task.volunteer.volunteerProfile.phone})`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={task.deliveryStatus === 'delivered' ? 'success' : task.deliveryStatus === 'in_transit' ? 'info' : 'neutral'}>
                    Delivery: {task.deliveryStatus.replace(/_/g, ' ')}
                  </Badge>
                  <Badge tone={task.confirmationStatus === 'confirmed' ? 'success' : task.confirmationStatus === 'disputed' ? 'error' : 'warning'}>
                    NGO Confirmation: {task.confirmationStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted block font-medium mb-1">Task Instructions</span>
                  <p className="text-content leading-relaxed bg-surface-raised p-2.5 rounded border border-line">
                    {task.taskDetails}
                  </p>
                </div>

                {task.report && (
                  <div>
                    <span className="text-muted block font-medium mb-1">Linked Citizen Distress Report</span>
                    <div className="bg-surface-raised p-2.5 rounded border border-line space-y-1">
                      <p className="font-semibold text-content">{task.report.title}</p>
                      <p className="text-muted">
                        Category: <span className="capitalize">{task.report.needCategory}</span> · Urgency: {task.report.urgency}
                      </p>
                      <p className="text-muted">Report Status: <strong className="text-content">{task.report.status}</strong></p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons for NGO Delivery Confirmation */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
                <span className="text-[11px] text-muted">
                  Created {new Date(task.createdAt).toLocaleString()}
                  {task.confirmedAt && ` · Confirmed ${new Date(task.confirmedAt).toLocaleString()}`}
                </span>

                <div className="flex items-center gap-2">
                  {isAwaiting && (
                    <>
                      <Button
                        variant="primary"
                        className="text-xs bg-success hover:bg-success/90"
                        onClick={() => {
                          setActionTask(task)
                          setConfirmAction('confirm')
                        }}
                      >
                        ✓ Confirm Delivery & Resolve Report
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs text-error border-error/30 hover:bg-error/10"
                        onClick={() => {
                          setActionTask(task)
                          setConfirmAction('dispute')
                        }}
                      >
                        Dispute Delivery
                      </Button>
                    </>
                  )}
                  {task.confirmationStatus === 'confirmed' && (
                    <span className="text-xs font-semibold text-success flex items-center gap-1">
                      ✓ Delivery Confirmed & Report Resolved
                    </span>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Confirmation / Dispute Modal */}
      {actionTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md p-6 bg-surface border-line space-y-4">
            <h3 className="text-sm font-semibold text-content">
              {confirmAction === 'confirm' ? 'Confirm Successful Delivery' : 'Dispute Delivery Outcome'}
            </h3>
            <p className="text-xs text-muted">
              {confirmAction === 'confirm'
                ? 'Confirming delivery will mark the field task as delivered, decrement the volunteer workload, and automatically mark the linked citizen report as Resolved.'
                : 'Flagging a delivery dispute records an operational discrepancy for platform administrator review.'}
            </p>

            {actionError && <p className="text-xs text-error">{actionError}</p>}

            <form onSubmit={handleConfirmSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted font-medium mb-1">
                  {confirmAction === 'confirm' ? 'Confirmation Notes (Optional)' : 'Dispute Reason / Observations *'}
                </label>
                <textarea
                  rows={3}
                  required={confirmAction === 'dispute'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter field notes, beneficiary acknowledgement, or delivery discrepancies..."
                  className="w-full rounded-lg border border-line bg-surface-raised p-2.5 text-content text-xs focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setActionTask(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={confirmAction === 'confirm' ? 'primary' : 'secondary'}
                  className={`text-xs ${confirmAction === 'confirm' ? 'bg-success hover:bg-success/90' : 'text-error border-error/30'}`}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : confirmAction === 'confirm' ? 'Confirm Delivery' : 'Record Dispute'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

