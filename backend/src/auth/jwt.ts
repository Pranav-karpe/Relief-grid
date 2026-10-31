import { createHmac, timingSafeEqual } from 'node:crypto'
import { userRoles, type UserRole } from '../models/common.js'

type JwtPayload = {
  sub: string
  role: UserRole
  iat: number
  exp: number
}

const algorithm = 'HS256'

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url')
}

export function createAccessToken(userId: string, role: UserRole, secret: string, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const header = encode({ alg: algorithm, typ: 'JWT' })
  const payload = encode({ sub: userId, role, iat: now, exp: now + expiresInSeconds })
  const unsignedToken = `${header}.${payload}`
  return `${unsignedToken}.${sign(unsignedToken, secret)}`
}

export function verifyAccessToken(token: string, secret: string): JwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token.')
  }

  const [header, payload, signature] = parts
  const expectedSignature = sign(`${header}.${payload}`, secret)
  const actual = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid token.')
  }

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string; typ?: string }
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload
    const now = Math.floor(Date.now() / 1000)

    if (
      decodedHeader.alg !== algorithm ||
      decodedHeader.typ !== 'JWT' ||
      typeof decodedPayload.sub !== 'string' ||
      !userRoles.includes(decodedPayload.role) ||
      !Number.isInteger(decodedPayload.exp) ||
      decodedPayload.exp <= now
    ) {
      throw new Error('Invalid token.')
    }

    return decodedPayload
  } catch {
    throw new Error('Invalid token.')
  }
}
