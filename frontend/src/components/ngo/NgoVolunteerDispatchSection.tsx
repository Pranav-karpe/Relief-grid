import { useState, useEffect, useCallback } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Input from '../ui/Input'
import {
  getNearbyVolunteers,
  createNgoTask,
  type NearbyVolunteer,
} from '../../api/ngo'
import { useLiveSync } from '../../lib/live-sync'

type NgoVolunteerDispatchSectionProps = {
  token: string
  isVerified: boolean
}

type VehicleType = 'any' | 'foot' | 'bicycle' | 'two_wheeler' | 'four_wheeler' | 'truck' | 'boat'

const VEHICLE_LABELS: Record<VehicleType, { label: string; icon: string; capacity: string }> = {
  any: { label: 'Any Vehicle / On Foot', icon: '🚶‍♂️', capacity: 'Standard payload' },
  foot: { label: 'Foot Patrol', icon: '🚶', capacity: 'Up to 10 kg backpack' },
  bicycle: { label: 'Bicycle Messenger', icon: '🚲', capacity: 'Up to 20 kg carrier' },
  two_wheeler: { label: 'Two-Wheeler / Motorbike', icon: '🛵', capacity: 'Up to 45 kg panniers' },
  four_wheeler: { label: 'Automobile / SUV / Van', icon: '🚗', capacity: 'Up to 400 kg cargo' },
  truck: { label: 'Medium / Heavy Relief Truck', icon: '🚛', capacity: 'Bulk freight (>1 ton)' },
  boat: { label: 'Flood Boat / Marine Vessel', icon: '🚤', capacity: 'Water rescue / marsh transit' },
}

export default function NgoVolunteerDispatchSection({
  token,
  isVerified,
}: NgoVolunteerDispatchSectionProps) {
  const [lat, setLat] = useState('28.6139') // Default coordinates (New Delhi reference)
  const [lng, setLng] = useState('77.2090')
  const [radiusKm, setRadiusKm] = useState('10') // Default 10 km strict
  const [volunteers, setVolunteers] = useState<NearbyVolunteer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Enhanced task dispatch modal state
  const [selectedVolunteer, setSelectedVolunteer] = useState<NearbyVolunteer | null>(null)
  const [taskDetails, setTaskDetails] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [reportId, setReportId] = useState('')
  const [quantityTarget, setQuantityTarget] = useState('')
  const [cargoWeightKg, setCargoWeightKg] = useState('')
  const [cargoVolumeM3, setCargoVolumeM3] = useState('')
  const [requiredVehicleType, setRequiredVehicleType] = useState<VehicleType>('any')
  const [safetyCheckInInterval, setSafetyCheckInInterval] = useState('30')
  const [pickupLat, setPickupLat] = useState('')
  const [pickupLng, setPickupLng] = useState('')
  const [destLat, setDestLat] = useState('')
  const [destLng, setDestLng] = useState('')

  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const fetchVolunteers = useCallback(() => {
    if (!token || !isVerified) return
    const nLat = Number(lat)
    const nLng = Number(lng)
    const nRadius = Number(radiusKm)

    if (isNaN(nLat) || isNaN(nLng)) {
      setError('Please provide valid latitude and longitude coordinates.')
      return
    }

    setLoading(true)
    setError(null)

    getNearbyVolunteers(token, {
      lat: nLat,
      lng: nLng,
      radiusKm: isNaN(nRadius) ? 10 : nRadius,
    })
      .then((data) => {
        setVolunteers(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to search nearby volunteers.')
        setLoading(false)
      })
  }, [token, isVerified, lat, lng, radiusKm])

  useEffect(() => {
    if (isVerified) {
      fetchVolunteers()
    }
  }, [isVerified, fetchVolunteers])

  // Live real-time cross-dashboard synchronization
  useLiveSync((event) => {
    if (event.type === 'TASK_ASSIGNED' || event.type === 'DELIVERY_UPDATED') {
      fetchVolunteers()
    }
  })

  function handleOpenDispatch(vol: NearbyVolunteer) {
    setSelectedVolunteer(vol)
    setDispatchError(null)
    setDispatchSuccess(null)
  }

  async function handleDispatchTask(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedVolunteer || !taskDetails.trim()) return

    setDispatchLoading(true)
    setDispatchError(null)
    setDispatchSuccess(null)

    try {
      const payload: Parameters<typeof createNgoTask>[1] = {
        volunteerId: selectedVolunteer._id,
        taskDetails: taskDetails.trim(),
        priority,
        ...(reportId.trim() ? { reportId: reportId.trim() } : {}),
        ...(quantityTarget ? { quantityTarget: Number(quantityTarget) } : {}),
        ...(cargoWeightKg ? { cargoWeightKg: Number(cargoWeightKg) } : {}),
        ...(cargoVolumeM3 ? { cargoVolumeM3: Number(cargoVolumeM3) } : {}),
        requiredVehicleType,
        safetyCheckInInterval: Number(safetyCheckInInterval) || 30,
      }

      if (pickupLat && pickupLng && !isNaN(Number(pickupLat)) && !isNaN(Number(pickupLng))) {
        payload.pickupLocation = { type: 'Point', coordinates: [Number(pickupLng), Number(pickupLat)] }
      }
      if (destLat && destLng && !isNaN(Number(destLat)) && !isNaN(Number(destLng))) {
        payload.destinationLocation = { type: 'Point', coordinates: [Number(destLng), Number(destLat)] }
      }

      await createNgoTask(token, payload)

      setDispatchSuccess(`Mission assignment successfully dispatched to ${selectedVolunteer.displayName}!`)
      setTaskDetails('')
      setReportId('')
      setQuantityTarget('')
      setCargoWeightKg('')
      setCargoVolumeM3('')
      setPickupLat('')
      setPickupLng('')
      setDestLat('')
      setDestLng('')
      setTimeout(() => {
        setSelectedVolunteer(null)
        setDispatchSuccess(null)
        fetchVolunteers()
      }, 1600)
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Failed to dispatch task.')
    } finally {
      setDispatchLoading(false)
    }
  }

  if (!isVerified) {
    return (
      <Card className="p-8 text-center border-warning/30 bg-surface">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning text-2xl mb-4">
          🔒
        </div>
        <h3 className="type-card-heading text-content">Volunteer Discovery Locked</h3>
        <p className="mt-2 type-body text-muted max-w-lg mx-auto">
          Only verified NGOs can search nearby verified volunteers and dispatch field operations. Please complete platform verification to unlock volunteer management.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card className="p-6 bg-surface border-line glow-card">
        <div className="flex flex-col lg:flex-row lg:items-end gap-5 justify-between">
          <div>
            <h3 className="type-card-heading text-content">Field Volunteer Proximity Scanner</h3>
            <p className="type-body text-muted mt-1 max-w-xl">
              Locate active, verified field responders within a strict geospatial radius (default 10 km). Dispatch time-critical relief missions directly with vehicle compatibility checks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-32">
              <Input label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" />
            </div>
            <div className="w-32">
              <Input label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" />
            </div>
            <div className="w-32">
              <Input
                label="Radius (km)"
                type="number"
                min="1"
                max="50"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              className="mt-auto h-[44px] px-5"
              onClick={fetchVolunteers}
              disabled={loading}
            >
              {loading ? 'Scanning…' : 'Scan Sector'}
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-error font-medium">{error}</p>}
      </Card>

      {/* Volunteer Grid */}
      {volunteers.length === 0 && !loading && (
        <Card className="p-10 text-center text-muted type-body border-dashed border-line">
          No verified volunteers found within {radiusKm} km of the specified coordinates. Try expanding the search radius up to 50 km.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {volunteers.map((vol) => (
          <Card key={vol._id} className="p-5 border-line bg-surface hover:border-orange/50 transition-all flex flex-col justify-between glow-card">
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
                <div>
                  <h4 className="type-card-heading text-content">{vol.displayName}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-semibold text-orange">{vol.distanceKm} km away</span>
                    <span className="text-muted/60">•</span>
                    <span className="text-xs text-muted capitalize">{vol.affiliation || 'Independent'}</span>
                  </div>
                </div>
                <Badge tone={vol.availability === 'available' ? 'success' : 'warning'}>
                  {vol.availability}
                </Badge>
              </div>

              <div className="mt-4 space-y-2.5 type-body text-sm">
                <div className="flex justify-between py-1 border-b border-line/60">
                  <span className="text-muted">Verification Status</span>
                  <Badge tone="success">Verified</Badge>
                </div>
                <div className="flex justify-between py-1 border-b border-line/60">
                  <span className="text-muted">Active Workload</span>
                  <span className="font-semibold text-content">{vol.currentWorkload} active tasks</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line/60">
                  <span className="text-muted">Service Radius</span>
                  <span className="font-semibold text-content">{vol.serviceRadiusKm} km</span>
                </div>
                {vol.phone && (
                  <div className="flex justify-between py-1 border-b border-line/60">
                    <span className="text-muted">Direct Contact</span>
                    <span className="font-mono text-content">{vol.phone}</span>
                  </div>
                )}
                {vol.skills.length > 0 && (
                  <div className="pt-1.5">
                    <span className="text-muted block mb-1.5 text-xs font-semibold uppercase tracking-wider">Field Capabilities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {vol.skills.map((s, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs rounded-md bg-surface-raised border border-line text-content font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {vol.experience && (
                  <p className="text-xs text-muted italic line-clamp-2 mt-2 bg-surface-raised p-2 rounded border border-line/60">
                    "{vol.experience}"
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-line">
              <Button
                variant="primary"
                className="w-full h-11 text-sm font-semibold"
                onClick={() => handleOpenDispatch(vol)}
              >
                Dispatch Relief Task →
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Complete Task Dispatch & Volunteer Assignment Modal */}
      {selectedVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 md:p-8 bg-surface border-line glow-card space-y-6 my-auto">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-orange">Mission Coordinator Dispatch</span>
                <h3 className="type-dash-section text-content mt-1">
                  Assign Task to {selectedVolunteer.displayName}
                </h3>
                <p className="type-sm text-muted mt-0.5">
                  Proximity: {selectedVolunteer.distanceKm} km • Active Workload: {selectedVolunteer.currentWorkload} tasks
                </p>
              </div>
              <button
                onClick={() => setSelectedVolunteer(null)}
                className="rounded-lg p-2 text-muted hover:text-content hover:bg-surface-raised transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {dispatchSuccess && (
              <div className="rounded-xl border border-success/30 bg-success/15 p-4 text-sm font-medium text-success flex items-center gap-2">
                <span>✓</span>
                <span>{dispatchSuccess}</span>
              </div>
            )}
            {dispatchError && (
              <div className="rounded-xl border border-error/30 bg-error/15 p-4 text-sm font-medium text-error flex items-center gap-2">
                <span>⚠</span>
                <span>{dispatchError}</span>
              </div>
            )}

            <form onSubmit={handleDispatchTask} className="space-y-5">
              {/* Task Details */}
              <div>
                <label className="type-label block text-content mb-1.5">
                  Mission Directives & Delivery Instructions <span className="text-error">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={taskDetails}
                  onChange={(e) => setTaskDetails(e.target.value)}
                  placeholder="Detail exact pickup location, beneficiary contact, safety perimeter, and specific relief materials to be transported..."
                  className="w-full rounded-xl border border-line bg-surface-raised p-3.5 type-body text-content focus:border-orange focus:ring-1 focus:ring-orange focus:outline-none transition-all placeholder:text-muted/60"
                />
              </div>

              {/* Priority & Vehicle Compatibility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="type-label block text-content mb-1.5">Priority Classification</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full h-[44px] rounded-xl border border-line bg-surface-raised px-3.5 type-body text-content focus:border-orange focus:ring-1 focus:ring-orange focus:outline-none transition-all"
                  >
                    <option value="low">Low Priority (Routine Stocking)</option>
                    <option value="medium">Medium Priority (Standard Distribution)</option>
                    <option value="high">High Priority (Urgent Needs)</option>
                    <option value="critical">Critical / Life Safety (Immediate Response)</option>
                  </select>
                </div>

                <div>
                  <label className="type-label block text-content mb-1.5">Vehicle Compatibility Requirement</label>
                  <select
                    value={requiredVehicleType}
                    onChange={(e) => setRequiredVehicleType(e.target.value as VehicleType)}
                    className="w-full h-[44px] rounded-xl border border-line bg-surface-raised px-3.5 type-body text-content focus:border-orange focus:ring-1 focus:ring-orange focus:outline-none transition-all"
                  >
                    {(Object.keys(VEHICLE_LABELS) as VehicleType[]).map((vKey) => (
                      <option key={vKey} value={vKey}>
                        {VEHICLE_LABELS[vKey].icon} {VEHICLE_LABELS[vKey].label} ({VEHICLE_LABELS[vKey].capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cargo Specs & Safety Interval */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Input
                    label="Target Quantity (Units)"
                    type="number"
                    min="1"
                    value={quantityTarget}
                    onChange={(e) => setQuantityTarget(e.target.value)}
                    placeholder="e.g. 50"
                  />
                </div>
                <div>
                  <Input
                    label="Cargo Weight (kg)"
                    type="number"
                    min="0"
                    step="0.5"
                    value={cargoWeightKg}
                    onChange={(e) => setCargoWeightKg(e.target.value)}
                    placeholder="e.g. 120"
                  />
                </div>
                <div>
                  <Input
                    label="Safety Check-In (mins)"
                    type="number"
                    min="5"
                    max="180"
                    value={safetyCheckInInterval}
                    onChange={(e) => setSafetyCheckInInterval(e.target.value)}
                    placeholder="e.g. 30"
                  />
                </div>
              </div>

              {/* Linked Citizen Report */}
              <div>
                <Input
                  label="Linked Citizen Distress Report ID (Optional)"
                  value={reportId}
                  onChange={(e) => setReportId(e.target.value)}
                  placeholder="Paste 24-character MongoDB Report ID to link tracking timeline"
                />
              </div>

              {/* Geographic Checkpoints (Optional override) */}
              <div className="rounded-xl border border-line bg-surface-raised/50 p-4 space-y-3">
                <span className="type-label block text-content font-medium">Waypoint Coordinates (Optional)</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Input label="Pickup Lat" value={pickupLat} onChange={(e) => setPickupLat(e.target.value)} placeholder="e.g. 28.61" />
                  <Input label="Pickup Lng" value={pickupLng} onChange={(e) => setPickupLng(e.target.value)} placeholder="e.g. 77.21" />
                  <Input label="Dest Lat" value={destLat} onChange={(e) => setDestLat(e.target.value)} placeholder="e.g. 28.65" />
                  <Input label="Dest Lng" value={destLng} onChange={(e) => setDestLng(e.target.value)} placeholder="e.g. 77.23" />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 px-5 type-body"
                  onClick={() => setSelectedVolunteer(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="h-11 px-6 type-body font-semibold shadow-lg shadow-orange/20"
                  disabled={dispatchLoading}
                >
                  {dispatchLoading ? 'Dispatching Mission…' : 'Confirm & Dispatch Mission'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
