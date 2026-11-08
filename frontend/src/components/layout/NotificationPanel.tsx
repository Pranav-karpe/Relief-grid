import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from '../../api/notifications'
import { AuthApiError } from '../../api/auth'
import { useLiveSync } from '../../lib/live-sync'

// ---------------------------------------------------------------------------
// Bell icon
// ---------------------------------------------------------------------------

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <div className="relative">
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      {hasUnread && (
        <span
          className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-error"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------

function NotificationRow({
  notification,
  onRead,
}: {
  notification: Notification
  onRead: (id: string) => void
}) {
  const isUnread = !notification.readAt

  return (
    <div
      className={`flex items-start gap-3.5 px-4.5 py-3.5 border-b border-line last:border-0 transition-colors ${
        isUnread ? 'bg-orange/5' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-semibold truncate ${isUnread ? 'text-content' : 'text-muted'}`}>
          {notification.title}
        </p>
        <p className="text-[13.5px] text-muted mt-1 leading-normal line-clamp-2">{notification.message}</p>
        <p className="text-xs text-muted/70 mt-1 font-mono">
          {new Date(notification.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
      {isUnread && (
        <button
          type="button"
          onClick={() => onRead(notification._id)}
          aria-label={`Mark "${notification.title}" as read`}
          className="shrink-0 text-xs font-semibold text-orange hover:underline focus-visible:outline-none"
        >
          Mark read
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NotificationPanel
// ---------------------------------------------------------------------------

type Props = { token: string }

export default function NotificationPanel({ token }: Props) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Poll unread count every 60 s & update instantly on live sync events
  const fetchCount = useCallback(async () => {
    try {
      const count = await getUnreadCount(token)
      setUnreadCount(count)
    } catch {
      // Non-fatal — count stays stale
    }
  }, [token])

  useLiveSync(() => {
    void fetchCount()
  }, [fetchCount])

  useEffect(() => {
    void fetchCount()
    const id = setInterval(() => { void fetchCount() }, 60_000)
    return () => clearInterval(id)
  }, [fetchCount])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function openPanel() {
    setOpen((v) => !v)
    if (!open) {
      setLoading(true)
      setError(null)
      try {
        const res = await getNotifications(token, { limit: 20 })
        setNotifications(res.data)
      } catch (err) {
        setError(err instanceof AuthApiError ? err.message : 'Could not load notifications.')
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleMarkRead(id: string) {
    try {
      const updated = await markAsRead(token, id)
      setNotifications((prev) => prev.map((n) => (n._id === id ? updated : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Silently fail — user can retry
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    try {
      await markAllAsRead(token)
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })))
      setUnreadCount(0)
    } catch {
      // Silently fail
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="flex items-center justify-center rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-content transition-colors focus-visible:outline-none"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon hasUnread={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="ml-1 text-xs font-semibold text-error" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-line bg-surface shadow-lg z-50"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold text-content">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={markingAll}
                className="text-xs text-accent hover:underline disabled:opacity-50 focus-visible:outline-none"
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-sm text-muted text-center" aria-live="polite" aria-busy="true">
                Loading…
              </p>
            )}
            {error && (
              <p className="px-4 py-6 text-sm text-error text-center" role="alert">{error}</p>
            )}
            {!loading && !error && notifications.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted text-center">No notifications yet.</p>
            )}
            {!loading && !error && notifications.map((n) => (
              <NotificationRow key={n._id} notification={n} onRead={(id) => void handleMarkRead(id)} />
            ))}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 border-t border-line">
            <p className="text-xs text-muted">
              In-app notifications only. Not email or push.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
