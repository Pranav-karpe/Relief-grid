import { Router } from 'express'
import { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { RequirementModel } from '../models/requirement.js'
import { requireAuth, requireRoles, requireVerifiedNgo } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { confirmAllocation } from '../services/allocation.service.js'
import { notify } from '../services/notification.service.js'

const allocationsRouter = Router()

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

// ---------------------------------------------------------------------------
// POST /api/allocations — confirm a resource allocation
// Accessible by: NGO (must be verified and own the requirement) or admin
// ---------------------------------------------------------------------------

allocationsRouter.post('/', requireAuth, requireRoles('ngo', 'admin'), requireVerifiedNgo, async (req, res) => {
  const b = body(req.body)
  const auth = req.auth!

  const donationId = typeof b.donationId === 'string' ? b.donationId.trim() : ''
  const requirementId = typeof b.requirementId === 'string' ? b.requirementId.trim() : ''
  const quantity = Number(b.quantity)
  const idempotencyKey = typeof b.idempotencyKey === 'string' ? b.idempotencyKey.trim().slice(0, 120) : undefined

  if (!Types.ObjectId.isValid(donationId)) throw new ApiError(400, 'validation_error', 'donationId is required and must be a valid ID.')
  if (!Types.ObjectId.isValid(requirementId)) throw new ApiError(400, 'validation_error', 'requirementId is required and must be a valid ID.')
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'validation_error', 'quantity must be a positive number.')

  // NGO must own the requirement
  if (auth.role === 'ngo') {
    const req_ = await RequirementModel.findOne({
      _id: requirementId,
      ngo: new Types.ObjectId(auth.userId),
    }).lean()
    if (!req_) throw new ApiError(404, 'not_found', 'Requirement not found.')
  }

  const result = await confirmAllocation({
    donationId,
    requirementId,
    quantity,
    allocatedBy: auth.userId,
    idempotencyKey,
  })

  // Notify the donor that their donation has been reserved
  const donation = await DonationModel.findById(donationId).select('donor resourceCategory').lean()
  if (donation?.donor) {
    await notify({
      recipientId: String(donation.donor),
      eventType: 'allocation.reserved',
      title: 'Your donation has been reserved',
      message: `${quantity} units of "${donation.resourceCategory}" have been reserved for an NGO requirement.`,
      relatedEntityType: 'Donation',
      relatedEntityId: donationId,
    })
  }

  // Notify the NGO that the allocation was confirmed
  const requirement = await RequirementModel.findById(requirementId).select('ngo resourceCategory').lean()
  if (requirement?.ngo && auth.role !== 'ngo') {
    await notify({
      recipientId: String(requirement.ngo),
      eventType: 'allocation.confirmed',
      title: 'Resource allocation confirmed',
      message: `${quantity} units of "${requirement.resourceCategory}" have been allocated to your requirement.`,
      relatedEntityType: 'Requirement',
      relatedEntityId: requirementId,
    })
  }

  res.status(201).json({ data: result })
})

// ---------------------------------------------------------------------------
// GET /api/allocations/mine — list allocations for own requirements (NGO)
// ---------------------------------------------------------------------------

allocationsRouter.get('/mine', requireAuth, requireRoles('ngo'), requireVerifiedNgo, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)

  // Return requirements that have reserved quantities (i.e. have allocations)
  const requirements = await RequirementModel.find({
    ngo: new Types.ObjectId(req.auth!.userId),
    $or: [{ quantityReserved: { $gt: 0 } }, { quantityFulfilled: { $gt: 0 } }],
  })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()

  res.status(200).json({ data: requirements })
})

export default allocationsRouter
