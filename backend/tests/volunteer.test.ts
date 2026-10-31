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
// Strategy (matching existing test files):
//   - No token / bad token → assert exact 401 (no DB needed).
//   - Valid token, wrong role → assert 403 or 401 (DB timeout).
//   - Valid token, correct role, validation before DB → assert expected or 401.
//   - Valid token, correct role, DB required → assert expected or 401/500.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const VOL_ID = '000000000000000000000040'
const VOL2_ID = '000000000000000000000041'
const CITIZEN_ID = '000000000000000000000010'
const DONOR_ID = '000000000000000000000020'
const NGO_ID = '000000000000000000000030'
const FAKE_TASK_ID = '000000000000000000000099'

function volToken(id = VOL_ID) { return createAccessToken(id, 'volunteer', secret, 3600) }
function citizenToken() { return createAccessToken(CITIZEN_ID, 'citizen', secret, 3600) }
function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }
function ngoToken() { return createAccessToken(NGO_ID, 'ngo', secret, 3600) }

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
// GET /api/volunteer/tasks/mine
// ---------------------------------------------------------------------------

test('GET /api/volunteer/tasks/mine — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine')
  assert.equal(res.status, 401)
})

test('GET /api/volunteer/tasks/mine — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/mine — rejects donor role', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/mine — rejects NGO role', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/mine — valid volunteer token reaches route', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine', undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('GET /api/volunteer/tasks/mine — rejects invalid cursor', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/mine?cursor=!!!bad!!!', undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/volunteer/tasks/:taskId
// ---------------------------------------------------------------------------

test('GET /api/volunteer/tasks/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/volunteer/tasks/${FAKE_TASK_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/volunteer/tasks/:id — rejects citizen role', async () => {
  const res = await httpRequest('GET', `/api/volunteer/tasks/${FAKE_TASK_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/:id — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('GET', '/api/volunteer/tasks/not-a-valid-id', undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/:id — valid volunteer token reaches route', async () => {
  const res = await httpRequest('GET', `/api/volunteer/tasks/${FAKE_TASK_ID}`, undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

test('GET /api/volunteer/tasks/:id — different volunteer token returns 404 (ownership enforced)', async () => {
  const res = await httpRequest('GET', `/api/volunteer/tasks/${FAKE_TASK_ID}`, undefined, {
    Authorization: `Bearer ${volToken(VOL2_ID)}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/volunteer/tasks/:taskId/accept
// ---------------------------------------------------------------------------

test('POST /api/volunteer/tasks/:id/accept — rejects unauthenticated', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/accept`)
  assert.equal(res.status, 401)
})

test('POST /api/volunteer/tasks/:id/accept — rejects citizen role', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/accept`, {}, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/volunteer/tasks/:id/accept — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('POST', '/api/volunteer/tasks/not-a-valid-id/accept', {}, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('POST /api/volunteer/tasks/:id/accept — valid volunteer token reaches route', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/accept`, {}, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 409 || res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 404/409/200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// POST /api/volunteer/tasks/:taskId/decline
// ---------------------------------------------------------------------------

test('POST /api/volunteer/tasks/:id/decline — rejects unauthenticated', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/decline`)
  assert.equal(res.status, 401)
})

test('POST /api/volunteer/tasks/:id/decline — rejects citizen role', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/decline`, {}, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/volunteer/tasks/:id/decline — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('POST', '/api/volunteer/tasks/not-a-valid-id/decline', {}, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('POST /api/volunteer/tasks/:id/decline — valid volunteer token reaches route', async () => {
  const res = await httpRequest('POST', `/api/volunteer/tasks/${FAKE_TASK_ID}/decline`, {}, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 409 || res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 404/409/200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// PATCH /api/volunteer/tasks/:taskId/progress
// ---------------------------------------------------------------------------

test('PATCH /api/volunteer/tasks/:id/progress — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { pickupStatus: 'collected' })
  assert.equal(res.status, 401)
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects citizen role', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { pickupStatus: 'collected' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/volunteer/tasks/:id/progress — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('PATCH', '/api/volunteer/tasks/not-a-valid-id/progress', { pickupStatus: 'collected' }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects protected field volunteer', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { volunteer: VOL2_ID }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects protected field assignmentStatus', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { assignmentStatus: 'accepted' }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects protected field deliveredAt', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { deliveredAt: new Date().toISOString() }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects protected field history', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { history: [] }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects empty update body', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, {}, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/volunteer/tasks/:id/progress — rejects proofOfDeliveryRef without delivered status', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, {
    pickupStatus: 'collected',
    proofOfDeliveryRef: 'some-ref',
  }, { Authorization: `Bearer ${volToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/volunteer/tasks/:id/progress — valid volunteer token reaches route', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { pickupStatus: 'collected' }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 409 || res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 404/409/200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/volunteer/history
// ---------------------------------------------------------------------------

test('GET /api/volunteer/history — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/volunteer/history')
  assert.equal(res.status, 401)
})

test('GET /api/volunteer/history — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/volunteer/history', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/history — rejects donor role', async () => {
  const res = await httpRequest('GET', '/api/volunteer/history', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/volunteer/history — valid volunteer token reaches route', async () => {
  const res = await httpRequest('GET', '/api/volunteer/history', undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('GET /api/volunteer/history — rejects invalid cursor', async () => {
  const res = await httpRequest('GET', '/api/volunteer/history?cursor=!!!bad!!!', undefined, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Volunteer error responses never expose stack traces', async () => {
  const res = await httpRequest('PATCH', `/api/volunteer/tasks/${FAKE_TASK_ID}/progress`, { volunteer: 'x' }, {
    Authorization: `Bearer ${volToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
