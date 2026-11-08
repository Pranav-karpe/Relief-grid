import { useState, useEffect, useCallback } from 'react'
import { getAdminUsers, patchUserStatus, type AdminUser } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Input from '../ui/Input'

type Props = { token: string }

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; users: AdminUser[]; nextCursor: string | null }

const ROLES = ['', 'citizen', 'donor', 'volunteer', 'ngo', 'admin']
const STATUSES = ['', 'pending', 'active', 'suspended', 'closed']

function statusTone(s: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (s === 'active') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'suspended' || s === 'closed') return 'error'
  return 'neutral'
}

function nextAllowedStatuses(current: string): string[] {
  const map: Record<string, string[]> = {
    pending: ['active', 'closed'],
    active: ['suspended', 'closed'],
    suspended: ['active', 'closed'],
    closed: [],
  }
  return map[current] ?? []
}

export default function AdminUserSection({ token }: Props) {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [actionState, setActionState] = useState<Record<string, boolean>>({})
  const [confirm, setConfirm] = useState<{ userId: string; newStatus: string } | null>(null)

  const load = useCallback((cur?: string) => {
    setListState({ status: 'loading' })
    getAdminUsers(token, {
      cursor: cur,
      role: roleFilter || undefined,
      accountStatus: statusFilter || undefined,
      search: search.trim() || undefined,
    })
      .then(({ data, page }) => setListState({ status: 'ok', users: data, nextCursor: page.nextCursor }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load users.'
        setListState({ status: 'error', message })
      })
  }, [token, roleFilter, statusFilter, search])

  useEffect(() => { setCursor(undefined); load(undefined) }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setCursor(undefined)
    load(undefined)
  }

  function handleNextPage() {
    if (listState.status !== 'ok' || !listState.nextCursor) return
    setCursor(listState.nextCursor)
    load(listState.nextCursor)
  }

  async function applyStatus(userId: string, newStatus: string) {
    setConfirm(null)
    setActionState((s) => ({ ...s, [userId]: true }))
    try {
      const updated = await patchUserStatus(token, userId, newStatus)
      setListState((prev) => {
        if (prev.status !== 'ok') return prev
        return { ...prev, users: prev.users.map((u) => u._id === userId ? updated : u) }
      })
    } catch (err: unknown) {
      const message = err instanceof AuthApiError ? err.message : 'Status update failed.'
      alert(message)
    } finally {
      setActionState((s) => ({ ...s, [userId]: false }))
    }
  }

  return (
    <Card>
      <SectionHeading title="User Management" description="Search, filter, and manage account statuses." />

      <form onSubmit={handleSearch} className="mt-4 flex flex-wrap gap-2">
        <Input label="Search" placeholder="Email or name…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-content focus:border-accent focus:outline-none">
            {ROLES.map((r) => <option key={r} value={r}>{r || 'All roles'}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-content focus:border-accent focus:outline-none">
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary">Search</Button>
        </div>
      </form>

      <div className="mt-4">
        {listState.status === 'loading' && <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading users…</p>}
        {listState.status === 'error' && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-error" role="alert">{listState.message}</p>
            <Button variant="outline" onClick={() => load(cursor)}>Retry</Button>
          </div>
        )}
        {listState.status === 'ok' && listState.users.length === 0 && (
          <p className="text-sm text-muted">No users match the current filters.</p>
        )}
        {listState.status === 'ok' && listState.users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full type-table">
              <thead>
                <tr className="border-b border-line text-left text-sm font-semibold text-muted">
                  <th className="pb-3 pr-4">Name & Email</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Organization / Profile</th>
                  <th className="pb-3 pr-4">Account Status</th>
                  <th className="pb-3">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody>
                {listState.users.map((u) => {
                  const allowed = nextAllowedStatuses(u.accountStatus)
                  const busy = actionState[u._id] ?? false
                  return (
                    <tr key={u._id} className="border-b border-line/40 hover:bg-surface-raised/50 transition-colors">
                      <td className="py-3.5 pr-4">
                        <p className="font-semibold text-content text-base">{u.displayName}</p>
                        <p className="text-muted text-sm">{u.email}</p>
                        {u.emailVerified && (
                          <span className="text-xs text-emerald-400 font-medium">✓ Email Verified</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge tone="neutral" className="capitalize text-xs">{u.role}</Badge>
                      </td>
                      <td className="py-3.5 pr-4 text-sm text-muted">
                        {u.role === 'ngo' && u.organizationProfile ? (
                          <div>
                            <p className="font-semibold text-content">{u.organizationProfile.name || 'No org name'}</p>
                            <p className="text-muted font-mono text-xs">Reg: {u.organizationProfile.registrationNumber || '—'}</p>
                            <p className="text-xs text-orange font-medium mt-0.5">Verification: {u.organizationProfile.verificationStatus || 'not_submitted'}</p>
                          </div>
                        ) : (
                          <span className="text-muted text-sm">Individual Citizen</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-4">
                        <Badge tone={statusTone(u.accountStatus)} className="text-xs">{u.accountStatus}</Badge>
                      </td>
                      <td className="py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {allowed.map((s) => (
                            <Button
                              key={s}
                              variant={s === 'suspended' || s === 'closed' ? 'danger' : 'outline'}
                              className="text-xs h-8 px-3"
                              loading={busy}
                              disabled={busy}
                              onClick={() => setConfirm({ userId: u._id, newStatus: s })}
                            >
                              {s}
                            </Button>
                          ))}
                          {allowed.length === 0 && <span className="text-sm text-muted">—</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {listState.nextCursor && (
              <div className="mt-3">
                <Button variant="secondary" onClick={handleNextPage}>Load more</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-xl max-w-sm w-full mx-4">
            <p className="text-sm text-content">
              Set account status to <strong>{confirm.newStatus}</strong>? This action will be audited.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirm.newStatus === 'suspended' || confirm.newStatus === 'closed' ? 'danger' : 'primary'}
                onClick={() => applyStatus(confirm.userId, confirm.newStatus)}
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
