import { useState, useEffect, useCallback } from 'react'
import { AuthApiError } from '../../api/auth'
import { getNgoReports, getNgoReport, type NgoReport } from '../../api/ngo'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import LocationMap from '../ui/LocationMap'

type BadgeTone = 'neutral' | 'warning' | 'success' | 'error' | 'info'

const URGENCY_TONE: Record<string, BadgeTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'error',
}

type Props = { token: string }

export default function NgoReportsSection({ token }: Props) {
  const [reports, setReports] = useState<NgoReport[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<NgoReport | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const load = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await getNgoReports(token, {
        cursor,
        urgency: urgencyFilter || undefined,
        needCategory: categoryFilter || undefined,
      })
      setReports((prev) => cursor ? [...prev, ...result.data] : result.data)
      setNextCursor(result.page.nextCursor)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Could not load reports. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token, urgencyFilter, categoryFilter])

  useEffect(() => { load() }, [load])

  async function openDetail(reportId: string) {
    setDetailLoading(true)
    setDetailError(null)
    setSelected(null)
    try {
      const report = await getNgoReport(token, reportId)
      setSelected(report)
    } catch (err) {
      setDetailError(err instanceof AuthApiError ? err.message : 'Could not load report details.')
    } finally {
      setDetailLoading(false)
    }
  }

  function applyFilters() { load() }

  if (selected) {
    return (
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted hover:text-content transition-colors">
            ← Back to reports
          </button>
        </div>
        <SectionHeading
          title={selected.title}
          supportingContent={<Badge tone={URGENCY_TONE[selected.urgency] ?? 'neutral'}>{selected.urgency}</Badge>}
        />
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Category</dt>
            <dd className="text-content">{selected.needCategory}</dd>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Status</dt>
            <dd className="text-content">{selected.status.replace('_', ' ')}</dd>
          </div>
          {selected.affectedPersonCount !== undefined && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Affected persons</dt>
              <dd className="text-content">{selected.affectedPersonCount}</dd>
            </div>
          )}
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Location</dt>
            <dd className="text-content font-mono text-xs">
              ({selected.location.coordinates[1].toFixed(4)}, {selected.location.coordinates[0].toFixed(4)})
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <LocationMap
            markers={[{
              id: selected._id,
              coordinates: selected.location.coordinates as [number, number],
              label: selected.title,
              detail: `${selected.needCategory} · ${selected.urgency}`,
              tone: selected.urgency === 'critical' ? 'error' : selected.urgency === 'high' ? 'warning' : 'default',
            }]}
            height={240}
            listHeading="Report location"
          />
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <dt className="text-muted">Submitted</dt>
            <dd className="text-content">{new Date(selected.createdAt).toLocaleDateString()}</dd>
          </div>
          {selected.requestedResources.length > 0 && (
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-muted">Resources needed</dt>
              <dd className="text-content">
                <ul className="grid gap-1">
                  {selected.requestedResources.map((r, i) => (
                    <li key={i}>{r.quantity} {r.unit} of {r.category}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </Card>
    )
  }

  return (
    <Card>
      <SectionHeading title="Citizen reports" description="Review submitted relief reports to assess resource needs." />

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value)}
          className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-content focus:border-accent focus:outline-none"
          aria-label="Filter by urgency"
        >
          <option value="">All urgencies</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-content focus:border-accent focus:outline-none"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          <option value="food">Food</option>
          <option value="water">Water</option>
          <option value="shelter">Shelter</option>
          <option value="medical">Medical</option>
          <option value="other">Other</option>
        </select>
        <Button variant="secondary" onClick={applyFilters} disabled={loading}>Apply filters</Button>
      </div>

      {detailError && (
        <p className="mt-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {detailError}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading reports…</p>
      ) : error ? (
        <div className="mt-6 grid gap-3">
          <p className="text-sm text-error" role="alert">{error}</p>
          <Button variant="secondary" onClick={() => load()}>Retry</Button>
        </div>
      ) : reports.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No reports match the current filters.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {reports.map((r) => (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => openDetail(r._id)}
                className="w-full rounded-lg border border-line bg-surface-raised p-4 text-left transition-colors hover:border-accent focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-content">{r.title}</span>
                  <Badge tone={URGENCY_TONE[r.urgency] ?? 'neutral'}>{r.urgency}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                  <span>{r.needCategory}</span>
                  <span>{r.status.replace('_', ' ')}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {detailLoading && <p className="mt-3 text-sm text-muted">Loading report details…</p>}

      {nextCursor && !loading && (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => load(nextCursor)} loading={loadingMore} disabled={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </Card>
  )
}
