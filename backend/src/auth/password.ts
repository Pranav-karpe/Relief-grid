import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const saltBytes = 16
const keyLength = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes).toString('hex')
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer
  return `${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, encodedKey] = storedHash.split(':')

  if (!salt || !encodedKey || encodedKey.length !== keyLength * 2) {
    return false
  }

  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer
  const expectedKey = Buffer.from(encodedKey, 'hex')
  return expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey)
}
