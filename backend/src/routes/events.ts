import crypto from 'node:crypto'
import { Router } from 'express'
import { verifyAccessToken } from '../auth/jwt.js'
import { config } from '../config/env.js'
import { eventBroadcaster } from '../services/event-broadcaster.js'

const eventsRouter = Router()

/**
 * GET /api/events — Authenticated Server-Sent Events (SSE) Stream
 * Supports browser EventSource via query ?token=... or standard Authorization header.
 */
eventsRouter.get('/events', (req, res) => {
  let token: string | undefined

  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else if (typeof req.query.token === 'string') {
    token = req.query.token
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication token required for live stream.' })
    return
  }

  try {
    const payload = verifyAccessToken(token, config.jwtSecret)

    // Set standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const clientId = crypto.randomUUID()
    eventBroadcaster.addClient(clientId, payload.sub, payload.role, res)

    req.on('close', () => {
      eventBroadcaster.removeClient(clientId)
    })
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' })
  }
})

/**
 * GET /api/events/status — Diagnostic endpoint for live connections count
 */
eventsRouter.get('/events/status', (_req, res) => {
  res.status(200).json({
    service: 'reliefgrid-sse-sync',
    activeConnections: eventBroadcaster.getConnectedCount(),
    status: 'operational',
  })
})

export default eventsRouter

