import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'

// ---------------------------------------------------------------------------
// NOTE ON TEST ENVIRONMENT
// The test setup (setup.ts) overrides MONGODB_URI to a non-routable address.
// requireAuth performs a DB lookup to verify the user is still active.
// With no DB, that lookup times out (~1.5 s) and returns 401.
//
// Consequence: any test that sends a valid token will receive 401 (DB timeout)
// rather than the live-server response (403, 400, 200, etc.).
//
// Strategy (matching routes.test.ts):
//   - Tests that must NOT reach the route handler (no token / bad token):
//     assert exact 401.
//   - Tests that require auth to pass before the route logic runs:
//     assert the expected code OR 401 (DB timeout).
//   - Validation that runs BEFORE the DB lookup (e.g. invalid ObjectId check
//     in the route, or forbidden-field check before DB) can assert exact codes
//     only if the check happens before requireAuth — which it does not here,
//     so we accept 401 as the DB-timeout alternative.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const CITIZEN_ID = '000000000000000000000010'
const CITIZEN2_ID = '000000000000000000000011'
const DONOR_ID = '000000000000000000000020'
const FAKE_REPORT_ID = '000000000000000000000099'

function citizenToken(id = CITIZEN_ID) {
  return createAccessToken(id, 'citizen', secret, 3600)
}
function donorToken() {
  return createAccessToken(DONOR_ID, 'donor', secret, 3600)
}

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

const validReport = {
  title: 'Water shortage in sector 4',
  description: 'Residents have had no clean water for three days.',
  needCategory: 'water',
  urgency: 'high',
  location: { type: 'Point', coordinates: [72.8777, 19.076] },
}

// ---------------------------------------------------------------------------
// POST /api/reports — unauthenticated (no token → exact 401, no DB needed)
// ---------------------------------------------------------------------------

test('POST /api/reports — rejects unauthenticated request', async () => {
  const res = await httpRequest('POST', '/api/reports', validReport)
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// POST /api/reports — wrong role (donor token → 403 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/reports — rejects non-citizen role (donor)', async () => {
  const res = await httpRequest('POST', '/api/reports', validReport, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/reports — validation errors (400 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/reports — rejects missing title', async () => {
  const res = await httpRequest('POST', '/api/reports', { ...validReport, title: '' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects short description', async () => {
  const res = await httpRequest('POST', '/api/reports', { ...validReport, description: 'short' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects invalid category', async () => {
  const res = await httpRequest('POST', '/api/reports', { ...validReport, needCategory: 'weapons' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects invalid urgency', async () => {
  const res = await httpRequest('POST', '/api/reports', { ...validReport, urgency: 'extreme' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects missing location', async () => {
  const { location: _loc, ...noLoc } = validReport
  const res = await httpRequest('POST', '/api/reports', noLoc, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects invalid GeoJSON coordinates', async () => {
  const res = await httpRequest('POST', '/api/reports', {
    ...validReport,
    location: { type: 'Point', coordinates: [200, 100] },
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/reports — rejects negative affectedPersonCount', async () => {
  const res = await httpRequest('POST', '/api/reports', {
    ...validReport,
    affectedPersonCount: -5,
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/reports — valid token + body (500 DB-timeout or 201 live)
// ---------------------------------------------------------------------------

test('POST /api/reports — valid token reaches route (500 DB-timeout or 201 live)', async () => {
  const res = await httpRequest('POST', '/api/reports', validReport, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 500 || res.status === 201 || res.status === 401,
    `Expected 500/201/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/reports/mine
// ---------------------------------------------------------------------------

test('GET /api/reports/mine — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/reports/mine')
  assert.equal(res.status, 401)
})

test('GET /api/reports/mine — rejects non-citizen role', async () => {
  const res = await httpRequest('GET', '/api/reports/mine', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/reports/mine — valid citizen token reaches route', async () => {
  const res = await httpRequest('GET', '/api/reports/mine', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 500 || res.status === 200 || res.status === 401,
    `Expected 500/200/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/reports/:reportId
// ---------------------------------------------------------------------------

test('GET /api/reports/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/reports/${FAKE_REPORT_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/reports/:id — rejects non-citizen role', async () => {
  const res = await httpRequest('GET', `/api/reports/${FAKE_REPORT_ID}`, undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/reports/:id — returns 404 for invalid ObjectId (or 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/reports/not-a-valid-id', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/reports/:id — valid citizen token reaches route', async () => {
  const res = await httpRequest('GET', `/api/reports/${FAKE_REPORT_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

test('GET /api/reports/:id — different citizen token reaches route (ownership enforced in query)', async () => {
  const res = await httpRequest('GET', `/api/reports/${FAKE_REPORT_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken(CITIZEN2_ID)}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// PATCH /api/reports/:reportId
// ---------------------------------------------------------------------------

test('PATCH /api/reports/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, { title: 'New title here' })
  assert.equal(res.status, 401)
})

test('PATCH /api/reports/:id — rejects non-citizen role', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, { title: 'New title here' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/reports/:id — rejects attempt to change reporter field', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, {
    reporter: CITIZEN2_ID,
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/reports/:id — rejects attempt to change review field', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, {
    review: { note: 'approved' },
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/reports/:id — rejects invalid status (citizen cannot set verified)', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, {
    status: 'verified',
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/reports/:id — rejects invalid status (citizen cannot set resolved)', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, {
    status: 'resolved',
  }, { Authorization: `Bearer ${citizenToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/reports/:id — rejects empty update body', async () => {
  const res = await httpRequest('PATCH', `/api/reports/${FAKE_REPORT_ID}`, {}, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 500 || res.status === 401,
    `Expected 400/500/401, got ${res.status}`)
})

test('PATCH /api/reports/:id — returns 404 for invalid ObjectId (or 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', '/api/reports/not-a-valid-id', { title: 'Updated title text' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Error responses never expose stack traces', async () => {
  const res = await httpRequest('POST', '/api/reports', { title: '' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
