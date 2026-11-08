import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Card from '../../components/ui/Card'
import SectionHeading from '../../components/ui/SectionHeading'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import LocationMap from '../../components/ui/LocationMap'
import { DonorImageUploader } from '../../components/donor/DonorImageUploader'
import type { ProcessedImage } from '../../lib/image-processing'
import {
  GlowingMetricCard,
  GlowingBarChart,
  GlowingDonutChart,
  GlowingProgressMeter,
} from '../../components/ui/GlowingCharts'
import { useLiveSync } from '../../lib/live-sync'
import { useAuthContext } from '../../lib/useAuthContext'
import {
  createDonation,
  getMyDonations,
  getDonation,
  patchDonation,
  type Donation,
  type CreateDonationInput,
  type PatchDonationInput,
  type DonationCondition,
  type DonationStatus,
} from '../../api/donations'
import { getMatchesForDonation, type MatchSuggestion } from '../../api/matching'
import { AuthApiError } from '../../api/auth'

// ---------------------------------------------------------------------------
// Types / helpers
// ---------------------------------------------------------------------------

type View = 'overview' | 'create' | 'list' | { type: 'detail'; id: string }

const STATUS_TONE: Record<DonationStatus, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = {
  available: 'success',
  reserved: 'info',
  partially_allocated: 'info',
  allocated: 'success',
  expired: 'neutral',
  cancelled: 'error',
}

const STATUS_LABEL: Record<DonationStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  partially_allocated: 'Partially Allocated',
  allocated: 'Allocated',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const CONDITIONS: DonationCondition[] = ['new', 'good', 'fair', 'unknown']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function getToken(state: ReturnType<typeof useAuthContext>['state']): string {
  return state.status === 'authenticated' ? state.token : ''
}

// ---------------------------------------------------------------------------
// Create Donation Form
// ---------------------------------------------------------------------------

type FormErrors = Partial<Record<keyof CreateDonationInput | 'lat' | 'lng' | 'form', string>>

function CreateForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [condition, setCondition] = useState<DonationCondition>('good')
  const [batchNumber, setBatchNumber] = useState('')
  const [coldChainRequired, setColdChainRequired] = useState(false)
  const [photos, setPhotos] = useState<ProcessedImage[]>([])
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [locating, setLocating] = useState(false)
  const [locationNotice, setLocationNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  function handleDetectLocation() {
    setLocationNotice(null)
    if (!('geolocation' in navigator)) {
      setLocationNotice('Geolocation is not supported by your browser. Please enter coordinates manually.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLng(pos.coords.longitude.toFixed(6))
        setLat(pos.coords.latitude.toFixed(6))
        setLocationNotice('GPS coordinates captured.')
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocationNotice(`Location capture failed (${err.message}). Enter manually.`)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  function validate(): FormErrors {
    const e: FormErrors = {}
    if (!category.trim() || category.trim().length > 80) e.resourceCategory = 'Required, max 80 characters.'
    if (description.trim().length < 10 || description.trim().length > 3000) e.description = 'Must be 10–3000 characters.'
    const q = Number(quantity)
    if (!quantity || !Number.isFinite(q) || q < 0) e.quantity = 'Must be a non-negative number.'
    if (!unit.trim() || unit.trim().length > 40) e.unit = 'Required, max 40 characters.'
    const latN = Number(lat)
    const lngN = Number(lng)
    if (!lat || !Number.isFinite(latN) || latN < -90 || latN > 90) e.lat = 'Valid latitude required (−90 to 90).'
    if (!lng || !Number.isFinite(lngN) || lngN < -180 || lngN > 180) e.lng = 'Valid longitude required (−180 to 180).'
    if (expiryDate && isNaN(new Date(expiryDate).getTime())) e.expiryDate = 'Must be a valid date.'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const input: CreateDonationInput = {
        resourceCategory: category.trim(),
        description: description.trim(),
        quantity: Number(quantity),
        unit: unit.trim(),
        condition,
        batchNumber: batchNumber.trim() || undefined,
        coldChainRequired,
        location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        ...(expiryDate ? { expiryDate } : {}),
        photos: photos.map((p) => ({ data: p.dataUrl, name: p.fileName })),
      }
      await createDonation(token, input)
      setSuccess(true)
    } catch (err) {
      const msg = err instanceof AuthApiError ? err.message : 'An unexpected error occurred.'
      setErrors({ form: msg })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/8 p-8 text-center max-w-xl mx-auto">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h3 className="text-lg font-semibold text-content">Donation Listing Published</h3>
        <p className="text-sm text-muted mt-1 mb-5">Your resource offer is now live in the system and available to be matched with registered NGO requirements.</p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => { setSuccess(false); setCategory(''); setDescription(''); setQuantity(''); setUnit(''); setLat(''); setLng(''); setExpiryDate(''); setBatchNumber(''); setColdChainRequired(false); setPhotos([]); setCondition('good') }}>
            Create Another
          </Button>
          <Button variant="secondary" onClick={onCreated}>View My Listings</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Input
          label="Resource category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Bottled Water, Rice, Medical Kits, Tents"
          error={errors.resourceCategory}
          maxLength={80}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantity"
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 100"
            error={errors.quantity}
            required
          />
          <Input
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. litres, kg, cartons"
            error={errors.unit}
            maxLength={40}
            required
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-sm font-medium text-content" htmlFor="description">Resource Description & Details</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={3000}
          placeholder="Describe package condition, brand, storage requirements or handling notes… (min 10 characters)"
          className={`w-full rounded-xl border bg-surface-raised px-3.5 py-2.5 text-sm text-content placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${errors.description ? 'border-error' : 'border-line'}`}
        />
        {errors.description && <p className="text-xs text-error" role="alert">{errors.description}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content" htmlFor="condition">Condition</label>
          <select
            id="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value as DonationCondition)}
            className="min-h-10 w-full rounded-xl border border-line bg-surface-raised px-3 text-content transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <Input
          label="Expiry date (optional)"
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          error={errors.expiryDate}
          hint="Applicable for food, medicines or perishable supplies."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
        <Input
          label="Batch / Lot Number (optional)"
          value={batchNumber}
          onChange={(e) => setBatchNumber(e.target.value)}
          placeholder="e.g. LOT-2026-X99 or BATCH-44"
          maxLength={60}
          hint="Assists NGOs in tracking pharmaceuticals, packaged rations, and recalls."
        />
        <div className="flex items-center gap-3 pt-2 md:pt-4">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-content">
            <input
              type="checkbox"
              checked={coldChainRequired}
              onChange={(e) => setColdChainRequired(e.target.checked)}
              className="w-4 h-4 rounded border-line bg-surface-raised text-accent focus:ring-accent/30"
            />
            <span className="font-medium">Requires Cold-Chain / Refrigeration</span>
          </label>
        </div>
      </div>

      {/* Photo evidence uploader */}
      <div className="rounded-xl border border-line/80 bg-surface-raised/40 p-4">
        <DonorImageUploader
          images={photos}
          onChange={setPhotos}
          maxImages={3}
          disabled={loading}
        />
      </div>

      {/* Pickup location */}
      <div className="rounded-xl border border-line/80 bg-surface-raised/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Pickup Location Coordinates</p>
            <p className="text-xs text-muted">Where relief teams or logistics partners will collect this donation.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="text-xs h-8 px-3 gap-1.5"
            onClick={handleDetectLocation}
            loading={locating}
            disabled={locating}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
            </svg>
            Use GPS Location
          </Button>
        </div>

        {locationNotice && (
          <p className="text-xs text-accent bg-accent/10 border border-accent/20 rounded-lg p-2.5" role="status">
            {locationNotice}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Latitude"
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="e.g. 19.0760"
            error={errors.lat}
            required
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="e.g. 72.8777"
            error={errors.lng}
            required
          />
        </div>
      </div>

      {errors.form && (
        <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {errors.form}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading} className="px-6 py-2.5">
          Publish Donation Listing
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Donation list item
// ---------------------------------------------------------------------------

function DonationRow({ donation, onView }: { donation: Donation; onView: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-raised px-4 py-3 hover:border-accent/40 transition-colors">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content">{donation.resourceCategory}</p>
        <p className="text-xs text-muted mt-0.5">{donation.quantity} {donation.unit} · {formatDate(donation.createdAt)}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge tone={STATUS_TONE[donation.availabilityStatus]}>{STATUS_LABEL[donation.availabilityStatus]}</Badge>
        <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onView}>View</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donation list view
// ---------------------------------------------------------------------------

function DonationList({ token, onView }: { token: string; onView: (id: string) => void }) {
  const [donations, setDonations] = useState<Donation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getMyDonations(token)
      setDonations(res.data)
      setNextCursor(res.page.nextCursor)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Failed to load donations.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await getMyDonations(token, nextCursor)
      setDonations((prev) => [...prev, ...res.data])
      setNextCursor(res.page.nextCursor)
    } catch {
      // silently fail on load-more
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <p className="text-sm text-muted py-4" aria-live="polite" aria-busy="true">Loading donations…</p>

  if (error) return (
    <div className="rounded-lg border border-error/30 bg-error/8 px-4 py-3">
      <p className="text-sm text-error mb-2">{error}</p>
      <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => void load()}>Retry</Button>
    </div>
  )

  if (donations.length === 0) return (
    <p className="text-sm text-muted py-4">No donations yet. Create your first listing to get started.</p>
  )

  return (
    <div className="grid gap-2">
      {donations.map((d) => (
        <DonationRow key={d._id} donation={d} onView={() => onView(d._id)} />
      ))}
      {nextCursor && (
        <Button variant="ghost" loading={loadingMore} onClick={() => void loadMore()} className="mt-2 text-sm">
          Load more
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Donation detail view with matching NGO requirements
// ---------------------------------------------------------------------------

function DonationDetail({ token, donationId, onBack }: { token: string; donationId: string; onBack: () => void }) {
  const [donation, setDonation] = useState<Donation | null>(null)
  const [matches, setMatches] = useState<MatchSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Edit fields
  const [editCategory, setEditCategory] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editCondition, setEditCondition] = useState<DonationCondition>('good')
  const [editErrors, setEditErrors] = useState<Partial<Record<string, string>>>({})

  useEffect(() => {
    setLoading(true)
    setError(null)
    getDonation(token, donationId)
      .then((d) => {
        setDonation(d)
        setEditCategory(d.resourceCategory)
        setEditDescription(d.description)
        setEditQuantity(String(d.quantity))
        setEditUnit(d.unit)
        setEditCondition(d.condition)

        // Load real matching suggestions from backend
        setLoadingMatches(true)
        getMatchesForDonation(token, donationId)
          .then((m) => setMatches(m))
          .catch(() => setMatches([]))
          .finally(() => setLoadingMatches(false))
      })
      .catch((err) => setError(err instanceof AuthApiError ? err.message : 'Failed to load donation.'))
      .finally(() => setLoading(false))
  }, [token, donationId])

  async function handleSave() {
    const errs: Partial<Record<string, string>> = {}
    if (!editCategory.trim() || editCategory.trim().length > 80) errs.category = 'Required, max 80 characters.'
    if (editDescription.trim().length < 10) errs.description = 'Must be at least 10 characters.'
    const q = Number(editQuantity)
    if (!editQuantity || !Number.isFinite(q) || q < 0) errs.quantity = 'Must be a non-negative number.'
    if (!editUnit.trim() || editUnit.trim().length > 40) errs.unit = 'Required, max 40 characters.'
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return }
    setEditErrors({})
    setActionLoading(true)
    setActionError(null)
    try {
      const patch: PatchDonationInput = {
        resourceCategory: editCategory.trim(),
        description: editDescription.trim(),
        quantity: Number(editQuantity),
        unit: editUnit.trim(),
        condition: editCondition,
      }
      const updated = await patchDonation(token, donationId, patch)
      setDonation(updated)
      setEditing(false)
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Failed to update donation.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancel() {
    setActionLoading(true)
    setActionError(null)
    try {
      const updated = await patchDonation(token, donationId, { availabilityStatus: 'cancelled' })
      setDonation(updated)
      setCancelConfirm(false)
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Failed to cancel donation.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <p className="text-sm text-muted py-6 text-center" aria-live="polite" aria-busy="true">Loading donation details…</p>

  if (error) return (
    <div className="rounded-xl border border-error/30 bg-error/10 p-5">
      <p className="text-sm text-error mb-3">{error}</p>
      <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onBack}>Back to listings</Button>
    </div>
  )

  if (!donation) return null

  const canEdit = donation.availabilityStatus === 'available'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" className="h-9 px-3 text-sm gap-2" onClick={onBack}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Listings
        </Button>
        <Badge tone={STATUS_TONE[donation.availabilityStatus]} className="text-xs px-3 py-1 font-semibold">
          {STATUS_LABEL[donation.availabilityStatus]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Details or Edit form */}
        <div className="lg:col-span-7 space-y-6">
          {!editing ? (
            <Card className="shadow-sm">
              <div className="border-b border-line/60 pb-4 mb-4">
                <span className="text-xs uppercase tracking-wider text-subtle font-semibold">Resource Details</span>
                <h3 className="type-dash-section text-content mt-1">{donation.resourceCategory}</h3>
              </div>

              <dl className="grid gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted uppercase tracking-wider mb-1">Description</dt>
                  <dd className="text-content leading-relaxed rounded-lg bg-surface-raised/60 p-3 border border-line/50">
                    {donation.description}
                  </dd>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-line bg-surface-raised p-3.5">
                    <dt className="text-xs text-muted uppercase tracking-wider">Total Quantity</dt>
                    <dd className="text-xl font-bold text-content mt-1">{donation.quantity} <span className="text-sm font-normal text-muted">{donation.unit}</span></dd>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-raised p-3.5">
                    <dt className="text-xs text-muted uppercase tracking-wider">Condition</dt>
                    <dd className="text-xl font-bold text-content capitalize mt-1">{donation.condition}</dd>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-line bg-surface-raised p-3.5">
                    <dt className="text-xs text-muted uppercase tracking-wider">Reserved</dt>
                    <dd className="text-lg font-semibold text-warning mt-1">{donation.quantityReserved} <span className="text-xs text-muted">{donation.unit}</span></dd>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-raised p-3.5">
                    <dt className="text-xs text-muted uppercase tracking-wider">Allocated</dt>
                    <dd className="text-lg font-semibold text-success mt-1">{donation.quantityAllocated} <span className="text-xs text-muted">{donation.unit}</span></dd>
                  </div>
                </div>

                {donation.expiryDate && (
                  <div>
                    <dt className="text-xs text-muted uppercase tracking-wider mb-1">Expiration Date</dt>
                    <dd className="text-content font-medium">{formatDate(donation.expiryDate)}</dd>
                  </div>
                )}

                {donation.batchNumber && (
                  <div>
                    <dt className="text-xs text-muted uppercase tracking-wider mb-1">Batch / Lot Number</dt>
                    <dd className="text-content font-mono font-medium">{donation.batchNumber}</dd>
                  </div>
                )}

                {donation.coldChainRequired && (
                  <div className="flex items-center gap-2 text-xs text-sky-400 bg-sky-950/40 border border-sky-800/50 rounded-lg p-2.5">
                    <span>❄️ Cold-Chain Storage & Transport Required</span>
                  </div>
                )}

                {donation.quarantineStatus && donation.quarantineStatus !== 'none' && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5">
                    <span>⚠️ Quarantine Active: {donation.quarantineStatus === 'quarantined_expired' ? 'Expired Supplies' : 'Safety Review'}</span>
                  </div>
                )}

                {donation.evidencePhotos && donation.evidencePhotos.length > 0 && (
                  <div className="pt-2">
                    <dt className="text-xs text-muted uppercase tracking-wider mb-2">Verified Photo Evidence ({donation.evidencePhotos.length})</dt>
                    <div className="grid grid-cols-3 gap-2">
                      {donation.evidencePhotos.map((photo, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-line bg-surface-raised group">
                          <img src={photo.url} alt={`Evidence ${i + 1}`} className="w-full h-24 object-cover" />
                          {photo.reviewStatus === 'flagged' && (
                            <span className="absolute bottom-1 right-1 bg-amber-600/90 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                              Flagged
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted border-t border-line/50 pt-3">
                  <span>Listed on {formatDate(donation.createdAt)}</span>
                  <span>ID: <code className="text-subtle font-mono">{donation._id.slice(-8)}</code></span>
                </div>
              </dl>

              {actionError && (
                <p className="mt-4 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error" role="alert">{actionError}</p>
              )}

              {canEdit && (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-line/60 pt-4">
                  <Button variant="secondary" className="px-4 text-xs" onClick={() => { setEditing(true); setActionError(null) }}>Edit Listing</Button>
                  {!cancelConfirm ? (
                    <Button variant="danger" className="px-4 text-xs" onClick={() => setCancelConfirm(true)}>Withdraw Listing</Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">Confirm cancellation?</span>
                      <Button variant="danger" className="px-3 text-xs" loading={actionLoading} onClick={() => void handleCancel()}>Confirm</Button>
                      <Button variant="ghost" className="px-3 text-xs" onClick={() => setCancelConfirm(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className="shadow-sm">
              <h3 className="type-dash-section text-content mb-4">Edit Donation Listing</h3>
              <div className="grid gap-4">
                <Input label="Resource category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} error={editErrors.category} maxLength={80} />
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-content" htmlFor="edit-description">Description</label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className={`w-full rounded-xl border bg-surface-raised px-3.5 py-2 text-sm text-content placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${editErrors.description ? 'border-error' : 'border-line'}`}
                  />
                  {editErrors.description && <p className="text-xs text-error" role="alert">{editErrors.description}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Quantity" type="number" min="0" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} error={editErrors.quantity} />
                  <Input label="Unit" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} error={editErrors.unit} maxLength={40} />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium text-content" htmlFor="edit-condition">Condition</label>
                  <select
                    id="edit-condition"
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value as DonationCondition)}
                    className="min-h-10 w-full rounded-xl border border-line bg-surface-raised px-3 text-content transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  >
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                {actionError && <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error" role="alert">{actionError}</p>}
                <div className="flex gap-3 pt-2">
                  <Button loading={actionLoading} onClick={() => void handleSave()}>Save Changes</Button>
                  <Button variant="ghost" onClick={() => { setEditing(false); setEditErrors({}) }}>Discard</Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right column: Pickup Map & Matching NGO Requirements */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pickup location map */}
          <Card className="shadow-sm">
            <h4 className="text-sm font-semibold text-content mb-2">Pickup Location</h4>
            <p className="text-xs text-muted mb-3">
              Coordinates: {donation.location.coordinates[1].toFixed(4)}, {donation.location.coordinates[0].toFixed(4)}
            </p>
            <div className="overflow-hidden rounded-xl border border-line">
              <LocationMap
                markers={[{
                  id: donation._id,
                  coordinates: donation.location.coordinates as [number, number],
                  label: donation.resourceCategory,
                  detail: `${donation.quantity} ${donation.unit}`,
                  tone: 'success',
                }]}
                height={200}
                listHeading="Pickup location"
              />
            </div>
          </Card>

          {/* Real Matching NGO Requirements via getMatchesForDonation */}
          <Card className="shadow-sm">
            <div className="flex items-center justify-between border-b border-line/60 pb-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-content">Matching NGO Requirements</h4>
                <p className="text-xs text-muted">Nearby relief operations that need this resource.</p>
              </div>
              <Badge tone={matches.length > 0 ? 'success' : 'neutral'} className="text-[11px]">
                {matches.length} {matches.length === 1 ? 'Match' : 'Matches'}
              </Badge>
            </div>

            <div className="mb-3 rounded-lg border border-line/70 bg-surface-raised/60 p-2.5 text-[11px] text-muted leading-relaxed">
              <span className="font-semibold text-content block mb-0.5">Note on Coordination:</span>
              Matching suggestions show potential compatibility within 10km proximity and are not confirmed allocations or delivery guarantees. Allocation requires NGO review and authorization.
            </div>

            {loadingMatches ? (
              <p className="py-4 text-xs text-muted text-center">Checking matching requirements…</p>
            ) : matches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line/80 p-4 text-center">
                <p className="text-xs font-medium text-content">No nearby NGO requirements matched yet</p>
                <p className="text-[11px] text-muted mt-1">
                  The automated coordination system continuously scans for compatible NGO requirements within range.
                </p>
              </div>
            ) : (
              <ul className="space-y-3" aria-label="Matching NGO requirements">
                {matches.map((m, idx) => (
                  <li key={`${m.requirementId}-${idx}`} className="rounded-xl border border-line bg-surface-raised p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-content capitalize">{m.requirementCategory}</span>
                      <span className="text-[10px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                        Score: {Math.round(m.score * 100)}%
                      </span>
                    </div>
                    <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">
                      <span>Suggested: <strong className="text-content font-medium">{m.suggestedQty} {m.unit}</strong></span>
                      {m.distanceKm !== null && (
                        <span>Distance: <strong className="text-content font-medium">{m.distanceKm.toFixed(1)} km</strong></span>
                      )}
                    </div>
                    {m.reasons && m.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {m.reasons.map((r, ri) => (
                          <span key={ri} className="text-[10px] text-muted bg-surface/80 border border-line/60 rounded px-1.5 py-0.5">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview stats
// ---------------------------------------------------------------------------

function Overview({ token, onNavigate }: { token: string; onNavigate: (v: View) => void }) {
  const [donations, setDonations] = useState<Donation[] | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(() => {
    setLoading(true)
    getMyDonations(token)
      .then((res) => setDonations(res.data))
      .catch(() => setDonations([]))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Live Cross-Dashboard Synchronization: updates automatically on allocation/dispatch events
  useLiveSync(() => {
    loadData()
  }, [loadData])

  const total = donations?.length ?? 0
  const available = donations?.filter((d) => d.availabilityStatus === 'available').length ?? 0
  const inProgress = donations?.filter((d) => ['reserved', 'partially_allocated'].includes(d.availabilityStatus)).length ?? 0
  const completed = donations?.filter((d) => d.availabilityStatus === 'allocated').length ?? 0

  // Category breakdown
  const categoryMap: Record<string, number> = {}
  for (const d of donations ?? []) {
    const cat = d.resourceCategory || 'Other'
    categoryMap[cat] = (categoryMap[cat] || 0) + 1
  }
  const categoryBars = Object.entries(categoryMap).slice(0, 5).map(([label, value]) => ({
    label,
    value,
    color: '#f97316',
  }))

  const mapMarkers = (donations ?? [])
    .filter((d) => d.location && Array.isArray(d.location.coordinates) && d.location.coordinates.length === 2)
    .map((d) => ({
      id: d._id,
      coordinates: d.location.coordinates as [number, number],
      label: d.resourceCategory,
      detail: `${d.quantity} ${d.unit} · ${STATUS_LABEL[d.availabilityStatus]}`,
      tone: (d.availabilityStatus === 'available' ? 'success' : d.availabilityStatus === 'cancelled' ? 'error' : 'default') as 'success' | 'error' | 'default',
    }))

  return (
    <div className="space-y-7">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-line bg-gradient-to-r from-surface to-surface-raised p-6 sm:p-7 shadow-surface">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-content tracking-tight">Donor Logistics Console</h2>
            <p className="mt-1.5 text-base text-muted leading-relaxed">
              List critical relief supplies, manage active commitments, and verify allocation to active disaster operations.
            </p>
          </div>
          <Button
            onClick={() => onNavigate('create')}
            className="shrink-0 gap-2 h-12 px-6 text-base font-semibold shadow-sm shadow-orange-500/20"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Offer Resources
          </Button>
        </div>
      </div>

      {/* Metrics Row across desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <GlowingMetricCard
          title="Total Listed"
          value={loading ? '—' : total}
          subtitle="All recorded aid batches"
          icon="📦"
          tone="neutral"
          onClick={() => onNavigate('list')}
        />
        <GlowingMetricCard
          title="Available for Relief"
          value={loading ? '—' : available}
          subtitle="Ready for NGO allocation"
          icon="✨"
          tone="emerald"
          onClick={() => onNavigate('list')}
        />
        <GlowingMetricCard
          title="In Transit / Reserved"
          value={loading ? '—' : inProgress}
          subtitle="Actively deploying to camps"
          icon="🚚"
          tone="amber"
          onClick={() => onNavigate('list')}
        />
        <GlowingMetricCard
          title="Fully Allocated"
          value={loading ? '—' : completed}
          subtitle="Fulfilled & confirmed"
          icon="✅"
          tone="orange"
          onClick={() => onNavigate('list')}
        />
      </div>

      {/* Glowing Analytics Visuals */}
      {total > 0 && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 glow-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="type-card-heading text-content">Donation Items by Category</h3>
              <Badge tone="info">Live Inventory</Badge>
            </div>
            <p className="text-sm text-muted mb-4">Volume distribution across registered relief resource types.</p>
            <GlowingBarChart
              data={categoryBars.length > 0 ? categoryBars : [{ label: 'General', value: total, color: '#f97316' }]}
              height={180}
              unit="batches"
            />
          </div>

          <div className="lg:col-span-5 glow-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="type-card-heading text-content">Allocation Commitment Rate</h3>
                <Badge tone="neutral">Status Ratio</Badge>
              </div>
              <p className="text-sm text-muted mb-3">Ratio of resources allocated vs available.</p>
              <GlowingDonutChart
                centerTitle="Batches"
                centerValue={total}
                segments={[
                  { label: 'Available', value: available, color: '#10b981' },
                  { label: 'Reserved / Transit', value: inProgress, color: '#f59e0b' },
                  { label: 'Allocated', value: completed, color: '#f97316' },
                ]}
              />
            </div>
            <div className="mt-4 pt-3 border-t border-line/50">
              <GlowingProgressMeter
                label="Resource Mobilization"
                value={completed + inProgress}
                total={total || 1}
                unit="batches"
                color="#f97316"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Overview content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Recent Listings and Quick Actions */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="shadow-sm">
            <SectionHeading
              title="Recent donation listings"
              description="Resources you have offered for relief mobilization."
              supportingContent={
                <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => onNavigate('list')}>
                  View all listings →
                </Button>
              }
            />
            <div className="mt-4">
              {loading && <p className="text-sm text-muted py-4 text-center">Loading recent listings…</p>}
              {!loading && total === 0 && (
                <div className="rounded-xl border border-dashed border-line/80 py-8 px-4 text-center">
                  <p className="text-sm font-medium text-content">No donation listings yet</p>
                  <p className="mt-1 text-xs text-muted mb-4">Start contributing to crisis relief operations by listing essential resources.</p>
                  <Button onClick={() => onNavigate('create')}>Offer First Resource</Button>
                </div>
              )}
              {!loading && total > 0 && (
                <div className="grid gap-2.5">
                  {donations!.slice(0, 4).map((d) => (
                    <DonationRow key={d._id} donation={d} onView={() => onNavigate({ type: 'detail', id: d._id })} />
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card className="shadow-sm">
            <SectionHeading title="Quick actions" description="Direct management shortcuts" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => onNavigate('create')}>+ Offer Resources</Button>
              <Button variant="secondary" onClick={() => onNavigate('list')}>View My Donation Listings</Button>
            </div>
          </Card>
        </div>

        {/* Right: Geographical Pickup Points */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="shadow-sm">
            <h4 className="text-sm font-semibold text-content mb-1">Active Pickup Points</h4>
            <p className="text-xs text-muted mb-3">Geographical distribution of your registered resource locations.</p>
            {mapMarkers.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-line">
                <LocationMap markers={mapMarkers} height={300} listHeading="Registered donation locations" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line/80 p-8 text-center text-xs text-muted">
                No active pickup locations registered yet.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DonorDashboard
// ---------------------------------------------------------------------------

export default function DonorDashboard() {
  const { state } = useAuthContext()
  const token = getToken(state)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'overview'
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)

  function handleNavigate(v: View) {
    if (typeof v === 'object' && v.type === 'detail') {
      setSelectedDetailId(v.id)
    } else {
      setSelectedDetailId(null)
      setSearchParams({ tab: String(v) })
    }
  }

  const title = selectedDetailId
    ? 'Donation Details'
    : activeTab === 'create'
    ? 'Offer Resources'
    : activeTab === 'list'
    ? 'My Donation Listings'
    : 'Donor Resource Hub'

  const subtitle = selectedDetailId
    ? 'Detailed resource specification, current status, and real-time matching NGO requirements.'
    : activeTab === 'create'
    ? 'Publish food, water, medical aid, or shelter resources for disaster relief.'
    : activeTab === 'list'
    ? 'Monitor your active listings, reserved supplies, and allocation history.'
    : 'Manage resource contributions, monitor dispatch progress, and track NGO relief matching.'

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {/* Sub-navigation tabs */}
      {!selectedDetailId && (
        <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
          {[
            { id: 'overview', label: 'Dashboard' },
            { id: 'create', label: '+ Offer Resources' },
            { id: 'list', label: 'My Donation Listings' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNavigate(tab.id as View)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none interactive-popup ${
                activeTab === tab.id
                  ? 'bg-orange text-white shadow-xs'
                  : 'text-muted hover:text-content hover:bg-surface-raised'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {selectedDetailId ? (
        <DonationDetail
          token={token}
          donationId={selectedDetailId}
          onBack={() => setSelectedDetailId(null)}
        />
      ) : activeTab === 'create' ? (
        <Card className="shadow-sm">
          <SectionHeading title="Create donation listing" description="List supplies, food, or equipment for immediate or standby disaster relief." />
          <div className="mt-5">
            <CreateForm token={token} onCreated={() => handleNavigate('list')} />
          </div>
        </Card>
      ) : activeTab === 'list' ? (
        <Card className="shadow-sm">
          <SectionHeading
            title="My donation listings"
            description="All resource listings you have submitted to ReliefGrid."
            supportingContent={
              <Button className="h-8 px-3 text-xs" onClick={() => handleNavigate('create')}>+ New listing</Button>
            }
          />
          <div className="mt-5">
            <DonationList token={token} onView={(id) => handleNavigate({ type: 'detail', id })} />
          </div>
        </Card>
      ) : (
        <Overview token={token} onNavigate={handleNavigate} />
      )}
    </DashboardLayout>
  )
}
