import { useState, useEffect, useCallback } from 'react'
import {
  getVerifications, getVerification, approveVerification, rejectVerification,
  type NgoVerification, type AdminUser,
} from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type Props = { token: string }

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: NgoVerification[]; nextCursor: string | null }

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; verification: NgoVerification; ngo: AdminUser | null }

const STATUS_FILTER_OPTIONS = ['pending', 'approved', 'rejected', 'suspended']

function verTone(s: string): 'warning' | 'success' | 'error' | 'neutral' {
  if (s === 'pending') return 'warning'
  if (s === 'approved') return 'success'
  if (s === 'rejected' || s === 'suspended') return 'error'
  return 'neutral'
}

export default function AdminNgoVerificationSection({ token }: Props) {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [rejectReason, setRejectReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)

  const [feedback, setFeedback] = useState<string | null>(null)

  const loadList = useCallback((cur?: string) => {
    setListState({ status: 'loading' })
    getVerifications(token, { status: statusFilter, cursor: cur })
      .then(({ data, page }) => setListState({ status: 'ok', items: data, nextCursor: page.nextCursor }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load verifications.'
        setListState({ status: 'error', message })
      })
  }, [token, statusFilter])

  useEffect(() => { loadList() }, [loadList])

  function openDetail(id: string) {
    setDetailState({ status: 'loading' })
    setRejectReason('')
    setReasonError('')
    setConfirmAction(null)
    setFeedback(null)
    getVerification(token, id)
      .then(({ verification, ngo }) => setDetailState({ status: 'ok', verification, ngo }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load verification.'
        setDetailState({ status: 'error', message })
      })
  }

  async function handleApprove() {
    if (detailState.status !== 'ok') return
    setActionBusy(true)
    setConfirmAction(null)
    try {
      await approveVerification(token, detailState.verification._id)
      setFeedback('NGO verification approved successfully. Organization notification dispatched.')
      loadList()
      setDetailState({ status: 'idle' })
    } catch (err: unknown) {
      const message = err instanceof AuthApiError ? err.message : 'Approval failed.'
      alert(message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleReject() {
    if (detailState.status !== 'ok') return
    if (rejectReason.trim().length < 5) {
      setReasonError('Reason must be at least 5 characters.')
      return
    }
    setActionBusy(true)
    setConfirmAction(null)
    try {
      await rejectVerification(token, detailState.verification._id, rejectReason.trim())
      setFeedback('NGO verification rejected. Notice and reason dispatched to the organization.')
      loadList()
      setDetailState({ status: 'idle' })
    } catch (err: unknown) {
      const message = err instanceof AuthApiError ? err.message : 'Rejection failed.'
      alert(message)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <Card>
      <SectionHeading title="NGO Verification" description="Review and decide on pending NGO verification applications." />

      {feedback && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400 flex items-center justify-between" role="status">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-emerald-400 hover:text-emerald-300 text-xs">Dismiss</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTER_OPTIONS.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'primary' : 'outline'}
            onClick={() => { setStatusFilter(s); setDetailState({ status: 'idle' }); setFeedback(null) }}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* List */}
        <div>
          {listState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading…</p>}
          {listState.status === 'error' && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-error" role="alert">{listState.message}</p>
              <Button variant="outline" onClick={() => loadList()}>Retry</Button>
            </div>
          )}
          {listState.status === 'ok' && listState.items.length === 0 && (
            <p className="text-sm text-muted">No {statusFilter} verifications.</p>
          )}
          {listState.status === 'ok' && listState.items.map((v) => (
            <button
              key={v._id}
              type="button"
              onClick={() => openDetail(v._id)}
              className="mb-2 w-full rounded-lg border border-line bg-surface-raised px-4 py-3 text-left hover:border-accent transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-content truncate">{v._id}</span>
                <Badge tone={verTone(v.status)}>{v.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{new Date(v.createdAt).toLocaleDateString()}</p>
            </button>
          ))}
          {listState.status === 'ok' && listState.nextCursor && (
            <Button variant="secondary" onClick={() => loadList(listState.nextCursor ?? undefined)}>Load more</Button>
          )}
        </div>

        {/* Detail */}
        <div>
          {detailState.status === 'idle' && <p className="text-sm text-muted">Select a verification to review.</p>}
          {detailState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading detail…</p>}
          {detailState.status === 'error' && <p className="text-sm text-error" role="alert">{detailState.message}</p>}
          {detailState.status === 'ok' && (
            <div className="rounded-lg border border-line bg-surface-raised p-4 grid gap-3">
              <div>
                <p className="text-xs text-muted">Status</p>
                <Badge tone={verTone(detailState.verification.status)}>{detailState.verification.status}</Badge>
              </div>
              {detailState.ngo && (
                <>
                  <div>
                    <p className="text-xs text-muted">NGO name</p>
                    <p className="text-sm text-content">{detailState.ngo.organizationProfile?.name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Registration number</p>
                    <p className="text-sm text-content">{detailState.ngo.organizationProfile?.registrationNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Email</p>
                    <p className="text-sm text-content">{detailState.ngo.email}</p>
                  </div>
                </>
              )}

              {/* AI Verification Assessment Card */}
              {detailState.verification.assessmentReport && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-accent uppercase tracking-wider">AI Assessment Engine</span>
                    <Badge tone={detailState.verification.assessmentReport.assessment === 'appears_valid' ? 'success' : 'warning'}>
                      {detailState.verification.assessmentReport.assessment.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="text-xs text-content space-y-1">
                    <p><strong className="text-muted">Recommendation:</strong> {detailState.verification.assessmentReport.recommendation}</p>
                    <p><strong className="text-muted">Summary:</strong> {detailState.verification.assessmentReport.summary}</p>
                    <p><strong className="text-muted">Confidence:</strong> {detailState.verification.assessmentReport.confidence}%</p>
                  </div>
                  {detailState.verification.assessmentReport.flags.length > 0 && (
                    <div className="pt-1 border-t border-accent/20">
                      <span className="text-[11px] text-warning font-semibold block mb-1">Attention Flags:</span>
                      <ul className="list-disc list-inside text-[11px] text-muted space-y-0.5">
                        {detailState.verification.assessmentReport.flags.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {detailState.verification.reason && (
                <div className="rounded border border-error/30 bg-error/10 p-2.5">
                  <p className="text-xs font-semibold text-error">Decision Reason</p>
                  <p className="text-xs text-content mt-0.5">{detailState.verification.reason}</p>
                </div>
              )}
              {detailState.verification.reviewedAt && (
                <div>
                  <p className="text-xs text-muted">Decision Date</p>
                  <p className="text-xs text-content">{new Date(detailState.verification.reviewedAt).toLocaleString()}</p>
                </div>
              )}
              {detailState.verification.submittedEvidenceRefs && detailState.verification.submittedEvidenceRefs.length > 0 && (
                <div>
                  <p className="text-xs text-muted">Evidence refs (references)</p>
                  <ul className="mt-1 list-disc list-inside text-sm text-content">
                    {detailState.verification.submittedEvidenceRefs.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}

              {detailState.verification.status === 'pending' && (
                <>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium text-content" htmlFor="reject-reason">
                      Rejection reason <span className="text-muted">(required to reject)</span>
                    </label>
                    <textarea
                      id="reject-reason"
                      rows={3}
                      value={rejectReason}
                      onChange={(e) => { setRejectReason(e.target.value); setReasonError('') }}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-content focus:border-accent focus:outline-none"
                      placeholder="Explain why the application is being rejected…"
                    />
                    {reasonError && <p className="text-xs text-error" role="alert">{reasonError}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      loading={actionBusy}
                      disabled={actionBusy}
                      onClick={() => setConfirmAction('approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      loading={actionBusy}
                      disabled={actionBusy}
                      onClick={() => { if (rejectReason.trim().length < 5) { setReasonError('Reason must be at least 5 characters.'); return } setConfirmAction('reject') }}
                    >
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm text-content">
              {confirmAction === 'approve'
                ? 'Approve this NGO verification? This action will be audited.'
                : `Reject this NGO verification with the provided reason? This action will be audited.`}
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant={confirmAction === 'approve' ? 'primary' : 'danger'}
                onClick={confirmAction === 'approve' ? handleApprove : handleReject}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
