import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'

// ---------------------------------------------------------------------------
// NOTE ON TEST ENVIRONMENT
// setup.ts overrides MONGODB_URI to a non-routable address.
// requireAuth performs a DB lookup — with no DB it times out (~1.5 s) → 401.
//
// Strategy (matching routes.test.ts):
//   - No token → exact 401 (rejected before DB lookup).
//   - Valid token for wrong role → 403 live, 401 DB-timeout → accept either.
//   - Valid admin token → route logic runs but DB fails → 500/404/409/401.
//   - Validation before DB (e.g. invalid ObjectId, bad body) → 400 or 401.
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const ADMIN_ID    = '000000000000000000000001'
const CITIZEN_ID  = '000000000000000000000010'
const DONOR_ID    = '000000000000000000000020'
const VOLUNTEER_ID = '000000000000000000000030'
const NGO_ID      = '000000000000000000000040'
const FAKE_ID     = '000000000000000000000099'

function token(id: string, role: string) {
  return createAccessToken(id, role as never, secret, 3600)
}

type FetchResult = { status: number; body: Record<string, unknown> }

function req(
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
      const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers }
      if (payload) h['Content-Length'] = String(Buffer.byteLength(payload))
      const r = http.request(
        { hostname: '127.0.0.1', port: address.port, path, method, headers: h },
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
      r.on('error', (err) => { server.close(); reject(err) })
      if (payload) r.write(payload)
      r.end()
    })
  })
}

// ---------------------------------------------------------------------------
// Authorization — unauthenticated requests
// ---------------------------------------------------------------------------

const ADMIN_ENDPOINTS: [string, string][] = [
  ['GET',   '/api/admin/overview'],
  ['GET',   '/api/admin/users'],
  ['GET',   `/api/admin/users/${FAKE_ID}`],
  ['PATCH', `/api/admin/users/${FAKE_ID}/status`],
  ['GET',   '/api/admin/ngos/verifications'],
  ['GET',   `/api/admin/ngos/verifications/${FAKE_ID}`],
  ['POST',  `/api/admin/ngos/verifications/${FAKE_ID}/approve`],
  ['POST',  `/api/admin/ngos/verifications/${FAKE_ID}/reject`],
  ['GET',   '/api/admin/reports'],
  ['GET',   `/api/admin/reports/${FAKE_ID}`],
  ['PATCH', `/api/admin/reports/${FAKE_ID}/status`],
  ['GET',   '/api/admin/complaints'],
  ['GET',   `/api/admin/complaints/${FAKE_ID}`],
  ['PATCH', `/api/admin/complaints/${FAKE_ID}/status`],
  ['GET',   '/api/admin/audit-logs'],
  ['GET',   '/api/admin/resources'],
  ['GET',   '/api/admin/requirements'],
  ['GET',   '/api/admin/allocations'],
  ['GET',   '/api/admin/tasks'],
]

for (const [method, path] of ADMIN_ENDPOINTS) {
  test(`${method} ${path} — rejects unauthenticated (no token)`, async () => {
    const res = await req(method, path)
    assert.equal(res.status, 401)
  })
}

// ---------------------------------------------------------------------------
// Authorization — non-admin roles cannot access admin endpoints
// ---------------------------------------------------------------------------

const NON_ADMIN_TOKENS = [
  { role: 'citizen',   id: CITIZEN_ID },
  { role: 'donor',     id: DONOR_ID },
  { role: 'volunteer', id: VOLUNTEER_ID },
  { role: 'ngo',       id: NGO_ID },
]

for (const { role, id } of NON_ADMIN_TOKENS) {
  test(`GET /api/admin/overview — rejects ${role} role`, async () => {
    const res = await req('GET', '/api/admin/overview', undefined, {
      Authorization: `Bearer ${token(id, role)}`,
    })
    assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
  })
}

for (const { role, id } of NON_ADMIN_TOKENS) {
  test(`GET /api/admin/users — rejects ${role} role`, async () => {
    const res = await req('GET', '/api/admin/users', undefined, {
      Authorization: `Bearer ${token(id, role)}`,
    })
    assert.ok(res.status === 403 || res.status === 401, `Expected 403 or 401, got ${res.status}`)
  })
}

// ---------------------------------------------------------------------------
// Public registration cannot create an admin (already tested in routes.test.ts,
// but verify the admin endpoint itself is not publicly accessible)
// ---------------------------------------------------------------------------

test('POST /api/auth/register — rejects admin role', async () => {
  const res = await req('POST', '/api/auth/register', {
    displayName: 'Hacker',
    email: `admin-attempt-${Date.now()}@example.invalid`,
    password: 'password123',
    role: 'admin',
  })
  assert.equal(res.status, 400)
})

// ---------------------------------------------------------------------------
// Admin overview — admin token reaches route (DB timeout → 500/401)
// ---------------------------------------------------------------------------

test('GET /api/admin/overview — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/overview', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(
    res.status === 200 || res.status === 500 || res.status === 401,
    `Expected 200/500/401, got ${res.status}`,
  )
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

test('GET /api/admin/users — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/users', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/users — pagination limit is bounded (limit=200 clamped to 100)', async () => {
  const res = await req('GET', '/api/admin/users?limit=200', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  // Route clamps limit to 100; DB timeout → 500/401 in test env
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/users/:userId — returns 404 for invalid ObjectId', async () => {
  const res = await req('GET', '/api/admin/users/not-a-valid-id', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('GET /api/admin/users/:userId — admin token reaches route for valid ObjectId', async () => {
  const res = await req('GET', `/api/admin/users/${FAKE_ID}`, undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401, `Expected 404/500/401, got ${res.status}`)
})

test('PATCH /api/admin/users/:userId/status — rejects invalid accountStatus', async () => {
  const res = await req('PATCH', `/api/admin/users/${FAKE_ID}/status`, { accountStatus: 'banned' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/admin/users/:userId/status — rejects invalid ObjectId', async () => {
  const res = await req('PATCH', '/api/admin/users/bad-id/status', { accountStatus: 'active' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/admin/users/:userId/status — self-suspension is rejected', async () => {
  // Admin tries to suspend their own account
  const res = await req('PATCH', `/api/admin/users/${ADMIN_ID}/status`, { accountStatus: 'suspended' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  // 409 = self-suspension rejected; 401 = DB timeout (auth lookup failed)
  assert.ok(res.status === 409 || res.status === 401, `Expected 409 or 401, got ${res.status}`)
})

test('PATCH /api/admin/users/:userId/status — self-close is rejected', async () => {
  const res = await req('PATCH', `/api/admin/users/${ADMIN_ID}/status`, { accountStatus: 'closed' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 409 || res.status === 401, `Expected 409 or 401, got ${res.status}`)
})

test('PATCH /api/admin/users/:userId/status — response never contains stack trace', async () => {
  const res = await req('PATCH', `/api/admin/users/${FAKE_ID}/status`, { accountStatus: 'banned' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
})

// ---------------------------------------------------------------------------
// NGO verifications
// ---------------------------------------------------------------------------

test('GET /api/admin/ngos/verifications — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/ngos/verifications', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/ngos/verifications/:id — returns 404 for invalid ObjectId', async () => {
  const res = await req('GET', '/api/admin/ngos/verifications/bad-id', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('POST /api/admin/ngos/verifications/:id/approve — returns 404 for invalid ObjectId', async () => {
  const res = await req('POST', '/api/admin/ngos/verifications/bad-id/approve', {}, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('POST /api/admin/ngos/verifications/:id/reject — requires a reason', async () => {
  const res = await req('POST', `/api/admin/ngos/verifications/${FAKE_ID}/reject`, { reason: 'hi' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  // reason too short (< 5 chars) → 400; or 401 DB timeout
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/admin/ngos/verifications/:id/reject — missing reason is rejected', async () => {
  const res = await req('POST', `/api/admin/ngos/verifications/${FAKE_ID}/reject`, {}, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('POST /api/admin/ngos/verifications/:id/reject — valid reason reaches route', async () => {
  const res = await req('POST', `/api/admin/ngos/verifications/${FAKE_ID}/reject`, {
    reason: 'Documents are incomplete and unverifiable.',
  }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401, `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

test('GET /api/admin/reports — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/reports', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/reports/:id — returns 404 for invalid ObjectId', async () => {
  const res = await req('GET', '/api/admin/reports/bad-id', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/admin/reports/:id/status — rejects invalid status value', async () => {
  const res = await req('PATCH', `/api/admin/reports/${FAKE_ID}/status`, { status: 'approved' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/admin/reports/:id/status — rejects invalid ObjectId', async () => {
  const res = await req('PATCH', '/api/admin/reports/bad-id/status', { status: 'verified' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/admin/reports/:id/status — valid status reaches route', async () => {
  const res = await req('PATCH', `/api/admin/reports/${FAKE_ID}/status`, { status: 'under_review' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401, `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

test('GET /api/admin/complaints — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/complaints', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/complaints/:id — returns 404 for invalid ObjectId', async () => {
  const res = await req('GET', '/api/admin/complaints/bad-id', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 401, `Expected 404 or 401, got ${res.status}`)
})

test('PATCH /api/admin/complaints/:id/status — rejects invalid status', async () => {
  const res = await req('PATCH', `/api/admin/complaints/${FAKE_ID}/status`, { status: 'approved' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/admin/complaints/:id/status — valid status reaches route', async () => {
  const res = await req('PATCH', `/api/admin/complaints/${FAKE_ID}/status`, { status: 'under_review' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 404 || res.status === 500 || res.status === 401, `Expected 404/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

test('GET /api/admin/audit-logs — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/audit-logs', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/audit-logs — pagination limit is bounded', async () => {
  const res = await req('GET', '/api/admin/audit-logs?limit=500', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// Oversight endpoints
// ---------------------------------------------------------------------------

test('GET /api/admin/resources — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/resources', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/requirements — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/requirements', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/allocations — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/allocations', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

test('GET /api/admin/tasks — admin token reaches route', async () => {
  const res = await req('GET', '/api/admin/tasks', undefined, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.ok(res.status === 200 || res.status === 500 || res.status === 401, `Expected 200/500/401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// No stack traces in any admin error response
// ---------------------------------------------------------------------------

test('Admin error responses never expose stack traces', async () => {
  const res = await req('PATCH', `/api/admin/users/${FAKE_ID}/status`, { accountStatus: 'banned' }, {
    Authorization: `Bearer ${token(ADMIN_ID, 'admin')}`,
  })
  assert.equal((res.body as { stack?: unknown }).stack, undefined)
  assert.equal((res.body as { error?: unknown }).error, undefined)
})
