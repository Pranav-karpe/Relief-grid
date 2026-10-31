import { useState, useEffect, useCallback } from 'react'
import { getAdminComplaints, patchComplaintStatus, type AdminComplaint } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type Props = { token: string }

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: AdminComplaint[]; nextCursor: string | null }

const COMPLAINT_STATUSES = ['', 'open', 'under_review', 'resolved', 'dismissed']

const TRANSITIONS: Record<string, string[]> = {
  open: ['under_review', 'dismissed'],
  under_review: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
}

function statusTone(s: string): 'warning' | 'info' | 'success' | 'error' | 'neutral' {
  if (s === 'open') return 'warning'
  if (s === 'under_review') return 'info'
  if (s === 'resolved') return 'success'
  if (s === 'dismissed') return 'error'
  return 'neutral'
}

export default function AdminComplaintSection({ token }: Props) {
  const [statusFilter, setStatusFilter] = useState('')
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<AdminComplaint | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback((cur?: string) => {
    setListState({ status: 'loading' })
    getAdminComplaints(token, { cursor: cur, status: statusFilter || undefined })
      .then(({ data, page }) => setListState({ status: 'ok', items: data, nextCursor: page.nextCursor }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load complaints.'
        setListState({ status: 'error', message })
      })
  }, [token, statusFilter])

  useEffect(() => { load() }, [load])

  async function applyStatus(newStatus: string) {
    if (!selected) return
    setActionBusy(true)
    setConfirm(null)
    try {
      const updated = await patchComplaintStatus(token, selected._id, newStatus, reason.trim() || undefined)
      setSelected(updated)
      setListState((prev) => {
        if (prev.status !== 'ok') return prev
        return { ...prev, items: prev.items.map((c) => c._id === updated._id ? updated : c) }
      })
      setReason('')
    } catch (err: unknown) {
      const message = err instanceof AuthApiError ? err.message : 'Status update failed.'
      alert(message)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <Card>
      <SectionHeading title="Complaints" description="Review and resolve platform complaints." />

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setSelected(null) }}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-content focus:border-accent focus:outline-none">
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          {listState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading complaints…</p>}
          {listState.status === 'error' && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error" role="alert">{listState.message}</p>
              <Button variant="outline" onClick={() => load()}>Retry</Button>
            </div>
          )}
          {listState.status === 'ok' && listState.items.length === 0 && (
            <p className="text-sm text-muted">No complaints match the current filter.</p>
          )}
          {listState.status === 'ok' && listState.items.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => { setSelected(c); setReason('') }}
              className={`mb-2 w-full rounded-lg border px-4 py-3 text-left transition-colors ${selected?._id === c._id ? 'border-accent bg-accent/5' : 'border-line bg-surface-raised hover:border-accent'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-content truncate">{c.subjectEntityType}</span>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted line-clamp-1">{c.description}</p>
            </button>
          ))}
          {listState.status === 'ok' && listState.nextCursor && (
            <Button variant="secondary" onClick={() => load(listState.nextCursor ?? undefined)}>Load more</Button>
          )}
        </div>

        <div>
          {!selected && <p className="text-sm text-muted">Select a complaint to review.</p>}
          {selected && (
            <div className="rounded-lg border border-line bg-surface-raised p-4 grid gap-3">
              <div>
                <p className="text-xs text-muted">Subject type</p>
                <p className="text-sm text-content">{selected.subjectEntityType}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Description</p>
                <p className="text-sm text-content">{selected.description}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Status</p>
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
              </div>
              {selected.reason && (
                <div>
                  <p className="text-xs text-muted">Resolution reason</p>
                  <p className="text-sm text-content">{selected.reason}</p>
                </div>
              )}

              {(TRANSITIONS[selected.status] ?? []).length > 0 && (
                <>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium text-content" htmlFor="complaint-reason">
                      Reason <span className="text-muted">(optional)</span>
                    </label>
                    <textarea
                      id="complaint-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none"
                      placeholder="Optional resolution note…"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(TRANSITIONS[selected.status] ?? []).map((s) => (
                      <Button
                        key={s}
                        variant={s === 'dismissed' ? 'danger' : 'primary'}
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
              Change complaint status to <strong>{confirm}</strong>? This action will be audited.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant={confirm === 'dismissed' ? 'danger' : 'primary'} onClick={() => applyStatus(confirm)}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
