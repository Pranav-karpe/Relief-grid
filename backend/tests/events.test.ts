import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import app from '../src/app.js'
import { createAccessToken } from '../src/auth/jwt.js'
import { eventBroadcaster } from '../src/services/event-broadcaster.js'

const secret = process.env.JWT_SECRET || 'test-secret-that-is-longer-than-32-characters'
const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)

test('GET /api/events — rejects unauthenticated request with 401', async () => {
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('no address'))
        return
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/events',
          method: 'GET',
        },
        (res) => {
          server.close()
          assert.equal(res.statusCode, 401)
          resolve()
        },
      )
      req.on('error', (e) => {
        server.close()
        reject(e)
      })
      req.end()
    })
  })
})

test('GET /api/events/status returns operational status', async () => {
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('no address'))
        return
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/events/status',
          method: 'GET',
        },
        (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => {
            server.close()
            assert.equal(res.statusCode, 200)
            const json = JSON.parse(data)
            assert.equal(json.service, 'reliefgrid-sse-sync')
            assert.equal(typeof json.activeConnections, 'number')
            resolve()
          })
        },
      )
      req.on('error', (e) => {
        server.close()
        reject(e)
      })
      req.end()
    })
  })
})

test('eventBroadcaster broadcasts typed events to connected clients matching roles', async () => {
  const captured: string[] = []
  const mockRes: any = {
    write: (chunk: string) => {
      captured.push(chunk)
      return true
    },
  }

  const clientId = 'test-client-123'
  eventBroadcaster.addClient(clientId, 'user-abc', 'ngo', mockRes)

  try {
    assert.ok(captured.length >= 1, 'Initial CONNECTED packet should be sent')
    assert.ok(captured[0].includes('CONNECTED'))

    // Broadcast targeting citizen only -> NGO should not receive
    eventBroadcaster.broadcast({
      type: 'CITIZEN_ALERT',
      targetRoles: ['citizen'],
    })
    assert.equal(captured.length, 1)

    // Broadcast targeting ngo -> NGO receives
    eventBroadcaster.broadcast({
      type: 'TASK_ASSIGNED',
      payload: { taskId: 'task-999' },
      targetRoles: ['ngo', 'volunteer'],
    })
    assert.equal(captured.length, 2)
    assert.ok(captured[1].includes('TASK_ASSIGNED'))
    assert.ok(captured[1].includes('task-999'))
  } finally {
    eventBroadcaster.removeClient(clientId)
  }
})

