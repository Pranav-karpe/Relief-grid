import { useEffect, useState, useRef } from 'react'

export type LiveEvent = {
  type: string
  payload?: any
  timestamp?: string
  targetRoles?: string[]
  targetUserId?: string
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline'

type EventCallback = (event: LiveEvent) => void
type StatusCallback = (status: ConnectionStatus) => void

class LiveSyncClient {
  private eventSource: EventSource | null = null
  private status: ConnectionStatus = 'offline'
  private eventListeners: Set<EventCallback> = new Set()
  private statusListeners: Set<StatusCallback> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempts = 0
  private currentToken: string | null = null

  public connect(token: string) {
    if (!token) {
      this.disconnect()
      return
    }

    if (this.currentToken === token && this.status === 'connected') {
      return
    }

    this.disconnect()
    this.currentToken = token
    this.setStatus('reconnecting')

    try {
      // In browser, EventSource uses the current origin
      const sseUrl = `/api/events?token=${encodeURIComponent(token)}`
      this.eventSource = new EventSource(sseUrl)

      this.eventSource.onopen = () => {
        this.retryAttempts = 0
        this.setStatus('connected')
      }

      this.eventSource.onmessage = (e) => {
        try {
          const event: LiveEvent = JSON.parse(e.data)
          this.notifyEvent(event)
        } catch {
          // ignore heartbeats or malformed packets
        }
      }

      this.eventSource.onerror = () => {
        this.eventSource?.close()
        this.eventSource = null
        this.scheduleReconnect()
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.retryAttempts += 1

    if (this.retryAttempts > 5) {
      this.setStatus('offline')
    } else {
      this.setStatus('reconnecting')
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.retryAttempts), 15000)
    this.reconnectTimer = setTimeout(() => {
      if (this.currentToken) {
        this.connect(this.currentToken)
      }
    }, delay)
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.currentToken = null
    this.retryAttempts = 0
    this.setStatus('offline')
  }

  private setStatus(newStatus: ConnectionStatus) {
    if (this.status === newStatus) return
    this.status = newStatus
    for (const listener of this.statusListeners) {
      listener(newStatus)
    }
  }

  private notifyEvent(event: LiveEvent) {
    for (const listener of this.eventListeners) {
      listener(event)
    }
  }

  public subscribeEvents(cb: EventCallback): () => void {
    this.eventListeners.add(cb)
    return () => {
      this.eventListeners.delete(cb)
    }
  }

  public subscribeStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb)
    cb(this.status)
    return () => {
      this.statusListeners.delete(cb)
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status
  }
}

export const liveSync = new LiveSyncClient()

/**
 * Hook to listen for live operational events across dashboards
 */
export function useLiveSync(onEvent?: EventCallback, deps: any[] = []) {
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent

  useEffect(() => {
    if (!cbRef.current) return
    return liveSync.subscribeEvents((event) => {
      cbRef.current?.(event)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * Hook to display honest connection status indicator in the UI
 */
export function useLiveConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(liveSync.getStatus())

  useEffect(() => {
    return liveSync.subscribeStatus(setStatus)
  }, [])

  return status
}
