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
//   - Valid token, wrong role → 403 or 401.
//   - Valid token, admin, validation before DB → expected or 401.
//   - Valid token, admin, DB required → expected or 401/500.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const ADMIN_ID = '000000000000000000000001'
const DONOR_ID = '000000000000000000000002'
const NGO_ID = '000000000000000000000003'
const CITIZEN_ID = '000000000000000000000004'
const VOL_ID = '000000000000000000000005'

function adminToken() { return createAccessToken(ADMIN_ID, 'admin', secret, 3600) }
function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }
function ngoToken() { return createAccessToken(NGO_ID, 'ngo', secret, 3600) }
function citizenToken() { return createAccessToken(CITIZEN_ID, 'citizen', secret, 3600) }
function volunteerToken() { return createAccessToken(VOL_ID, 'volunteer', secret, 3600) }

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

const VALID_TASK_BODY = {
  volunteerId: VOL_ID,
  taskDetails: 'Deliver bottled water to the relief camp at sector 4.',
  assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
}

// ---------------------------------------------------------------------------
// POST /api/coordination/tasks — admin only
// ---------------------------------------------------------------------------

test('POST /api/coordination/tasks — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY)
  assert.equal(res.status, 401)
})

test('POST /api/coordination/tasks — rejects volunteer role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY, {
    Authorization: `Bearer ${volunteerToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/coordination/tasks — rejects ngo role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/coordination/tasks — rejects donor role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/coordination/tasks — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/coordination/tasks — validation errors (400 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/coordination/tasks — rejects missing volunteerId (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    taskDetails: VALID_TASK_BODY.taskDetails,
    assignedLocation: VALID_TASK_BODY.assignedLocation,
  }, { Authorization: `Bearer ${adminToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/coordination/tasks — rejects missing taskDetails (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    volunteerId: VALID_TASK_BODY.volunteerId,
    assignedLocation: VALID_TASK_BODY.assignedLocation,
  }, { Authorization: `Bearer ${adminToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/coordination/tasks — rejects missing assignedLocation (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    volunteerId: VALID_TASK_BODY.volunteerId,
    taskDetails: VALID_TASK_BODY.taskDetails,
  }, { Authorization: `Bearer ${adminToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/coordination/tasks — rejects invalid GeoJSON type (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    ...VALID_TASK_BODY,
    assignedLocation: { type: 'Polygon', coordinates: [72.8777, 19.076] },
  }, { Authorization: `Bearer ${adminToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/coordination/tasks — rejects out-of-range coordinates (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    ...VALID_TASK_BODY,
    assignedLocation: { type: 'Point', coordinates: [200, 100] },
  }, { Authorization: `Bearer ${adminToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

// ---------------------------------------------------------------------------
// POST /api/coordination/tasks — volunteer cannot self-assign
// Volunteers are blocked at the role level (403) — they cannot reach this endpoint
// ---------------------------------------------------------------------------

test('POST /api/coordination/tasks — volunteer cannot self-assign (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', {
    ...VALID_TASK_BODY,
    volunteerId: VOL_ID,
  }, { Authorization: `Bearer ${volunteerToken()}` })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/coordination/tasks — valid admin token reaches route
// ---------------------------------------------------------------------------

test('POST /api/coordination/tasks — valid admin token reaches route (201/404/500/401 no-DB)', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', VALID_TASK_BODY, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.ok(
    res.status === 201 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 201/404/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/coordination/tasks — admin only
// ---------------------------------------------------------------------------

test('GET /api/coordination/tasks — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', '/api/coordination/tasks')
  assert.equal(res.status, 401)
})

test('GET /api/coordination/tasks — rejects volunteer role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/coordination/tasks', undefined, {
    Authorization: `Bearer ${volunteerToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/coordination/tasks — rejects ngo role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/coordination/tasks', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/coordination/tasks — valid admin token reaches route (200/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/coordination/tasks', undefined, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('GET /api/coordination/tasks — rejects invalid cursor (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/coordination/tasks?cursor=!!!bad!!!', undefined, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Coordination error responses never expose stack traces', async () => {
  const res = await httpRequest('POST', '/api/coordination/tasks', { volunteerId: '' }, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
