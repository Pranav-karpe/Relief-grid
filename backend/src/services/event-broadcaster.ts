import type { Response } from 'express'

export type LiveEvent = {
  type: string
  payload?: unknown
  timestamp?: string
  targetRoles?: string[]
  targetUserId?: string
}

type SseClient = {
  id: string
  userId: string
  role: string
  res: Response
}

class EventBroadcaster {
  private clients: Map<string, SseClient> = new Map()
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startHeartbeat()
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) return
    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients.entries()) {
        try {
          client.res.write(': heartbeat\n\n')
        } catch {
          this.removeClient(id)
        }
      }
    }, 25000)
    // Avoid holding open node process in test runners
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref()
    }
  }

  public addClient(id: string, userId: string, role: string, res: Response): void {
    this.clients.set(id, { id, userId, role, res })
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'CONNECTED',
          userId,
          role,
          timestamp: new Date().toISOString(),
        })}\n\n`,
      )
    } catch {
      this.removeClient(id)
    }
  }

  public removeClient(id: string): void {
    this.clients.delete(id)
  }

  public getConnectedCount(): number {
    return this.clients.size
  }

  public broadcast(event: LiveEvent): void {
    const payloadStr = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    })
    const dataString = `data: ${payloadStr}\n\n`

    for (const [id, client] of this.clients.entries()) {
      if (event.targetUserId && client.userId !== event.targetUserId) {
        continue
      }
      if (
        event.targetRoles &&
        event.targetRoles.length > 0 &&
        !event.targetRoles.includes(client.role)
      ) {
        continue
      }
      try {
        client.res.write(dataString)
      } catch {
        this.removeClient(id)
      }
    }
  }
}

export const eventBroadcaster = new EventBroadcaster()

