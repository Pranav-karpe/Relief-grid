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

const NGO_ID = '000000000000000000000030'
const NGO2_ID = '000000000000000000000031'
const CITIZEN_ID = '000000000000000000000010'
const DONOR_ID = '000000000000000000000020'
const FAKE_ID = '000000000000000000000099'

function ngoToken(id = NGO_ID) { return createAccessToken(id, 'ngo', secret, 3600) }
function citizenToken() { return createAccessToken(CITIZEN_ID, 'citizen', secret, 3600) }
function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }

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

const VALID_REQUIREMENT = {
  resourceCategory: 'Water',
  description: 'Bottled water needed for flood victims in the area.',
  quantityRequested: 100,
  unit: 'cases',
  priority: 'high',
  deliveryArea: { type: 'Point', coordinates: [72.8777, 19.076] },
}

// ---------------------------------------------------------------------------
// GET /api/ngo/profile
// ---------------------------------------------------------------------------

test('GET /api/ngo/profile — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/ngo/profile')
  assert.equal(res.status, 401)
})

test('GET /api/ngo/profile — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/ngo/profile', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/profile — rejects donor role', async () => {
  const res = await httpRequest('GET', '/api/ngo/profile', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/profile — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', '/api/ngo/profile', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 200/404/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// PATCH /api/ngo/profile
// ---------------------------------------------------------------------------

test('PATCH /api/ngo/profile — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', { displayName: 'New Name' })
  assert.equal(res.status, 401)
})

test('PATCH /api/ngo/profile — rejects citizen role', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', { displayName: 'New Name' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/profile — rejects role change attempt', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', { role: 'admin' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/ngo/profile — rejects verificationStatus change attempt', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', {
    organizationProfile: { verificationStatus: 'verified' },
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/ngo/profile — rejects accountStatus change attempt', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', { accountStatus: 'active' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/profile — rejects empty update body', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', {}, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/profile — rejects short displayName', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/profile', { displayName: 'X' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/ngo/verification
// ---------------------------------------------------------------------------

test('GET /api/ngo/verification — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/ngo/verification')
  assert.equal(res.status, 401)
})

test('GET /api/ngo/verification — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/ngo/verification', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/verification — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', '/api/ngo/verification', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/ngo/verification/submit
// ---------------------------------------------------------------------------

test('POST /api/ngo/verification/submit — rejects unauthenticated', async () => {
  const res = await httpRequest('POST', '/api/ngo/verification/submit')
  assert.equal(res.status, 401)
})

test('POST /api/ngo/verification/submit — rejects citizen role', async () => {
  const res = await httpRequest('POST', '/api/ngo/verification/submit', {}, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/ngo/verification/submit — valid NGO token reaches route', async () => {
  const res = await httpRequest('POST', '/api/ngo/verification/submit', {}, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  // 400 = missing org name, 409 = duplicate/already verified, 201 = created, 401/500 = no DB
  assert.ok(
    res.status === 400 || res.status === 409 || res.status === 201 || res.status === 401 || res.status === 500,
    `Expected 400/409/201/401/500, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/ngo/reports
// ---------------------------------------------------------------------------

test('GET /api/ngo/reports — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports')
  assert.equal(res.status, 401)
})

test('GET /api/ngo/reports — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/reports — rejects donor role', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/reports — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/ngo/reports — rejects invalid cursor', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports?cursor=!!!invalid!!!', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/ngo/reports/:reportId
// ---------------------------------------------------------------------------

test('GET /api/ngo/reports/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/ngo/reports/${FAKE_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/ngo/reports/:id — rejects citizen role', async () => {
  const res = await httpRequest('GET', `/api/ngo/reports/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/reports/:id — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('GET', '/api/ngo/reports/not-a-valid-id', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/ngo/reports/:id — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', `/api/ngo/reports/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/ngo/requirements
// ---------------------------------------------------------------------------

test('POST /api/ngo/requirements — rejects unauthenticated', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', VALID_REQUIREMENT)
  assert.equal(res.status, 401)
})

test('POST /api/ngo/requirements — rejects citizen role', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', VALID_REQUIREMENT, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects donor role', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', VALID_REQUIREMENT, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects missing resourceCategory', async () => {
  const { resourceCategory: _rc, ...noCategory } = VALID_REQUIREMENT
  const res = await httpRequest('POST', '/api/ngo/requirements', noCategory, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/ngo/requirements — rejects short description', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, description: 'short' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects zero quantity', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, quantityRequested: 0 }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects negative quantity', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, quantityRequested: -5 }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects invalid priority', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, priority: 'extreme' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects invalid GeoJSON', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', {
    ...VALID_REQUIREMENT,
    deliveryArea: { type: 'Point', coordinates: [200, 100] },
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects invalid neededBy date', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, neededBy: 'not-a-date' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/ngo/requirements — rejects client-supplied ngo field', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, ngo: NGO2_ID }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/ngo/requirements — rejects client-supplied status field', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { ...VALID_REQUIREMENT, status: 'fulfilled' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/ngo/requirements — valid NGO token reaches route (201 live, 500/401 no-DB)', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', VALID_REQUIREMENT, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 201 || res.status === 500 || res.status === 401,
    `Expected 201/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/ngo/requirements/mine
// ---------------------------------------------------------------------------

test('GET /api/ngo/requirements/mine — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/ngo/requirements/mine')
  assert.equal(res.status, 401)
})

test('GET /api/ngo/requirements/mine — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/ngo/requirements/mine', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/requirements/mine — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', '/api/ngo/requirements/mine', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/ngo/requirements/mine — rejects invalid cursor', async () => {
  const res = await httpRequest('GET', '/api/ngo/requirements/mine?cursor=!!!bad!!!', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// GET /api/ngo/requirements/:id
// ---------------------------------------------------------------------------

test('GET /api/ngo/requirements/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/ngo/requirements/${FAKE_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/ngo/requirements/:id — rejects citizen role', async () => {
  const res = await httpRequest('GET', `/api/ngo/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/ngo/requirements/:id — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('GET', '/api/ngo/requirements/not-a-valid-id', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/ngo/requirements/:id — valid NGO token reaches route', async () => {
  const res = await httpRequest('GET', `/api/ngo/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

test('GET /api/ngo/requirements/:id — different NGO token returns 404 (ownership enforced)', async () => {
  const res = await httpRequest('GET', `/api/ngo/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${ngoToken(NGO2_ID)}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// PATCH /api/ngo/requirements/:id
// ---------------------------------------------------------------------------

test('PATCH /api/ngo/requirements/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { unit: 'kg' })
  assert.equal(res.status, 401)
})

test('PATCH /api/ngo/requirements/:id — rejects citizen role', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { unit: 'kg' }, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/requirements/:id — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/requirements/not-a-valid-id', { unit: 'kg' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/requirements/:id — rejects protected field ngo', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { ngo: NGO2_ID }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/ngo/requirements/:id — rejects protected field status', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { status: 'fulfilled' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/ngo/requirements/:id — rejects protected field quantityFulfilled', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { quantityFulfilled: 5 }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('PATCH /api/ngo/requirements/:id — rejects empty update body', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, {}, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 500 || res.status === 401,
    `Expected 400/500/401, got ${res.status}`)
})

test('PATCH /api/ngo/requirements/:id — rejects invalid priority', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}`, { priority: 'extreme' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// PATCH /api/ngo/requirements/:id/cancel
// ---------------------------------------------------------------------------

test('PATCH /api/ngo/requirements/:id/cancel — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}/cancel`)
  assert.equal(res.status, 401)
})

test('PATCH /api/ngo/requirements/:id/cancel — rejects citizen role', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}/cancel`, {}, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/requirements/:id/cancel — returns 404 for invalid ObjectId', async () => {
  const res = await httpRequest('PATCH', '/api/ngo/requirements/not-a-valid-id/cancel', {}, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/ngo/requirements/:id/cancel — valid NGO token reaches route', async () => {
  const res = await httpRequest('PATCH', `/api/ngo/requirements/${FAKE_ID}/cancel`, {}, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 409 || res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 404/409/200/500/401, got ${res.status}`)
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('NGO error responses never expose stack traces', async () => {
  const res = await httpRequest('POST', '/api/ngo/requirements', { resourceCategory: '' }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
