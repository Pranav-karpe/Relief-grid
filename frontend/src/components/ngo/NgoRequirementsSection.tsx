import { useState, useEffect, useCallback } from 'react'
import { AuthApiError } from '../../api/auth'
import {
  getMatchesForRequirement,
  type MatchSuggestion,
} from '../../api/matching'
import {
  createRequirement,
  getMyRequirements,
  patchRequirement,
  cancelRequirement,
  type Requirement,
  type CreateRequirementInput,
  type RequirementPriority,
} from '../../api/ngo'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Input from '../ui/Input'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'error',
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  fulfilled: 'info',
  expired: 'neutral',
  cancelled: 'error',
}

type View = 'list' | 'create' | 'detail'

type FormState = {
  resourceCategory: string
  description: string
  quantityRequested: string
  unit: string
  priority: RequirementPriority
  lng: string
  lat: string
  neededBy: string
}

const EMPTY_FORM: FormState = {
  resourceCategory: '',
  description: '',
  quantityRequested: '',
  unit: '',
  priority: 'medium',
  lng: '',
  lat: '',
  neededBy: '',
}

type Props = { token: string }

export default function NgoRequirementsSection({ token }: Props) {
  const [view, setView] = useState<View>('list')
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Requirement | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [matches, setMatches] = useState<MatchSuggestion[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [detectingGps, setDetectingGps] = useState(false)

  const loadList = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    setListError(null)
    try {
      const result = await getMyRequirements(token, { cursor })
      setRequirements((prev) => cursor ? [...prev, ...result.data] : result.data)
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setListError(err instanceof AuthApiError ? err.message : 'Could not load requirements.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token])

  useEffect(() => { if (view === 'list') loadList() }, [view, loadList])

  async function fetchMatches(reqId: string) {
    setLoadingMatches(true)
    try {
      const data = await getMatchesForRequirement(token, reqId)
      setMatches(data)
    } catch {
      setMatches([])
    } finally {
      setLoadingMatches(false)
    }
  }

  function handleDetectGps() {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser.')
      return
    }
    setDetectingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          lng: pos.coords.longitude.toFixed(6),
          lat: pos.coords.latitude.toFixed(6),
        }))
        setDetectingGps(false)
      },
      () => {
        setDetectingGps(false)
        alert('Could not retrieve current location. Please enter coordinates manually.')
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }

  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.resourceCategory.trim()) errs.resourceCategory = 'Resource category is required.'
    if (form.description.trim().length < 10) errs.description = 'Description must be at least 10 characters.'
    const qty = Number(form.quantityRequested)
    if (!Number.isFinite(qty) || qty <= 0) errs.quantityRequested = 'Quantity must be a positive number.'
    if (!form.unit.trim()) errs.unit = 'Unit is required.'
    const lng = Number(form.lng)
    const lat = Number(form.lat)
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errs.lng = 'Longitude must be between -180 and 180.'
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errs.lat = 'Latitude must be between -90 and 90.'
    if (form.neededBy && isNaN(new Date(form.neededBy).getTime())) errs.neededBy = 'Invalid date.'
    return errs
  }

  async function handleCreate() {
    const errs = validateForm()
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setSubmitting(true)
    setSubmitError(null)
    setFieldErrors({})
    try {
      const input: CreateRequirementInput = {
        resourceCategory: form.resourceCategory.trim(),
        description: form.description.trim(),
        quantityRequested: Number(form.quantityRequested),
        unit: form.unit.trim(),
        priority: form.priority,
        deliveryArea: { type: 'Point', coordinates: [Number(form.lng), Number(form.lat)] },
        ...(form.neededBy ? { neededBy: form.neededBy } : {}),
      }
      await createRequirement(token, input)
      setForm(EMPTY_FORM)
      setView('list')
    } catch (err) {
      setSubmitError(err instanceof AuthApiError ? err.message : 'Could not create requirement. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit() {
    if (!selected) return
    const errs = validateForm()
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return }

    setActionLoading(true)
    setActionError(null)
    setFieldErrors({})
    try {
      const updated = await patchRequirement(token, selected._id, {
        resourceCategory: form.resourceCategory.trim(),
        description: form.description.trim(),
        quantityRequested: Number(form.quantityRequested),
        unit: form.unit.trim(),
        priority: form.priority,
        deliveryArea: { type: 'Point', coordinates: [Number(form.lng), Number(form.lat)] },
        neededBy: form.neededBy || null,
      })
      setSelected(updated)
      setEditMode(false)
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Could not save changes.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancel() {
    if (!selected) return
    setActionLoading(true)
    setActionError(null)
    try {
      const updated = await cancelRequirement(token, selected._id)
      setSelected(updated)
      setCancelConfirm(false)
    } catch (err) {
      setActionError(err instanceof AuthApiError ? err.message : 'Could not cancel requirement.')
    } finally {
      setActionLoading(false)
    }
  }

  function openDetail(req: Requirement) {
    setSelected(req)
    setEditMode(false)
    setCancelConfirm(false)
    setActionError(null)
    setView('detail')
    fetchMatches(req._id)
  }

  function startEdit() {
    if (!selected) return
    setForm({
      resourceCategory: selected.resourceCategory,
      description: selected.description,
      quantityRequested: String(selected.quantityRequested),
      unit: selected.unit,
      priority: selected.priority,
      lng: String(selected.deliveryArea.coordinates[0]),
      lat: String(selected.deliveryArea.coordinates[1]),
      neededBy: selected.neededBy ? selected.neededBy.slice(0, 10) : '',
    })
    setFieldErrors({})
    setActionError(null)
    setEditMode(true)
  }

  function field(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // ---- Create form ----
  if (view === 'create') {
    return (
      <Card>
        <div className="mb-4">
          <button type="button" onClick={() => setView('list')} className="text-sm text-muted hover:text-content transition-colors">
            ← Back to requirements
          </button>
        </div>
        <SectionHeading title="Create resource requirement" description="Specify resource requirements for citizen relief distribution." />
        
        {submitError && (
          <p className="mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">{submitError}</p>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <Input label="Resource category" value={form.resourceCategory} onChange={(e) => field('resourceCategory', e.target.value)} error={fieldErrors.resourceCategory} placeholder="e.g. Water, Emergency Rations, Medical kits" maxLength={80} />
          </div>

          <div className="md:col-span-2 grid gap-1.5">
            <label className="text-sm font-medium text-content" htmlFor="req-description">Description</label>
            <textarea
              id="req-description"
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              rows={3}
              maxLength={3000}
              className={`min-h-[90px] w-full rounded-lg border bg-surface-raised px-3 py-2 text-sm text-content placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${fieldErrors.description ? 'border-error' : 'border-line'}`}
              placeholder="Describe what is required, specifications, and urgency criteria (min 10 characters)"
            />
            {fieldErrors.description && <p className="text-xs text-error" role="alert">{fieldErrors.description}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Quantity" type="number" min="1" value={form.quantityRequested} onChange={(e) => field('quantityRequested', e.target.value)} error={fieldErrors.quantityRequested} />
            <Input label="Unit" value={form.unit} onChange={(e) => field('unit', e.target.value)} error={fieldErrors.unit} placeholder="cases, kg, litres" maxLength={40} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content" htmlFor="req-priority">Priority level</label>
              <select id="req-priority" value={form.priority} onChange={(e) => field('priority', e.target.value as RequirementPriority)} className="h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <Input label="Needed by (optional)" type="date" value={form.neededBy} onChange={(e) => field('neededBy', e.target.value)} error={fieldErrors.neededBy} />
          </div>

          <div className="md:col-span-2 rounded-xl border border-line/60 bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <span className="text-sm font-medium text-content">Delivery area coordinates</span>
                <p className="text-xs text-muted">Set target delivery center or distribution zone location</p>
              </div>
              <Button type="button" variant="secondary" onClick={handleDetectGps} loading={detectingGps} disabled={detectingGps} className="text-xs">
                📍 Auto-detect GPS
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Longitude" type="number" step="any" value={form.lng} onChange={(e) => field('lng', e.target.value)} error={fieldErrors.lng} placeholder="-180 to 180" />
              <Input label="Latitude" type="number" step="any" value={form.lat} onChange={(e) => field('lat', e.target.value)} error={fieldErrors.lat} placeholder="-90 to 90" />
            </div>
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
            <Button onClick={handleCreate} loading={submitting} disabled={submitting}>Publish requirement</Button>
            <Button variant="ghost" onClick={() => setView('list')} disabled={submitting}>Cancel</Button>
          </div>
        </div>
      </Card>
    )
  }

  // ---- Detail / edit view ----
  if (view === 'detail' && selected) {
    return (
      <Card>
        <div className="mb-4">
          <button type="button" onClick={() => { setView('list'); setEditMode(false) }} className="text-sm text-muted hover:text-content transition-colors">
            ← Back to requirements
          </button>
        </div>
        <SectionHeading
          title={editMode ? 'Edit requirement' : selected.resourceCategory}
          supportingContent={
            !editMode ? (
              <div className="flex gap-2">
                <Badge tone={PRIORITY_TONE[selected.priority] ?? 'neutral'}>{selected.priority}</Badge>
                <Badge tone={STATUS_TONE[selected.status] ?? 'neutral'}>{selected.status}</Badge>
              </div>
            ) : null
          }
        />

        {actionError && (
          <p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">{actionError}</p>
        )}

        {!editMode ? (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-5">
              <dl className="grid gap-3 rounded-xl border border-line bg-surface-raised p-5 text-sm">
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-muted">Description</dt>
                  <dd className="text-content font-medium">{selected.description}</dd>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-muted">Requested</dt>
                  <dd className="text-content font-semibold">{selected.quantityRequested} {selected.unit}</dd>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-muted">Fulfillment</dt>
                  <dd className="text-content">
                    <div className="flex items-center gap-3">
                      <span>{selected.quantityFulfilled} fulfilled / {selected.quantityReserved} reserved</span>
                      <div className="w-24 h-2 bg-surface rounded-full overflow-hidden border border-line">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${Math.min(100, Math.round((selected.quantityFulfilled / selected.quantityRequested) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </dd>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-muted">Delivery Area</dt>
                  <dd className="font-mono text-xs text-content">[{selected.deliveryArea.coordinates[1].toFixed(4)}, {selected.deliveryArea.coordinates[0].toFixed(4)}]</dd>
                </div>
                {selected.neededBy && (
                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <dt className="text-muted">Needed By</dt>
                    <dd className="text-content">{new Date(selected.neededBy).toLocaleDateString()}</dd>
                  </div>
                )}
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <dt className="text-muted">Posted On</dt>
                  <dd className="text-content">{new Date(selected.createdAt).toLocaleDateString()}</dd>
                </div>
              </dl>

              {selected.status === 'active' && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="secondary" onClick={startEdit}>Edit specification</Button>
                  {!cancelConfirm ? (
                    <Button variant="danger" onClick={() => setCancelConfirm(true)}>Cancel requirement</Button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 p-2">
                      <span className="text-sm text-error font-medium">Confirm cancellation?</span>
                      <Button variant="danger" onClick={handleCancel} loading={actionLoading} disabled={actionLoading}>Confirm</Button>
                      <Button variant="ghost" onClick={() => setCancelConfirm(false)} disabled={actionLoading}>Keep</Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-xl border border-line bg-surface-raised p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-content">Matching Donor Resources</h3>
                  {loadingMatches && <span className="text-xs text-muted">Searching...</span>}
                </div>

                {loadingMatches ? (
                  <p className="text-xs text-muted">Querying available donations within coverage radius...</p>
                ) : matches.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted">No donor matches found currently.</p>
                    <p className="text-xs text-muted/70 mt-1">Donors posting matching items in this category will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matches.map((m) => (
                      <div key={m.donationId} className="rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent/40">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-sm font-semibold text-content capitalize">{m.donationCategory}</span>
                            <p className="text-xs text-muted mt-0.5">
                              {m.suggestedQty} {m.unit} suggested (of {m.availableQty} available)
                            </p>
                          </div>
                          <Badge tone="success">
                            {Math.round(m.score * 100)}% match
                          </Badge>
                        </div>
                        {m.distanceKm !== null && (
                          <p className="text-xs text-content/70 mt-2 font-mono">
                            📍 {m.distanceKm.toFixed(1)} km from delivery zone
                          </p>
                        )}
                        {m.reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {m.reasons.map((r, i) => (
                              <span key={i} className="text-[11px] rounded bg-surface-raised px-1.5 py-0.5 text-muted border border-line/40">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <Input label="Resource category" value={form.resourceCategory} onChange={(e) => field('resourceCategory', e.target.value)} error={fieldErrors.resourceCategory} maxLength={80} />
            </div>

            <div className="md:col-span-2 grid gap-1.5">
              <label className="text-sm font-medium text-content" htmlFor="edit-description">Description</label>
              <textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                rows={3}
                maxLength={3000}
                className={`min-h-[90px] w-full rounded-lg border bg-surface-raised px-3 py-2 text-sm text-content focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${fieldErrors.description ? 'border-error' : 'border-line'}`}
              />
              {fieldErrors.description && <p className="text-xs text-error" role="alert">{fieldErrors.description}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Quantity" type="number" min="1" value={form.quantityRequested} onChange={(e) => field('quantityRequested', e.target.value)} error={fieldErrors.quantityRequested} />
              <Input label="Unit" value={form.unit} onChange={(e) => field('unit', e.target.value)} error={fieldErrors.unit} maxLength={40} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium text-content" htmlFor="edit-priority">Priority</label>
                <select id="edit-priority" value={form.priority} onChange={(e) => field('priority', e.target.value as RequirementPriority)} className="h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <Input label="Needed by (optional)" type="date" value={form.neededBy} onChange={(e) => field('neededBy', e.target.value)} error={fieldErrors.neededBy} />
            </div>

            <div className="md:col-span-2 rounded-xl border border-line/60 bg-surface/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-sm font-medium text-content">Delivery area coordinates</span>
                <Button type="button" variant="secondary" onClick={handleDetectGps} loading={detectingGps} disabled={detectingGps} className="text-xs">
                  📍 Auto-detect GPS
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Longitude" type="number" step="any" value={form.lng} onChange={(e) => field('lng', e.target.value)} error={fieldErrors.lng} />
                <Input label="Latitude" type="number" step="any" value={form.lat} onChange={(e) => field('lat', e.target.value)} error={fieldErrors.lat} />
              </div>
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
              <Button onClick={handleSaveEdit} loading={actionLoading} disabled={actionLoading}>Save changes</Button>
              <Button variant="ghost" onClick={() => { setEditMode(false); setFieldErrors({}) }} disabled={actionLoading}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    )
  }

  // ---- List view ----
  return (
    <Card>
      <SectionHeading
        title="My requirements"
        description="Resource requirements your organisation has posted."
        supportingContent={<Button onClick={() => { setForm(EMPTY_FORM); setSubmitError(null); setFieldErrors({}); setView('create') }}>New requirement</Button>}
      />

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading requirements…</p>
      ) : listError ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm text-error" role="alert">{listError}</p>
          <Button variant="secondary" onClick={() => loadList()}>Retry</Button>
        </div>
      ) : requirements.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No requirements yet. Create your first requirement to get started.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {requirements.map((r) => (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => openDetail(r)}
                className="w-full rounded-lg border border-line bg-surface-raised p-4 text-left transition-colors hover:border-accent focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-content">{r.resourceCategory}</span>
                  <div className="flex gap-2">
                    <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{r.priority}</Badge>
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                  <span>{r.quantityRequested} {r.unit}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && !loading && (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => loadList(nextCursor)} loading={loadingMore} disabled={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  )
}
