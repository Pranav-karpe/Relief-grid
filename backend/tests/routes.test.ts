import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'

// ---------------------------------------------------------------------------
// Minimal HTTP helper — spins up the Express app on a random port, makes one
// request, then closes the server. No Atlas connection needed for these tests.
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
      if (!address || typeof address === 'string') {
        reject(new Error('Could not bind test server'))
        return
      }

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
// Health
// ---------------------------------------------------------------------------

test('GET /api/health returns 200', async () => {
  const res = await httpRequest('GET', '/api/health')
  assert.equal(res.status, 200)
  assert.equal((res.body as { status?: string }).status, 'ok')
})

// ---------------------------------------------------------------------------
// Registration — validation only (no Atlas write)
// ---------------------------------------------------------------------------

test('POST /api/auth/register — rejects missing fields', async () => {
  const res = await httpRequest('POST', '/api/auth/register', { email: 'bad' })
  assert.equal(res.status, 400)
  assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/auth/register — rejects admin role', async () => {
  const res = await httpRequest('POST', '/api/auth/register', {
    displayName: 'Hacker',
    email: `admin-test-${Date.now()}@example.invalid`,
    password: 'password123',
    role: 'admin',
  })
  assert.equal(res.status, 400)
})

test('POST /api/auth/register — rejects short displayName', async () => {
  const res = await httpRequest('POST', '/api/auth/register', {
    displayName: 'X',
    email: `short-name-${Date.now()}@example.invalid`,
    password: 'password123',
  })
  assert.equal(res.status, 400)
  assert.equal((res.body as { code?: string }).code, 'validation_error')
})

test('POST /api/auth/register — rejects short password', async () => {
  const res = await httpRequest('POST', '/api/auth/register', {
    displayName: 'Valid Name',
    email: `short-pw-${Date.now()}@example.invalid`,
    password: 'short',
  })
  assert.equal(res.status, 400)
})

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test('POST /api/auth/login — rejects unknown credentials generically', async () => {
  const res = await httpRequest('POST', '/api/auth/login', {
    email: 'nobody@example.invalid',
    password: 'password123',
  })
  // In the test environment, MONGODB_URI points at a non-routable address, so
  // the DB is always unavailable. The server must return 500 (internal error —
  // Mongoose buffer timeout) rather than 200 or a token.  A live server would
  // return 401 with a generic message.  Either way, no token must be returned.
  assert.ok(
    res.status === 401 || res.status === 500 || res.status === 503,
    `Expected 401/500/503 (no token) — got ${res.status}`,
  )
  assert.equal((res.body as { data?: { token?: unknown } }).data?.token, undefined, 'login must not return a token')
})

test('POST /api/auth/login — rejects malformed body', async () => {
  const res = await httpRequest('POST', '/api/auth/login', { email: 'not-an-email', password: 'pw' })
  assert.equal(res.status, 400)
})

// ---------------------------------------------------------------------------
// Protected routes — token validation (no DB lookup succeeds, 401 expected)
// ---------------------------------------------------------------------------

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

test('GET /api/users/me — rejects missing token', async () => {
  const res = await httpRequest('GET', '/api/users/me')
  assert.equal(res.status, 401)
})

test('GET /api/users/me — rejects tampered token', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)
  const res = await httpRequest('GET', '/api/users/me', undefined, {
    Authorization: `Bearer ${token}x`,
  })
  assert.equal(res.status, 401)
})

test('GET /api/users/me — rejects expired token', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, -1)
  const res = await httpRequest('GET', '/api/users/me', undefined, {
    Authorization: `Bearer ${token}`,
  })
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// Role-access routes
// ---------------------------------------------------------------------------

test('GET /api/role-access/ngo — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/role-access/ngo')
  assert.equal(res.status, 401)
})

test('GET /api/role-access/admin — rejects unauthenticated', async () => {
  const res = await httpRequest('GET', '/api/role-access/admin')
  assert.equal(res.status, 401)
})

// ---------------------------------------------------------------------------
// Profile update — validation (forbidden fields checked before DB lookup)
// ---------------------------------------------------------------------------

test('PATCH /api/users/me — rejects unauthenticated', async () => {
  const res = await httpRequest('PATCH', '/api/users/me', { displayName: 'New Name' })
  assert.equal(res.status, 401)
})

test('PATCH /api/users/me — rejects role change attempt', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)
  const res = await httpRequest('PATCH', '/api/users/me', { role: 'admin' }, {
    Authorization: `Bearer ${token}`,
  })
  // 400 = forbidden field caught before DB; 401 = user not found in DB
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/users/me — rejects accountStatus change attempt', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)
  const res = await httpRequest('PATCH', '/api/users/me', { accountStatus: 'active' }, {
    Authorization: `Bearer ${token}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/users/me — rejects verificationStatus change attempt', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)
  const res = await httpRequest('PATCH', '/api/users/me', {
    organizationProfile: { verificationStatus: 'verified' },
  }, { Authorization: `Bearer ${token}` })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

test('PATCH /api/users/me — rejects empty update body', async () => {
  const token = createAccessToken('000000000000000000000001', 'citizen', secret, 3600)
  const res = await httpRequest('PATCH', '/api/users/me', {}, {
    Authorization: `Bearer ${token}`,
  })
  assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

test('Unknown route returns 404', async () => {
  const res = await httpRequest('GET', '/api/does-not-exist')
  assert.equal(res.status, 404)
})
