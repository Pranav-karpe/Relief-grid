import { useState } from 'react'
import { AuthApiError } from '../../api/auth'
import {
  updateProgress,
  declineTask,
  checkInTask,
  releaseTask,
  type VolunteerTask,
  type PickupStatus,
  type DeliveryStatus,
  type ProgressInput,
} from '../../api/volunteer'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'
import LocationMap from '../ui/LocationMap'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const ASSIGNMENT_TONE: Record<string, BadgeTone> = {
  assigned: 'warning',
  accepted: 'success',
  declined: 'neutral',
  cancelled: 'error',
  reassigned: 'info',
}
const PICKUP_TONE: Record<string, BadgeTone> = {
  pending: 'neutral',
  collected: 'success',
  failed: 'error',
}
const DELIVERY_TONE: Record<string, BadgeTone> = {
  pending: 'neutral',
  in_transit: 'info',
  delivered_pending_confirmation: 'warning',
  delivered: 'success',
  failed: 'error',
}

const PICKUP_NEXT: Record<string, PickupStatus[]> = {
  pending: ['collected', 'failed'],
  collected: [],
  failed: [],
}
const DELIVERY_NEXT: Record<string, DeliveryStatus[]> = {
  pending: ['in_transit'],
  in_transit: ['delivered', 'failed'],
  delivered_pending_confirmation: [],
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
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Delivery proof fields
  const [proofType, setProofType] = useState<'signature' | 'photo' | 'receipt'>('signature')
  const [proofRef, setProofRef] = useState('')
  const [signatureName, setSignatureName] = useState('')

  // Proxy handover fields
  const [isProxy, setIsProxy] = useState(false)
  const [proxyRecipientType, setProxyRecipientType] = useState<
    'primary_recipient' | 'proxy_coordinator' | 'community_shelter_lead' | 'family_member' | 'local_authority'
  >('proxy_coordinator')
  const [proxyName, setProxyName] = useState('')
  const [proxyPhone, setProxyPhone] = useState('')
  const [proxyReason, setProxyReason] = useState('')

  // Partial delivery / discrepancy fields
  const [deliveredQuantity, setDeliveredQuantity] = useState<string>(
    task.quantityTarget !== undefined ? String(task.quantityTarget) : '',
  )
  const [discrepancyReason, setDiscrepancyReason] = useState('none')
  const [discrepancyNotes, setDiscrepancyNotes] = useState('')

  // Decline & release modal states
  const [declineConfirm, setDeclineConfirm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [releaseConfirm, setReleaseConfirm] = useState(false)
  const [releaseReason, setReleaseReason] = useState('')

  async function handleProgress(pickupStatus?: PickupStatus, deliveryStatus?: DeliveryStatus) {
    setLoading(true)
    setError(null)
    setSuccessNotice(null)
    try {
      const input: ProgressInput = {}
      if (pickupStatus) input.pickupStatus = pickupStatus
      if (deliveryStatus) input.deliveryStatus = deliveryStatus

      if (deliveryStatus === 'delivered') {
        if (proofRef.trim()) input.proofOfDeliveryRef = proofRef.trim()

        input.proofOfDelivery = {
          proofType,
          signatureData: signatureName ? `Digital acknowledgement: ${signatureName.trim()}` : undefined,
          photoUrl: proofType === 'photo' ? proofRef.trim() : undefined,
          receiptUrl: proofType === 'receipt' ? proofRef.trim() : undefined,
        }

        if (isProxy) {
          input.proxyHandover = {
            isProxy: true,
            recipientType: proxyRecipientType,
            recipientName: proxyName.trim(),
            recipientPhone: proxyPhone.trim(),
            reason: proxyReason.trim(),
          }
        }

        if (deliveredQuantity.trim()) {
          input.quantityDelivered = Number(deliveredQuantity)
          input.discrepancyReason = discrepancyReason
          input.discrepancyNotes = discrepancyNotes.trim()
        }
      }

      const updated = await updateProgress(token, task._id, input)
      setTask(updated)
      onUpdated(updated)
      setSuccessNotice('Task status updated successfully.')
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not update progress.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSafetyCheckIn() {
    setLoading(true)
    setError(null)
    setSuccessNotice(null)
    try {
      const updated = await checkInTask(token, task._id, {
        note: 'Field Safety Check-in OK',
      })
      setTask(updated)
      onUpdated(updated)
      setSuccessNotice('Safety check-in recorded. NGO coordinators notified.')
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not record check-in.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReleaseTask() {
    setLoading(true)
    setError(null)
    setSuccessNotice(null)
    try {
      const updated = await releaseTask(token, task._id, releaseReason.trim() || 'Breakdown / hazard release')
      setTask(updated)
      onUpdated(updated)
      setReleaseConfirm(false)
      setSuccessNotice('Task released. NGO coordinators alerted for re-dispatch.')
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not release task.')
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
  const isEnRoute = task.assignmentStatus === 'accepted' && (task.pickupStatus === 'collected' || task.deliveryStatus === 'in_transit')

  return (
    <Card className="p-6 md:p-8 bg-surface border-line glow-card">
      <div className="mb-4">
        <button
          type="button"
          onClick={onBack}
          className="type-body text-sm text-muted hover:text-orange transition-colors flex items-center gap-1.5 font-medium"
        >
          <span>←</span> Back to tasks
        </button>
      </div>

      <SectionHeading
        title="Delivery Task Details"
        supportingContent={
          <div className="flex flex-wrap gap-2">
            <Badge tone={ASSIGNMENT_TONE[task.assignmentStatus] ?? 'neutral'}>
              {task.assignmentStatus.replace('_', ' ')}
            </Badge>
            {task.confirmationStatus && (
              <Badge
                tone={
                  task.confirmationStatus === 'confirmed'
                    ? 'success'
                    : task.confirmationStatus === 'disputed'
                    ? 'error'
                    : 'warning'
                }
              >
                {task.confirmationStatus.replace('_', ' ')}
              </Badge>
            )}
          </div>
        }
      />

      {error && (
        <p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {successNotice && (
        <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {successNotice}
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
              <dd>
                <Badge tone={PICKUP_TONE[task.pickupStatus] ?? 'neutral'}>
                  {task.pickupStatus.replace('_', ' ')}
                </Badge>
              </dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Delivery status</dt>
              <dd>
                <Badge tone={DELIVERY_TONE[task.deliveryStatus] ?? 'neutral'}>
                  {task.deliveryStatus.replace('_', ' ')}
                </Badge>
              </dd>
            </div>

            {task.quantityTarget !== undefined && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Target quantity</dt>
                <dd className="text-content font-medium">{task.quantityTarget} units</dd>
              </div>
            )}

            {task.quantityDelivered !== undefined && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Delivered</dt>
                <dd className="text-content font-medium">
                  {task.quantityDelivered} units
                  {task.quantityRemaining !== undefined && task.quantityRemaining > 0 && (
                    <span className="text-warning ml-2 font-normal">
                      ({task.quantityRemaining} unfulfilled - {task.discrepancyReason || 'partial'})
                    </span>
                  )}
                </dd>
              </div>
            )}

            {task.proxyHandover?.isProxy && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Proxy Handover</dt>
                <dd className="text-content text-xs">
                  {task.proxyHandover.recipientName} ({task.proxyHandover.recipientType.replace('_', ' ')})
                  {task.proxyHandover.recipientPhone ? ` • ${task.proxyHandover.recipientPhone}` : ''}
                </dd>
              </div>
            )}

            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Coordinates</dt>
              <dd className="font-mono text-xs text-content">
                [{task.assignedLocation.coordinates[1].toFixed(4)}, {task.assignedLocation.coordinates[0].toFixed(4)}]
              </dd>
            </div>

            {task.safetyCheckIn?.lastCheckInAt && (
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <dt className="text-muted">Last safety check</dt>
                <dd className="text-xs text-emerald-400 font-medium">
                  {new Date(task.safetyCheckIn.lastCheckInAt).toLocaleTimeString()}
                </dd>
              </div>
            )}
          </dl>

          {/* Safety check-in and emergency release bar for active deliveries */}
          {isEnRoute && (
            <div className="rounded-xl border border-line bg-surface-raised p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-content uppercase tracking-wider">Field Safety & Resilience</p>
                <p className="text-xs text-muted">Periodic check-in confirms safe transit to dispatch coordinators.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs h-8" onClick={handleSafetyCheckIn} loading={loading} disabled={loading}>
                  🛡️ Record Check-in
                </Button>
                <Button variant="danger" className="text-xs h-8" onClick={() => setReleaseConfirm(true)} disabled={loading}>
                  Breakdown / Release
                </Button>
              </div>
            </div>
          )}

          {releaseConfirm && (
            <div className="rounded-xl border border-error/30 bg-error/10 p-4 space-y-3">
              <p className="text-sm font-medium text-error">Emergency Task Release</p>
              <p className="text-xs text-muted">
                Experienced a vehicle breakdown, flooded route, or urgent hazard? Releasing alerts the dispatch NGO immediately so supplies can be re-routed without blocking relief.
              </p>
              <Input
                label="Reason for release"
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                placeholder="e.g. Flat tire on Highway 8, road submerged by flash flood"
                maxLength={1000}
              />
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleReleaseTask} loading={loading} disabled={loading}>
                  Confirm Emergency Release
                </Button>
                <Button variant="ghost" onClick={() => setReleaseConfirm(false)} disabled={loading}>
                  Keep Task
                </Button>
              </div>
            </div>
          )}

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
                <div className="space-y-4 pt-2 border-t border-line/60">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-muted uppercase">Delivery:</span>
                    {deliveryNext.map((s) => (
                      <Button
                        key={s}
                        variant={s === 'delivered' ? 'primary' : 'secondary'}
                        onClick={() => handleProgress(undefined, s)}
                        loading={loading}
                        disabled={loading}
                      >
                        Mark {s.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>

                  {deliveryNext.includes('delivered') && (
                    <div className="rounded-lg border border-line/70 bg-surface/50 p-4 space-y-3">
                      <p className="text-xs font-semibold text-content uppercase tracking-wider">
                        Delivery Evidence & Proxy Options
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="grid gap-1">
                          <label className="text-xs font-medium text-muted">Proof Type</label>
                          <select
                            value={proofType}
                            onChange={(e) => setProofType(e.target.value as any)}
                            className="min-h-9 rounded-lg border border-line bg-surface-raised px-2.5 text-xs text-content focus:border-accent focus:outline-none"
                          >
                            <option value="signature">Digital Signature / Acknowledgement</option>
                            <option value="photo">Delivery Site Photo URL</option>
                            <option value="receipt">Physical Transfer Receipt Ref</option>
                          </select>
                        </div>

                        {proofType === 'signature' ? (
                          <Input
                            label="Recipient Name / Signature Ack"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            placeholder="e.g. Ramesh Patil (Beneficiary)"
                            maxLength={120}
                          />
                        ) : (
                          <Input
                            label="Proof Reference / URL"
                            value={proofRef}
                            onChange={(e) => setProofRef(e.target.value)}
                            placeholder={proofType === 'photo' ? 'Photo URL or storage key' : 'Paper receipt serial number'}
                            maxLength={500}
                          />
                        )}
                      </div>

                      {/* Partial delivery fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <Input
                          label="Actual Quantity Delivered"
                          type="number"
                          value={deliveredQuantity}
                          onChange={(e) => setDeliveredQuantity(e.target.value)}
                          placeholder="e.g. 50"
                          min="0"
                        />
                        {task.quantityTarget !== undefined &&
                          Number(deliveredQuantity) < task.quantityTarget && (
                            <>
                              <div className="grid gap-1">
                                <label className="text-xs font-medium text-warning">Discrepancy Reason</label>
                                <select
                                  value={discrepancyReason}
                                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                                  className="min-h-9 rounded-lg border border-warning/50 bg-surface-raised px-2.5 text-xs text-content focus:border-warning focus:outline-none"
                                >
                                  <option value="none">Select reason for shortage</option>
                                  <option value="damaged_in_transit">Damaged in Transit</option>
                                  <option value="partial_recipient_capacity">Recipient Partial Storage Capacity</option>
                                  <option value="shortage_at_pickup">Shortage at Donor/Warehouse</option>
                                  <option value="transport_capacity_limit">Transport Capacity Limit</option>
                                  <option value="other">Other Reason</option>
                                </select>
                              </div>
                              <Input
                                label="Discrepancy Notes"
                                value={discrepancyNotes}
                                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                                placeholder="Explain damage or shortage notes"
                                maxLength={1000}
                              />
                            </>
                          )}
                      </div>

                      {/* Proxy Handover Checkbox */}
                      <div className="pt-2 border-t border-line/40">
                        <label className="flex items-center gap-2 text-xs text-content cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isProxy}
                            onChange={(e) => setIsProxy(e.target.checked)}
                            className="rounded border-line bg-surface-raised text-accent focus:ring-accent/30"
                          />
                          <span className="font-medium">Handover to Proxy / Community Representative</span>
                        </label>

                        {isProxy && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-surface-raised/60 p-3 rounded-lg border border-line/60">
                            <div>
                              <label className="text-[11px] text-muted">Representative Role</label>
                              <select
                                value={proxyRecipientType}
                                onChange={(e) => setProxyRecipientType(e.target.value as any)}
                                className="w-full mt-1 min-h-8 rounded border border-line bg-surface px-2 text-xs text-content"
                              >
                                <option value="proxy_coordinator">Local Coordinator</option>
                                <option value="community_shelter_lead">Community Shelter Lead</option>
                                <option value="family_member">Family Member</option>
                                <option value="local_authority">Local Authority / Ward Officer</option>
                              </select>
                            </div>
                            <Input
                              label="Proxy Full Name"
                              value={proxyName}
                              onChange={(e) => setProxyName(e.target.value)}
                              placeholder="e.g. Suresh Kumar"
                            />
                            <Input
                              label="Proxy Contact Phone"
                              value={proxyPhone}
                              onChange={(e) => setProxyPhone(e.target.value)}
                              placeholder="+91 98765 43210"
                            />
                            <div className="md:col-span-3">
                              <Input
                                label="Proxy Handover Reason"
                                value={proxyReason}
                                onChange={(e) => setProxyReason(e.target.value)}
                                placeholder="e.g. Primary citizen receiving medical attention or relocated"
                                maxLength={500}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Decline action */}
          {canDecline && !declineConfirm && (
            <div className="pt-2">
              <Button variant="danger" onClick={() => setDeclineConfirm(true)} disabled={loading}>
                Decline Task
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
                  Confirm Decline
                </Button>
                <Button variant="ghost" onClick={() => setDeclineConfirm(false)} disabled={loading}>
                  Keep Task
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <LocationMap
            markers={[
              {
                id: task._id,
                coordinates: task.assignedLocation.coordinates as [number, number],
                label: 'Assigned Target Location',
                detail: task.taskDetails,
                tone: task.deliveryStatus === 'delivered' ? 'default' : 'warning',
              },
            ]}
            height={320}
            listHeading="Target destination"
          />
        </div>
      </div>
    </Card>
  )
}
