import { Router } from 'express'
import { config } from '../config/env.js'
import { UserModel } from '../models/user.js'
import type { UserDocument } from '../models/user.js'
import { userRoles, type UserRole } from '../models/common.js'
import { register, login, isPublicRole, userRepository, DuplicateEmailError, InvalidCredentialsError } from '../auth/service.js'
import { ApiError } from '../middleware/api-error.js'
import { authRateLimiter } from '../middleware/rate-limiter.js'
import { ensureMongoDBConnected } from '../config/mongodb.js'

const authRouter = Router()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}$/

function bodyValue(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' ? body as Record<string, unknown> : {}
}

function validateCredentials(body: unknown): { email: string; password: string } {
  const values = bodyValue(body)
  const email = typeof values.email === 'string' ? values.email.trim() : ''
  const password = typeof values.password === 'string' ? values.password : ''

  if (!emailPattern.test(email) || password.length < 8 || password.length > 128) {
    throw new ApiError(400, 'validation_error', 'A valid email and password of 8 to 128 characters are required.')
  }

  return { email, password }
}

function safeUser(user: UserDocument) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    organizationProfile: user.organizationProfile,
    volunteerProfile: user.volunteerProfile,
  }
}

authRouter.post('/register', authRateLimiter, async (request, response) => {
  const values = bodyValue(request.body)
  const { email, password } = validateCredentials(values)
  const displayName = typeof values.displayName === 'string' ? values.displayName.trim() : ''
  const role = values.role === undefined ? undefined : values.role
  const phone = typeof values.phone === 'string' ? values.phone.trim() : undefined

  if (displayName.length < 2 || displayName.length > 120 || (typeof role !== 'undefined' && (typeof role !== 'string' || !isPublicRole(role)))) {
    throw new ApiError(400, 'validation_error', `displayName and role must be valid. Roles: ${userRoles.filter((item) => item !== 'admin').join(', ')}.`)
  }

  if (phone && !phonePattern.test(phone)) {
    throw new ApiError(400, 'validation_error', 'Phone number format is invalid.')
  }

  const dbConnected = await ensureMongoDBConnected()
  if (!dbConnected) {
    throw new ApiError(503, 'service_unavailable', 'Database connection is temporarily unavailable. Please try again in a moment.')
  }

  const organizationName = typeof values.organizationName === 'string' ? values.organizationName.trim() : undefined
  const registrationNumber = typeof values.registrationNumber === 'string' ? values.registrationNumber.trim() : undefined
  const darpanId = typeof values.darpanId === 'string' ? values.darpanId.trim() : undefined
  const skills = Array.isArray(values.skills) ? values.skills.map(String) : undefined

  let generalLocation: { type: 'Point'; coordinates: [number, number] } | undefined
  if (values.generalLocation && typeof values.generalLocation === 'object') {
    const loc = values.generalLocation as { coordinates?: unknown }
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
      const lng = Number(loc.coordinates[0])
      const lat = Number(loc.coordinates[1])
      if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
        generalLocation = { type: 'Point', coordinates: [lng, lat] }
      }
    }
  }

  try {
    const user = await register(
      {
        displayName,
        email,
        password,
        phone,
        role: role as Exclude<UserRole, 'admin'> | undefined,
        organizationName,
        registrationNumber,
        darpanId,
        skills,
        generalLocation,
      },
      userRepository,
    )
    response.status(201).json({ data: safeUser(user) })
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      throw new ApiError(409, 'email_taken', error.message)
    }
    throw error
  }
})

authRouter.post('/login', authRateLimiter, async (request, response) => {
  const { email, password } = validateCredentials(request.body)

  const dbConnected = await ensureMongoDBConnected()
  if (!dbConnected) {
    throw new ApiError(503, 'service_unavailable', 'Database connection is temporarily unavailable. Please try again in a moment.')
  }

  try {
    const result = await login(email, password, userRepository, config.jwtSecret, config.jwtExpiresInSeconds)
    response.status(200).json({ data: { token: result.token, user: safeUser(result.user) } })
  } catch (error) {
    if (!(error instanceof InvalidCredentialsError)) {
      throw error
    }
    throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
  }
})

export { safeUser }
export default authRouter
