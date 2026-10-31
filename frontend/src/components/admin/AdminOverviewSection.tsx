import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminOverview, type AdminOverview } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'

type Props = { token: string }

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: AdminOverview }

export default function AdminOverviewSection({ token }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const navigate = useNavigate()

  const load = useCallback(() => {
    setState({ status: 'loading' })
    getAdminOverview(token)
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load platform overview metrics.'
        setState({ status: 'error', message })
      })
  }, [token])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            title="Platform Administration Overview"
            description="Live system-wide operational metrics and pending administrative actions aggregated from the database."
          />
          <Button variant="secondary" onClick={load}>Refresh Metrics</Button>
        </div>

        {state.status === 'loading' && (
          <div className="py-12 text-center" aria-live="polite" aria-busy="true">
            <p className="text-sm text-muted">Aggregating live platform metrics from MongoDB…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="my-6 rounded-xl border border-error/30 bg-error/10 p-5 text-center">
            <p className="text-sm font-medium text-error" role="alert">{state.message}</p>
            <p className="mt-1 text-xs text-muted">A connection or query error occurred. Zero values are not assumed.</p>
            <div className="mt-4">
              <Button variant="outline" onClick={load}>Retry Connection</Button>
            </div>
          </div>
        )}

        {state.status === 'ok' && (
          <div className="mt-6 space-y-6">
            {/* PRIORITY ACTION BANNERS */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                Urgent Administrative Queues
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Pending NGO Verification */}
                <div className={`rounded-xl border p-4 transition-all ${
                  state.data.ngoVerifications.pending > 0
                    ? 'border-orange/60 bg-orange/10 shadow-sm'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">NGO Applications</span>
                    {state.data.ngoVerifications.pending > 0 && (
                      <Badge tone="warning">Pending Review</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-2xl font-bold text-content">
                    {state.data.ngoVerifications.pending}
                  </p>
                  <p className="text-xs text-muted mt-1">Awaiting accreditation check</p>
                  <div className="mt-3">
                    <Button
                      variant={state.data.ngoVerifications.pending > 0 ? 'primary' : 'outline'}
                      className="w-full text-xs py-1"
                      onClick={() => navigate('/dashboard/admin?tab=ngos')}
                    >
                      Review Queue
                    </Button>
                  </div>
                </div>

                {/* Reports Under Review / Submitted */}
                <div className={`rounded-xl border p-4 transition-all ${
                  state.data.reports.submitted > 0 || state.data.reports.underReview > 0
                    ? 'border-accent/40 bg-accent/5 shadow-sm'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Pending Relief Reports</span>
                    <Badge tone="info">Active</Badge>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-content">
                    {(state.data.reports.submitted || 0) + (state.data.reports.underReview || 0)}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {state.data.reports.submitted} submitted · {state.data.reports.underReview} in review
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      className="w-full text-xs py-1"
                      onClick={() => navigate('/dashboard/admin?tab=reports')}
                    >
                      Inspect Reports
                    </Button>
                  </div>
                </div>

                {/* Field Tasks in Progress */}
                <div className="rounded-xl border border-line bg-surface-raised p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Field Tasks</span>
                    <Badge tone="neutral">Volunteers</Badge>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-content">
                    {state.data.tasks.active}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {state.data.tasks.byDelivery?.inTransit || 0} currently in transit
                  </p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      className="w-full text-xs py-1"
                      onClick={() => navigate('/dashboard/admin?tab=volunteers')}
                    >
                      Track Field Ops
                    </Button>
                  </div>
                </div>

                {/* Open Complaints */}
                <div className={`rounded-xl border p-4 transition-all ${
                  state.data.complaints.open > 0
                    ? 'border-error/40 bg-error/10'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Platform Complaints</span>
                    {state.data.complaints.open > 0 ? (
                      <Badge tone="error">Attention Required</Badge>
                    ) : (
                      <Badge tone="success">Clear</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-2xl font-bold text-content">
                    {state.data.complaints.open}
                  </p>
                  <p className="text-xs text-muted mt-1">Open platform grievances</p>
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      className="w-full text-xs py-1"
                      onClick={() => navigate('/dashboard/admin?tab=complaints')}
                    >
                      View Complaints
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* PLATFORM USERS BREAKDOWN */}
            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
                <h3 className="text-sm font-semibold text-content">Registered Users by Role</h3>
                <span className="text-xs text-muted">
                  Total Accounts: <strong className="text-content font-mono">{state.data.users.total}</strong> ({state.data.users.active} active)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-line/60 bg-surface p-3">
                  <p className="text-xs text-muted">Citizens</p>
                  <p className="text-xl font-bold text-content mt-1">{state.data.users.byRole?.citizen ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface p-3">
                  <p className="text-xs text-muted">Donors</p>
                  <p className="text-xl font-bold text-content mt-1">{state.data.users.byRole?.donor ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface p-3">
                  <p className="text-xs text-muted">Volunteers</p>
                  <p className="text-xl font-bold text-content mt-1">{state.data.users.byRole?.volunteer ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface p-3">
                  <p className="text-xs text-muted">NGOs</p>
                  <p className="text-xl font-bold text-content mt-1">{state.data.users.byRole?.ngo ?? '—'}</p>
                  <p className="text-[11px] text-muted mt-0.5">{state.data.ngoVerifications.approved} verified</p>
                </div>
                <div className="rounded-lg border border-line/60 bg-surface p-3">
                  <p className="text-xs text-muted">Administrators</p>
                  <p className="text-xl font-bold text-content mt-1">{state.data.users.byRole?.admin ?? '—'}</p>
                </div>
              </div>
            </div>

            {/* RESOURCE & COORDINATION STATUS SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Relief Reports */}
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
                  <h3 className="text-sm font-semibold text-content">Citizen Relief Reports</h3>
                  <Badge tone="neutral">Total: {state.data.reports.total ?? (state.data.reports.submitted + state.data.reports.underReview + state.data.reports.verified)}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">Submitted</p>
                    <p className="text-lg font-bold text-warning mt-1">{state.data.reports.submitted}</p>
                  </div>
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">In Review</p>
                    <p className="text-lg font-bold text-accent mt-1">{state.data.reports.underReview}</p>
                  </div>
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">Verified</p>
                    <p className="text-lg font-bold text-emerald-400 mt-1">{state.data.reports.verified}</p>
                  </div>
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">Resolved</p>
                    <p className="text-lg font-bold text-content mt-1">{state.data.reports.resolved ?? 0}</p>
                  </div>
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">Rejected</p>
                    <p className="text-lg font-bold text-error mt-1">{state.data.reports.rejected ?? 0}</p>
                  </div>
                  <div className="rounded bg-surface p-2 border border-line/50">
                    <p className="text-muted">Draft</p>
                    <p className="text-lg font-bold text-subtle mt-1">{state.data.reports.draft ?? 0}</p>
                  </div>
                </div>
              </div>

              {/* Resources & Allocations */}
              <div className="rounded-xl border border-line bg-surface-raised p-4">
                <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
                  <h3 className="text-sm font-semibold text-content">Resources & Allocation Commitments</h3>
                  <Button variant="ghost" className="text-xs p-0 text-accent hover:underline" onClick={() => navigate('/dashboard/admin?tab=resources')}>
                    Open Ledger →
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-surface p-2.5 border border-line/50">
                    <span className="text-muted">Available Donations:</span>
                    <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{state.data.donations.available}</p>
                  </div>
                  <div className="rounded bg-surface p-2.5 border border-line/50">
                    <span className="text-muted">Active Requirements:</span>
                    <p className="text-lg font-bold text-content font-mono mt-0.5">{state.data.requirements?.active ?? '—'}</p>
                  </div>
                  <div className="rounded bg-surface p-2.5 border border-line/50">
                    <span className="text-muted">Confirmed Allocations:</span>
                    <p className="text-lg font-bold text-accent font-mono mt-0.5">{state.data.allocations?.confirmed ?? '—'}</p>
                  </div>
                  <div className="rounded bg-surface p-2.5 border border-line/50">
                    <span className="text-muted">Fulfilled Requirements:</span>
                    <p className="text-lg font-bold text-success font-mono mt-0.5">{state.data.requirements?.fulfilled ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* RECENT PLATFORM AUDIT ACTIVITY */}
            <div className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
                <h3 className="text-sm font-semibold text-content">Recent Platform Administrative Activity</h3>
                <Button variant="ghost" className="text-xs p-0 text-accent hover:underline" onClick={() => navigate('/dashboard/admin?tab=audit')}>
                  View Complete Audit Log →
                </Button>
              </div>

              {(!state.data.recentActivity || state.data.recentActivity.length === 0) ? (
                <p className="text-xs text-muted py-3">No recent administrative audit records recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="pb-1.5 font-medium">Timestamp</th>
                        <th className="pb-1.5 font-medium">Action</th>
                        <th className="pb-1.5 font-medium">Target Entity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/30">
                      {state.data.recentActivity.map((log) => (
                        <tr key={log._id}>
                          <td className="py-2 text-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                          <td className="py-2 font-mono text-accent">{log.action}</td>
                          <td className="py-2 text-content">{log.entityType} ({log.entityId ? String(log.entityId).slice(-6) : '—'})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
