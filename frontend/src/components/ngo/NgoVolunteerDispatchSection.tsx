import { useState, useEffect } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Input from '../ui/Input'
import {
  getNearbyVolunteers,
  createNgoTask,
  type NearbyVolunteer,
} from '../../api/ngo'

type NgoVolunteerDispatchSectionProps = {
  token: string
  isVerified: boolean
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

  // Task dispatch modal state
  const [selectedVolunteer, setSelectedVolunteer] = useState<NearbyVolunteer | null>(null)
  const [taskDetails, setTaskDetails] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [reportId, setReportId] = useState('')
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  function fetchVolunteers() {
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
  }

  useEffect(() => {
    if (isVerified) {
      fetchVolunteers()
    }
  }, [isVerified])

  async function handleDispatchTask(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedVolunteer || !taskDetails.trim()) return

    setDispatchLoading(true)
    setDispatchError(null)
    setDispatchSuccess(null)

    try {
      await createNgoTask(token, {
        volunteerId: selectedVolunteer._id,
        taskDetails: taskDetails.trim(),
        priority,
        ...(reportId.trim() ? { reportId: reportId.trim() } : {}),
      })

      setDispatchSuccess(`Task successfully dispatched to ${selectedVolunteer.displayName}!`)
      setTaskDetails('')
      setReportId('')
      setTimeout(() => {
        setSelectedVolunteer(null)
        setDispatchSuccess(null)
        fetchVolunteers() // Refresh workloads
      }, 1800)
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Failed to dispatch task.')
    } finally {
      setDispatchLoading(false)
    }
  }

  if (!isVerified) {
    return (
      <Card className="p-8 text-center border-warning/30 bg-surface">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning text-xl mb-3">
          🔒
        </div>
        <h3 className="text-base font-semibold text-content">Volunteer Discovery Locked</h3>
        <p className="mt-2 text-xs text-muted max-w-md mx-auto">
          Only verified NGOs can search nearby verified volunteers and dispatch field operations. Please complete platform verification to unlock volunteer management.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <Card className="p-6 bg-surface border-line">
        <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
          <div>
            <h3 className="text-sm font-semibold text-content">Nearby Verified Volunteers</h3>
            <p className="text-xs text-muted mt-1">
              Locate active field volunteers within a strict geospatial radius (default 10 km).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-28">
              <Input label="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" className="text-xs" />
            </div>
            <div className="w-28">
              <Input label="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" className="text-xs" />
            </div>
            <div className="w-28">
              <Input
                label="Radius (km)"
                type="number"
                min="1"
                max="50"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="text-xs"
              />
            </div>
            <Button
              variant="secondary"
              className="text-xs mt-auto h-9"
              onClick={fetchVolunteers}
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Scan Area'}
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-error">{error}</p>}
      </Card>

      {/* Volunteer Grid */}
      {volunteers.length === 0 && !loading && (
        <Card className="p-8 text-center text-muted text-xs border-dashed border-line">
          No verified volunteers found within {radiusKm} km of the specified location. Try expanding the search radius.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {volunteers.map((vol) => (
          <Card key={vol._id} className="p-5 border-line bg-surface hover:border-accent/40 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-content">{vol.displayName}</h4>
                  <p className="text-xs text-accent font-medium mt-0.5">{vol.distanceKm} km away</p>
                </div>
                <Badge tone={vol.availability === 'available' ? 'success' : 'warning'}>
                  {vol.availability}
                </Badge>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-line/60">
                  <span className="text-muted">Active Workload</span>
                  <span className="font-semibold text-content">{vol.currentWorkload} tasks</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line/60">
                  <span className="text-muted">Service Radius</span>
                  <span className="font-semibold text-content">{vol.serviceRadiusKm} km</span>
                </div>
                {vol.skills.length > 0 && (
                  <div className="pt-1">
                    <span className="text-muted block mb-1">Skills</span>
                    <div className="flex flex-wrap gap-1">
                      {vol.skills.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 text-[10px] rounded bg-surface-raised border border-line text-content">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-line">
              <Button
                variant="primary"
                className="w-full text-xs"
                onClick={() => setSelectedVolunteer(vol)}
              >
                Dispatch Delivery Task
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Task Dispatch Modal */}
      {selectedVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md p-6 bg-surface border-line space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-sm font-semibold text-content">
                Dispatch Task to {selectedVolunteer.displayName}
              </h3>
              <button
                onClick={() => setSelectedVolunteer(null)}
                className="text-muted hover:text-content text-sm"
              >
                ✕
              </button>
            </div>

            {dispatchSuccess && (
              <p className="text-xs text-success bg-success/10 border border-success/30 p-2.5 rounded-lg">
                {dispatchSuccess}
              </p>
            )}
            {dispatchError && (
              <p className="text-xs text-error bg-error/10 border border-error/30 p-2.5 rounded-lg">
                {dispatchError}
              </p>
            )}

            <form onSubmit={handleDispatchTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-muted font-medium mb-1">Task Instructions / Delivery Details *</label>
                <textarea
                  rows={4}
                  required
                  value={taskDetails}
                  onChange={(e) => setTaskDetails(e.target.value)}
                  placeholder="Describe pickup point, cargo items, recipient contact, and safety instructions..."
                  className="w-full rounded-lg border border-line bg-surface-raised p-2.5 text-content text-xs focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-muted font-medium mb-1">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full rounded-lg border border-line bg-surface-raised p-2 text-content text-xs focus:border-accent focus:outline-none"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical / Life Safety</option>
                </select>
              </div>

              <div>
                <Input
                  label="Linked Citizen Report ID (Optional)"
                  value={reportId}
                  onChange={(e) => setReportId(e.target.value)}
                  placeholder="Paste 24-character report ID to sync tracking timeline"
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setSelectedVolunteer(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="text-xs"
                  disabled={dispatchLoading}
                >
                  {dispatchLoading ? 'Dispatching...' : 'Confirm & Dispatch Task'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
