import { useState, useEffect, useCallback } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import {
  getNgoTasks,
  confirmNgoTaskDelivery,
  type NgoTask,
} from '../../api/ngo'
import { useLiveSync } from '../../lib/live-sync'

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
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'in_transit' | 'confirmed'>('all')

  // Confirmation modal
  const [actionTask, setActionTask] = useState<NgoTask | null>(null)
  const [confirmAction, setConfirmAction] = useState<'confirm' | 'dispute'>('confirm')
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadTasks = useCallback(() => {
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
  }, [token, isVerified])

  useEffect(() => {
    if (isVerified) {
      loadTasks()
    }
  }, [isVerified, loadTasks])

  // Live real-time sync when volunteers update check-ins, transit, or delivery
  useLiveSync((event) => {
    if (event.type === 'DELIVERY_UPDATED' || event.type === 'TASK_ASSIGNED' || event.type === 'DELIVERY_CONFIRMED') {
      loadTasks()
    }
  })

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
        <h3 className="type-card-heading text-content">Task Oversight Locked</h3>
        <p className="mt-2 type-body text-muted max-w-md mx-auto">
          Please complete official NGO verification to dispatch tasks and confirm field deliveries.
        </p>
      </Card>
    )
  }

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'awaiting') {
      return t.confirmationStatus === 'awaiting_confirmation' || t.deliveryStatus === 'delivered_pending_confirmation'
    }
    if (filter === 'in_transit') {
      return t.deliveryStatus === 'in_transit' || t.pickupStatus === 'collected'
    }
    if (filter === 'confirmed') {
      return t.confirmationStatus === 'confirmed'
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="type-dash-section text-content">Field Tasks & Delivery Oversight</h3>
          <p className="type-body text-muted mt-0.5">
            Monitor real-time progress and perform secondary delivery confirmation to resolve citizen distress reports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-surface-raised p-1 border border-line">
            {(['all', 'awaiting', 'in_transit', 'confirmed'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  filter === tab ? 'bg-orange text-white shadow-xs' : 'text-muted hover:text-content'
                }`}
              >
                {tab === 'awaiting' ? 'Awaiting NGO Confirmation' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="h-[38px] px-4 text-xs font-semibold" onClick={loadTasks} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-error font-medium">{error}</p>}

      {filteredTasks.length === 0 && !loading && (
        <Card className="p-10 text-center text-muted type-body border-dashed border-line">
          No field tasks found under the selected view. Dispatched volunteer assignments will appear here with live transit updates.
        </Card>
      )}

      <div className="space-y-4">
        {filteredTasks.map((task) => {
          const isAwaiting =
            task.confirmationStatus === 'awaiting_confirmation' ||
            task.deliveryStatus === 'delivered_pending_confirmation'

          return (
            <Card key={task._id} className="p-6 border-line bg-surface space-y-4 glow-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="type-card-heading text-content">Task #{task._id.slice(-6).toUpperCase()}</span>
                    <Badge tone={task.priority === 'critical' ? 'error' : task.priority === 'high' ? 'warning' : 'neutral'}>
                      {task.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="type-body text-sm text-muted mt-1.5">
                    Assigned Field Volunteer: <strong className="text-content">{task.volunteer?.displayName}</strong>
                    {task.volunteer?.volunteerProfile?.phone && (
                      <span className="ml-2 font-mono text-xs text-orange">({task.volunteer.volunteerProfile.phone})</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={task.deliveryStatus === 'delivered' ? 'success' : task.deliveryStatus === 'in_transit' ? 'info' : 'neutral'}>
                    Delivery: {task.deliveryStatus.replace(/_/g, ' ')}
                  </Badge>
                  <Badge tone={task.confirmationStatus === 'confirmed' ? 'success' : task.confirmationStatus === 'disputed' ? 'error' : 'warning'}>
                    NGO Status: {task.confirmationStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="type-label block text-muted mb-1">Operational Instructions</span>
                  <p className="type-body text-content leading-relaxed bg-surface-raised p-3.5 rounded-xl border border-line">
                    {task.taskDetails}
                  </p>
                </div>

                {task.report ? (
                  <div>
                    <span className="type-label block text-muted mb-1">Linked Citizen Distress Report</span>
                    <div className="bg-surface-raised p-3.5 rounded-xl border border-line space-y-1.5 type-body text-sm">
                      <p className="font-bold text-content">{task.report.title}</p>
                      <p className="text-muted">
                        Category: <span className="capitalize text-content font-medium">{task.report.needCategory}</span> • Urgency: <span className="capitalize text-content font-medium">{task.report.urgency}</span>
                      </p>
                      <p className="text-muted">
                        Report Lifecycle: <strong className="text-orange capitalize">{task.report.status}</strong>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-line/60 bg-surface-raised/40 p-4">
                    <span className="type-sm text-muted">Direct agency field task (unlinked to citizen report)</span>
                  </div>
                )}
              </div>

              {/* Delivery Proof & Proxy Verification Banner */}
              {((task.proofOfDelivery?.proofType !== undefined && task.proofOfDelivery?.proofType !== 'none') ||
                task.proxyHandover?.isProxy ||
                task.quantityDelivered !== undefined) && (
                <div className="bg-surface-raised rounded-xl border border-line/80 p-3.5 space-y-1.5">
                  <span className="type-label block text-xs font-bold uppercase tracking-wider text-muted">Verification Proof Telemetry</span>
                  <div className="flex flex-wrap items-center gap-4 type-body text-sm text-content">
                    {task.proofOfDelivery?.proofType && task.proofOfDelivery.proofType !== 'none' && (
                      <span className="text-emerald-400 font-medium">
                        📄 POD Proof: {task.proofOfDelivery.proofType} {task.proofOfDelivery.signatureData ? `(${task.proofOfDelivery.signatureData})` : ''}
                      </span>
                    )}
                    {task.proxyHandover?.isProxy && (
                      <span className="text-sky-400 font-medium">
                        🤝 Proxy Handover: {task.proxyHandover.recipientName} ({task.proxyHandover.recipientType.replace(/_/g, ' ')})
                      </span>
                    )}
                    {task.quantityDelivered !== undefined && (
                      <span className="text-zinc-300 font-medium">
                        📦 Delivered: {task.quantityDelivered} {task.quantityTarget ? `/ ${task.quantityTarget}` : ''} units
                        {task.quantityRemaining !== undefined && task.quantityRemaining > 0 && (
                          <span className="text-amber-400 ml-1.5 font-semibold">
                            ({task.quantityRemaining} units remaining - {task.discrepancyReason || 'partial'})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons for NGO Delivery Confirmation */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
                <span className="type-sm text-muted">
                  Dispatched {new Date(task.createdAt).toLocaleString()}
                  {task.confirmedAt && ` • Confirmed ${new Date(task.confirmedAt).toLocaleString()}`}
                </span>

                <div className="flex items-center gap-3">
                  {isAwaiting && (
                    <>
                      <Button
                        variant="primary"
                        className="h-10 px-5 text-sm bg-success hover:bg-success/90 font-semibold"
                        onClick={() => {
                          setActionTask(task)
                          setConfirmAction('confirm')
                        }}
                      >
                        ✓ Confirm Delivery & Resolve Report
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-10 px-4 text-sm text-error border-error/30 hover:bg-error/10 font-semibold"
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
                    <span className="type-body text-sm font-bold text-success flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-success"></span>
                      Delivery Confirmed & Citizen Report Resolved
                    </span>
                  )}
                  {task.confirmationStatus === 'disputed' && (
                    <span className="type-body text-sm font-bold text-error flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-error"></span>
                      Delivery Disputed — Under Admin Audit
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg p-6 md:p-8 bg-surface border-line glow-card space-y-5">
            <h3 className="type-dash-section text-content">
              {confirmAction === 'confirm' ? 'Confirm Successful Delivery' : 'Dispute Delivery Outcome'}
            </h3>
            <p className="type-body text-muted">
              {confirmAction === 'confirm'
                ? 'Confirming delivery marks the field task as delivered, releases volunteer workload, and automatically transitions the linked citizen distress report to Resolved.'
                : 'Flagging a delivery dispute records an operational discrepancy in the audit log for platform administrator intervention.'}
            </p>

            {actionError && (
              <div className="rounded-xl border border-error/30 bg-error/15 p-3 text-sm text-error">
                {actionError}
              </div>
            )}

            <form onSubmit={handleConfirmSubmit} className="space-y-4">
              <div>
                <label className="type-label block text-content mb-1.5">
                  {confirmAction === 'confirm' ? 'Confirmation Notes (Optional)' : 'Dispute Reason / Field Observations *'}
                </label>
                <textarea
                  rows={3}
                  required={confirmAction === 'dispute'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record delivery acknowledgment, field condition observations, or quantity variations..."
                  className="w-full rounded-xl border border-line bg-surface-raised p-3.5 type-body text-content focus:border-orange focus:ring-1 focus:ring-orange focus:outline-none transition-all placeholder:text-muted/60"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 px-4 type-body"
                  onClick={() => setActionTask(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={confirmAction === 'confirm' ? 'primary' : 'secondary'}
                  className={`h-10 px-5 type-body font-semibold ${
                    confirmAction === 'confirm' ? 'bg-success hover:bg-success/90' : 'text-error border-error/30'
                  }`}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing…' : confirmAction === 'confirm' ? 'Confirm Delivery' : 'Record Dispute'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
