import crypto from 'node:crypto'
import { Router } from 'express'
import { Types } from 'mongoose'
import { BeneficiaryDistributionModel } from '../models/distribution.js'
import { requireAuth, requireRoles, requireVerifiedNgo } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const distributionsRouter = Router()

const HASH_SALT = process.env.BENEFICIARY_SALT ?? 'reliefgrid-beneficiary-privacy-salt-2026'

function hashBeneficiaryId(rawId: string): string {
  return crypto
    .createHmac('sha256', HASH_SALT)
    .update(rawId.trim().toUpperCase())
    .digest('hex')
}

// POST /api/distributions/check-duplicate — cross-NGO duplicate aid check
distributionsRouter.post(
  '/check-duplicate',
  requireAuth,
  requireRoles('ngo'),
  requireVerifiedNgo,
  async (req, res) => {
    const b = req.body as Record<string, unknown>
    const govtId = typeof b.beneficiaryGovtId === 'string' ? b.beneficiaryGovtId.trim() : ''
    const rationCategory = typeof b.rationCategory === 'string' ? b.rationCategory.trim() : ''

    if (!govtId) {
      throw new ApiError(400, 'validation_error', 'beneficiaryGovtId is required.')
    }
    if (!rationCategory) {
      throw new ApiError(400, 'validation_error', 'rationCategory is required.')
    }

    const hash = hashBeneficiaryId(govtId)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const existing = await BeneficiaryDistributionModel.findOne({
      beneficiaryIdHash: hash,
      rationCategory: { $regex: new RegExp(`^${rationCategory}$`, 'i') },
      distributedAt: { $gte: sevenDaysAgo },
    })
      .populate('ngo', 'displayName organizationProfile.name')
      .lean()

    if (existing) {
      const ngoName =
        (existing.ngo as any)?.organizationProfile?.name ||
        (existing.ngo as any)?.displayName ||
        'Another Registered NGO'

      res.status(200).json({
        data: {
          isDuplicate: true,
          lastDistributedAt: existing.distributedAt,
          previousDistributor: ngoName,
          quantityGiven: existing.quantityGiven,
          unit: existing.unit,
          warning: `Beneficiary already received "${existing.rationCategory}" from ${ngoName} within the past 7 days.`,
        },
      })
      return
    }

    res.status(200).json({
      data: {
        isDuplicate: false,
        message: 'No duplicate distribution recorded for this beneficiary in the last 7 days.',
      },
    })
  },
)

// POST /api/distributions — record aid distribution
distributionsRouter.post('/', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const b = req.body as Record<string, unknown>

  const govtId = typeof b.beneficiaryGovtId === 'string' ? b.beneficiaryGovtId.trim() : ''
  const initials = typeof b.beneficiaryInitials === 'string' ? b.beneficiaryInitials.trim().slice(0, 10) : ''
  const rationCategory = typeof b.rationCategory === 'string' ? b.rationCategory.trim() : ''
  const quantityGiven = Number(b.quantityGiven)
  const unit = typeof b.unit === 'string' ? b.unit.trim() : ''
  const campOrShelterName = typeof b.campOrShelterName === 'string' ? b.campOrShelterName.trim() : undefined
  const notes = typeof b.notes === 'string' ? b.notes.trim() : undefined

  if (!govtId) throw new ApiError(400, 'validation_error', 'beneficiaryGovtId is required.')
  if (!initials) throw new ApiError(400, 'validation_error', 'beneficiaryInitials are required.')
  if (!rationCategory) throw new ApiError(400, 'validation_error', 'rationCategory is required.')
  if (!Number.isFinite(quantityGiven) || quantityGiven <= 0) {
    throw new ApiError(400, 'validation_error', 'quantityGiven must be greater than 0.')
  }
  if (!unit) throw new ApiError(400, 'validation_error', 'unit is required.')

  // Location: required GeoJSON point (fuzzed)
  const loc = b.location as { coordinates?: number[] } | undefined
  if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length !== 2) {
    throw new ApiError(400, 'validation_error', 'Valid location is required.')
  }

  const hash = hashBeneficiaryId(govtId)

  const doc = await BeneficiaryDistributionModel.create({
    ngo: new Types.ObjectId(req.auth!.userId),
    beneficiaryIdHash: hash,
    beneficiaryInitials: initials,
    rationCategory,
    quantityGiven,
    unit,
    campOrShelterName,
    location: { type: 'Point', coordinates: [loc.coordinates[0], loc.coordinates[1]] },
    notes,
    distributedAt: new Date(),
  })

  res.status(201).json({ data: doc })
})

// GET /api/distributions — list own NGO distributions
distributionsRouter.get('/', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const list = await BeneficiaryDistributionModel.find({
    ngo: new Types.ObjectId(req.auth!.userId),
  })
    .sort({ distributedAt: -1 })
    .limit(limit)
    .lean()

  res.status(200).json({ data: list })
})

export default distributionsRouter

