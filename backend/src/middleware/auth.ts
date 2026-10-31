import type { RequestHandler } from 'express'
import { config } from '../config/env.js'
import { UserModel } from '../models/user.js'
import type { UserRole } from '../models/common.js'
import { verifyAccessToken } from '../auth/jwt.js'
import { ApiError } from './api-error.js'

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string
        role: UserRole
        isVerifiedNgo?: boolean
        isVerifiedVolunteer?: boolean
      }
    }
  }
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const authorization = request.header('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined

  if (!token) {
    next(new ApiError(401, 'authentication_required', 'Authentication is required.'))
    return
  }

  try {
    const payload = verifyAccessToken(token, config.jwtSecret)
    const user = await UserModel.findById(payload.sub)
      .select('role accountStatus organizationProfile.verificationStatus volunteerProfile.verificationStatus')
      .exec()

    if (!user || user.accountStatus !== 'active' || user.role !== payload.role) {
      throw new ApiError(401, 'authentication_required', 'Authentication is required.')
    }

    request.auth = {
      userId: user.id,
      role: user.role,
      isVerifiedNgo: user.role === 'ngo' && user.organizationProfile?.verificationStatus === 'verified',
      isVerifiedVolunteer: user.role === 'volunteer' && user.volunteerProfile?.verificationStatus === 'verified',
    }
    next()
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, 'invalid_token', 'The access token is invalid or expired.'))
  }
}

export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      next(new ApiError(403, 'forbidden', 'You do not have permission to access this resource.'))
      return
    }

    next()
  }
}

export const requireVerifiedNgo: RequestHandler = (request, _response, next) => {
  if (!request.auth) {
    next(new ApiError(401, 'authentication_required', 'Authentication is required.'))
    return
  }

  if (request.auth.role === 'admin') {
    next()
    return
  }

  if (request.auth.role !== 'ngo' || !request.auth.isVerifiedNgo) {
    next(new ApiError(403, 'ngo_verification_required', 'Verified NGO status is required to perform this action.'))
    return
  }

  next()
}

export const requireVerifiedVolunteer: RequestHandler = (request, _response, next) => {
  if (!request.auth) {
    next(new ApiError(401, 'authentication_required', 'Authentication is required.'))
    return
  }

  if (request.auth.role === 'admin') {
    next()
    return
  }

  if (request.auth.role !== 'volunteer' || !request.auth.isVerifiedVolunteer) {
    next(new ApiError(403, 'volunteer_verification_required', 'Verified volunteer status is required to perform this action.'))
    return
  }

  next()
}
