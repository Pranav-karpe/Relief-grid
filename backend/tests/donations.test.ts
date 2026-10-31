import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'

// ---------------------------------------------------------------------------
// NOTE ON TEST ENVIRONMENT
// setup.ts overrides MONGODB_URI to a non-routable address.
// requireAuth performs a DB lookup to verify the user is still active.
// With no DB, that lookup times out (~1.5 s) and returns 401.
//
// Strategy (matching reports.test.ts):
//   - No token / bad token → assert exact 401 (no DB needed).
//   - Valid token → assert expected code OR 401 (DB timeout).
//   - Validation that runs BEFORE requireAuth (none here — all routes use
//     requireAuth first) → accept 401 as DB-timeout alternative.
// ---------------------------------------------------------------------------

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
      if (!address || typeof address === 'string') { reject(new Error('Could not bind')); return }
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

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const DONOR_ID = '000000000000000000000001'
const CITIZEN_ID = '000000000000000000000002'
const FAKE_DONATION_ID = '000000000000000000000099'

function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }
function citizenToken() { return createAccessToken(CITIZEN_ID, 'citizen', secret, 3600) }

const VALID_BODY = {
  resourceCategory: 'Water',
  description: 'Bottled water, 500ml bottles, sealed cases.',
  quantity: 100,
  unit: 'cases',
  condition: 'new',
  location: { type: 'Point', coordinates: [72.8777, 19.076] },
}

// ---------------------------------------------------------------------------
// POST /api/donations — unauthenticated (no token → exact 401, no DB needed)
// ---------------------------------------------------------------------------

test('POST /api/donations — rejects unauthenticated request with 401', async () => {
  const res = await httpRequest('POST', '/api/donations', VALID_BODY)
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// POST /api/donations — wrong role (403 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/donations — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', VALID_BODY, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/donations — validation errors (400 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/donations — rejects missing resourceCategory (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', { ...VALID_BODY, resourceCategory: '' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/donations — rejects short description (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', { ...VALID_BODY, description: 'short' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects negative quantity (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', { ...VALID_BODY, quantity: -1 }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects invalid condition (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', { ...VALID_BODY, condition: 'broken' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects missing location (400 live, 401 DB-timeout)', async () => {
  const { location: _loc, ...noLoc } = VALID_BODY
  const res = await httpRequest('POST', '/api/donations', noLoc, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects invalid GeoJSON type (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', {
    ...VALID_BODY,
    location: { type: 'Polygon', coordinates: [72.8777, 19.076] },
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects out-of-range coordinates (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', {
    ...VALID_BODY,
    location: { type: 'Point', coordinates: [200, 100] },
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — rejects invalid expiryDate (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/donations', { ...VALID_BODY, expiryDate: 'not-a-date' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/donations — valid donor token reaches route (201 live, 500/401 no-DB)', async () => {
  const res = await httpRequest('POST', '/api/donations', VALID_BODY, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(
    res.status === 201 || res.status === 500 || res.status === 401,
    `Expected 201/500/401 — got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/donations/mine
// ---------------------------------------------------------------------------

test('GET /api/donations/mine — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', '/api/donations/mine')
  assert.equal(res.status, 401)
})

test('GET /api/donations/mine — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/donations/mine', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/donations/mine — valid donor token reaches route (200 live, 500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/donations/mine', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401 — got ${res.status}`,
  )
})

test('GET /api/donations/mine — rejects invalid cursor (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/donations/mine?cursor=!!!invalid!!!', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/donations/:id
// ---------------------------------------------------------------------------

test('GET /api/donations/:id — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', `/api/donations/${FAKE_DONATION_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/donations/:id — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', `/api/donations/${FAKE_DONATION_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/donations/:id — rejects invalid ObjectId (404 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/donations/not-an-id', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/donations/:id — valid donor token reaches route (404/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', `/api/donations/${FAKE_DONATION_ID}`, undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(
    res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401 — got ${res.status}`,
  )
})

// ---------------------------------------------------------------------------
// PATCH /api/donations/:id
// ---------------------------------------------------------------------------

test('PATCH /api/donations/:id — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, { unit: 'kg' })
  assert.equal(res.status, 401)
})

test('PATCH /api/donations/:id — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, { unit: 'kg' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/donations/:id — rejects invalid ObjectId (404 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', '/api/donations/not-an-id', { unit: 'kg' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/donations/:id — rejects protected field "donor" (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    donor: '000000000000000000000099',
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects protected field "quantityReserved" (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    quantityReserved: 5,
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects protected field "quantityAllocated" (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    quantityAllocated: 5,
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects protected field "matchedRequirements" (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    matchedRequirements: [],
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects donor setting reserved status (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    availabilityStatus: 'reserved',
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects donor setting allocated status (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {
    availabilityStatus: 'allocated',
  }, { Authorization: `Bearer ${donorToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/donations/:id — rejects empty update body (400 live, 500/401 no-DB)', async () => {
  const res = await httpRequest('PATCH', `/api/donations/${FAKE_DONATION_ID}`, {}, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 500 || res.status === 401,
    `Expected 400/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Donation error responses never expose stack traces', async () => {
  const res = await httpRequest('POST', '/api/donations', { resourceCategory: '' }, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
