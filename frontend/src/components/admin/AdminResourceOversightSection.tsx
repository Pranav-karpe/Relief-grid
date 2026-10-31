import { useState, useEffect, useCallback } from 'react'
import {
  getAdminResources,
  getAdminRequirements,
  getAdminAllocations,
  type AdminResource,
  type AdminRequirement,
  type AdminAllocation,
} from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Input from '../ui/Input'

type Props = { token: string }
type SubTab = 'donations' | 'requirements' | 'allocations'

function donationStatusTone(s: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (s === 'available') return 'success'
  if (s === 'reserved' || s === 'partially_allocated') return 'warning'
  if (s === 'allocated') return 'info'
  if (s === 'expired' || s === 'cancelled') return 'error'
  return 'neutral'
}

function reqStatusTone(s: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (s === 'active') return 'warning'
  if (s === 'fulfilled') return 'success'
  if (s === 'expired' || s === 'cancelled') return 'error'
  return 'neutral'
}

function priorityTone(p: string): 'error' | 'warning' | 'info' | 'neutral' {
  if (p === 'critical') return 'error'
  if (p === 'high') return 'warning'
  if (p === 'medium') return 'info'
  return 'neutral'
}

function allocStateTone(s: string): 'success' | 'warning' | 'error' {
  if (s === 'confirmed') return 'success'
  if (s === 'pending') return 'warning'
  return 'error'
}

export default function AdminResourceOversightSection({ token }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('donations')

  // Donations state
  const [resources, setResources] = useState<AdminResource[]>([])
  const [resCursor, setResCursor] = useState<string | null>(null)
  const [resStatus, setResStatus] = useState('')
  const [resSearch, setResSearch] = useState('')
  const [resLoading, setResLoading] = useState(false)
  const [resError, setResError] = useState<string | null>(null)

  // Requirements state
  const [requirements, setRequirements] = useState<AdminRequirement[]>([])
  const [reqCursor, setReqCursor] = useState<string | null>(null)
  const [reqStatus, setReqStatus] = useState('')
  const [reqPriority, setReqPriority] = useState('')
  const [reqLoading, setReqLoading] = useState(false)
  const [reqError, setReqError] = useState<string | null>(null)

  // Allocations state
  const [allocations, setAllocations] = useState<AdminAllocation[]>([])
  const [allocCursor, setAllocCursor] = useState<string | null>(null)
  const [allocState, setAllocState] = useState('')
  const [allocLoading, setAllocLoading] = useState(false)
  const [allocError, setAllocError] = useState<string | null>(null)

  // Load resources
  const loadResources = useCallback((cur?: string) => {
    setResLoading(true)
    setResError(null)
    getAdminResources(token, {
      cursor: cur,
      status: resStatus || undefined,
      search: resSearch.trim() || undefined,
    })
      .then(({ data, page }) => {
        setResources(data)
        setResCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        setResError(err instanceof AuthApiError ? err.message : 'Failed to load resources.')
      })
      .finally(() => setResLoading(false))
  }, [token, resStatus, resSearch])

  // Load requirements
  const loadRequirements = useCallback((cur?: string) => {
    setReqLoading(true)
    setReqError(null)
    getAdminRequirements(token, {
      cursor: cur,
      status: reqStatus || undefined,
      priority: reqPriority || undefined,
    })
      .then(({ data, page }) => {
        setRequirements(data)
        setReqCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        setReqError(err instanceof AuthApiError ? err.message : 'Failed to load requirements.')
      })
      .finally(() => setReqLoading(false))
  }, [token, reqStatus, reqPriority])

  // Load allocations
  const loadAllocations = useCallback((cur?: string) => {
    setAllocLoading(true)
    setAllocError(null)
    getAdminAllocations(token, {
      cursor: cur,
      state: allocState || undefined,
    })
      .then(({ data, page }) => {
        setAllocations(data)
        setAllocCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        setAllocError(err instanceof AuthApiError ? err.message : 'Failed to load allocations.')
      })
      .finally(() => setAllocLoading(false))
  }, [token, allocState])

  useEffect(() => {
    if (subTab === 'donations') loadResources()
    else if (subTab === 'requirements') loadRequirements()
    else if (subTab === 'allocations') loadAllocations()
  }, [subTab, loadResources, loadRequirements, loadAllocations])

  return (
    <Card>
      <SectionHeading
        title="Resource & Allocation Oversight"
        description="Monitor donor inventory, NGO relief requirements, and durable allocation commitments."
      />

      {/* Subtab navigation */}
      <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3">
        <Button
          variant={subTab === 'donations' ? 'primary' : 'outline'}
          onClick={() => setSubTab('donations')}
        >
          Donor Resource Listings
        </Button>
        <Button
          variant={subTab === 'requirements' ? 'primary' : 'outline'}
          onClick={() => setSubTab('requirements')}
        >
          NGO Requirements
        </Button>
        <Button
          variant={subTab === 'allocations' ? 'primary' : 'outline'}
          onClick={() => setSubTab('allocations')}
        >
          Allocation Ledger
        </Button>
      </div>

      {/* DONATIONS VIEW */}
      {subTab === 'donations' && (
        <div className="mt-4 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); loadResources() }}
            className="flex flex-wrap items-end gap-3"
          >
            <Input
              label="Search category or description"
              placeholder="e.g. Rice, Water..."
              value={resSearch}
              onChange={(e) => setResSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content">Availability Status</label>
              <select
                value={resStatus}
                onChange={(e) => setResStatus(e.target.value)}
                className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
              >
                <option value="">All statuses</option>
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="partially_allocated">Partially Allocated</option>
                <option value="allocated">Fully Allocated</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>

          {resLoading && <p className="text-sm text-muted" aria-live="polite">Loading donor inventory…</p>}
          {resError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error">{resError}</p>
              <Button variant="outline" onClick={() => loadResources()}>Retry</Button>
            </div>
          )}

          {!resLoading && !resError && resources.length === 0 && (
            <p className="text-sm text-muted">No donor listings match the criteria.</p>
          )}

          {!resLoading && !resError && resources.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">Donor</th>
                    <th className="pb-2 pr-4 font-medium">Total / Unit</th>
                    <th className="pb-2 pr-4 font-medium">Reserved</th>
                    <th className="pb-2 pr-4 font-medium">Allocated</th>
                    <th className="pb-2 pr-4 font-medium">Available</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => {
                    const remaining = Math.max(0, r.quantity - (r.quantityReserved || 0) - (r.quantityAllocated || 0))
                    return (
                      <tr key={r._id} className="border-b border-line/40 hover:bg-surface-raised/50 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-content">{r.resourceCategory}</td>
                        <td className="py-2.5 pr-4 text-xs text-muted">
                          {r.donor ? (
                            <div>
                              <p className="font-medium text-content">{r.donor.displayName}</p>
                              <p className="text-subtle truncate max-w-[150px]">{r.donor.email}</p>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-content font-mono">{r.quantity} {r.unit}</td>
                        <td className="py-2.5 pr-4 text-warning font-mono">{r.quantityReserved || 0}</td>
                        <td className="py-2.5 pr-4 text-accent font-mono">{r.quantityAllocated || 0}</td>
                        <td className="py-2.5 pr-4 font-semibold text-emerald-400 font-mono">{remaining}</td>
                        <td className="py-2.5 pr-4">
                          <Badge tone={donationStatusTone(r.availabilityStatus)}>{r.availabilityStatus}</Badge>
                        </td>
                        <td className="py-2.5 capitalize text-xs text-muted">{r.condition}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {resCursor && (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => loadResources(resCursor)}>Load more</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* REQUIREMENTS VIEW */}
      {subTab === 'requirements' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content">Requirement Status</label>
              <select
                value={reqStatus}
                onChange={(e) => setReqStatus(e.target.value)}
                className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content">Priority</label>
              <select
                value={reqPriority}
                onChange={(e) => setReqPriority(e.target.value)}
                className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
              >
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <Button variant="secondary" onClick={() => loadRequirements()}>Filter</Button>
          </div>

          {reqLoading && <p className="text-sm text-muted" aria-live="polite">Loading NGO requirements…</p>}
          {reqError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error">{reqError}</p>
              <Button variant="outline" onClick={() => loadRequirements()}>Retry</Button>
            </div>
          )}

          {!reqLoading && !reqError && requirements.length === 0 && (
            <p className="text-sm text-muted">No NGO requirements match the selected filters.</p>
          )}

          {!reqLoading && !reqError && requirements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">NGO</th>
                    <th className="pb-2 pr-4 font-medium">Requested</th>
                    <th className="pb-2 pr-4 font-medium">Reserved</th>
                    <th className="pb-2 pr-4 font-medium">Fulfilled</th>
                    <th className="pb-2 pr-4 font-medium">Priority</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Needed By</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((req) => (
                    <tr key={req._id} className="border-b border-line/40 hover:bg-surface-raised/50 transition-colors">
                      <td className="py-2.5 pr-4 font-medium text-content">{req.resourceCategory}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted">
                        <p className="font-medium text-content">{req.ngo?.organizationProfile?.name || req.ngo?.displayName || '—'}</p>
                        <p className="text-subtle truncate max-w-[150px]">{req.ngo?.email}</p>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-content">{req.quantityRequested} {req.unit}</td>
                      <td className="py-2.5 pr-4 font-mono text-warning">{req.quantityReserved}</td>
                      <td className="py-2.5 pr-4 font-mono text-emerald-400 font-semibold">{req.quantityFulfilled}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={priorityTone(req.priority)}>{req.priority}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={reqStatusTone(req.status)}>{req.status}</Badge>
                      </td>
                      <td className="py-2.5 text-xs text-muted">
                        {req.neededBy ? new Date(req.neededBy).toLocaleDateString() : 'Immediate'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reqCursor && (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => loadRequirements(reqCursor)}>Load more</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ALLOCATIONS VIEW */}
      {subTab === 'allocations' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-content">Allocation State</label>
              <select
                value={allocState}
                onChange={(e) => setAllocState(e.target.value)}
                className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content focus:border-accent focus:outline-none"
              >
                <option value="">All states</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <Button variant="secondary" onClick={() => loadAllocations()}>Filter</Button>
          </div>

          {allocLoading && <p className="text-sm text-muted" aria-live="polite">Loading allocation ledger…</p>}
          {allocError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error">{allocError}</p>
              <Button variant="outline" onClick={() => loadAllocations()}>Retry</Button>
            </div>
          )}

          {!allocLoading && !allocError && allocations.length === 0 && (
            <p className="text-sm text-muted">No durable allocation records found.</p>
          )}

          {!allocLoading && !allocError && allocations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 pr-4 font-medium">Record ID / Timestamp</th>
                    <th className="pb-2 pr-4 font-medium">Resource</th>
                    <th className="pb-2 pr-4 font-medium">Quantity</th>
                    <th className="pb-2 pr-4 font-medium">Allocated By</th>
                    <th className="pb-2 pr-4 font-medium">State</th>
                    <th className="pb-2 font-medium">Idempotency Key</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => (
                    <tr key={a._id} className="border-b border-line/40 hover:bg-surface-raised/50 transition-colors">
                      <td className="py-2.5 pr-4 text-xs">
                        <span className="font-mono text-content">{a._id}</span>
                        <p className="text-muted">{new Date(a.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-content">
                        <span className="font-medium">{a.donationId?.resourceCategory || a.requirementId?.resourceCategory || 'Resource'}</span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono font-semibold text-accent">
                        {a.quantity} {a.donationId?.unit || ''}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted">
                        <span className="text-content font-medium">{a.allocatedBy?.displayName || 'System'}</span>
                        <p className="text-subtle">({a.allocatedBy?.role || 'admin'})</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={allocStateTone(a.state)}>{a.state}</Badge>
                        {a.failureReason && (
                          <p className="mt-1 text-[11px] text-error truncate max-w-[140px]" title={a.failureReason}>
                            {a.failureReason}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-xs text-subtle truncate max-w-[160px]">
                        {a.idempotencyKey || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allocCursor && (
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => loadAllocations(allocCursor)}>Load more</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
