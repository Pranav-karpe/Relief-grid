import { useState, useEffect, useCallback } from 'react'
import { getAuditLogs, type AuditLog } from '../../api/admin'
import { AuthApiError } from '../../api/auth'
import Card from '../ui/Card'
import SectionHeading from '../ui/SectionHeading'
import Button from '../ui/Button'

type Props = { token: string }

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; logs: AuditLog[]; nextCursor: string | null }

export default function AdminAuditLogSection({ token }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const load = useCallback((cur?: string) => {
    setState({ status: 'loading' })
    getAuditLogs(token, {
      cursor: cur,
      entityType: entityTypeFilter.trim() || undefined,
      action: actionFilter.trim() || undefined,
    })
      .then(({ data, page }) => setState({ status: 'ok', logs: data, nextCursor: page.nextCursor }))
      .catch((err: unknown) => {
        const message = err instanceof AuthApiError ? err.message : 'Failed to load audit logs.'
        setState({ status: 'error', message })
      })
  }, [token, entityTypeFilter, actionFilter])

  useEffect(() => { load() }, [load])

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    load()
  }

  function renderActor(actor: AuditLog['actor']) {
    if (!actor) return '—'
    if (typeof actor === 'object') {
      return (
        <div>
          <span className="font-medium text-content">{actor.displayName}</span>
          <span className="text-[11px] text-subtle block">{actor.email}</span>
        </div>
      )
    }
    return <span className="font-mono text-xs">{actor}</span>
  }

  return (
    <Card>
      <SectionHeading
        title="Activity / Audit Logs"
        description="Immutable administrative ledger recording all consequential status transitions, verifications, and platform actions."
      />

      <form onSubmit={handleFilter} className="mt-4 flex flex-wrap items-end gap-3 border-b border-line pb-4">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content" htmlFor="entity-type-filter">Entity type</label>
          <input
            id="entity-type-filter"
            type="text"
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            placeholder="e.g. User, NgoVerification, Report…"
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-sm font-medium text-content" htmlFor="action-filter">Action</label>
          <input
            id="action-filter"
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="e.g. ngo_verification.approved…"
            className="min-h-10 rounded-lg border border-line bg-surface-raised px-3 text-sm text-content placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          {(entityTypeFilter || actionFilter) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEntityTypeFilter('')
                setActionFilter('')
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </form>

      <div className="mt-4">
        {state.status === 'loading' && (
          <p className="text-sm text-muted" aria-live="polite" aria-busy="true">Loading audit logs…</p>
        )}
        {state.status === 'error' && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-error" role="alert">{state.message}</p>
            <Button variant="outline" onClick={() => load()}>Retry</Button>
          </div>
        )}
        {state.status === 'ok' && state.logs.length === 0 && (
          <p className="text-sm text-muted">No audit log entries found matching criteria.</p>
        )}
        {state.status === 'ok' && state.logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="pb-2 pr-4 font-medium">Timestamp</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Actor</th>
                  <th className="pb-2 pr-4 font-medium">Entity Type</th>
                  <th className="pb-2 font-medium">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {state.logs.map((log) => (
                  <tr key={log._id} className="border-b border-line/40 hover:bg-surface-raised/40 transition-colors">
                    <td className="py-2.5 pr-4 text-xs text-muted whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-accent">{log.action}</td>
                    <td className="py-2.5 pr-4 text-xs">{renderActor(log.actor)}</td>
                    <td className="py-2.5 pr-4 text-xs text-content font-medium">{log.entityType}</td>
                    <td className="py-2.5 font-mono text-xs text-muted truncate max-w-[160px]">{log.entityId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.nextCursor && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => load(state.nextCursor ?? undefined)}>Load more</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
