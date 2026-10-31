import { useState } from 'react'
import { AuthApiError } from '../../api/auth'
import { updateProgress, declineTask, type VolunteerTask, type PickupStatus, type DeliveryStatus } from '../../api/volunteer'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import LocationMap from '../ui/LocationMap'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const ASSIGNMENT_TONE: Record<string, BadgeTone> = {
  assigned: 'warning', accepted: 'success', declined: 'neutral', cancelled: 'error', reassigned: 'info',
}
const PICKUP_TONE: Record<string, BadgeTone> = {
  pending: 'neutral', collected: 'success', failed: 'error',
}
const DELIVERY_TONE: Record<string, BadgeTone> = {
  pending: 'neutral', in_transit: 'info', delivered: 'success', failed: 'error',
}

// Valid next transitions for volunteer
const PICKUP_NEXT: Record<string, PickupStatus[]> = {
  pending: ['collected', 'failed'],
  collected: [],
  failed: [],
}
const DELIVERY_NEXT: Record<string, DeliveryStatus[]> = {
  pending: ['in_transit'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
}

type Props = {
  token: string
  task: VolunteerTask
  onBack: () => void
  onUpdated: (task: VolunteerTask) => void
}

export default function VolunteerTaskDetail({ token, task: initialTask, onBack, onUpdated }: Props) {
  const [task, setTask] = useState(initialTask)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proofRef, setProofRef] = useState('')
  const [declineConfirm, setDeclineConfirm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  async function handleProgress(pickupStatus?: PickupStatus, deliveryStatus?: DeliveryStatus) {
    setLoading(true)
    setError(null)
    try {
      const input: { pickupStatus?: PickupStatus; deliveryStatus?: DeliveryStatus; proofOfDeliveryRef?: string } = {}
      if (pickupStatus) input.pickupStatus = pickupStatus
      if (deliveryStatus) input.deliveryStatus = deliveryStatus
      if (deliveryStatus === 'delivered' && proofRef.trim()) input.proofOfDeliveryRef = proofRef.trim()
      const updated = await updateProgress(token, task._id, input)
      setTask(updated)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not update progress.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDecline() {
    setLoading(true)
    setError(null)
    try {
      const updated = await declineTask(token, task._id, declineReason.trim() || undefined)
      setTask(updated)
      onUpdated(updated)
      setDeclineConfirm(false)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not decline task.')
    } finally {
      setLoading(false)
    }
  }

  const pickupNext = PICKUP_NEXT[task.pickupStatus] ?? []
  const deliveryNext = DELIVERY_NEXT[task.deliveryStatus] ?? []
  const canProgress = task.assignmentStatus === 'accepted' && (pickupNext.length > 0 || deliveryNext.length > 0)
  const canDecline = task.assignmentStatus === 'assigned' || task.assignmentStatus === 'reassigned'

  return (
    <Card>
      <div className="mb-4">
        <button type="button" onClick={onBack} className="text-sm text-muted hover:text-content transition-colors">
          ← Back to tasks
        </button>
      </div>

      <SectionHeading
        title="Task details"
        supportingContent={
          <div className="flex flex-wrap gap-2">
            <Badge tone={ASSIGNMENT_TONE[task.assignmentStatus] ?? 'neutral'}>
              {task.assignmentStatus.replace('_', ' ')}
            </Badge>
          </div>
        }
      />

      {error && (
        <p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-5">
          <dl className="grid gap-3 rounded-xl border border-line bg-surface-raised p-5 text-sm">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Task details</dt>
              <dd className="text-content font-medium">{task.taskDetails}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Pickup status</dt>
              <dd><Badge tone={PICKUP_TONE[task.pickupStatus] ?? 'neutral'}>{task.pickupStatus.replace('_', ' ')}</Badge></dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Delivery status</dt>
              <dd><Badge tone={DELIVERY_TONE[task.deliveryStatus] ?? 'neutral'}>{task.deliveryStatus.replace('_', ' ')}</Badge></dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Coordinates</dt>
              <dd className="font-mono text-xs text-content">
                [{task.assignedLocation.coordinates[1].toFixed(4)}, {task.assignedLocation.coordinates[0].toFixed(4)}]
              </dd>
            </div>
            {task.acceptedAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Accepted</dt>
                <dd className="text-content">{new Date(task.acceptedAt).toLocaleDateString()}</dd>
              </div>
            )}
            {task.collectedAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Collected</dt>
                <dd className="text-content">{new Date(task.collectedAt).toLocaleDateString()}</dd>
              </div>
            )}
            {task.deliveredAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Delivered</dt>
                <dd className="text-content">{new Date(task.deliveredAt).toLocaleDateString()}</dd>
              </div>
            )}
            {task.proofOfDeliveryRef && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Proof ref</dt>
                <dd className="text-content font-mono">{task.proofOfDeliveryRef}</dd>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Assigned</dt>
              <dd className="text-content">{new Date(task.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>

          {/* Progress actions */}
          {canProgress && (
            <div className="rounded-xl border border-line bg-surface-raised p-5 space-y-4">
              <p className="text-sm font-semibold text-content">Update Task Progress</p>

              {pickupNext.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-medium text-muted uppercase">Pickup:</span>
                  {pickupNext.map((s) => (
                    <Button key={s} variant="secondary" onClick={() => handleProgress(s)} loading={loading} disabled={loading}>
                      Mark {s.replace('_', ' ')}
                    </Button>
                  ))}
                </div>
              )}

              {deliveryNext.length > 0 && (
                <div className="space-y-3 pt-1 border-t border-line/60">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-muted uppercase">Delivery:</span>
                    {deliveryNext.map((s) => (
                      <Button key={s} variant="secondary" onClick={() => handleProgress(undefined, s)} loading={loading} disabled={loading}>
                        Mark {s.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                  {deliveryNext.includes('delivered') && (
                    <Input
                      label="Proof of delivery reference (optional)"
                      value={proofRef}
                      onChange={(e) => setProofRef(e.target.value)}
                      placeholder="Receipt number, recipient contact, or transfer reference ID"
                      maxLength={500}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Decline action */}
          {canDecline && !declineConfirm && (
            <div className="pt-2">
              <Button variant="danger" onClick={() => setDeclineConfirm(true)} disabled={loading}>
                Decline task
              </Button>
            </div>
          )}

          {canDecline && declineConfirm && (
            <div className="rounded-xl border border-error/30 bg-error/10 p-4 space-y-3">
              <p className="text-sm font-medium text-error">Confirm Task Decline</p>
              <Input
                label="Reason for declining (optional)"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Area inaccessible, vehicle breakdown, conflicting schedule"
                maxLength={1000}
              />
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleDecline} loading={loading} disabled={loading}>
                  Confirm decline
                </Button>
                <Button variant="ghost" onClick={() => setDeclineConfirm(false)} disabled={loading}>
                  Keep task
                </Button>
              </div>
            </div>
          )}

          {task.assignmentStatus === 'declined' && (
            <p className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-muted">This task has been declined. A coordinator may reassign it.</p>
          )}
          {task.assignmentStatus === 'cancelled' && (
            <p className="rounded-lg border border-line bg-surface-raised p-3 text-sm text-muted">This task has been cancelled.</p>
          )}
          {task.deliveryStatus === 'delivered' && (
            <p className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
              ✓ Delivery submitted. Independent confirmation by the responsible NGO coordinator verifies completion.
            </p>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <LocationMap
            markers={[{
              id: task._id,
              coordinates: task.assignedLocation.coordinates as [number, number],
              label: 'Assigned Target Location',
              detail: task.taskDetails,
              tone: task.deliveryStatus === 'delivered' ? 'default' : 'warning',
            }]}
            height={320}
            listHeading="Target destination"
          />
        </div>
      </div>
    </Card>
  )
}
