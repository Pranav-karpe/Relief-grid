import { Router } from 'express'
import { Types } from 'mongoose'
import { UserModel } from '../models/user.js'
import { NgoVerificationModel } from '../models/oversight.js'
import { ReportModel } from '../models/report.js'
import { RequirementModel } from '../models/requirement.js'
import { VolunteerTaskModel } from '../models/task.js'
import { requireAuth, requireRoles, requireVerifiedNgo } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { evaluateNgoRegistration } from '../services/ngo-verification.service.js'

const ngoRouter = Router()

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ALLOWED_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
const ALLOWED_REQ_STATUSES = ['active', 'fulfilled', 'expired', 'cancelled'] as const
const NGO_EDITABLE_STATUSES = ['active'] as const

type Priority = (typeof ALLOWED_PRIORITIES)[number]

function isPriority(v: unknown): v is Priority {
  return typeof v === 'string' && (ALLOWED_PRIORITIES as readonly string[]).includes(v)
}

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validateGeoPoint(loc: unknown, label = 'location'): [number, number] {
  if (
    typeof loc !== 'object' ||
    loc === null ||
    (loc as Record<string, unknown>).type !== 'Point' ||
    !Array.isArray((loc as Record<string, unknown>).coordinates) ||
    ((loc as Record<string, unknown>).coordinates as unknown[]).length !== 2 ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[0] !== 'number' ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[1] !== 'number'
  ) {
    throw new ApiError(400, 'validation_error', `${label} must be a GeoJSON Point: { type: "Point", coordinates: [longitude, latitude] }.`)
  }
  const [lng, lat] = (loc as { coordinates: number[] }).coordinates
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new ApiError(400, 'validation_error', 'coordinates must be valid [longitude, latitude] values.')
  }
  return [lng, lat]
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ---------------------------------------------------------------------------
// GET /api/ngo/profile — read own NGO profile
// ---------------------------------------------------------------------------

ngoRouter.get('/profile', requireAuth, requireRoles('ngo'), async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId).select('-auth').lean()
  if (!user) throw new ApiError(404, 'not_found', 'User not found.')
  res.status(200).json({ data: user })
})

// ---------------------------------------------------------------------------
// PATCH /api/ngo/profile — update own NGO profile fields
// ---------------------------------------------------------------------------

ngoRouter.patch('/profile', requireAuth, requireRoles('ngo'), async (req, res) => {
  const b = body(req.body)

  const forbidden = ['role', 'accountStatus', 'auth', 'emailVerified', 'email', '_id', '__v']
  for (const key of forbidden) {
    if (key in b) throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
  }

  const allowed: Record<string, unknown> = {}

  if (typeof b.displayName === 'string') {
    const v = b.displayName.trim()
    if (v.length < 2 || v.length > 120) throw new ApiError(400, 'validation_error', 'displayName must be 2–120 characters.')
    allowed.displayName = v
  }

  if (typeof b.phone === 'string') {
    allowed.phone = b.phone.trim()
  }

  if (b.organizationProfile !== undefined) {
    if (typeof b.organizationProfile !== 'object' || b.organizationProfile === null) {
      throw new ApiError(400, 'validation_error', 'organizationProfile must be an object.')
    }
    const org = b.organizationProfile as Record<string, unknown>

    if ('verificationStatus' in org) {
      throw new ApiError(400, 'validation_error', 'Field "verificationStatus" cannot be updated directly.')
    }

    if (org.name !== undefined) {
      if (typeof org.name !== 'string' || org.name.trim().length === 0 || org.name.trim().length > 160) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.name must be 1–160 characters.')
      }
      allowed['organizationProfile.name'] = org.name.trim()
    }
    if (org.registrationNumber !== undefined) {
      if (typeof org.registrationNumber !== 'string' || org.registrationNumber.trim().length > 100) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.registrationNumber must be up to 100 characters.')
      }
      allowed['organizationProfile.registrationNumber'] = org.registrationNumber.trim()
    }
    if (org.darpanId !== undefined) {
      if (typeof org.darpanId !== 'string' || org.darpanId.trim().length > 100) {
        throw new ApiError(400, 'validation_error', 'organizationProfile.darpanId must be up to 100 characters.')
      }
      allowed['organizationProfile.darpanId'] = org.darpanId.trim()
    }
    if (org.contactPhone !== undefined) {
      allowed['organizationProfile.contactPhone'] = typeof org.contactPhone === 'string' ? org.contactPhone.trim() : ''
    }
    if (org.website !== undefined) {
      allowed['organizationProfile.website'] = typeof org.website === 'string' ? org.website.trim() : ''
    }
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const user = await UserModel.findByIdAndUpdate(
    req.auth!.userId,
    { $set: allowed },
    { new: true, runValidators: true },
  ).select('-auth').lean()

  if (!user) throw new ApiError(404, 'not_found', 'User not found.')
  res.status(200).json({ data: user })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/verification — read own verification record
// ---------------------------------------------------------------------------

ngoRouter.get('/verification', requireAuth, requireRoles('ngo'), async (req, res) => {
  const record = await NgoVerificationModel.findOne({
    ngo: new Types.ObjectId(req.auth!.userId),
  }).sort({ createdAt: -1 }).lean()

  res.status(200).json({ data: record ?? null })
})

// ---------------------------------------------------------------------------
// POST /api/ngo/verification/submit — submit or resubmit for verification
// ---------------------------------------------------------------------------

ngoRouter.post('/verification/submit', requireAuth, requireRoles('ngo'), async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId).lean()
  if (!user) throw new ApiError(404, 'not_found', 'User not found.')

  const b = body(req.body)
  const name = typeof b.organizationName === 'string' && b.organizationName.trim()
    ? b.organizationName.trim()
    : user.organizationProfile?.name?.trim() ?? ''

  if (!name) {
    throw new ApiError(400, 'validation_error', 'Organization name is required before submitting for verification.')
  }

  const registrationNumber = typeof b.registrationNumber === 'string' ? b.registrationNumber.trim() : user.organizationProfile?.registrationNumber
  const darpanId = typeof b.darpanId === 'string' ? b.darpanId.trim() : user.organizationProfile?.darpanId
  const contactPhone = typeof b.contactPhone === 'string' ? b.contactPhone.trim() : user.organizationProfile?.contactPhone || user.phone
  const website = typeof b.website === 'string' ? b.website.trim() : user.organizationProfile?.website

  // Check for an existing pending record
  const existing = await NgoVerificationModel.findOne({
    ngo: new Types.ObjectId(req.auth!.userId),
    status: { $in: ['pending', 'under_review'] },
  }).lean()

  if (existing) {
    throw new ApiError(409, 'duplicate_submission', 'A verification request is already pending review.')
  }

  // NGO cannot resubmit if currently approved
  const currentStatus = user.organizationProfile?.verificationStatus
  if (currentStatus === 'verified') {
    throw new ApiError(409, 'invalid_transition', 'Your organisation is already verified.')
  }

  // Evaluate submission with AI/automated verification engine
  const assessmentReport = await evaluateNgoRegistration(req.auth!.userId, {
    name,
    registrationNumber: registrationNumber || undefined,
    darpanId: darpanId || undefined,
    contactPhone: contactPhone || undefined,
    website: website || undefined,
  })

  const submittedData = {
    name,
    registrationNumber,
    darpanId,
    contactPhone,
    website,
  }

  const record = await NgoVerificationModel.create({
    ngo: new Types.ObjectId(req.auth!.userId),
    status: 'pending',
    submittedData,
    assessmentReport,
  })

  // Update user's organizationProfile with submitted details & mark status pending
  await UserModel.findByIdAndUpdate(req.auth!.userId, {
    $set: {
      'organizationProfile.name': name,
      'organizationProfile.registrationNumber': registrationNumber,
      'organizationProfile.darpanId': darpanId,
      'organizationProfile.contactPhone': contactPhone,
      'organizationProfile.website': website,
      'organizationProfile.verificationStatus': 'pending',
    },
  })

  res.status(201).json({ data: record })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/reports — list submitted/verified reports for NGO review
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.get('/reports', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = {
    status: { $in: ['submitted', 'under_review', 'verified'] },
  }

  if (typeof req.query.urgency === 'string' && req.query.urgency) {
    filter.urgency = req.query.urgency
  }
  if (typeof req.query.needCategory === 'string' && req.query.needCategory) {
    filter.needCategory = req.query.needCategory
  }
  if (typeof req.query.status === 'string' && req.query.status) {
    const allowed = ['submitted', 'under_review', 'verified']
    if (allowed.includes(req.query.status)) filter.status = req.query.status
  }

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { createdAt: string; _id: string }
      filter.$or = [
        { createdAt: { $lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), _id: { $lt: new Types.ObjectId(String(decoded._id)) } },
      ]
    } catch {
      throw new ApiError(400, 'validation_error', 'Invalid cursor.')
    }
  }

  const reports = await ReportModel.find(filter)
    .select('title needCategory urgency location status affectedPersonCount requestedResources riskAssessment timeline deliveryTask assignedNgo createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (reports.length > limit) {
    reports.pop()
    const last = reports[reports.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: reports, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/reports/:reportId — get report detail for NGO review
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.get('/reports/:reportId', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const reportId = String(req.params.reportId)
  if (!Types.ObjectId.isValid(reportId)) {
    throw new ApiError(404, 'not_found', 'Report not found.')
  }

  const report = await ReportModel.findOne({
    _id: reportId,
    status: { $in: ['submitted', 'under_review', 'verified', 'resolved'] },
  })
    .select('-reporter -review')
    .populate('deliveryTask')
    .lean()

  if (!report) throw new ApiError(404, 'not_found', 'Report not found.')
  res.status(200).json({ data: report })
})

// ---------------------------------------------------------------------------
// POST /api/ngo/requirements — create a requirement (VERIFIED NGO ONLY)
// ---------------------------------------------------------------------------

ngoRouter.post('/requirements', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const b = body(req.body)

  const resourceCategory = typeof b.resourceCategory === 'string' ? b.resourceCategory.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const unit = typeof b.unit === 'string' ? b.unit.trim() : ''
  const priority = b.priority
  const quantityRequested = Number(b.quantityRequested)

  if (resourceCategory.length < 1 || resourceCategory.length > 80) {
    throw new ApiError(400, 'validation_error', 'resourceCategory must be 1–80 characters.')
  }
  if (description.length < 10 || description.length > 3000) {
    throw new ApiError(400, 'validation_error', 'description must be 10–3000 characters.')
  }
  if (unit.length < 1 || unit.length > 40) {
    throw new ApiError(400, 'validation_error', 'unit must be 1–40 characters.')
  }
  if (!isPriority(priority)) {
    throw new ApiError(400, 'validation_error', `priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}.`)
  }
  if (!Number.isFinite(quantityRequested) || quantityRequested <= 0) {
    throw new ApiError(400, 'validation_error', 'quantityRequested must be a positive number.')
  }

  const [lng, lat] = validateGeoPoint(b.deliveryArea, 'deliveryArea')

  let neededBy: Date | undefined
  if (b.neededBy !== undefined && b.neededBy !== null && b.neededBy !== '') {
    neededBy = new Date(b.neededBy as string)
    if (isNaN(neededBy.getTime())) {
      throw new ApiError(400, 'validation_error', 'neededBy must be a valid ISO date string.')
    }
  }

  const protectedFields = ['ngo', 'status', 'quantityFulfilled', 'quantityReserved']
  for (const key of protectedFields) {
    if (key in b) throw new ApiError(400, 'validation_error', `Field "${key}" cannot be set by the client.`)
  }

  const requirement = await RequirementModel.create({
    ngo: new Types.ObjectId(req.auth!.userId),
    resourceCategory,
    description,
    unit,
    priority,
    quantityRequested,
    deliveryArea: { type: 'Point', coordinates: [lng, lat] },
    status: 'active',
    ...(neededBy ? { neededBy } : {}),
  })

  res.status(201).json({ data: requirement })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/requirements/mine — list own requirements
// ---------------------------------------------------------------------------

ngoRouter.get('/requirements/mine', requireAuth, requireRoles('ngo'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = { ngo: new Types.ObjectId(req.auth!.userId) }

  if (typeof req.query.status === 'string' && req.query.status) {
    if ((ALLOWED_REQ_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
  }

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { createdAt: string; _id: string }
      filter.$or = [
        { createdAt: { $lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), _id: { $lt: new Types.ObjectId(String(decoded._id)) } },
      ]
    } catch {
      throw new ApiError(400, 'validation_error', 'Invalid cursor.')
    }
  }

  const requirements = await RequirementModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (requirements.length > limit) {
    requirements.pop()
    const last = requirements[requirements.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: requirements, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/requirements/:requirementId — get own requirement by ID
// ---------------------------------------------------------------------------

ngoRouter.get('/requirements/:requirementId', requireAuth, requireRoles('ngo'), async (req, res) => {
  const requirementId = String(req.params.requirementId)
  if (!Types.ObjectId.isValid(requirementId)) {
    throw new ApiError(404, 'not_found', 'Requirement not found.')
  }

  const requirement = await RequirementModel.findOne({
    _id: requirementId,
    ngo: new Types.ObjectId(req.auth!.userId),
  }).lean()

  if (!requirement) throw new ApiError(404, 'not_found', 'Requirement not found.')
  res.status(200).json({ data: requirement })
})

// ---------------------------------------------------------------------------
// PATCH /api/ngo/requirements/:requirementId — update own active requirement
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.patch('/requirements/:requirementId', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const requirementId = String(req.params.requirementId)
  if (!Types.ObjectId.isValid(requirementId)) {
    throw new ApiError(404, 'not_found', 'Requirement not found.')
  }

  const requirement = await RequirementModel.findOne({
    _id: requirementId,
    ngo: new Types.ObjectId(req.auth!.userId),
  })

  if (!requirement) throw new ApiError(404, 'not_found', 'Requirement not found.')

  if (!(NGO_EDITABLE_STATUSES as readonly string[]).includes(requirement.status)) {
    throw new ApiError(409, 'invalid_transition', 'Only active requirements can be edited.')
  }

  const b = body(req.body)
  const protectedFields = ['ngo', 'quantityFulfilled', 'quantityReserved', 'status']
  for (const key of protectedFields) {
    if (key in b) throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
  }

  const allowed: Record<string, unknown> = {}

  if (typeof b.resourceCategory === 'string') {
    const v = b.resourceCategory.trim()
    if (v.length < 1 || v.length > 80) throw new ApiError(400, 'validation_error', 'resourceCategory must be 1–80 characters.')
    allowed.resourceCategory = v
  }
  if (typeof b.description === 'string') {
    const v = b.description.trim()
    if (v.length < 10 || v.length > 3000) throw new ApiError(400, 'validation_error', 'description must be 10–3000 characters.')
    allowed.description = v
  }
  if (typeof b.unit === 'string') {
    const v = b.unit.trim()
    if (v.length < 1 || v.length > 40) throw new ApiError(400, 'validation_error', 'unit must be 1–40 characters.')
    allowed.unit = v
  }
  if (b.priority !== undefined) {
    if (!isPriority(b.priority)) throw new ApiError(400, 'validation_error', `priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}.`)
    allowed.priority = b.priority
  }
  if (b.quantityRequested !== undefined) {
    const v = Number(b.quantityRequested)
    if (!Number.isFinite(v) || v <= 0) throw new ApiError(400, 'validation_error', 'quantityRequested must be a positive number.')
    allowed.quantityRequested = v
  }
  if (b.deliveryArea !== undefined) {
    const [lng, lat] = validateGeoPoint(b.deliveryArea, 'deliveryArea')
    allowed.deliveryArea = { type: 'Point', coordinates: [lng, lat] }
  }
  if (b.neededBy !== undefined) {
    if (b.neededBy === null || b.neededBy === '') {
      allowed.neededBy = undefined
    } else {
      const d = new Date(b.neededBy as string)
      if (isNaN(d.getTime())) throw new ApiError(400, 'validation_error', 'neededBy must be a valid ISO date string.')
      allowed.neededBy = d
    }
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const updated = await RequirementModel.findOneAndUpdate(
    { _id: requirementId, ngo: new Types.ObjectId(req.auth!.userId) },
    { $set: allowed },
    { new: true, runValidators: true },
  ).lean()

  if (!updated) throw new ApiError(404, 'not_found', 'Requirement not found.')
  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// PATCH /api/requirements/:requirementId/cancel — cancel an active requirement
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.patch('/requirements/:requirementId/cancel', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const requirementId = String(req.params.requirementId)
  if (!Types.ObjectId.isValid(requirementId)) {
    throw new ApiError(404, 'not_found', 'Requirement not found.')
  }

  const requirement = await RequirementModel.findOne({
    _id: requirementId,
    ngo: new Types.ObjectId(req.auth!.userId),
  })

  if (!requirement) throw new ApiError(404, 'not_found', 'Requirement not found.')

  if (requirement.status !== 'active') {
    throw new ApiError(409, 'invalid_transition', 'Only active requirements can be cancelled.')
  }

  if (requirement.quantityReserved > 0 || requirement.quantityFulfilled > 0) {
    throw new ApiError(409, 'invalid_transition', 'Cannot cancel a requirement with reserved or fulfilled quantities.')
  }

  const updated = await RequirementModel.findOneAndUpdate(
    { _id: requirementId, ngo: new Types.ObjectId(req.auth!.userId), status: 'active' },
    { $set: { status: 'cancelled' } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(404, 'not_found', 'Requirement not found.')
  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/volunteers/nearby — discover nearby verified & active volunteers
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.get('/volunteers/nearby', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const radiusKm = Math.min(Math.max(Number(req.query.radiusKm) || 10, 1), 50) // Default 10 km, max 50 km
  const availability = typeof req.query.availability === 'string' ? req.query.availability : 'available'

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, 'validation_error', 'Valid lat and lng query parameters are required.')
  }

  // Find active, verified volunteers
  const query: Record<string, unknown> = {
    role: 'volunteer',
    accountStatus: 'active',
    'volunteerProfile.verificationStatus': 'verified',
  }

  if (availability && ['available', 'busy', 'unavailable'].includes(availability)) {
    query['volunteerProfile.availability'] = availability
  }

  const candidates = await UserModel.find(query)
    .select('displayName volunteerProfile.skills volunteerProfile.availability volunteerProfile.serviceRadiusKm volunteerProfile.areas volunteerProfile.currentWorkload volunteerProfile.generalLocation volunteerProfile.phone')
    .lean()

  const nearbyVolunteers: Array<{
    _id: unknown
    displayName: string
    skills: string[]
    availability: string
    currentWorkload: number
    serviceRadiusKm: number
    areas: string[]
    phone?: string
    distanceKm: number
  }> = []

  for (const v of candidates) {
    const coords = v.volunteerProfile?.generalLocation?.coordinates
    if (Array.isArray(coords) && coords.length === 2) {
      const [vLng, vLat] = coords
      const dist = haversineDistanceKm(lat, lng, vLat, vLng)
      if (dist <= radiusKm) {
        nearbyVolunteers.push({
          _id: v._id,
          displayName: v.displayName,
          skills: v.volunteerProfile?.skills ?? [],
          availability: v.volunteerProfile?.availability ?? 'available',
          currentWorkload: v.volunteerProfile?.currentWorkload ?? 0,
          serviceRadiusKm: v.volunteerProfile?.serviceRadiusKm ?? 10,
          areas: v.volunteerProfile?.areas ?? [],
          phone: v.volunteerProfile?.phone || undefined,
          distanceKm: Math.round(dist * 10) / 10,
        })
      }
    }
  }

  // Sort closest first, then lowest workload
  nearbyVolunteers.sort((a, b) => a.distanceKm - b.distanceKm || a.currentWorkload - b.currentWorkload)

  res.status(200).json({
    data: nearbyVolunteers,
    meta: {
      center: { lat, lng },
      radiusKm,
      count: nearbyVolunteers.length,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /api/ngo/tasks — dispatch a new task to a verified volunteer
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.post('/tasks', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const b = body(req.body)

  const volunteerId = typeof b.volunteerId === 'string' ? b.volunteerId.trim() : ''
  if (!Types.ObjectId.isValid(volunteerId)) {
    throw new ApiError(400, 'validation_error', 'A valid volunteerId is required.')
  }

  // Verify that the assigned volunteer exists, is active, and is verified
  const volunteer = await UserModel.findOne({
    _id: volunteerId,
    role: 'volunteer',
    accountStatus: 'active',
  }).lean()

  if (!volunteer) {
    throw new ApiError(404, 'not_found', 'Volunteer not found or inactive.')
  }

  if (volunteer.volunteerProfile?.verificationStatus !== 'verified') {
    throw new ApiError(403, 'volunteer_not_verified', 'Cannot assign tasks to an unverified volunteer.')
  }

  const taskDetails = typeof b.taskDetails === 'string' ? b.taskDetails.trim() : ''
  if (taskDetails.length < 5 || taskDetails.length > 3000) {
    throw new ApiError(400, 'validation_error', 'taskDetails must be between 5 and 3000 characters.')
  }

  const priority = isPriority(b.priority) ? b.priority : 'medium'

  // Validate locations
  let destinationLocation: { type: 'Point'; coordinates: [number, number] } | undefined
  if (b.destinationLocation) {
    const coords = validateGeoPoint(b.destinationLocation, 'destinationLocation')
    destinationLocation = { type: 'Point', coordinates: coords }
  }

  let pickupLocation: { type: 'Point'; coordinates: [number, number] } | undefined
  if (b.pickupLocation) {
    const coords = validateGeoPoint(b.pickupLocation, 'pickupLocation')
    pickupLocation = { type: 'Point', coordinates: coords }
  }

  // Optional report link
  let reportId: Types.ObjectId | undefined
  if (typeof b.reportId === 'string' && Types.ObjectId.isValid(b.reportId)) {
    const rep = await ReportModel.findById(b.reportId).lean()
    if (!rep) throw new ApiError(404, 'not_found', 'Referenced report not found.')
    reportId = rep._id as Types.ObjectId

    // Use report location as destination if not explicitly provided
    if (!destinationLocation && rep.location?.coordinates) {
      destinationLocation = { type: 'Point', coordinates: rep.location.coordinates as [number, number] }
    }
  }

  // Optional requirement link
  let requirementId: Types.ObjectId | undefined
  if (typeof b.requirementId === 'string' && Types.ObjectId.isValid(b.requirementId)) {
    const reqDoc = await RequirementModel.findById(b.requirementId).lean()
    if (!reqDoc) throw new ApiError(404, 'not_found', 'Referenced requirement not found.')
    requirementId = reqDoc._id as Types.ObjectId
  }

  const assignedLocation = destinationLocation || pickupLocation || { type: 'Point', coordinates: [0, 0] }

  const task = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(volunteerId),
    createdBy: new Types.ObjectId(req.auth!.userId),
    assignedByNgo: new Types.ObjectId(req.auth!.userId),
    report: reportId,
    requirement: requirementId,
    assignmentStatus: 'assigned',
    pickupStatus: 'pending',
    deliveryStatus: 'pending',
    confirmationStatus: 'unconfirmed',
    priority,
    assignedLocation,
    pickupLocation,
    destinationLocation,
    taskDetails,
    history: [
      {
        status: 'assigned',
        changedBy: new Types.ObjectId(req.auth!.userId),
        changedAt: new Date(),
        reason: 'Task created and dispatched by NGO',
      },
    ],
  })

  // Increment volunteer's workload
  await UserModel.findByIdAndUpdate(volunteerId, {
    $inc: { 'volunteerProfile.currentWorkload': 1 },
  })

  // Link to report if reportId provided, and add timeline event
  if (reportId) {
    await ReportModel.findByIdAndUpdate(reportId, {
      $set: {
        deliveryTask: task._id,
        assignedNgo: new Types.ObjectId(req.auth!.userId),
      },
      $push: {
        timeline: {
          stage: 'assigned',
          title: 'Relief Task Dispatched',
          description: `NGO dispatched delivery task to volunteer "${volunteer.displayName}".`,
          timestamp: new Date(),
          actorRole: 'ngo',
        },
      },
    })
  }

  res.status(201).json({ data: task })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/tasks — list tasks dispatched by this NGO
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.get('/tasks', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const filter: Record<string, unknown> = {
    $or: [
      { assignedByNgo: new Types.ObjectId(req.auth!.userId) },
      { createdBy: new Types.ObjectId(req.auth!.userId) },
    ],
  }

  if (typeof req.query.deliveryStatus === 'string') {
    filter.deliveryStatus = req.query.deliveryStatus
  }
  if (typeof req.query.confirmationStatus === 'string') {
    filter.confirmationStatus = req.query.confirmationStatus
  }

  const tasks = await VolunteerTaskModel.find(filter)
    .populate('volunteer', 'displayName email volunteerProfile.phone volunteerProfile.skills')
    .populate('report', 'title needCategory urgency status location affectedPersonCount requestedResources')
    .populate('requirement', 'resourceCategory description unit quantityRequested')
    .sort({ createdAt: -1 })
    .lean()

  res.status(200).json({ data: tasks })
})

// ---------------------------------------------------------------------------
// GET /api/ngo/tasks/:taskId — get single dispatched task detail
// (REQUIRES VERIFIED NGO — OWNING NGO ONLY)
// ---------------------------------------------------------------------------

ngoRouter.get('/tasks/:taskId', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!Types.ObjectId.isValid(taskId)) {
    throw new ApiError(404, 'not_found', 'Task not found.')
  }

  const task = await VolunteerTaskModel.findOne({
    _id: taskId,
    $or: [
      { assignedByNgo: new Types.ObjectId(req.auth!.userId) },
      { createdBy: new Types.ObjectId(req.auth!.userId) },
    ],
  })
    .populate('volunteer', 'displayName email volunteerProfile.phone volunteerProfile.skills')
    .populate('report', 'title needCategory urgency status location affectedPersonCount requestedResources timeline')
    .populate('requirement', 'resourceCategory description unit quantityRequested')
    .lean()

  if (!task) {
    throw new ApiError(404, 'not_found', 'Task not found or belongs to another organisation.')
  }

  res.status(200).json({ data: task })
})

// ---------------------------------------------------------------------------
// POST /api/ngo/tasks/:taskId/confirm-delivery — NGO confirmation / dispute
// (REQUIRES VERIFIED NGO)
// ---------------------------------------------------------------------------

ngoRouter.post('/tasks/:taskId/confirm-delivery', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!Types.ObjectId.isValid(taskId)) {
    throw new ApiError(404, 'not_found', 'Task not found.')
  }

  const task = await VolunteerTaskModel.findById(taskId)
  if (!task) {
    throw new ApiError(404, 'not_found', 'Task not found.')
  }

  // Ensure this task belongs to the calling NGO
  const isOwner =
    (task.assignedByNgo && task.assignedByNgo.toString() === req.auth!.userId) ||
    (task.createdBy && task.createdBy.toString() === req.auth!.userId)

  if (!isOwner) {
    throw new ApiError(403, 'forbidden', 'You can only confirm tasks assigned by your organisation.')
  }

  const b = body(req.body)
  const action = b.action // 'confirm' | 'dispute'
  const notes = typeof b.notes === 'string' ? b.notes.trim() : ''

  if (action !== 'confirm' && action !== 'dispute') {
    throw new ApiError(400, 'validation_error', 'action must be either "confirm" or "dispute".')
  }

  if (action === 'confirm') {
    task.confirmationStatus = 'confirmed'
    task.deliveryStatus = 'delivered'
    task.confirmedAt = new Date()
    task.confirmedBy = new Types.ObjectId(req.auth!.userId)
    task.confirmationNotes = notes || 'Delivery confirmed by NGO'

    task.history.push({
      status: 'confirmed',
      changedBy: new Types.ObjectId(req.auth!.userId),
      changedAt: new Date(),
      reason: notes || 'Delivery confirmed by NGO',
    })

    await task.save()

    // Decrement volunteer workload
    if (task.volunteer) {
      await UserModel.findByIdAndUpdate(task.volunteer, {
        $inc: { 'volunteerProfile.currentWorkload': -1 },
      })
    }

    // Resolve report if linked
    if (task.report) {
      await ReportModel.findByIdAndUpdate(task.report, {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: new Types.ObjectId(req.auth!.userId),
          resolutionNote: notes || 'Delivery confirmed by NGO. Relief completed.',
        },
        $push: {
          timeline: {
            stage: 'delivered',
            title: 'Delivery Confirmed & Resolved',
            description: notes || 'NGO confirmed successful field delivery. Citizen distress request is resolved.',
            timestamp: new Date(),
            actorRole: 'ngo',
          },
        },
      })
    }
  } else {
    // Dispute
    task.confirmationStatus = 'disputed'
    task.confirmedAt = new Date()
    task.confirmedBy = new Types.ObjectId(req.auth!.userId)
    task.confirmationNotes = notes || 'Delivery disputed by NGO'

    task.history.push({
      status: 'disputed',
      changedBy: new Types.ObjectId(req.auth!.userId),
      changedAt: new Date(),
      reason: notes || 'Delivery disputed by NGO',
    })

    await task.save()

    // Flag on report timeline if linked
    if (task.report) {
      await ReportModel.findByIdAndUpdate(task.report, {
        $push: {
          timeline: {
            stage: 'disputed',
            title: 'Delivery Disputed by NGO',
            description: notes || 'NGO raised a dispute regarding the relief delivery.',
            timestamp: new Date(),
            actorRole: 'ngo',
          },
        },
      })
    }
  }

  res.status(200).json({ data: task })
})

export default ngoRouter
