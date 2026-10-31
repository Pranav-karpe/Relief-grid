import { useState, useEffect, useCallback } from 'react'
import { getAdminReports, patchReportStatus, type AdminReport } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type Props = { token: string }

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: AdminReport[]; nextCursor: string | null }

const REPORT_STATUSES = ['', 'submitted', 'under_review', 'verified', 'rejected', 'resolved']
const URGENCIES = ['', 'low', 'medium', 'high', 'critical']

const TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['verified', 'rejected'],
  verified: ['resolved'],
  rejected: [],
  resolved: [],
  draft: ['submitted'],
}

function urgencyTone(u: string): 'error' | 'warning' | 'info' | 'neutral' {
  if (u === 'critical') return 'error'
  if (u === 'high') return 'warning'
  if (u === 'medium') return 'info'
  return 'neutral'
}

function statusTone(s: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (s === 'verified' || s === 'resolved') return 'success'
  if (s === 'under_review') return 'info'
  if (s === 'submitted') return 'warning'
  if (s === 'rejected') return 'error'
  return 'neutral'
}

export default function AdminReportSection({ token }: Props) {
  const [statusFilter, setStatusFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<AdminReport | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback((cur?: string) => {
    setListState({ status: 'loading' })
    getAdminReports(token, {
      cursor: cur,
      status: statusFilter || undefined,
      urgency: urgencyFilter || undefined,
    })
      .then(({ data, page }) => setListState({ status: 'ok', items: data, nextCursor: page.nextCursor }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load reports.'
        setListState({ status: 'error', message })
      })
  }, [token, statusFilter, urgencyFilter])

  useEffect(() => { load() }, [load])

  async function applyStatus(newStatus: string) {
    if (!selected) return
    setActionBusy(true)
    setConfirm(null)
    try {
      const updated = await patchReportStatus(token, selected._id, newStatus, note.trim() || undefined)
      setSelected(updated)
      setListState((prev) => {
        if (prev.status !== 'ok') return prev
        return { ...prev, items: prev.items.map((r) => r._id === updated._id ? updated : r) }
      })
      setNote('')
    } catch (err: unknown) {
      const message = err instanceof AuthApiError ? err.message : 'Status update failed.'
      alert(message)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <Card>
      <SectionHeading title="Report Oversight" description="Review and manage disaster relief reports." />

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelected(null) }}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-content focus:border-accent focus:outline-none">
            {REPORT_STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Urgency</label>
          <select value={urgencyFilter} onChange={(e) => { setUrgencyFilter(e.target.value); setSelected(null) }}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-content focus:border-accent focus:outline-none">
            {URGENCIES.map((u) => <option key={u} value={u}>{u || 'All urgencies'}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          {listState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading reports…</p>}
          {listState.status === 'error' && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error" role="alert">{listState.message}</p>
              <Button variant="outline" onClick={() => load()}>Retry</Button>
            </div>
          )}
          {listState.status === 'ok' && listState.items.length === 0 && (
            <p className="text-sm text-muted">No reports match the current filters.</p>
          )}
          {listState.status === 'ok' && listState.items.map((r) => (
            <button
              key={r._id}
              type="button"
              onClick={() => { setSelected(r); setNote('') }}
              className={`mb-2 w-full rounded-lg border px-4 py-3 text-left transition-colors ${selected?._id === r._id ? 'border-accent bg-accent/5' : 'border-line bg-surface-raised hover:border-accent'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-content truncate">{r.title}</span>
                <Badge tone={urgencyTone(r.urgency)}>{r.urgency}</Badge>
              </div>
              <div className="mt-1 flex gap-2 items-center flex-wrap">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                {r.riskAssessment && r.riskAssessment.riskLevel !== 'low' && (
                  <Badge tone={r.riskAssessment.riskLevel === 'high' ? 'error' : 'warning'}>
                    {r.riskAssessment.riskLevel} risk
                  </Badge>
                )}
                <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
          {listState.status === 'ok' && listState.nextCursor && (
            <Button variant="secondary" onClick={() => load(listState.nextCursor ?? undefined)}>Load more</Button>
          )}
        </div>

        <div>
          {!selected && <p className="text-sm text-muted">Select a report to review.</p>}
          {selected && (
            <div className="rounded-lg border border-line bg-surface-raised p-4 grid gap-3">
              <div>
                <p className="text-xs text-muted">Title</p>
                <p className="text-sm font-medium text-content">{selected.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Description</p>
                <p className="text-sm text-content">{selected.description}</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted">Category</p>
                  <p className="text-sm text-content">{selected.needCategory}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Urgency</p>
                  <Badge tone={urgencyTone(selected.urgency)}>{selected.urgency}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted">Status</p>
                  <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                </div>
              </div>
              {selected.affectedPersonCount !== undefined && (
                <div>
                  <p className="text-xs text-muted">Affected persons</p>
                  <p className="text-sm text-content">{selected.affectedPersonCount}</p>
                </div>
              )}
              {selected.location?.coordinates && (
                <div>
                  <p className="text-xs text-muted">Location Coordinates</p>
                  <p className="text-xs font-mono text-content">
                    {selected.location.coordinates[1].toFixed(4)}°N, {selected.location.coordinates[0].toFixed(4)}°E
                  </p>
                </div>
              )}
              {selected.requestedResources && selected.requestedResources.length > 0 && (
                <div>
                  <p className="text-xs text-muted">Requested Resources</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selected.requestedResources.map((res, i) => (
                      <span key={i} className="rounded bg-surface px-2 py-0.5 text-xs text-content border border-line">
                        {res.category}: {res.quantity} {res.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected.evidenceRefs && selected.evidenceRefs.length > 0 && (
                <div>
                  <p className="text-xs text-muted">Evidence References</p>
                  <ul className="mt-1 list-disc list-inside text-xs font-mono text-subtle">
                    {selected.evidenceRefs.map((ref, i) => <li key={i}>{ref}</li>)}
                  </ul>
                </div>
              )}

              {/* Citizen Authenticity & Spam Risk Analysis */}
              {selected.riskAssessment && (
                <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">Authenticity & Duplicate Risk</span>
                    <Badge tone={selected.riskAssessment.riskLevel === 'high' ? 'error' : selected.riskAssessment.riskLevel === 'medium' ? 'warning' : 'success'}>
                      {selected.riskAssessment.riskLevel.toUpperCase()} RISK (Score {selected.riskAssessment.riskScore}/100)
                    </Badge>
                  </div>
                  <p className="text-xs text-content leading-relaxed">{selected.riskAssessment.explanation}</p>
                  {selected.riskAssessment.flags && selected.riskAssessment.flags.length > 0 && (
                    <div className="pt-1 text-[11px] text-warning">
                      <strong>Flags Detected:</strong> {selected.riskAssessment.flags.join(' · ')}
                    </div>
                  )}
                  {selected.riskAssessment.suggestedAction && (
                    <p className="text-[11px] text-muted">
                      <strong>Suggested Action:</strong> {selected.riskAssessment.suggestedAction}
                    </p>
                  )}
                </div>
              )}
              {selected.review?.reviewedAt && (
                <div className="rounded border border-line/40 bg-surface p-2 text-xs">
                  <p className="text-muted">Previous Review: {new Date(selected.review.reviewedAt).toLocaleString()}</p>
                </div>
              )}

              {(TRANSITIONS[selected.status] ?? []).length > 0 && (
                <>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium text-content" htmlFor="review-note">Review note (optional)</label>
                    <textarea
                      id="review-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none"
                      placeholder="Optional internal note…"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(TRANSITIONS[selected.status] ?? []).map((s) => (
                      <Button
                        key={s}
                        variant={s === 'rejected' ? 'danger' : 'primary'}
                        loading={actionBusy}
                        disabled={actionBusy}
                        onClick={() => setConfirm(s)}
                      >
                        → {s}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm text-content">
              Change report status to <strong>{confirm}</strong>? This action will be audited.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant={confirm === 'rejected' ? 'danger' : 'primary'} onClick={() => applyStatus(confirm)}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
