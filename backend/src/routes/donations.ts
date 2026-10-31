import { Router } from 'express'
import { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const donationsRouter = Router()

const ALLOWED_CONDITIONS = ['new', 'good', 'fair', 'unknown'] as const
const ALLOWED_STATUSES = ['available', 'reserved', 'partially_allocated', 'allocated', 'expired', 'cancelled'] as const
// Donor may only set these statuses directly
const DONOR_SETTABLE_STATUSES = ['available', 'cancelled'] as const

type Condition = (typeof ALLOWED_CONDITIONS)[number]

function isCondition(v: unknown): v is Condition {
  return typeof v === 'string' && (ALLOWED_CONDITIONS as readonly string[]).includes(v)
}

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validateCreateInput(raw: unknown) {
  const b = body(raw)

  const resourceCategory = typeof b.resourceCategory === 'string' ? b.resourceCategory.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const unit = typeof b.unit === 'string' ? b.unit.trim() : ''
  const condition = b.condition
  const quantity = Number(b.quantity)

  if (resourceCategory.length < 1 || resourceCategory.length > 80) {
    throw new ApiError(400, 'validation_error', 'resourceCategory must be between 1 and 80 characters.')
  }
  if (description.length < 10 || description.length > 3000) {
    throw new ApiError(400, 'validation_error', 'description must be between 10 and 3000 characters.')
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new ApiError(400, 'validation_error', 'quantity must be a non-negative number.')
  }
  if (unit.length < 1 || unit.length > 40) {
    throw new ApiError(400, 'validation_error', 'unit must be between 1 and 40 characters.')
  }
  if (!isCondition(condition)) {
    throw new ApiError(400, 'validation_error', `condition must be one of: ${ALLOWED_CONDITIONS.join(', ')}.`)
  }

  // Location: required GeoJSON point
  const loc = b.location
  if (
    typeof loc !== 'object' ||
    loc === null ||
    (loc as Record<string, unknown>).type !== 'Point' ||
    !Array.isArray((loc as Record<string, unknown>).coordinates) ||
    ((loc as Record<string, unknown>).coordinates as unknown[]).length !== 2 ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[0] !== 'number' ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[1] !== 'number'
  ) {
    throw new ApiError(400, 'validation_error', 'location must be a GeoJSON Point: { type: "Point", coordinates: [longitude, latitude] }.')
  }
  const [lng, lat] = (loc as { coordinates: number[] }).coordinates
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new ApiError(400, 'validation_error', 'coordinates must be valid [longitude, latitude] values.')
  }

  // Optional expiryDate
  let expiryDate: Date | undefined
  if (b.expiryDate !== undefined && b.expiryDate !== null && b.expiryDate !== '') {
    expiryDate = new Date(b.expiryDate as string)
    if (isNaN(expiryDate.getTime())) {
      throw new ApiError(400, 'validation_error', 'expiryDate must be a valid ISO date string.')
    }
  }

  return {
    resourceCategory,
    description,
    quantity,
    unit,
    condition,
    location: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
    ...(expiryDate ? { expiryDate } : {}),
  }
}

// POST /api/donations — create a donation (donor only)
donationsRouter.post('/', requireAuth, requireRoles('donor'), async (req, res) => {
  const validated = validateCreateInput(req.body)
  const donation = await DonationModel.create({
    ...validated,
    donor: new Types.ObjectId(req.auth!.userId),
    availabilityStatus: 'available',
  })
  res.status(201).json({ data: donation })
})

// GET /api/donations/mine — list own donations (donor only)
donationsRouter.get('/mine', requireAuth, requireRoles('donor'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = { donor: new Types.ObjectId(req.auth!.userId) }

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

  const donations = await DonationModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean()

  let nextCursor: string | null = null
  if (donations.length > limit) {
    donations.pop()
    const last = donations[donations.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: donations, page: { nextCursor } })
})

// GET /api/donations/:donationId — get own donation by ID (donor only)
donationsRouter.get('/:donationId', requireAuth, requireRoles('donor'), async (req, res) => {
  const donationId = String(req.params.donationId)
  if (!Types.ObjectId.isValid(donationId)) {
    throw new ApiError(404, 'not_found', 'Donation not found.')
  }
  const donation = await DonationModel.findOne({
    _id: donationId,
    donor: new Types.ObjectId(req.auth!.userId),
  }).lean()

  if (!donation) throw new ApiError(404, 'not_found', 'Donation not found.')
  res.status(200).json({ data: donation })
})

// PATCH /api/donations/:donationId — update own donation (donor only)
donationsRouter.patch('/:donationId', requireAuth, requireRoles('donor'), async (req, res) => {
  const donationId = String(req.params.donationId)
  if (!Types.ObjectId.isValid(donationId)) {
    throw new ApiError(404, 'not_found', 'Donation not found.')
  }

  const donation = await DonationModel.findOne({
    _id: donationId,
    donor: new Types.ObjectId(req.auth!.userId),
  })

  if (!donation) throw new ApiError(404, 'not_found', 'Donation not found.')

  // Only available donations can be edited by the donor
  const b = body(req.body)

  // Reject protected fields
  const forbidden = ['donor', 'quantityReserved', 'quantityAllocated', 'matchedRequirements'] as const
  for (const key of forbidden) {
    if (key in b) {
      throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
    }
  }

  // Status transitions: donor may only set available or cancelled
  if ('availabilityStatus' in b) {
    const newStatus = b.availabilityStatus
    if (!(DONOR_SETTABLE_STATUSES as readonly unknown[]).includes(newStatus)) {
      throw new ApiError(400, 'validation_error', `Donors may only set availabilityStatus to: ${DONOR_SETTABLE_STATUSES.join(', ')}.`)
    }
    // Can only cancel from available
    if (newStatus === 'cancelled' && donation.availabilityStatus !== 'available') {
      throw new ApiError(409, 'invalid_transition', 'Only available donations can be cancelled.')
    }
  } else {
    // Non-status edits only allowed on available donations
    if (donation.availabilityStatus !== 'available') {
      throw new ApiError(409, 'invalid_transition', 'Only available donations can be edited.')
    }
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
  if (b.quantity !== undefined) {
    const v = Number(b.quantity)
    if (!Number.isFinite(v) || v < 0) throw new ApiError(400, 'validation_error', 'quantity must be a non-negative number.')
    allowed.quantity = v
  }
  if (typeof b.unit === 'string') {
    const v = b.unit.trim()
    if (v.length < 1 || v.length > 40) throw new ApiError(400, 'validation_error', 'unit must be 1–40 characters.')
    allowed.unit = v
  }
  if (b.condition !== undefined) {
    if (!isCondition(b.condition)) throw new ApiError(400, 'validation_error', `condition must be one of: ${ALLOWED_CONDITIONS.join(', ')}.`)
    allowed.condition = b.condition
  }
  if ('availabilityStatus' in b) {
    allowed.availabilityStatus = b.availabilityStatus
  }
  if (b.expiryDate !== undefined) {
    if (b.expiryDate === null || b.expiryDate === '') {
      allowed.expiryDate = undefined
    } else {
      const d = new Date(b.expiryDate as string)
      if (isNaN(d.getTime())) throw new ApiError(400, 'validation_error', 'expiryDate must be a valid ISO date string.')
      allowed.expiryDate = d
    }
  }

  // Separate fields to unset (e.g. clearing expiryDate)
  const unset: Record<string, 1> = {}
  if (allowed.expiryDate === undefined && b.expiryDate !== undefined) {
    delete allowed.expiryDate
    unset.expiryDate = 1
  }

  if (Object.keys(allowed).length === 0 && Object.keys(unset).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const updateOp: Record<string, unknown> = {}
  if (Object.keys(allowed).length > 0) updateOp.$set = allowed
  if (Object.keys(unset).length > 0) updateOp.$unset = unset

  const updated = await DonationModel.findOneAndUpdate(
    { _id: donationId, donor: new Types.ObjectId(req.auth!.userId) },
    updateOp,
    { new: true, runValidators: true },
  ).lean()

  if (!updated) throw new ApiError(404, 'not_found', 'Donation not found.')
  res.status(200).json({ data: updated })
})

export default donationsRouter
