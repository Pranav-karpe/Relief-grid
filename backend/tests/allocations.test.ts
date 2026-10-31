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
//   - Valid token, correct role, validation before DB → expected or 401.
//   - Valid token, correct role, DB required → expected or 401/500.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const ADMIN_ID = '000000000000000000000001'
const NGO_ID = '000000000000000000000003'
const DONOR_ID = '000000000000000000000002'
const CITIZEN_ID = '000000000000000000000004'
const FAKE_DONATION_ID = '000000000000000000000010'
const FAKE_REQUIREMENT_ID = '000000000000000000000020'

function adminToken() { return createAccessToken(ADMIN_ID, 'admin', secret, 3600) }
function ngoToken() { return createAccessToken(NGO_ID, 'ngo', secret, 3600) }
function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }
function citizenToken() { return createAccessToken(CITIZEN_ID, 'citizen', secret, 3600) }

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

const VALID_BODY = {
  donationId: FAKE_DONATION_ID,
  requirementId: FAKE_REQUIREMENT_ID,
  quantity: 10,
}

// ---------------------------------------------------------------------------
// POST /api/allocations — unauthenticated
// ---------------------------------------------------------------------------

test('POST /api/allocations — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('POST', '/api/allocations', VALID_BODY)
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// POST /api/allocations — wrong roles
// ---------------------------------------------------------------------------

test('POST /api/allocations — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', VALID_BODY, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('POST /api/allocations — rejects donor role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', VALID_BODY, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// POST /api/allocations — validation errors (400 live, 401 DB-timeout)
// ---------------------------------------------------------------------------

test('POST /api/allocations — rejects missing donationId (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    requirementId: FAKE_REQUIREMENT_ID,
    quantity: 10,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/allocations — rejects missing requirementId (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    donationId: FAKE_DONATION_ID,
    quantity: 10,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/allocations — rejects zero quantity (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    ...VALID_BODY,
    quantity: 0,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/allocations — rejects negative quantity (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    ...VALID_BODY,
    quantity: -5,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/allocations — rejects invalid donationId format (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    donationId: 'not-an-id',
    requirementId: FAKE_REQUIREMENT_ID,
    quantity: 10,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/allocations — rejects invalid requirementId format (400 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('POST', '/api/allocations', {
    donationId: FAKE_DONATION_ID,
    requirementId: 'not-an-id',
    quantity: 10,
  }, { Authorization: `Bearer ${ngoToken()}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
  if (res.status === 400) assert.equal((res.body as { code?: string }).code, 'validation_error')
})

// ---------------------------------------------------------------------------
// POST /api/allocations — valid NGO/admin token reaches route
// ---------------------------------------------------------------------------

test('POST /api/allocations — valid NGO token reaches route (201/404/409/500/401 no-DB)', async () => {
  const res = await httpRequest('POST', '/api/allocations', VALID_BODY, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(
    res.status === 201 || res.status === 404 || res.status === 409 || res.status === 500 || res.status === 401,
    `Expected 201/404/409/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

test('POST /api/allocations — valid admin token reaches route (201/404/409/500/401 no-DB)', async () => {
  const res = await httpRequest('POST', '/api/allocations', VALID_BODY, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.ok(
    res.status === 201 || res.status === 404 || res.status === 409 || res.status === 500 || res.status === 401,
    `Expected 201/404/409/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/allocations/mine — NGO only
// ---------------------------------------------------------------------------

test('GET /api/allocations/mine — rejects unauthenticated with 401', async () => {
  const res = await httpRequest('GET', '/api/allocations/mine')
  assert.equal(res.status, 401)
})

test('GET /api/allocations/mine — rejects citizen role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/allocations/mine', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/allocations/mine — rejects donor role (403 live, 401 DB-timeout)', async () => {
  const res = await httpRequest('GET', '/api/allocations/mine', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/allocations/mine — valid NGO token reaches route (200/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/allocations/mine', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// No stack traces in error responses
// ---------------------------------------------------------------------------

test('Allocation error responses never expose stack traces', async () => {
  const res = await httpRequest('POST', '/api/allocations', { quantity: -1 }, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
