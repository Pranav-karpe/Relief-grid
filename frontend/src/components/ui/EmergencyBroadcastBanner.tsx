import React, { useState, useEffect } from 'react'

export interface BroadcastAlert {
  _id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'emergency'
  targetRole: string
  createdAt: string
}

export const EmergencyBroadcastBanner: React.FC<{ role?: string }> = ({ role }) => {
  const [alerts, setAlerts] = useState<BroadcastAlert[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    const url = role ? `/api/alerts/active?role=${role}` : '/api/alerts/active'
    fetch(url)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body) => {
        if (Array.isArray(body.data)) {
          setAlerts(body.data)
        }
      })
      .catch(() => {})
  }, [role])

  const visibleAlerts = alerts.filter((a) => !dismissed.includes(a._id))
  if (visibleAlerts.length === 0) return null

  const alert = visibleAlerts[0]

  const severityStyles = {
    emergency: 'bg-red-950/80 border-red-700/60 text-red-200',
    warning: 'bg-amber-950/80 border-amber-700/60 text-amber-200',
    info: 'bg-sky-950/80 border-sky-700/60 text-sky-200',
  }

  const iconStyles = {
    emergency: '🚨',
    warning: '⚠️',
    info: 'ℹ️',
  }

  return (
    <div
      role="alert"
      className={`relative w-full border-b px-4 py-3 text-xs sm:text-sm backdrop-blur-md transition-all ${
        severityStyles[alert.severity] || severityStyles.warning
      }`}
    >
      <div className="mx-auto flex max-w-[1680px] items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-base select-none leading-none pt-0.5">
            {iconStyles[alert.severity] || '⚠️'}
          </span>
          <div>
            <span className="font-bold tracking-wide uppercase mr-2 text-[11px] sm:text-xs px-1.5 py-0.5 rounded bg-black/40 border border-white/10">
              {alert.severity} broadcast
            </span>
            <strong className="font-semibold text-content mr-1">{alert.title}:</strong>
            <span className="leading-relaxed opacity-95">{alert.message}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed([...dismissed, alert._id])}
          className="rounded p-1 hover:bg-black/30 text-muted hover:text-content transition-colors shrink-0"
          title="Dismiss notification"
          aria-label="Dismiss alert"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

