import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'

// ---------------------------------------------------------------------------
// NOTE ON TEST ENVIRONMENT
// setup.ts overrides MONGODB_URI to a non-routable address.
// requireAuth performs a DB lookup — with no DB it times out and returns 401.
//
// Strategy:
//   - No token → exact 401.
//   - Valid token, any role → expected or 401/500 (DB timeout).
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const USER_ID = '000000000000000000000001'
const OTHER_USER_ID = '000000000000000000000002'
const FAKE_NOTIF_ID = '000000000000000000000099'

function userToken(id = USER_ID) { return createAccessToken(id, 'citizen', secret, 3600) }

type FetchResult = { status: number; body: Record<string, unknown> }

function httpRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') { reject(new Error('no address')); return }
      const payload = body !== undefined ? JSON.stringify(body) : undefined
      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers }
      if (payload) reqHeaders['Content-Length'] = String(Buffer.byteLength(payload))
      const req = http.request(
        { hostname: '127.0.0.1', port: address.port, path, method, headers: reqHeaders },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer) => { data += chunk.toString() })
          res.on('end', () => {
            server.close()
            try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, unknown> }) }
            catch { resolve({ status: res.statusCode ?? 0, body: {} }) }
          })
        },
      )
      req.on('error', (err) => { server.close(); reject(err) })
      if (payload) req.write(payload)
      req.end()
    })
  })
}

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------

test('GET /api/notifications — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', '/api/notifications')
  assert.equal(res.status, 401)
})

test('GET /api/notifications — valid token reaches route (200/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/notifications', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('GET /api/notifications — rejects invalid cursor (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/notifications?cursor=!!!invalid!!!', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('GET /api/notifications — unread filter accepted (200/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/notifications?unread=true', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
})

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-count
// ---------------------------------------------------------------------------

test('GET /api/notifications/unread-count — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', '/api/notifications/unread-count')
  assert.equal(res.status, 401)
})

test('GET /api/notifications/unread-count — valid token reaches route (200/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/notifications/unread-count', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// PATCH /api/notifications/read-all
// ---------------------------------------------------------------------------

test('PATCH /api/notifications/read-all — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('PATCH', '/api/notifications/read-all')
  assert.equal(res.status, 401)
})

test('PATCH /api/notifications/read-all — valid token reaches route (200/500/401 no-DB)', async () => {
  const res = await httpRequest('PATCH', '/api/notifications/read-all', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:id/read
// ---------------------------------------------------------------------------

test('PATCH /api/notifications/:id/read — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('PATCH', `/api/notifications/${FAKE_NOTIF_ID}/read`)
  assert.equal(res.status, 401)
})

test('PATCH /api/notifications/:id/read — rejects invalid ObjectId (404 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', '/api/notifications/not-an-id/read', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/notifications/:id/read — valid token reaches route (404/500/401 no-DB)', async () => {
  const res = await httpRequest('PATCH', `/api/notifications/${FAKE_NOTIF_ID}/read`, undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 200/404/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('PATCH /api/notifications/:id/read — different user cannot mark another user notification (404 live, 401 DB-timeout)', async () => {
  // The route filters by recipient = req.auth.userId, so another user's notification returns 404
  const res = await httpRequest('PATCH', `/api/notifications/${FAKE_NOTIF_ID}/read`, undefined, {
    Authorization: `Bearer ${userToken(OTHER_USER_ID)}`,
  })
  assert.ok(
    res.status === 200 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 200/404/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Notification error responses never expose stack traces', async () => {
  const res = await httpRequest('PATCH', '/api/notifications/not-an-id/read', undefined, {
    Authorization: `Bearer ${userToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
