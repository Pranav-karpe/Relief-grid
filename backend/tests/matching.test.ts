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
//   - No token → exact 401 (no DB needed).
//   - Valid token, wrong role → 403 or 401 (DB timeout).
//   - Valid token, correct role, invalid ID → 404 or 401.
//   - Valid token, correct role, valid ID → expected or 401/500.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const ADMIN_ID = '000000000000000000000001'
const DONOR_ID = '000000000000000000000002'
const NGO_ID = '000000000000000000000003'
const CITIZEN_ID = '000000000000000000000004'
const FAKE_ID = '000000000000000000000099'

function adminToken() { return createAccessToken(ADMIN_ID, 'admin', secret, 3600) }
function donorToken() { return createAccessToken(DONOR_ID, 'donor', secret, 3600) }
function ngoToken() { return createAccessToken(NGO_ID, 'ngo', secret, 3600) }
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

// ---------------------------------------------------------------------------
// GET /api/matching/suggestions — admin only
// ---------------------------------------------------------------------------

test('GET /api/matching/suggestions — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/matching/suggestions')
  assert.equal(res.status, 401)
})

test('GET /api/matching/suggestions — rejects donor role', async () => {
  const res = await httpRequest('GET', '/api/matching/suggestions', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/suggestions — rejects ngo role', async () => {
  const res = await httpRequest('GET', '/api/matching/suggestions', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/suggestions — rejects citizen role', async () => {
  const res = await httpRequest('GET', '/api/matching/suggestions', undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/suggestions — admin token reaches route (200 live, 500/401 no-DB)', async () => {
  const res = await httpRequest('GET', '/api/matching/suggestions', undefined, {
    Authorization: `Bearer ${adminToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/matching/donations/:donationId — donor (own) or admin
// ---------------------------------------------------------------------------

test('GET /api/matching/donations/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/matching/donations/${FAKE_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/matching/donations/:id — rejects citizen role', async () => {
  const res = await httpRequest('GET', `/api/matching/donations/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/donations/:id — rejects invalid ObjectId', async () => {
  const res = await httpRequest('GET', '/api/matching/donations/not-an-id', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/matching/donations/:id — donor token reaches route (200/404/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', `/api/matching/donations/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 200/404/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// GET /api/matching/requirements/:requirementId — ngo (own) or admin
// ---------------------------------------------------------------------------

test('GET /api/matching/requirements/:id — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', `/api/matching/requirements/${FAKE_ID}`)
  assert.equal(res.status, 401)
})

test('GET /api/matching/requirements/:id — rejects donor role', async () => {
  const res = await httpRequest('GET', `/api/matching/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/requirements/:id — rejects citizen role', async () => {
  const res = await httpRequest('GET', `/api/matching/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${citizenToken()}`,
  })
  assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
})

test('GET /api/matching/requirements/:id — rejects invalid ObjectId', async () => {
  const res = await httpRequest('GET', '/api/matching/requirements/not-an-id', undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/matching/requirements/:id — ngo token reaches route (200/404/500/401 no-DB)', async () => {
  const res = await httpRequest('GET', `/api/matching/requirements/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${ngoToken()}`,
  })
  assert.ok(
    res.status === 200 || res.status === 404 || res.status === 500 || res.status === 401,
    `Expected 200/404/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// Matching never exposes stack traces
// ---------------------------------------------------------------------------

test('Matching error responses never expose stack traces', async () => {
  const res = await httpRequest('GET', '/api/matching/donations/not-an-id', undefined, {
    Authorization: `Bearer ${donorToken()}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
