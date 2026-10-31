import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../../components/layout/DashboardLayout'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Badge from '../../components/ui/Badge'
import LocationMap from '../../components/ui/LocationMap'
import DeliveryTimeline from '../../components/ui/DeliveryTimeline'
import { useAuthContext } from '../../lib/useAuthContext'
import { AuthApiError } from '../../api/auth'
import {
  createReport,
  getMyReports,
  getReport,
  patchReport,
  type Report,
  type ReportCategory,
  type ReportUrgency,
  type PatchReportInput,
} from '../../api/reports'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'water', label: 'Water' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'medical', label: 'Medical Assistance' },
  { value: 'other', label: 'Other' },
]

const URGENCIES: { value: ReportUrgency; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const URGENCY_TONE: Record<ReportUrgency, 'neutral' | 'info' | 'warning' | 'error'> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'error',
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'warning',
  verified: 'success',
  rejected: 'error',
  resolved: 'success',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
  resolved: 'Resolved',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FormErrors = Partial<Record<'title' | 'description' | 'needCategory' | 'urgency' | 'longitude' | 'latitude' | 'affectedPersonCount', string>>

function validateForm(
  title: string,
  description: string,
  needCategory: string,
  urgency: string,
  longitude: string,
  latitude: string,
  affectedPersonCount?: string,
): FormErrors {
  const errors: FormErrors = {}
  if (title.trim().length < 3) errors.title = 'Title must be at least 3 characters.'
  if (title.trim().length > 160) errors.title = 'Title must be at most 160 characters.'
  if (description.trim().length < 10) errors.description = 'Description must be at least 10 characters.'
  if (description.trim().length > 5000) errors.description = 'Description must be at most 5000 characters.'
  if (!needCategory) errors.needCategory = 'Please select a category.'
  if (!urgency) errors.urgency = 'Please select an urgency level.'
  const lng = Number(longitude)
  const lat = Number(latitude)
  if (longitude.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.longitude = 'Longitude must be between -180 and 180.'
  }
  if (latitude.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.latitude = 'Latitude must be between -90 and 90.'
  }
  if (affectedPersonCount && affectedPersonCount.trim() !== '') {
    const num = Number(affectedPersonCount)
    if (!Number.isInteger(num) || num < 0) {
      errors.affectedPersonCount = 'Affected persons must be a positive integer or zero.'
    }
  }
  return errors
}

function apiMsg(err: unknown): string {
  return err instanceof AuthApiError ? err.message : 'An unexpected error occurred. Please try again.'
}

function SelectField({
  id, label, value, onChange, options, error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  error?: string
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-content" htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className="min-h-10 w-full rounded-lg border border-line bg-surface-raised px-3 text-content transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-error" role="alert">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Report form (create)
// ---------------------------------------------------------------------------

type ReportFormProps = {
  token: string
  onCreated: (report: Report) => void
  onViewReports?: () => void
}

function ReportForm({ token, onCreated, onViewReports }: ReportFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [needCategory, setNeedCategory] = useState<ReportCategory>('food')
  const [urgency, setUrgency] = useState<ReportUrgency>('medium')
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  const [onBehalf, setOnBehalf] = useState(false)
  const [affectedPersonCount, setAffectedPersonCount] = useState('')
  const [submitAsDraft, setSubmitAsDraft] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationNotice, setLocationNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submittedReport, setSubmittedReport] = useState<Report | null>(null)

  function handleDetectLocation() {
    setLocationNotice(null)
    if (!('geolocation' in navigator)) {
      setLocationNotice('Geolocation is not supported by your browser. Please enter coordinates manually.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLongitude(pos.coords.longitude.toFixed(6))
        setLatitude(pos.coords.latitude.toFixed(6))
        setLocationNotice('GPS coordinates captured successfully.')
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocationNotice(`Location capture failed (${err.message}). You can enter coordinates manually.`)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setApiError(null)
    const errors = validateForm(title, description, needCategory, urgency, longitude, latitude, affectedPersonCount)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    try {
      const fullDesc = onBehalf && !description.toLowerCase().includes('on behalf')
        ? `[Reported on behalf of someone without phone/connectivity]\n\n${description.trim()}`
        : description.trim()

      const report = await createReport(token, {
        title: title.trim(),
        description: fullDesc,
        needCategory,
        urgency,
        location: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
        ...(affectedPersonCount.trim() ? { affectedPersonCount: Number(affectedPersonCount) } : {}),
        status: submitAsDraft ? 'draft' : 'submitted',
      })
      setSubmittedReport(report)
      onCreated(report)
      setTitle(''); setDescription(''); setNeedCategory('food'); setUrgency('medium')
      setLongitude(''); setLatitude(''); setAffectedPersonCount(''); setOnBehalf(false); setSubmitAsDraft(false)
    } catch (err) {
      setApiError(apiMsg(err))
    } finally {
      setLoading(false)
    }
  }

  if (submittedReport) {
    return (
      <Card className="shadow-sm max-w-xl mx-auto text-center p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-content">
          Relief Request {submittedReport.status === 'draft' ? 'Saved as Draft' : 'Submitted Successfully'}
        </h3>
        <p className="text-sm text-muted mt-1.5 mb-6 leading-relaxed">
          {submittedReport.status === 'draft'
            ? 'Your draft request has been recorded. You can edit and submit it whenever you are ready.'
            : 'Your emergency assistance request has been recorded and submitted to verified NGOs and relief coordinators for review.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => setSubmittedReport(null)}>
            Create Another Request
          </Button>
          {onViewReports && (
            <Button variant="secondary" onClick={onViewReports}>
              View in My Reports
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-4">
        <div>
          <h2 className="type-dash-section text-content">Report a relief need</h2>
          <p className="mt-1 text-sm text-muted">Submit an urgent request for food, water, medical aid, shelter or supplies.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange/20 bg-orange/5 px-2.5 py-1 text-xs font-medium text-orange">
          <span className="h-1.5 w-1.5 rounded-full bg-orange animate-pulse" />
          Live Request System
        </span>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="grid gap-5">
        <Input
          label="Title of request"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          error={fieldErrors.title}
          hint="Briefly describe the need (3–160 characters)."
          placeholder="e.g. Critical potable water shortage in Sector 4"
        />

        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content" htmlFor="description">Situation details & requirements</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={5000}
            required
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? 'desc-error' : 'desc-hint'}
            className={`w-full resize-y rounded-xl border bg-surface-raised px-3.5 py-2.5 text-sm text-content placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${fieldErrors.description ? 'border-error' : 'border-line'}`}
            placeholder="Specify exact conditions, number of people needing assistance, road accessibility, or specific medical needs…"
          />
          {fieldErrors.description
            ? <p id="desc-error" className="text-xs text-error" role="alert">{fieldErrors.description}</p>
            : <p id="desc-hint" className="text-xs text-muted">10–5000 characters.</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField id="needCategory" label="Resource category" value={needCategory} onChange={(v) => setNeedCategory(v as ReportCategory)} options={CATEGORIES} error={fieldErrors.needCategory} />
          <SelectField id="urgency" label="Urgency tier" value={urgency} onChange={(v) => setUrgency(v as ReportUrgency)} options={URGENCIES} error={fieldErrors.urgency} />
        </div>

        {/* Affected people & On behalf */}
        <div className="rounded-xl border border-line/80 bg-surface-raised/60 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Beneficiary Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
            <div>
              <Input
                label="Affected people count"
                type="number"
                min="0"
                value={affectedPersonCount}
                onChange={(e) => setAffectedPersonCount(e.target.value)}
                error={fieldErrors.affectedPersonCount}
                hint="Estimated number of people impacted"
                placeholder="e.g. 12"
              />
            </div>
            <div className="pt-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-content select-none">
                <input
                  type="checkbox"
                  checked={onBehalf}
                  onChange={(e) => setOnBehalf(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-line accent-orange"
                />
                <div>
                  <span className="font-medium text-content">Reporting on behalf of others</span>
                  <p className="text-xs text-muted">For individuals or families without phone/internet access.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Location Section */}
        <div className="rounded-xl border border-line/80 bg-surface-raised/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Incident Location Coordinates</p>
              <p className="text-xs text-muted">Provide accurate coordinates so relief workers can navigate directly.</p>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Longitude (East/West)" type="number" value={longitude} onChange={(e) => setLongitude(e.target.value)} step="any" required error={fieldErrors.longitude} hint="-180 to 180" placeholder="e.g. 72.8777" />
            <Input label="Latitude (North/South)" type="number" value={latitude} onChange={(e) => setLatitude(e.target.value)} step="any" required error={fieldErrors.latitude} hint="-90 to 90" placeholder="e.g. 19.0760" />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted select-none">
          <input
            type="checkbox"
            checked={submitAsDraft}
            onChange={(e) => setSubmitAsDraft(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-orange"
          />
          Save as draft (do not submit to NGOs yet)
        </label>

        {apiError && (
          <p className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">{apiError}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading} disabled={loading} className="px-6 py-2.5">
            {submitAsDraft ? 'Save Draft' : 'Submit Relief Request'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Edit form (inline, draft only)
// ---------------------------------------------------------------------------

type EditFormProps = {
  token: string
  report: Report
  onSaved: (updated: Report) => void
  onCancel: () => void
}

function EditForm({ token, report, onSaved, onCancel }: EditFormProps) {
  const [title, setTitle] = useState(report.title)
  const [description, setDescription] = useState(report.description)
  const [needCategory, setNeedCategory] = useState<ReportCategory>(report.needCategory)
  const [urgency, setUrgency] = useState<ReportUrgency>(report.urgency)
  const [submitNow, setSubmitNow] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setApiError(null)
    const errors: FormErrors = {}
    if (title.trim().length < 3) errors.title = 'Title must be at least 3 characters.'
    if (title.trim().length > 160) errors.title = 'Title must be at most 160 characters.'
    if (description.trim().length < 10) errors.description = 'Description must be at least 10 characters.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    try {
      const patch: PatchReportInput = {
        title: title.trim(),
        description: description.trim(),
        needCategory,
        urgency,
        ...(submitNow ? { status: 'submitted' as const } : {}),
      }
      const updated = await patchReport(token, report._id, patch)
      onSaved(updated)
    } catch (err) {
      setApiError(apiMsg(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-orange/30">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-content">Edit draft report</h2>
        <Button variant="ghost" className="text-xs" onClick={onCancel}>Cancel</Button>
      </div>

      <form onSubmit={(e) => void handleSave(e)} noValidate className="grid gap-4">
        <Input label="Title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required error={fieldErrors.title} />
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content" htmlFor="edit-description">Description</label>
          <textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            required
            aria-invalid={Boolean(fieldErrors.description)}
            className={`w-full resize-y rounded-lg border bg-surface-raised px-3 py-2 text-sm text-content transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${fieldErrors.description ? 'border-error' : 'border-line'}`}
          />
          {fieldErrors.description && <p className="text-xs text-error" role="alert">{fieldErrors.description}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField id="edit-category" label="Category" value={needCategory} onChange={(v) => setNeedCategory(v as ReportCategory)} options={CATEGORIES} />
          <SelectField id="edit-urgency" label="Urgency" value={urgency} onChange={(v) => setUrgency(v as ReportUrgency)} options={URGENCIES} />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted select-none">
          <input type="checkbox" checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} className="h-4 w-4 rounded border-line accent-orange" />
          Submit this report now (draft → submitted)
        </label>

        {apiError && <p className="rounded-lg border border-error/30 bg-error/8 px-3 py-2.5 text-sm text-error" role="alert">{apiError}</p>}

        <div className="flex gap-2">
          <Button type="submit" loading={loading} disabled={loading}>Save changes</Button>
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Report detail panel
// ---------------------------------------------------------------------------

type DetailPanelProps = {
  token: string
  reportId: string
  onClose: () => void
  onEdit: (report: Report) => void
}

function DetailPanel({ token, reportId, onClose, onEdit }: DetailPanelProps) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getReport(token, reportId)
      .then((r) => { if (!cancelled) { setReport(r); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(apiMsg(err)); setLoading(false) } })
    return () => { cancelled = true }
  }, [token, reportId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-12"
      role="dialog"
      aria-modal="true"
      aria-label="Report details"
    >
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-surface)] animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-content">Report details</h2>
          <Button variant="ghost" className="text-xs" onClick={onClose}>Close</Button>
        </div>

        {loading && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading…</p>}
        {error && <p className="text-sm text-error" role="alert">{error}</p>}

        {report && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-content">{report.title}</p>
              <div className="flex gap-2">
                <Badge tone={URGENCY_TONE[report.urgency]}>{report.urgency}</Badge>
                <Badge tone={STATUS_TONE[report.status] ?? 'neutral'}>{STATUS_LABEL[report.status] ?? report.status}</Badge>
              </div>
            </div>

            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Category</span>
              <span className="capitalize text-content">{report.needCategory}</span>
            </div>

            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Description</span>
              <p className="text-content leading-relaxed">{report.description}</p>
            </div>

            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Location</span>
              <span className="text-content font-mono text-xs">
                {report.location.coordinates[1].toFixed(5)}, {report.location.coordinates[0].toFixed(5)}
              </span>
              <div className="mt-2">
                <LocationMap
                  markers={[{
                    id: report._id,
                    coordinates: report.location.coordinates,
                    label: report.title,
                    detail: `${report.needCategory} · ${report.urgency}`,
                    tone: report.urgency === 'critical' ? 'error' : report.urgency === 'high' ? 'warning' : 'default',
                  }]}
                  height={200}
                  listHeading="Report location"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="grid gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Created</span>
                <span className="text-content">{new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Updated</span>
                <span className="text-content">{new Date(report.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* E-Commerce Style Relief Delivery Tracking Timeline */}
            {report.status !== 'draft' && (
              <div className="border-t border-line pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Relief Delivery Progress</h3>
                <DeliveryTimeline status={report.status} timeline={report.timeline} />
              </div>
            )}

            {report.status === 'draft' && (
              <div className="mt-1">
                <Button variant="secondary" className="text-sm" onClick={() => onEdit(report)}>
                  Edit draft
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// My reports list
// ---------------------------------------------------------------------------

type MyReportsProps = {
  token: string
  refreshKey: number
  onEdit: (report: Report) => void
}

function MyReports({ token, refreshKey, onEdit }: MyReportsProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMyReports(token)
      setReports(result.data)
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setError(apiMsg(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load, refreshKey])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const result = await getMyReports(token, nextCursor)
      setReports((prev) => [...prev, ...result.data])
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setError(apiMsg(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const filteredReports = statusFilter === 'all'
    ? reports
    : reports.filter((r) => r.status === statusFilter)

  const mapMarkers = reports
    .filter((r) => r.location && Array.isArray(r.location.coordinates) && r.location.coordinates.length === 2)
    .map((r) => ({
      id: r._id,
      coordinates: r.location.coordinates as [number, number],
      label: r.title,
      detail: `${STATUS_LABEL[r.status] ?? r.status} · ${r.needCategory}`,
      tone: (r.urgency === 'critical' ? 'error' : r.urgency === 'high' ? 'warning' : 'default') as 'error' | 'warning' | 'default',
    }))

  return (
    <>
      <Card className="shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
          <div>
            <h2 className="type-dash-section text-content">Your relief requests</h2>
            <p className="mt-0.5 text-xs text-muted">Real-time status tracking for needs you submitted.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="text-xs h-8 px-3" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter reports by status">
          {[
            { id: 'all', label: 'All' },
            { id: 'submitted', label: 'Submitted' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'verified', label: 'Verified' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'draft', label: 'Drafts' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-orange text-white shadow-xs'
                  : 'bg-surface-raised text-muted hover:text-content hover:bg-surface-hover'
              }`}
            >
              {tab.label}
              {tab.id !== 'all' && (
                <span className="ml-1.5 opacity-80">
                  ({reports.filter((r) => r.status === tab.id).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Map preview of reported locations */}
        {mapMarkers.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-line">
            <LocationMap markers={mapMarkers} height={220} listHeading="Reported need locations" />
          </div>
        )}

        {loading && (
          <div className="py-8 text-center text-sm text-muted" aria-live="polite" aria-busy="true">
            <svg className="mx-auto h-5 w-5 animate-spin text-orange mb-2" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Loading your relief requests…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4">
            <p className="text-sm text-error" role="alert">{error}</p>
            <Button variant="outline" className="mt-3 text-xs" onClick={() => void load()}>Retry</Button>
          </div>
        )}

        {!loading && !error && filteredReports.length === 0 && (
          <div className="rounded-xl border border-dashed border-line/80 py-8 px-4 text-center">
            <p className="text-sm font-medium text-content">No {statusFilter === 'all' ? '' : statusFilter} requests found</p>
            <p className="mt-1 text-xs text-muted">
              {statusFilter === 'all'
                ? 'Fill out the form on the left to submit your first emergency relief need.'
                : 'No reports match this specific status filter.'}
            </p>
          </div>
        )}

        {!loading && !error && filteredReports.length > 0 && (
          <ul className="grid gap-3" aria-label="Your relief reports">
            {filteredReports.map((report) => (
              <li
                key={report._id}
                className="group rounded-xl border border-line bg-surface-raised p-4 transition-all hover:border-accent/50 hover:shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-content hover:text-accent transition-colors focus-visible:outline-none focus-visible:underline"
                    onClick={() => setDetailId(report._id)}
                  >
                    {report.title}
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={URGENCY_TONE[report.urgency]}>{report.urgency}</Badge>
                    <Badge tone={STATUS_TONE[report.status] ?? 'neutral'}>
                      {STATUS_LABEL[report.status] ?? report.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="capitalize font-medium text-content">{report.needCategory}</span>
                  {report.affectedPersonCount !== undefined && report.affectedPersonCount > 0 && (
                    <span>· {report.affectedPersonCount} persons</span>
                  )}
                  <span>· {new Date(report.createdAt).toLocaleDateString()}</span>
                </div>

                <p className="mt-1.5 line-clamp-2 text-xs text-muted leading-relaxed">{report.description}</p>

                <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2.5">
                  <span className="text-[11px] text-subtle font-mono">
                    [{report.location.coordinates[1].toFixed(3)}, {report.location.coordinates[0].toFixed(3)}]
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="text-xs px-2.5 py-1 min-h-0 h-7" onClick={() => setDetailId(report._id)}>
                      Details
                    </Button>
                    {report.status === 'draft' && (
                      <Button variant="ghost" className="text-xs px-2.5 py-1 min-h-0 h-7 text-orange hover:text-orange-strong font-medium" onClick={() => onEdit(report)}>
                        Edit Draft
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && !loading && (
          <div className="mt-4 text-center">
            <Button variant="outline" className="text-xs h-8 px-4" onClick={() => void loadMore()} loading={loadingMore}>
              Load more requests
            </Button>
          </div>
        )}
      </Card>

      {detailId && (
        <DetailPanel
          token={token}
          reportId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(r) => { setDetailId(null); onEdit(r) }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// CitizenOverview — Real Dashboard Overview
// ---------------------------------------------------------------------------

type CitizenOverviewProps = {
  token: string
  onNavigate: (tab: string) => void
  onViewDetails: (id: string) => void
  refreshKey: number
}

function CitizenOverview({ token, onNavigate, onViewDetails, refreshKey }: CitizenOverviewProps) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getMyReports(token)
      setReports(res.data)
    } catch (err) {
      setError(apiMsg(err))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  const total = reports?.length ?? 0
  const submitted = reports?.filter((r) => r.status === 'submitted').length ?? 0
  const underReview = reports?.filter((r) => r.status === 'under_review').length ?? 0
  const resolved = reports?.filter((r) => r.status === 'resolved').length ?? 0

  const stats = [
    { label: 'Total Requests', value: total, tone: 'text-content' },
    { label: 'Submitted', value: submitted, tone: 'text-info' },
    { label: 'Under Review', value: underReview, tone: 'text-warning' },
    { label: 'Resolved', value: resolved, tone: 'text-success' },
  ]

  const mapMarkers = (reports ?? [])
    .filter((r) => r.location && Array.isArray(r.location.coordinates) && r.location.coordinates.length === 2)
    .map((r) => ({
      id: r._id,
      coordinates: r.location.coordinates as [number, number],
      label: r.title,
      detail: `${STATUS_LABEL[r.status] ?? r.status} · ${r.needCategory}`,
      tone: (r.urgency === 'critical' ? 'error' : r.urgency === 'high' ? 'warning' : 'default') as 'error' | 'warning' | 'default',
    }))

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-line bg-gradient-to-r from-surface to-surface-raised p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-content tracking-tight">Your Relief Dashboard</h2>
            <p className="mt-1 text-sm text-muted">Create a relief request and follow its progress from one place.</p>
          </div>
          <Button
            onClick={() => onNavigate('create')}
            className="shrink-0 gap-2 h-11 px-5 shadow-sm shadow-orange-500/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Relief Request
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-5 shadow-xs">
            <p className="text-xs uppercase tracking-wider text-muted font-medium">{s.label}</p>
            <p className={`mt-2 text-3xl font-bold ${s.tone}`}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-line bg-surface py-12 text-center text-sm text-muted">
          <svg className="mx-auto h-6 w-6 animate-spin text-orange mb-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          Loading dashboard data…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-error/30 bg-error/10 p-5">
          <p className="text-sm text-error" role="alert">{error}</p>
          <Button variant="outline" className="mt-3 text-xs" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Grid Content */}
      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Recent Requests & Quick Actions */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3 mb-4">
                <div>
                  <h3 className="type-dash-section text-content">Recent Relief Requests</h3>
                  <p className="text-xs text-muted mt-0.5">Your most recent emergency assistance submissions.</p>
                </div>
                {total > 0 && (
                  <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => onNavigate('reports')}>
                    View All Reports →
                  </Button>
                )}
              </div>

              {total === 0 ? (
                <div className="rounded-xl border border-dashed border-line/80 py-8 px-4 text-center">
                  <p className="text-sm font-medium text-content">No relief requests yet</p>
                  <p className="mt-1 text-xs text-muted mb-4">
                    Submit an emergency assistance request for food, water, medical aid, or shelter.
                  </p>
                  <Button onClick={() => onNavigate('create')}>
                    Create First Request
                  </Button>
                </div>
              ) : (
                <ul className="grid gap-3" aria-label="Recent relief requests">
                  {reports!.slice(0, 4).map((report) => (
                    <li
                      key={report._id}
                      className="rounded-xl border border-line bg-surface-raised p-4 transition-all hover:border-accent/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          className="text-left text-sm font-semibold text-content hover:text-accent transition-colors focus-visible:outline-none focus-visible:underline"
                          onClick={() => onViewDetails(report._id)}
                        >
                          {report.title}
                        </button>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={URGENCY_TONE[report.urgency]}>{report.urgency}</Badge>
                          <Badge tone={STATUS_TONE[report.status] ?? 'neutral'}>
                            {STATUS_LABEL[report.status] ?? report.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="capitalize font-medium text-content">{report.needCategory}</span>
                        {report.affectedPersonCount !== undefined && report.affectedPersonCount > 0 && (
                          <span>· {report.affectedPersonCount} persons</span>
                        )}
                        <span>· {new Date(report.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2.5">
                        <span className="text-[11px] text-subtle font-mono">
                          [{report.location.coordinates[1].toFixed(3)}, {report.location.coordinates[0].toFixed(3)}]
                        </span>
                        <Button
                          variant="ghost"
                          className="text-xs px-2.5 py-1 min-h-0 h-7 text-accent hover:text-accent-strong"
                          onClick={() => onViewDetails(report._id)}
                        >
                          Details & Map
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="shadow-sm">
              <h3 className="type-dash-section text-content mb-1">Quick Actions</h3>
              <p className="text-xs text-muted mb-4">Direct navigation shortcuts for citizen coordination.</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => onNavigate('create')} className="gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Create Relief Request
                </Button>
                <Button variant="secondary" onClick={() => onNavigate('reports')}>
                  View My Relief Reports
                </Button>
              </div>
            </Card>
          </div>

          {/* Right: Geographical Request Incident Locations */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="shadow-sm">
              <h4 className="text-sm font-semibold text-content mb-1">Incident Locations</h4>
              <p className="text-xs text-muted mb-3">Geographical map of your reported assistance requests.</p>
              {mapMarkers.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-line">
                  <LocationMap markers={mapMarkers} height={280} listHeading="Reported coordinates" />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line/80 p-8 text-center text-xs text-muted">
                  No active incident locations recorded yet.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CitizenDashboard
// ---------------------------------------------------------------------------

export default function CitizenDashboard() {
  const { state } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'overview'
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  if (state.status !== 'authenticated') return null
  const { token } = state

  function handleNavigate(tab: string) {
    setEditingReport(null)
    setDetailId(null)
    setSearchParams({ tab })
  }

  function handleReportCreated() {
    setRefreshKey((k) => k + 1)
  }

  function handleEditRequest(report: Report) {
    setEditingReport(report)
  }

  function handleEditSaved() {
    setEditingReport(null)
    setRefreshKey((k) => k + 1)
  }

  const title = activeTab === 'create'
    ? 'Create Relief Request'
    : activeTab === 'reports'
    ? 'My Relief Reports'
    : 'Citizen Relief Dashboard'

  const subtitle = activeTab === 'create'
    ? 'Submit an emergency assistance request for food, water, medical aid, shelter, or essential supplies.'
    : activeTab === 'reports'
    ? 'Track live status updates and manage your submitted relief requests.'
    : 'Create a relief request and follow its progress from one place.'

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      {/* Sub-navigation tabs */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {[
          { id: 'overview', label: 'Dashboard' },
          { id: 'create', label: '+ Create Request' },
          { id: 'reports', label: 'My Relief Reports' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleNavigate(tab.id)}
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

      {editingReport ? (
        <div className="max-w-3xl mx-auto">
          <EditForm
            token={token}
            report={editingReport}
            onSaved={handleEditSaved}
            onCancel={() => setEditingReport(null)}
          />
        </div>
      ) : activeTab === 'create' ? (
        <div className="max-w-4xl mx-auto">
          <ReportForm
            token={token}
            onCreated={handleReportCreated}
            onViewReports={() => handleNavigate('reports')}
          />
        </div>
      ) : activeTab === 'reports' ? (
        <div className="w-full">
          <MyReports
            token={token}
            refreshKey={refreshKey}
            onEdit={handleEditRequest}
          />
        </div>
      ) : (
        <CitizenOverview
          token={token}
          onNavigate={handleNavigate}
          onViewDetails={(id) => setDetailId(id)}
          refreshKey={refreshKey}
        />
      )}

      {detailId && (
        <DetailPanel
          token={token}
          reportId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(r) => { setDetailId(null); setEditingReport(r) }}
        />
      )}
    </DashboardLayout>
  )
}
