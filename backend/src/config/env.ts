import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'),
})

type NodeEnvironment = 'development' | 'test' | 'production'

export type AppConfig = {
  nodeEnv: NodeEnvironment
  port: number
  mongodbUri: string
  jwtSecret: string
  jwtExpiresInSeconds: number
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser?: string
  smtpPass?: string
  emailFrom?: string
  emailFromName?: string
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '5000')

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return port
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (value === undefined || value === '') {
    return 'development'
  }

  if (value === 'development' || value === 'test' || value === 'production') {
    return value
  }

  throw new Error('NODE_ENV must be development, test, or production.')
}

function parseMongoDbUri(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('MONGODB_URI is required.')
  }

  return value
}

export function parseJwtSecret(value: string | undefined): string {
  if (value === undefined || value.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.')
  }

  return value
}

export function parseJwtExpiresInSeconds(value: string | undefined): number {
  const expiresInSeconds = Number(value ?? '3600')

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 86400) {
    throw new Error('JWT_EXPIRES_IN_SECONDS must be an integer between 60 and 86400.')
  }

  return expiresInSeconds
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: parseNodeEnvironment(process.env.NODE_ENV),
    port: parsePort(process.env.PORT),
    mongodbUri: parseMongoDbUri(process.env.MONGODB_URI),
    jwtSecret: parseJwtSecret(process.env.JWT_SECRET),
    jwtExpiresInSeconds: parseJwtExpiresInSeconds(process.env.JWT_EXPIRES_IN_SECONDS),
    smtpHost: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || undefined,
    smtpPass: process.env.SMTP_PASS || undefined,
    emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_FROM_ADDRESS || undefined,
    emailFromName: process.env.EMAIL_FROM_NAME || 'ReliefGrid Team',
  }
}

export const config = loadConfig()
