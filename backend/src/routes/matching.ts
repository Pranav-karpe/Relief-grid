import { Router } from 'express'
import { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { RequirementModel } from '../models/requirement.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { findMatches } from '../services/matching.service.js'

const matchingRouter = Router()

function parseDistanceOptions(query: Record<string, unknown>) {
  const maxDistanceKm = query.maxDistanceKm !== undefined ? Number(query.maxDistanceKm) : undefined
  const unlimitedDistance = query.unlimitedDistance === 'true' || query.unlimitedDistance === true
  return {
    ...(maxDistanceKm !== undefined && !isNaN(maxDistanceKm) ? { maxDistanceKm } : {}),
    ...(unlimitedDistance ? { unlimitedDistance: true } : {}),
  }
}

// ---------------------------------------------------------------------------
// GET /api/matching/donations/:donationId — suggestions for a specific donation
// Accessible by: the owning donor, or admin
// ---------------------------------------------------------------------------

matchingRouter.get('/donations/:donationId', requireAuth, async (req, res) => {
  const donationId = String(req.params.donationId)
  if (!Types.ObjectId.isValid(donationId)) throw new ApiError(404, 'not_found', 'Donation not found.')

  const auth = req.auth!
  const limit = Math.min(Number(req.query.limit) || 10, 50)
  const distanceOpts = parseDistanceOptions(req.query as Record<string, unknown>)

  // Verify ownership or admin
  if (auth.role !== 'admin') {
    if (auth.role !== 'donor') throw new ApiError(403, 'forbidden', 'You do not have permission to access this resource.')
    const donation = await DonationModel.findOne({
      _id: donationId,
      donor: new Types.ObjectId(auth.userId),
    }).lean()
    if (!donation) throw new ApiError(404, 'not_found', 'Donation not found.')
  }

  const suggestions = await findMatches({ donationId, limit, ...distanceOpts })
  res.status(200).json({ data: suggestions })
})

// ---------------------------------------------------------------------------
// GET /api/matching/requirements/:requirementId — suggestions for a specific requirement
// Accessible by: the owning NGO, or admin
// ---------------------------------------------------------------------------

matchingRouter.get('/requirements/:requirementId', requireAuth, async (req, res) => {
  const requirementId = String(req.params.requirementId)
  if (!Types.ObjectId.isValid(requirementId)) throw new ApiError(404, 'not_found', 'Requirement not found.')

  const auth = req.auth!
  const limit = Math.min(Number(req.query.limit) || 10, 50)
  const distanceOpts = parseDistanceOptions(req.query as Record<string, unknown>)

  if (auth.role !== 'admin') {
    if (auth.role !== 'ngo') throw new ApiError(403, 'forbidden', 'You do not have permission to access this resource.')
    const req_ = await RequirementModel.findOne({
      _id: requirementId,
      ngo: new Types.ObjectId(auth.userId),
    }).lean()
    if (!req_) throw new ApiError(404, 'not_found', 'Requirement not found.')
  }

  const suggestions = await findMatches({ requirementId, limit, ...distanceOpts })
  res.status(200).json({ data: suggestions })
})

// ---------------------------------------------------------------------------
// GET /api/matching/suggestions — platform-wide suggestions (admin only)
// ---------------------------------------------------------------------------

matchingRouter.get('/suggestions', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const distanceOpts = parseDistanceOptions(req.query as Record<string, unknown>)
  const suggestions = await findMatches({ limit, ...distanceOpts })
  res.status(200).json({ data: suggestions })
})

export default matchingRouter
