import './setup.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import { UserModel, type UserDocument } from '../src/models/user.js'
import { createAccessToken, verifyAccessToken } from '../src/auth/jwt.js'
import { hashPassword, verifyPassword } from '../src/auth/password.js'
import {
  isPublicRole,
  login,
  normalizeEmail,
  register,
  DuplicateEmailError,
  InvalidCredentialsError,
  type AuthRepository,
} from '../src/auth/service.js'
import { parseJwtExpiresInSeconds, parseJwtSecret } from '../src/config/env.js'
import { requireRoles } from '../src/middleware/auth.js'
import { createRateLimiter } from '../src/middleware/rate-limiter.js'
import { ApiError } from '../src/middleware/api-error.js'

const secret = 'test-secret-that-is-longer-than-32-characters'

function repository(users: UserDocument[] = []): AuthRepository {
  return {
    findByEmail: async (email) => users.find((user) => user.email === email) ?? null,
    create: async (data) => {
      const user = new UserModel(data)
      users.push(user)
      return user
    },
  }
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

test('passwords are salted, hashed, and verifiable', async () => {
  const hash = await hashPassword('correct horse battery staple')
  assert.notEqual(hash, 'correct horse battery staple')
  assert.equal(await verifyPassword('correct horse battery staple', hash), true)
  assert.equal(await verifyPassword('wrong password', hash), false)
})

test('two hashes of the same password use different salts', async () => {
  const hash1 = await hashPassword('shared-password')
  const hash2 = await hashPassword('shared-password')
  assert.notEqual(hash1, hash2, 'salts must differ between hashes')
  assert.equal(await verifyPassword('shared-password', hash1), true)
  assert.equal(await verifyPassword('shared-password', hash2), true)
})

test('password verification returns false on malformed hash', async () => {
  assert.equal(await verifyPassword('password', 'invalid-format'), false)
  assert.equal(await verifyPassword('password', ''), false)
  assert.equal(await verifyPassword('password', ':'), false)
  // Salt present but key is wrong length
  assert.equal(await verifyPassword('password', 'aabbccdd:deadbeef'), false)
})

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test('registration normalizes email, defaults to citizen, and never creates admin', async () => {
  const user = await register(
    { displayName: ' Citizen ', email: ' CITIZEN@EXAMPLE.ORG ', password: 'password123' },
    repository(),
  )
  assert.equal(user.email, 'citizen@example.org')
  assert.equal(user.role, 'citizen')
  assert.equal(user.accountStatus, 'active')
  assert.ok(user.auth?.passwordHash)
  assert.equal(isPublicRole('admin'), false)
  assert.equal(normalizeEmail(' A@EXAMPLE.ORG '), 'a@example.org')
})

test('displayName is trimmed by register', async () => {
  const user = await register(
    { displayName: '  Padded Name  ', email: 'padded@example.org', password: 'password123' },
    repository(),
  )
  assert.equal(user.displayName, 'Padded Name')
})

test('password is never stored as plaintext', async () => {
  const plaintext = 'supersecretpassword'
  const user = await register(
    { displayName: 'Test User', email: 'hashed@example.org', password: plaintext },
    repository(),
  )
  const hash = user.auth?.passwordHash ?? ''
  assert.notEqual(hash, plaintext, 'password hash must not equal plaintext')
  assert.ok(hash.includes(':'), 'hash must contain a salt separator colon')
})

test('duplicate email in repository throws DuplicateEmailError', async () => {
  const users: UserDocument[] = []
  const repo = repository(users)
  await register({ displayName: 'First', email: 'dup@example.org', password: 'password123' }, repo)
  await assert.rejects(
    register({ displayName: 'Second', email: 'dup@example.org', password: 'password123' }, repo),
    DuplicateEmailError,
  )
})

test('repository.create throwing E11000 is re-raised as DuplicateEmailError', async () => {
  const e11000 = Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
  const dupRepo: AuthRepository = {
    findByEmail: async () => null,
    create: async () => { throw e11000 },
  }
  await assert.rejects(
    register({ displayName: 'Race', email: 'race@example.org', password: 'password123' }, dupRepo),
    DuplicateEmailError,
  )
})

test('non-duplicate DB error during create is re-thrown unchanged', async () => {
  const dbError = new Error('network failure')
  const failRepo: AuthRepository = {
    findByEmail: async () => null,
    create: async () => { throw dbError },
  }
  await assert.rejects(
    register({ displayName: 'Fail', email: 'fail@example.org', password: 'password123' }, failRepo),
    (err) => err === dbError,
  )
})

// ---------------------------------------------------------------------------
// isPublicRole
// ---------------------------------------------------------------------------

test('isPublicRole accepts public roles and rejects admin and unknown roles', () => {
  assert.equal(isPublicRole('citizen'), true)
  assert.equal(isPublicRole('donor'), true)
  assert.equal(isPublicRole('volunteer'), true)
  assert.equal(isPublicRole('ngo'), true)
  assert.equal(isPublicRole('admin'), false)
  assert.equal(isPublicRole(undefined), true)
  assert.equal(isPublicRole('superuser'), false)
  assert.equal(isPublicRole(''), false)
})

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test('login returns a token and rejects invalid credentials generically', async () => {
  const users: UserDocument[] = []
  const repo = repository(users)
  const user = await register(
    { displayName: 'Donor', email: 'donor@example.org', password: 'password123', role: 'donor' },
    repo,
  )
  const result = await login('DONOR@example.org', 'password123', repo, secret, 3600)
  assert.equal(result.user.id, user.id)
  assert.equal(verifyAccessToken(result.token, secret).role, 'donor')
  await assert.rejects(login('donor@example.org', 'wrong-password', repo, secret, 3600), /Invalid email or password/)
  await assert.rejects(login('missing@example.org', 'password123', repo, secret, 3600), /Invalid email or password/)
})

test('inactive, suspended, and closed accounts cannot log in', async () => {
  async function makeRepo(status: string): Promise<AuthRepository> {
    const hash = await hashPassword('password123')
    return {
      findByEmail: async () =>
        new UserModel({
          displayName: 'Inactive',
          email: 'inactive@example.org',
          role: 'citizen',
          accountStatus: status,
          auth: { passwordHash: hash },
        }) as UserDocument,
      create: async () => { throw new Error('should not be called') },
    }
  }
  await assert.rejects(login('inactive@example.org', 'password123', await makeRepo('pending'), secret, 3600), InvalidCredentialsError)
  await assert.rejects(login('inactive@example.org', 'password123', await makeRepo('suspended'), secret, 3600), InvalidCredentialsError)
  await assert.rejects(login('inactive@example.org', 'password123', await makeRepo('closed'), secret, 3600), InvalidCredentialsError)
})

test('DB failure during findByEmail is not disguised as invalid credentials', async () => {
  const dbError = new Error('Atlas connection dropped')
  const failRepo: AuthRepository = {
    findByEmail: async () => { throw dbError },
    create: async () => { throw new Error('should not be called') },
  }
  await assert.rejects(
    login('any@example.org', 'password123', failRepo, secret, 3600),
    (err) => err === dbError,
  )
})

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

test('JWT verification rejects tampering and expired tokens', () => {
  const token = createAccessToken('user-id', 'citizen', secret, 3600)
  assert.equal(verifyAccessToken(token, secret).sub, 'user-id')
  assert.throws(() => verifyAccessToken(`${token}x`, secret), /Invalid token/)
  const expired = createAccessToken('user-id', 'citizen', secret, -1)
  assert.throws(() => verifyAccessToken(expired, secret), /Invalid token/)
})

test('JWT with wrong algorithm in header is rejected', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: 'x', role: 'citizen', iat: now, exp: now + 3600 })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  assert.throws(() => verifyAccessToken(`${header}.${payload}.${sig}`, secret), /Invalid token/)
})

test('JWT with invalid role claim is rejected', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: 'x', role: 'superadmin', iat: now, exp: now + 3600 })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  assert.throws(() => verifyAccessToken(`${header}.${payload}.${sig}`, secret), /Invalid token/)
})

test('JWT with missing sub claim is rejected', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ role: 'citizen', iat: now, exp: now + 3600 })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  assert.throws(() => verifyAccessToken(`${header}.${payload}.${sig}`, secret), /Invalid token/)
})

test('malformed JWT structures are rejected', () => {
  assert.throws(() => verifyAccessToken('not.a.valid.jwt.at.all', secret), /Invalid token/)
  assert.throws(() => verifyAccessToken('only-one-part', secret), /Invalid token/)
  assert.throws(() => verifyAccessToken('two.parts', secret), /Invalid token/)
  assert.throws(() => verifyAccessToken('', secret), /Invalid token/)
})

// ---------------------------------------------------------------------------
// Role middleware
// ---------------------------------------------------------------------------

test('role middleware allows matching roles and rejects restricted roles', () => {
  const nextCalls: unknown[] = []
  const middleware = requireRoles('ngo')
  const request = { auth: { userId: '1', role: 'citizen' as const } }
  middleware(request as never, {} as never, (error?: unknown) => nextCalls.push(error))
  assert.equal(nextCalls.length, 1)
  assert.equal((nextCalls[0] as { statusCode: number }).statusCode, 403)
  const allowedCalls: unknown[] = []
  middleware({ auth: { userId: '1', role: 'ngo' as const } } as never, {} as never, (error?: unknown) => allowedCalls.push(error))
  assert.equal(allowedCalls.length, 1)
  assert.equal(allowedCalls[0], undefined)
})

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

test('environment config validates JWT secret requirements safely', () => {
  assert.throws(() => parseJwtSecret(undefined), /JWT_SECRET must be at least 32 characters long/)
  assert.throws(() => parseJwtSecret('too-short-secret'), /JWT_SECRET must be at least 32 characters long/)
  const validSecret = 'a'.repeat(32)
  assert.equal(parseJwtSecret(validSecret), validSecret)
})

test('environment config defaults expiration and validates range', () => {
  assert.equal(parseJwtExpiresInSeconds(undefined), 3600)
  assert.equal(parseJwtExpiresInSeconds('7200'), 7200)
  assert.throws(() => parseJwtExpiresInSeconds('59'), /JWT_EXPIRES_IN_SECONDS must be an integer between 60 and 86400/)
  assert.throws(() => parseJwtExpiresInSeconds('86401'), /JWT_EXPIRES_IN_SECONDS must be an integer between 60 and 86400/)
  assert.throws(() => parseJwtExpiresInSeconds('not-a-number'), /JWT_EXPIRES_IN_SECONDS must be an integer between 60 and 86400/)
})

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

test('rate limiter permits requests under threshold and blocks with 429 when exceeded', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    max: 2,
    keyGenerator: () => 'client-1',
  })

  const headers: Record<string, string | number> = {}
  const mockRes = {
    setHeader: (name: string, value: string | number) => {
      headers[name] = value
    },
  }
  const mockReq = { ip: '127.0.0.1', socket: {} }

  let nextCalled = 0
  const next = () => { nextCalled += 1 }

  // 1st request
  limiter(mockReq as never, mockRes as never, next)
  assert.equal(nextCalled, 1)
  assert.equal(headers['X-RateLimit-Remaining'], 1)

  // 2nd request
  limiter(mockReq as never, mockRes as never, next)
  assert.equal(nextCalled, 2)
  assert.equal(headers['X-RateLimit-Remaining'], 0)

  // 3rd request — exceeds limit
  assert.throws(
    () => limiter(mockReq as never, mockRes as never, next),
    (err: unknown) => err instanceof ApiError && err.statusCode === 429 && err.code === 'too_many_requests',
  )
  assert.ok(Number(headers['Retry-After']) > 0)
})

