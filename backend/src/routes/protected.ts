import { Router } from 'express'
import { UserModel } from '../models/user.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { safeUser } from './auth.js'

const protectedRouter = Router()
const phonePattern = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}$/

protectedRouter.get('/users/me', requireAuth, async (request, response) => {
  const user = await UserModel.findById(request.auth?.userId).exec()
  if (!user) {
    response.status(404).json({ status: 'error', code: 'user_not_found', message: 'User not found.' })
    return
  }
  response.status(200).json({ data: safeUser(user) })
})

protectedRouter.patch('/users/me', requireAuth, async (request, response) => {
  const body = request.body !== null && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}

  // Immutable fields — silently strip or reject
  const forbidden = ['role', 'accountStatus', 'auth', 'emailVerified', 'email', '_id', '__v']
  for (const key of forbidden) {
    if (key in body) {
      throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
    }
  }

  const allowed: Record<string, unknown> = {}

  if (typeof body.displayName === 'string') {
    const name = body.displayName.trim()
    if (name.length < 2 || name.length > 120) {
      throw new ApiError(400, 'validation_error', 'displayName must be between 2 and 120 characters.')
    }
    allowed.displayName = name
  }

  if (typeof body.phone === 'string') {
    const phone = body.phone.trim()
    if (phone.length > 0 && !phonePattern.test(phone)) {
      throw new ApiError(400, 'validation_error', 'Phone number format is invalid.')
    }
    allowed.phone = phone
  }

  if (body.organizationProfile !== undefined) {
    if (typeof body.organizationProfile !== 'object' || body.organizationProfile === null) {
      throw new ApiError(400, 'validation_error', 'organizationProfile must be an object.')
    }
    const org = body.organizationProfile as Record<string, unknown>
    // verificationStatus is managed server-side only
    if ('verificationStatus' in org) {
      throw new ApiError(400, 'validation_error', 'Field "verificationStatus" cannot be updated through this endpoint.')
    }
    if (org.name !== undefined) {
      if (typeof org.name !== 'string' || org.name.trim().length > 160) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.name must be a string up to 160 characters.')
      }
      allowed['organizationProfile.name'] = org.name.trim()
    }
    if (org.registrationNumber !== undefined) {
      if (typeof org.registrationNumber !== 'string' || org.registrationNumber.trim().length > 100) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.registrationNumber must be a string up to 100 characters.')
      }
      allowed['organizationProfile.registrationNumber'] = org.registrationNumber.trim()
    }
    if (org.darpanId !== undefined) {
      if (typeof org.darpanId !== 'string' || org.darpanId.trim().length > 100) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.darpanId must be a string up to 100 characters.')
      }
      allowed['organizationProfile.darpanId'] = org.darpanId.trim()
    }
    if (org.contactPhone !== undefined) {
      if (typeof org.contactPhone !== 'string' || org.contactPhone.trim().length > 30) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.contactPhone must be a string up to 30 characters.')
      }
      allowed['organizationProfile.contactPhone'] = org.contactPhone.trim()
    }
    if (org.website !== undefined) {
      if (typeof org.website !== 'string' || org.website.trim().length > 200) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.website must be a string up to 200 characters.')
      }
      allowed['organizationProfile.website'] = org.website.trim()
    }
  }

  if (body.volunteerProfile !== undefined) {
    if (typeof body.volunteerProfile !== 'object' || body.volunteerProfile === null) {
      throw new ApiError(400, 'validation_error', 'volunteerProfile must be an object.')
    }
    const vol = body.volunteerProfile as Record<string, unknown>
    const volProtected = ['verificationStatus', 'verifiedAt', 'verifiedBy', 'currentWorkload', 'rejectionReason']
    for (const p of volProtected) {
      if (p in vol) {
        throw new ApiError(400, 'validation_error', `Field "volunteerProfile.${p}" cannot be updated through this endpoint.`)
      }
    }
    if (vol.phone !== undefined) {
      if (typeof vol.phone !== 'string' || (vol.phone.trim().length > 0 && !phonePattern.test(vol.phone.trim()))) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.phone format is invalid.')
      }
      allowed['volunteerProfile.phone'] = vol.phone.trim()
    }
    if (vol.availability !== undefined) {
      if (!['available', 'busy', 'unavailable'].includes(String(vol.availability))) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.availability must be available, busy, or unavailable.')
      }
      allowed['volunteerProfile.availability'] = String(vol.availability)
    }
    if (vol.skills !== undefined) {
      if (!Array.isArray(vol.skills)) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.skills must be an array.')
      }
      allowed['volunteerProfile.skills'] = vol.skills.map(String).map((s) => s.trim()).filter(Boolean)
    }
    if (vol.areas !== undefined) {
      if (!Array.isArray(vol.areas)) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.areas must be an array.')
      }
      allowed['volunteerProfile.areas'] = vol.areas.map(String).map((s) => s.trim()).filter(Boolean)
    }
    if (vol.experience !== undefined) {
      if (typeof vol.experience !== 'string' || vol.experience.trim().length > 2000) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.experience must be a string up to 2000 characters.')
      }
      allowed['volunteerProfile.experience'] = vol.experience.trim()
    }
    if (vol.serviceRadiusKm !== undefined) {
      const radius = Number(vol.serviceRadiusKm)
      if (!Number.isFinite(radius) || radius < 1 || radius > 100) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.serviceRadiusKm must be between 1 and 100 km.')
      }
      allowed['volunteerProfile.serviceRadiusKm'] = radius
    }
    if (vol.generalLocation !== undefined) {
      if (typeof vol.generalLocation !== 'object' || vol.generalLocation === null) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.generalLocation must be a GeoJSON Point.')
      }
      const loc = vol.generalLocation as { type?: unknown; coordinates?: unknown }
      if (loc.type !== 'Point' || !Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) {
        throw new ApiError(400, 'validation_error', 'volunteerProfile.generalLocation must be a GeoJSON Point.')
      }
      const lng = Number(loc.coordinates[0])
      const lat = Number(loc.coordinates[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new ApiError(400, 'validation_error', 'Coordinates must be valid [longitude, latitude].')
      }
      allowed['volunteerProfile.generalLocation'] = { type: 'Point', coordinates: [lng, lat] }
    }
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const user = await UserModel.findByIdAndUpdate(
    request.auth?.userId,
    { $set: allowed },
    { new: true, runValidators: true },
  ).exec()

  if (!user) {
    response.status(404).json({ status: 'error', code: 'user_not_found', message: 'User not found.' })
    return
  }

  response.status(200).json({ data: safeUser(user) })
})

protectedRouter.get('/role-access/ngo', requireAuth, requireRoles('ngo', 'admin'), (_request, response) => {
  response.status(200).json({ data: { role: 'ngo', message: 'NGO access granted.' } })
})

protectedRouter.get('/role-access/admin', requireAuth, requireRoles('admin'), (_request, response) => {
  response.status(200).json({ data: { role: 'admin', message: 'Admin access granted.' } })
})

export default protectedRouter
