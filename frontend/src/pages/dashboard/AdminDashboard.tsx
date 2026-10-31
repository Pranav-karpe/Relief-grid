import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../../components/layout/DashboardLayout'
import { useAuthContext } from '../../lib/useAuthContext'
import AdminOverviewSection from '../../components/admin/AdminOverviewSection'
import AdminNgoVerificationSection from '../../components/admin/AdminNgoVerificationSection'
import AdminVolunteerVerificationSection from '../../components/admin/AdminVolunteerVerificationSection'
import AdminUserSection from '../../components/admin/AdminUserSection'
import AdminReportSection from '../../components/admin/AdminReportSection'
import AdminResourceOversightSection from '../../components/admin/AdminResourceOversightSection'
import AdminVolunteerOversightSection from '../../components/admin/AdminVolunteerOversightSection'
import AdminAuditLogSection from '../../components/admin/AdminAuditLogSection'
import AdminComplaintSection from '../../components/admin/AdminComplaintSection'

type Section =
  | 'overview'
  | 'ngos'
  | 'volunteer-verifications'
  | 'users'
  | 'reports'
  | 'resources'
  | 'volunteers'
  | 'audit'
  | 'complaints'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview',                label: 'Overview' },
  { id: 'ngos',                    label: 'NGO Verification' },
  { id: 'volunteer-verifications', label: 'Volunteer Verification' },
  { id: 'users',                   label: 'User Management' },
  { id: 'reports',                 label: 'Relief Reports' },
  { id: 'resources',               label: 'Resource & Allocation Oversight' },
  { id: 'volunteers',              label: 'Volunteer Tasks Oversight' },
  { id: 'audit',                   label: 'Activity/Audit Log' },
  { id: 'complaints',              label: 'Complaints' },
]

export default function AdminDashboard() {
  const { state } = useAuthContext()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = (searchParams.get('tab') as Section) || 'overview'
  const active = ([
    'overview',
    'ngos',
    'volunteer-verifications',
    'users',
    'reports',
    'resources',
    'volunteers',
    'audit',
    'complaints',
  ] as Section[]).includes(tabParam)
    ? tabParam
    : 'overview'

  function setActive(s: Section) {
    setSearchParams({ tab: s })
  }

  if (state.status !== 'authenticated') return null
  const { token } = state

  return (
    <DashboardLayout title="Administrator Dashboard">
      {/* Section tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-line pb-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none ${
              active === s.id
                ? 'bg-orange/15 text-orange border border-orange/40 font-semibold'
                : 'text-muted hover:bg-surface-raised hover:text-content border border-transparent'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'overview'                && <AdminOverviewSection token={token} />}
      {active === 'ngos'                    && <AdminNgoVerificationSection token={token} />}
      {active === 'volunteer-verifications' && <AdminVolunteerVerificationSection token={token} />}
      {active === 'users'                   && <AdminUserSection token={token} />}
      {active === 'reports'                 && <AdminReportSection token={token} />}
      {active === 'resources'               && <AdminResourceOversightSection token={token} />}
      {active === 'volunteers'              && <AdminVolunteerOversightSection token={token} />}
      {active === 'audit'                   && <AdminAuditLogSection token={token} />}
      {active === 'complaints'              && <AdminComplaintSection token={token} />}
    </DashboardLayout>
  )
}
