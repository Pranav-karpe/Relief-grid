import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminOverview, type AdminOverview } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import {
  GlowingMetricCard,
  GlowingBarChart,
  GlowingDonutChart,
  GlowingProgressMeter,
} from '../ui/GlowingCharts'
import { useLiveSync } from '../../lib/live-sync'

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

  useEffect(() => {
    load()
  }, [load])

  // Live Cross-Dashboard Synchronization: auto-refresh when events arrive
  useLiveSync(() => {
    load()
  }, [load])

  return (
    <div className="space-y-7">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <SectionHeading
            title="Platform Administration Command Center"
            description="Live system-wide operational metrics, real-time coordination telemetry, and queue statuses aggregated from MongoDB."
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted/80 font-mono">Real-time sync active</span>
            <Button variant="secondary" onClick={load}>Refresh Data</Button>
          </div>
        </div>

        {state.status === 'loading' && (
          <div className="py-16 text-center" aria-live="polite" aria-busy="true">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-orange border-t-transparent mb-3" />
            <p className="text-base font-medium text-muted">Aggregating live platform metrics from MongoDB…</p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="my-6 rounded-2xl border border-error/30 bg-error/10 p-6 text-center">
            <p className="text-base font-semibold text-error" role="alert">{state.message}</p>
            <p className="mt-1 text-sm text-muted">A connection or query error occurred. Zero values are not assumed.</p>
            <div className="mt-5">
              <Button variant="outline" onClick={load}>Retry Connection</Button>
            </div>
          </div>
        )}

        {state.status === 'ok' && (
          <div className="mt-6 space-y-8">
            {/* TOP METRIC CARDS ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <GlowingMetricCard
                title="Registered Users"
                value={state.data.users.total}
                subtitle={`${state.data.users.active} active accounts`}
                icon="👥"
                tone="blue"
                onClick={() => navigate('/dashboard/admin?tab=users')}
              />
              <GlowingMetricCard
                title="Relief Requests"
                value={state.data.reports.total ?? (state.data.reports.submitted + state.data.reports.underReview + state.data.reports.verified)}
                subtitle={`${state.data.reports.verified} verified distress calls`}
                icon="🚨"
                tone="orange"
                onClick={() => navigate('/dashboard/admin?tab=reports')}
              />
              <GlowingMetricCard
                title="Available Aid Units"
                value={state.data.donations.available}
                subtitle={`${state.data.donations.total} total donations`}
                icon="📦"
                tone="emerald"
                onClick={() => navigate('/dashboard/admin?tab=resources')}
              />
              <GlowingMetricCard
                title="Active Field Tasks"
                value={state.data.tasks.active}
                subtitle={`${state.data.tasks.byDelivery?.inTransit ?? 0} consignments in transit`}
                icon="🚚"
                tone="purple"
                onClick={() => navigate('/dashboard/admin?tab=volunteers')}
              />
            </div>

            {/* PRIORITY ACTION QUEUES */}
            <div>
              <h2 className="type-card-heading text-content mb-4 flex items-center gap-2">
                <span>⚠️</span> Urgent Administrative Attention Queues
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* NGO Verifications */}
                <div className={`rounded-2xl border p-5 transition-all ${
                  state.data.ngoVerifications.pending > 0
                    ? 'border-orange/60 bg-orange/10 shadow-sm'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-muted">NGO Applications</span>
                    {state.data.ngoVerifications.pending > 0 && (
                      <Badge tone="warning">Pending Review</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-content font-mono">
                    {state.data.ngoVerifications.pending}
                  </p>
                  <p className="text-sm text-muted mt-1">Awaiting accreditation check</p>
                  <div className="mt-4">
                    <Button
                      variant={state.data.ngoVerifications.pending > 0 ? 'primary' : 'outline'}
                      className="w-full text-sm py-1.5"
                      onClick={() => navigate('/dashboard/admin?tab=ngos')}
                    >
                      Review Queue
                    </Button>
                  </div>
                </div>

                {/* Volunteer Verifications */}
                {(() => {
                  const volPending = state.data.volunteerVerifications?.pending ?? state.data.verifications?.volunteer?.pending ?? 0
                  return (
                    <div className={`rounded-2xl border p-5 transition-all ${
                      volPending > 0
                        ? 'border-orange/60 bg-orange/10 shadow-sm'
                        : 'border-line bg-surface-raised'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-muted">Volunteer Applications</span>
                        {volPending > 0 && (
                          <Badge tone="warning">Pending</Badge>
                        )}
                      </div>
                      <p className="mt-3 text-3xl font-extrabold text-content font-mono">
                        {volPending}
                      </p>
                      <p className="text-sm text-muted mt-1">Awaiting identity vetting</p>
                      <div className="mt-4">
                        <Button
                          variant={volPending > 0 ? 'primary' : 'outline'}
                          className="w-full text-sm py-1.5"
                          onClick={() => navigate('/dashboard/admin?tab=volunteer-verifications')}
                        >
                          Review Queue
                        </Button>
                      </div>
                    </div>
                  )
                })()}

                {/* Pending Allocation Confirmations */}
                <div className={`rounded-2xl border p-5 transition-all ${
                  (state.data.allocations?.pending ?? 0) > 0
                    ? 'border-orange/60 bg-orange/10 shadow-sm'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-muted">Pending Allocations</span>
                    {(state.data.allocations?.pending ?? 0) > 0 && (
                      <Badge tone="warning">In Review</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-content font-mono">
                    {state.data.allocations?.pending ?? 0}
                  </p>
                  <p className="text-sm text-muted mt-1">Resource commitments awaiting receipt</p>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      className="w-full text-sm py-1.5"
                      onClick={() => navigate('/dashboard/admin?tab=resources')}
                    >
                      Review Ledger
                    </Button>
                  </div>
                </div>

                {/* Complaints */}
                <div className={`rounded-2xl border p-5 transition-all ${
                  state.data.complaints.open > 0
                    ? 'border-error/60 bg-error/10 shadow-sm'
                    : 'border-line bg-surface-raised'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-muted">Platform Grievances</span>
                    {state.data.complaints.open > 0 ? (
                      <Badge tone="error">Attention Required</Badge>
                    ) : (
                      <Badge tone="success">Clear</Badge>
                    )}
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-content font-mono">
                    {state.data.complaints.open}
                  </p>
                  <p className="text-sm text-muted mt-1">Open registered complaints</p>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      className="w-full text-sm py-1.5"
                      onClick={() => navigate('/dashboard/admin?tab=complaints')}
                    >
                      View Complaints
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* VISUAL CHARTS SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Chart: Citizen Reports by Status Bar Chart */}
              <div className="lg:col-span-7 glow-card p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="type-card-heading text-content">Citizen Relief Reports Distribution</h3>
                  <Badge tone="info">Live Breakdown</Badge>
                </div>
                <p className="text-sm text-muted mb-4">
                  Aggregated distribution of distress calls by operational triage stage.
                </p>
                <GlowingBarChart
                  data={[
                    { label: 'Submitted', value: state.data.reports.submitted, color: '#f59e0b' },
                    { label: 'Under Review', value: state.data.reports.underReview, color: '#3b82f6' },
                    { label: 'Verified', value: state.data.reports.verified, color: '#10b981' },
                    { label: 'Resolved', value: state.data.reports.resolved ?? 0, color: '#06b6d4' },
                    { label: 'Rejected', value: state.data.reports.rejected ?? 0, color: '#ef4444' },
                    { label: 'Draft', value: state.data.reports.draft ?? 0, color: '#6b7280' },
                  ]}
                  height={190}
                  unit="reports"
                />
              </div>

              {/* Right Chart: Registered Users by Role Donut */}
              <div className="lg:col-span-5 glow-card p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="type-card-heading text-content">User Roles Breakdown</h3>
                  <Badge tone="neutral">Total: {state.data.users.total}</Badge>
                </div>
                <p className="text-sm text-muted mb-2">
                  Distribution of authorized responders across platform roles.
                </p>
                <GlowingDonutChart
                  centerTitle="Active Users"
                  centerValue={state.data.users.active}
                  segments={[
                    { label: 'Citizens', value: state.data.users.byRole?.citizen ?? 0, color: '#10b981' },
                    { label: 'Donors', value: state.data.users.byRole?.donor ?? 0, color: '#f97316' },
                    { label: 'Volunteers', value: state.data.users.byRole?.volunteer ?? 0, color: '#a855f7' },
                    { label: 'NGOs', value: state.data.users.byRole?.ngo ?? 0, color: '#3b82f6' },
                    { label: 'Admins', value: state.data.users.byRole?.admin ?? 0, color: '#f59e0b' },
                  ]}
                />
              </div>
            </div>

            {/* PROGRESS & COMMITMENT METERS */}
            <div className="glow-card p-6 space-y-5">
              <h3 className="type-card-heading text-content">Relief Operation Pipeline Health</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlowingProgressMeter
                  label="NGO Accreditation"
                  value={state.data.ngoVerifications.approved}
                  total={state.data.ngoVerifications.total || 1}
                  unit="NGOs"
                  color="#3b82f6"
                />
                <GlowingProgressMeter
                  label="Volunteer Identity Vetting"
                  value={state.data.volunteerVerifications?.approved ?? state.data.verifications?.volunteer?.approved ?? 0}
                  total={state.data.volunteerVerifications?.total ?? state.data.verifications?.volunteer?.total ?? 1}
                  unit="Volunteers"
                  color="#10b981"
                />
                <GlowingProgressMeter
                  label="Resource Fulfillment"
                  value={state.data.requirements?.fulfilled ?? 0}
                  total={(state.data.requirements?.active ?? 0) + (state.data.requirements?.fulfilled ?? 0) || 1}
                  unit="Requirements"
                  color="#f97316"
                />
              </div>
            </div>

            {/* RECENT PLATFORM AUDIT ACTIVITY TABLE */}
            <div className="glow-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-line pb-3">
                <div>
                  <h3 className="type-card-heading text-content">Recent Platform Administrative Activity</h3>
                  <p className="text-sm text-muted">Immutable audit trail of recent administrative state changes.</p>
                </div>
                <Button
                  variant="secondary"
                  className="text-sm py-1.5"
                  onClick={() => navigate('/dashboard/admin?tab=audit')}
                >
                  View Complete Audit Log →
                </Button>
              </div>

              {(!state.data.recentActivity || state.data.recentActivity.length === 0) ? (
                <p className="text-base text-muted py-6 text-center">No recent administrative audit records recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="pb-3 text-sm font-semibold uppercase tracking-wider text-muted">Timestamp</th>
                        <th className="pb-3 text-sm font-semibold uppercase tracking-wider text-muted">Action</th>
                        <th className="pb-3 text-sm font-semibold uppercase tracking-wider text-muted">Target Entity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40">
                      {state.data.recentActivity.map((log) => (
                        <tr key={log._id} className="hover:bg-surface-raised/50 transition-colors">
                          <td className="py-3 text-[14.5px] text-muted whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 font-mono text-[14.5px] font-semibold text-orange">
                            {log.action}
                          </td>
                          <td className="py-3 text-[14.5px] text-content font-medium">
                            {log.entityType} ({log.entityId ? String(log.entityId).slice(-6) : '—'})
                          </td>
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
