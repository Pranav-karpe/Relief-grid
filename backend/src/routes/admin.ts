import { Router } from 'express'
import { Types } from 'mongoose'
import { UserModel } from '../models/user.js'
import { NgoVerificationModel, VolunteerVerificationModel, ComplaintModel } from '../models/oversight.js'
import { ReportModel } from '../models/report.js'
import { DonationModel } from '../models/donation.js'
import { VolunteerTaskModel } from '../models/task.js'
import { AuditRecordModel } from '../models/audit.js'
import { RequirementModel } from '../models/requirement.js'
import { AllocationRecordModel } from '../models/allocation.js'
import { notify } from '../services/notification.service.js'
import { getOverdueVolunteerTasks } from '../services/volunteer-safety.service.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import type { AccountStatus } from '../models/common.js'

const adminRouter = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validId(id: string): boolean {
  return Types.ObjectId.isValid(id)
}

function buildCursorFilter(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) return {}
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { createdAt: string; _id: string }
    return {
      $or: [
        { createdAt: { $lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), _id: { $lt: new Types.ObjectId(String(decoded._id)) } },
      ],
    }
  } catch {
    throw new ApiError(400, 'validation_error', 'Invalid cursor.')
  }
}

function makeCursor(doc: { createdAt?: Date; _id: unknown }): string {
  return Buffer.from(JSON.stringify({ createdAt: doc.createdAt, _id: doc._id })).toString('base64url')
}

async function writeAudit(
  actor: string,
  action: string,
  entityType: string,
  entityId: Types.ObjectId | string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await AuditRecordModel.create({
    actor: new Types.ObjectId(actor),
    action,
    entityType,
    entityId: new Types.ObjectId(String(entityId)),
    metadata,
  })
}

// Safe user projection — never returns auth fields
const SAFE_USER_SELECT = '-auth'

// ---------------------------------------------------------------------------
// GET /api/admin/overview
// ---------------------------------------------------------------------------

adminRouter.get('/overview', requireAuth, requireRoles('admin'), async (_req, res) => {
  const [
    totalUsers,
    activeUsers,
    citizenUsers,
    donorUsers,
    volunteerUsers,
    ngoUsers,
    adminUsers,
    pendingVerifications,
    approvedVerifications,
    rejectedVerifications,
    suspendedVerifications,
    pendingVolVerifications,
    approvedVolVerifications,
    rejectedVolVerifications,
    draftReports,
    submittedReports,
    underReviewReports,
    verifiedReports,
    rejectedReports,
    resolvedReports,
    availableDonations,
    reservedDonations,
    partiallyAllocatedDonations,
    allocatedDonations,
    expiredDonations,
    cancelledDonations,
    activeRequirements,
    fulfilledRequirements,
    expiredRequirements,
    cancelledRequirements,
    pendingAllocations,
    confirmedAllocations,
    failedAllocations,
    openComplaints,
    underReviewComplaints,
    resolvedComplaints,
    dismissedComplaints,
    assignedTasks,
    acceptedTasks,
    declinedTasks,
    cancelledTasks,
    reassignedTasks,
    pendingDeliveries,
    inTransitDeliveries,
    deliveredDeliveries,
    failedDeliveries,
    recentAudits,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ accountStatus: 'active' }),
    UserModel.countDocuments({ role: 'citizen' }),
    UserModel.countDocuments({ role: 'donor' }),
    UserModel.countDocuments({ role: 'volunteer' }),
    UserModel.countDocuments({ role: 'ngo' }),
    UserModel.countDocuments({ role: 'admin' }),
    NgoVerificationModel.countDocuments({ status: 'pending' }),
    NgoVerificationModel.countDocuments({ status: 'approved' }),
    NgoVerificationModel.countDocuments({ status: 'rejected' }),
    NgoVerificationModel.countDocuments({ status: 'suspended' }),
    VolunteerVerificationModel.countDocuments({ status: 'pending' }),
    VolunteerVerificationModel.countDocuments({ status: 'approved' }),
    VolunteerVerificationModel.countDocuments({ status: 'rejected' }),
    ReportModel.countDocuments({ status: 'draft' }),
    ReportModel.countDocuments({ status: 'submitted' }),
    ReportModel.countDocuments({ status: 'under_review' }),
    ReportModel.countDocuments({ status: 'verified' }),
    ReportModel.countDocuments({ status: 'rejected' }),
    ReportModel.countDocuments({ status: 'resolved' }),
    DonationModel.countDocuments({ availabilityStatus: 'available' }),
    DonationModel.countDocuments({ availabilityStatus: 'reserved' }),
    DonationModel.countDocuments({ availabilityStatus: 'partially_allocated' }),
    DonationModel.countDocuments({ availabilityStatus: 'allocated' }),
    DonationModel.countDocuments({ availabilityStatus: 'expired' }),
    DonationModel.countDocuments({ availabilityStatus: 'cancelled' }),
    RequirementModel.countDocuments({ status: 'active' }),
    RequirementModel.countDocuments({ status: 'fulfilled' }),
    RequirementModel.countDocuments({ status: 'expired' }),
    RequirementModel.countDocuments({ status: 'cancelled' }),
    AllocationRecordModel.countDocuments({ state: 'pending' }),
    AllocationRecordModel.countDocuments({ state: 'confirmed' }),
    AllocationRecordModel.countDocuments({ state: 'failed' }),
    ComplaintModel.countDocuments({ status: 'open' }),
    ComplaintModel.countDocuments({ status: 'under_review' }),
    ComplaintModel.countDocuments({ status: 'resolved' }),
    ComplaintModel.countDocuments({ status: 'dismissed' }),
    VolunteerTaskModel.countDocuments({ assignmentStatus: 'assigned' }),
    VolunteerTaskModel.countDocuments({ assignmentStatus: 'accepted' }),
    VolunteerTaskModel.countDocuments({ assignmentStatus: 'declined' }),
    VolunteerTaskModel.countDocuments({ assignmentStatus: 'cancelled' }),
    VolunteerTaskModel.countDocuments({ assignmentStatus: 'reassigned' }),
    VolunteerTaskModel.countDocuments({ deliveryStatus: 'pending' }),
    VolunteerTaskModel.countDocuments({ deliveryStatus: 'in_transit' }),
    VolunteerTaskModel.countDocuments({ deliveryStatus: { $in: ['delivered_pending_confirmation', 'delivered'] } }),
    VolunteerTaskModel.countDocuments({ deliveryStatus: 'failed' }),
    AuditRecordModel.find()
      .populate('actor', 'displayName email role')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ])

  res.status(200).json({
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        byRole: {
          citizen: citizenUsers,
          donor: donorUsers,
          volunteer: volunteerUsers,
          ngo: ngoUsers,
          admin: adminUsers,
        },
      },
      verifications: {
        total: pendingVerifications + approvedVerifications + rejectedVerifications + suspendedVerifications +
               pendingVolVerifications + approvedVolVerifications + rejectedVolVerifications,
        pending: pendingVerifications + pendingVolVerifications,
        approved: approvedVerifications + approvedVolVerifications,
        rejected: rejectedVerifications + rejectedVolVerifications,
        suspended: suspendedVerifications,
        ngo: {
          total: pendingVerifications + approvedVerifications + rejectedVerifications + suspendedVerifications,
          pending: pendingVerifications,
          approved: approvedVerifications,
          rejected: rejectedVerifications,
          suspended: suspendedVerifications,
        },
        volunteer: {
          total: pendingVolVerifications + approvedVolVerifications + rejectedVolVerifications,
          pending: pendingVolVerifications,
          approved: approvedVolVerifications,
          rejected: rejectedVolVerifications,
        },
      },
      ngoVerifications: {
        total: pendingVerifications + approvedVerifications + rejectedVerifications + suspendedVerifications,
        pending: pendingVerifications,
        approved: approvedVerifications,
        rejected: rejectedVerifications,
        suspended: suspendedVerifications,
      },
      reports: {
        total: draftReports + submittedReports + underReviewReports + verifiedReports + rejectedReports + resolvedReports,
        submitted: submittedReports,
        underReview: underReviewReports,
        verified: verifiedReports,
        rejected: rejectedReports,
        resolved: resolvedReports,
        draft: draftReports,
      },
      donations: {
        total: availableDonations + reservedDonations + partiallyAllocatedDonations + allocatedDonations + expiredDonations + cancelledDonations,
        available: availableDonations,
        reserved: reservedDonations,
        partiallyAllocated: partiallyAllocatedDonations,
        allocated: allocatedDonations,
        expired: expiredDonations,
        cancelled: cancelledDonations,
      },
      requirements: {
        total: activeRequirements + fulfilledRequirements + expiredRequirements + cancelledRequirements,
        active: activeRequirements,
        fulfilled: fulfilledRequirements,
        expired: expiredRequirements,
        cancelled: cancelledRequirements,
      },
      allocations: {
        total: pendingAllocations + confirmedAllocations + failedAllocations,
        pending: pendingAllocations,
        confirmed: confirmedAllocations,
        failed: failedAllocations,
      },
      complaints: {
        total: openComplaints + underReviewComplaints + resolvedComplaints + dismissedComplaints,
        open: openComplaints,
        underReview: underReviewComplaints,
        resolved: resolvedComplaints,
        dismissed: dismissedComplaints,
      },
      tasks: {
        total: assignedTasks + acceptedTasks + declinedTasks + cancelledTasks + reassignedTasks,
        active: acceptedTasks,
        byAssignment: {
          assigned: assignedTasks,
          accepted: acceptedTasks,
          declined: declinedTasks,
          cancelled: cancelledTasks,
          reassigned: reassignedTasks,
        },
        byDelivery: {
          pending: pendingDeliveries,
          inTransit: inTransitDeliveries,
          delivered: deliveredDeliveries,
          failed: failedDeliveries,
        },
      },
      recentActivity: recentAudits,
    },
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------

adminRouter.get('/users', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  const VALID_ROLES = ['citizen', 'donor', 'volunteer', 'ngo', 'admin']
  const VALID_STATUSES = ['pending', 'active', 'suspended', 'closed']

  if (typeof req.query.role === 'string' && VALID_ROLES.includes(req.query.role)) {
    filter.role = req.query.role
  }
  if (typeof req.query.accountStatus === 'string' && VALID_STATUSES.includes(req.query.accountStatus)) {
    filter.accountStatus = req.query.accountStatus
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { email: { $regex: escaped, $options: 'i' } },
      { displayName: { $regex: escaped, $options: 'i' } },
    ]
  }

  const users = await UserModel.find(filter)
    .select(SAFE_USER_SELECT)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (users.length > limit) {
    users.pop()
    nextCursor = makeCursor(users[users.length - 1])
  }

  res.status(200).json({ data: users, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/users/:userId
// ---------------------------------------------------------------------------

adminRouter.get('/users/:userId', requireAuth, requireRoles('admin'), async (req, res) => {
  const userId = String(req.params.userId)
  if (!validId(userId)) throw new ApiError(404, 'not_found', 'User not found.')

  const user = await UserModel.findById(userId).select(SAFE_USER_SELECT).lean()
  if (!user) throw new ApiError(404, 'not_found', 'User not found.')

  res.status(200).json({ data: user })
})

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:userId/status
// ---------------------------------------------------------------------------

const ALLOWED_STATUS_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  pending: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
}

adminRouter.patch('/users/:userId/status', requireAuth, requireRoles('admin'), async (req, res) => {
  const userId = String(req.params.userId)
  if (!validId(userId)) throw new ApiError(404, 'not_found', 'User not found.')

  const b = body(req.body)
  const newStatus = typeof b.accountStatus === 'string' ? b.accountStatus : ''
  const VALID_STATUSES: AccountStatus[] = ['pending', 'active', 'suspended', 'closed']
  if (!VALID_STATUSES.includes(newStatus as AccountStatus)) {
    throw new ApiError(400, 'validation_error', `accountStatus must be one of: ${VALID_STATUSES.join(', ')}.`)
  }

  if (userId === req.auth!.userId && (newStatus === 'suspended' || newStatus === 'closed')) {
    throw new ApiError(409, 'forbidden_self_action', 'Administrators cannot suspend or close their own account.')
  }

  const user = await UserModel.findById(userId).select(SAFE_USER_SELECT).lean()
  if (!user) throw new ApiError(404, 'not_found', 'User not found.')

  const allowed = ALLOWED_STATUS_TRANSITIONS[user.accountStatus as AccountStatus] ?? []
  if (!allowed.includes(newStatus as AccountStatus)) {
    throw new ApiError(409, 'invalid_transition', `Cannot transition accountStatus from "${user.accountStatus}" to "${newStatus}".`)
  }

  if (user.role === 'admin' && (newStatus === 'suspended' || newStatus === 'closed')) {
    const activeAdminCount = await UserModel.countDocuments({ role: 'admin', accountStatus: 'active' })
    if (activeAdminCount <= 1) {
      throw new ApiError(409, 'last_admin', 'Cannot deactivate the last active administrator account.')
    }
  }

  const updated = await UserModel.findOneAndUpdate(
    { _id: userId, accountStatus: user.accountStatus },
    { $set: { accountStatus: newStatus } },
    { new: true },
  ).select(SAFE_USER_SELECT).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'User state changed concurrently. Please refresh and try again.')

  await writeAudit(req.auth!.userId, 'user.status_changed', 'User', userId, {
    previousStatus: user.accountStatus,
    newStatus,
    targetRole: user.role,
  })

  await notify({
    recipientId: userId,
    eventType: 'user.status_changed',
    title: 'Account Status Updated',
    message: `Your account status has been set to "${newStatus}" by platform administration.`,
    relatedEntityType: 'User',
    relatedEntityId: userId,
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/admin/ngos/verifications
// ---------------------------------------------------------------------------

adminRouter.get('/ngos/verifications', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_VER_STATUSES = ['pending', 'approved', 'rejected', 'suspended']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_VER_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status
  } else {
    filter.status = 'pending'
  }

  const records = await NgoVerificationModel.find(filter)
    .populate('ngo', 'displayName email phone organizationProfile')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (records.length > limit) {
    records.pop()
    nextCursor = makeCursor(records[records.length - 1])
  }

  res.status(200).json({ data: records, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/ngos/verifications/:verificationId
// ---------------------------------------------------------------------------

adminRouter.get('/ngos/verifications/:verificationId', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const record = await NgoVerificationModel.findById(id).lean()
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const ngoUser = await UserModel.findById(record.ngo).select(SAFE_USER_SELECT).lean()

  res.status(200).json({ data: { verification: record, ngo: ngoUser ?? null } })
})

// ---------------------------------------------------------------------------
// POST /api/admin/ngos/verifications/:verificationId/approve
// ---------------------------------------------------------------------------

adminRouter.post('/ngos/verifications/:verificationId/approve', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const record = await NgoVerificationModel.findById(id)
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  if (record.status !== 'pending') {
    throw new ApiError(409, 'invalid_transition', `Cannot approve a verification with status "${record.status}".`)
  }

  const now = new Date()
  const updated = await NgoVerificationModel.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'approved', reviewer: new Types.ObjectId(req.auth!.userId), reviewedAt: now } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Verification state changed concurrently.')

  // Update NGO user organization profile
  await UserModel.findByIdAndUpdate(record.ngo, {
    $set: {
      'organizationProfile.verificationStatus': 'verified',
      'organizationProfile.verifiedAt': now,
      'organizationProfile.verifiedBy': new Types.ObjectId(req.auth!.userId),
    },
  })

  await writeAudit(req.auth!.userId, 'ngo_verification.approved', 'NgoVerification', id, {
    ngoId: String(record.ngo),
  })

  await notify({
    recipientId: String(record.ngo),
    eventType: 'ngo_verification.approved',
    title: 'NGO Verification Approved',
    message: 'Your organization has been officially verified by platform administration. You now have full access to NGO coordination tools.',
    relatedEntityType: 'NgoVerification',
    relatedEntityId: id,
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// POST /api/admin/ngos/verifications/:verificationId/reject
// ---------------------------------------------------------------------------

adminRouter.post('/ngos/verifications/:verificationId/reject', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const b = body(req.body)
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (reason.length < 5 || reason.length > 2000) {
    throw new ApiError(400, 'validation_error', 'A reason of 5–2000 characters is required to reject a verification.')
  }

  const record = await NgoVerificationModel.findById(id)
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  if (record.status !== 'pending') {
    throw new ApiError(409, 'invalid_transition', `Cannot reject a verification with status "${record.status}".`)
  }

  const now = new Date()
  const updated = await NgoVerificationModel.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'rejected', reviewer: new Types.ObjectId(req.auth!.userId), reviewedAt: now, reason } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Verification state changed concurrently.')

  await UserModel.findByIdAndUpdate(record.ngo, {
    $set: {
      'organizationProfile.verificationStatus': 'rejected',
      'organizationProfile.rejectionReason': reason,
    },
  })

  await writeAudit(req.auth!.userId, 'ngo_verification.rejected', 'NgoVerification', id, {
    ngoId: String(record.ngo),
    reason,
  })

  await notify({
    recipientId: String(record.ngo),
    eventType: 'ngo_verification.rejected',
    title: 'NGO Verification Rejected',
    message: `Your organization verification application was not approved. Reason: ${reason}. Please update your organization profile or accreditation details before resubmitting.`,
    relatedEntityType: 'NgoVerification',
    relatedEntityId: id,
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/admin/volunteers/verifications — volunteer verification queue
// ---------------------------------------------------------------------------

adminRouter.get('/volunteers/verifications', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_VER_STATUSES = ['pending', 'approved', 'rejected']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_VER_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status
  } else {
    filter.status = 'pending'
  }

  const records = await VolunteerVerificationModel.find(filter)
    .populate('volunteer', 'displayName email phone volunteerProfile')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (records.length > limit) {
    records.pop()
    nextCursor = makeCursor(records[records.length - 1])
  }

  res.status(200).json({ data: records, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/volunteers/verifications/:verificationId
// ---------------------------------------------------------------------------

adminRouter.get('/volunteers/verifications/:verificationId', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const record = await VolunteerVerificationModel.findById(id).lean()
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const volUser = await UserModel.findById(record.volunteer).select(SAFE_USER_SELECT).lean()

  res.status(200).json({ data: { verification: record, volunteer: volUser ?? null } })
})

// ---------------------------------------------------------------------------
// POST /api/admin/volunteers/verifications/:verificationId/approve
// ---------------------------------------------------------------------------

adminRouter.post('/volunteers/verifications/:verificationId/approve', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const record = await VolunteerVerificationModel.findById(id)
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  if (record.status !== 'pending') {
    throw new ApiError(409, 'invalid_transition', `Cannot approve a verification with status "${record.status}".`)
  }

  const now = new Date()
  const updated = await VolunteerVerificationModel.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'approved', reviewer: new Types.ObjectId(req.auth!.userId), reviewedAt: now } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Verification state changed concurrently.')

  await UserModel.findByIdAndUpdate(record.volunteer, {
    $set: {
      'volunteerProfile.verificationStatus': 'verified',
      'volunteerProfile.verifiedAt': now,
      'volunteerProfile.verifiedBy': new Types.ObjectId(req.auth!.userId),
    },
  })

  await writeAudit(req.auth!.userId, 'volunteer_verification.approved', 'VolunteerVerification', id, {
    volunteerId: String(record.volunteer),
  })

  await notify({
    recipientId: String(record.volunteer),
    eventType: 'volunteer_verification.approved',
    title: 'Volunteer Verification Approved',
    message: 'Your volunteer application has been approved. You are now authorized to accept and coordinate emergency field relief deliveries.',
    relatedEntityType: 'VolunteerVerification',
    relatedEntityId: id,
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// POST /api/admin/volunteers/verifications/:verificationId/reject
// ---------------------------------------------------------------------------

adminRouter.post('/volunteers/verifications/:verificationId/reject', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.verificationId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Verification record not found.')

  const b = body(req.body)
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (reason.length < 5 || reason.length > 2000) {
    throw new ApiError(400, 'validation_error', 'A reason of 5–2000 characters is required to reject a verification.')
  }

  const record = await VolunteerVerificationModel.findById(id)
  if (!record) throw new ApiError(404, 'not_found', 'Verification record not found.')

  if (record.status !== 'pending') {
    throw new ApiError(409, 'invalid_transition', `Cannot reject a verification with status "${record.status}".`)
  }

  const now = new Date()
  const updated = await VolunteerVerificationModel.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'rejected', reviewer: new Types.ObjectId(req.auth!.userId), reviewedAt: now, reason } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Verification state changed concurrently.')

  await UserModel.findByIdAndUpdate(record.volunteer, {
    $set: {
      'volunteerProfile.verificationStatus': 'rejected',
      'volunteerProfile.rejectionReason': reason,
    },
  })

  await writeAudit(req.auth!.userId, 'volunteer_verification.rejected', 'VolunteerVerification', id, {
    volunteerId: String(record.volunteer),
    reason,
  })

  await notify({
    recipientId: String(record.volunteer),
    eventType: 'volunteer_verification.rejected',
    title: 'Volunteer Application Update',
    message: `Your volunteer verification application could not be approved at this time. Reason: ${reason}.`,
    relatedEntityType: 'VolunteerVerification',
    relatedEntityId: id,
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

adminRouter.get('/reports', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_REPORT_STATUSES = ['draft', 'submitted', 'under_review', 'verified', 'rejected', 'resolved']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_REPORT_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status
  }
  if (typeof req.query.urgency === 'string' && req.query.urgency) {
    filter.urgency = req.query.urgency
  }
  if (typeof req.query.riskLevel === 'string' && ['low', 'medium', 'high'].includes(req.query.riskLevel)) {
    filter['riskAssessment.riskLevel'] = req.query.riskLevel
  }

  const reports = await ReportModel.find(filter)
    .select('-review.note')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (reports.length > limit) {
    reports.pop()
    nextCursor = makeCursor(reports[reports.length - 1])
  }

  res.status(200).json({ data: reports, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/reports/:reportId
// ---------------------------------------------------------------------------

adminRouter.get('/reports/:reportId', requireAuth, requireRoles('admin'), async (req, res) => {
  const reportId = String(req.params.reportId)
  if (!validId(reportId)) throw new ApiError(404, 'not_found', 'Report not found.')

  const report = await ReportModel.findById(reportId).lean()
  if (!report) throw new ApiError(404, 'not_found', 'Report not found.')

  res.status(200).json({ data: report })
})

// ---------------------------------------------------------------------------
// PATCH /api/admin/reports/:reportId/status
// ---------------------------------------------------------------------------

const REPORT_ADMIN_TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['verified', 'rejected'],
  verified: ['resolved'],
  rejected: [],
  resolved: [],
  draft: ['submitted'],
}

adminRouter.patch('/reports/:reportId/status', requireAuth, requireRoles('admin'), async (req, res) => {
  const reportId = String(req.params.reportId)
  if (!validId(reportId)) throw new ApiError(404, 'not_found', 'Report not found.')

  const b = body(req.body)
  const newStatus = typeof b.status === 'string' ? b.status : ''
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) : undefined

  const VALID_REPORT_STATUSES = ['draft', 'submitted', 'under_review', 'verified', 'rejected', 'resolved']
  if (!VALID_REPORT_STATUSES.includes(newStatus)) {
    throw new ApiError(400, 'validation_error', `status must be one of: ${VALID_REPORT_STATUSES.join(', ')}.`)
  }

  const report = await ReportModel.findById(reportId)
  if (!report) throw new ApiError(404, 'not_found', 'Report not found.')

  const allowed = REPORT_ADMIN_TRANSITIONS[report.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new ApiError(409, 'invalid_transition', `Cannot transition report status from "${report.status}" to "${newStatus}".`)
  }

  const now = new Date()
  const stage = newStatus === 'resolved' ? 'delivered' : newStatus === 'verified' ? 'verified' : 'submitted'
  const timelineItem = {
    stage,
    title: `Report Status: ${newStatus}`,
    description: note || `Report status was updated to ${newStatus} by platform administration.`,
    timestamp: now,
    actorRole: 'admin',
  }

  const updated = await ReportModel.findOneAndUpdate(
    { _id: reportId, status: report.status },
    {
      $set: {
        status: newStatus,
        'review.reviewer': new Types.ObjectId(req.auth!.userId),
        'review.reviewedAt': now,
        ...(note ? { 'review.note': note } : {}),
      },
      $push: {
        timeline: timelineItem,
      },
    },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Report state changed concurrently.')

  await writeAudit(req.auth!.userId, 'report.status_changed', 'Report', reportId, {
    previousStatus: report.status,
    newStatus,
  })

  if (report.reporter) {
    await notify({
      recipientId: String(report.reporter),
      eventType: 'report.status_changed',
      title: 'Relief Report Status Updated',
      message: `Your relief report "${report.title}" status changed from "${report.status}" to "${newStatus}".${note ? ` Note: ${note}` : ''}`,
      relatedEntityType: 'Report',
      relatedEntityId: reportId,
    })
  }

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/admin/complaints
// ---------------------------------------------------------------------------

adminRouter.get('/complaints', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_COMPLAINT_STATUSES = ['open', 'under_review', 'resolved', 'dismissed']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_COMPLAINT_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status
  }
  if (typeof req.query.subjectEntityType === 'string' && req.query.subjectEntityType.trim()) {
    filter.subjectEntityType = req.query.subjectEntityType.trim()
  }

  const complaints = await ComplaintModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (complaints.length > limit) {
    complaints.pop()
    nextCursor = makeCursor(complaints[complaints.length - 1])
  }

  res.status(200).json({ data: complaints, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/complaints/:complaintId
// ---------------------------------------------------------------------------

adminRouter.get('/complaints/:complaintId', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.complaintId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Complaint not found.')

  const complaint = await ComplaintModel.findById(id).lean()
  if (!complaint) throw new ApiError(404, 'not_found', 'Complaint not found.')

  res.status(200).json({ data: complaint })
})

// ---------------------------------------------------------------------------
// PATCH /api/admin/complaints/:complaintId/status
// ---------------------------------------------------------------------------

const COMPLAINT_TRANSITIONS: Record<string, string[]> = {
  open: ['under_review', 'dismissed'],
  under_review: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
}

adminRouter.patch('/complaints/:complaintId/status', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.complaintId)
  if (!validId(id)) throw new ApiError(404, 'not_found', 'Complaint not found.')

  const b = body(req.body)
  const newStatus = typeof b.status === 'string' ? b.status : ''
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 2000) : undefined

  const VALID_COMPLAINT_STATUSES = ['open', 'under_review', 'resolved', 'dismissed']
  if (!VALID_COMPLAINT_STATUSES.includes(newStatus)) {
    throw new ApiError(400, 'validation_error', `status must be one of: ${VALID_COMPLAINT_STATUSES.join(', ')}.`)
  }

  const complaint = await ComplaintModel.findById(id)
  if (!complaint) throw new ApiError(404, 'not_found', 'Complaint not found.')

  const allowed = COMPLAINT_TRANSITIONS[complaint.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new ApiError(409, 'invalid_transition', `Cannot transition complaint status from "${complaint.status}" to "${newStatus}".`)
  }

  const now = new Date()
  const updated = await ComplaintModel.findOneAndUpdate(
    { _id: id, status: complaint.status },
    {
      $set: {
        status: newStatus,
        reviewer: new Types.ObjectId(req.auth!.userId),
        ...(newStatus === 'resolved' || newStatus === 'dismissed' ? { resolvedAt: now } : {}),
        ...(reason ? { reason } : {}),
      },
    },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Complaint state changed concurrently.')

  await writeAudit(req.auth!.userId, 'complaint.status_changed', 'Complaint', id, {
    previousStatus: complaint.status,
    newStatus,
    ...(reason ? { reason } : {}),
  })

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/admin/audit-logs
// ---------------------------------------------------------------------------

adminRouter.get('/audit-logs', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.entityType === 'string' && req.query.entityType.trim()) {
    filter.entityType = req.query.entityType.trim()
  }
  if (typeof req.query.action === 'string' && req.query.action.trim()) {
    filter.action = req.query.action.trim()
  }
  if (typeof req.query.actor === 'string' && validId(req.query.actor)) {
    filter.actor = new Types.ObjectId(req.query.actor)
  }

  const logs = await AuditRecordModel.find(filter)
    .populate('actor', 'displayName email role')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (logs.length > limit) {
    logs.pop()
    nextCursor = makeCursor(logs[logs.length - 1])
  }

  res.status(200).json({ data: logs, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/resources — donor resource listings oversight
// ---------------------------------------------------------------------------

adminRouter.get('/resources', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_STATUSES = ['available', 'reserved', 'partially_allocated', 'allocated', 'expired', 'cancelled']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_STATUSES.includes(req.query.status)) {
    filter.availabilityStatus = req.query.status
  }
  if (typeof req.query.category === 'string' && req.query.category.trim()) {
    filter.resourceCategory = req.query.category.trim()
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { resourceCategory: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ]
  }

  const items = await DonationModel.find(filter)
    .populate('donor', 'displayName email')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (items.length > limit) {
    items.pop()
    nextCursor = makeCursor(items[items.length - 1])
  }

  res.status(200).json({ data: items, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/requirements — NGO requirements oversight
// ---------------------------------------------------------------------------

adminRouter.get('/requirements', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_REQ_STATUSES = ['active', 'fulfilled', 'expired', 'cancelled']
  const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.status === 'string' && VALID_REQ_STATUSES.includes(req.query.status)) {
    filter.status = req.query.status
  }
  if (typeof req.query.priority === 'string' && VALID_PRIORITIES.includes(req.query.priority)) {
    filter.priority = req.query.priority
  }
  if (typeof req.query.category === 'string' && req.query.category.trim()) {
    filter.resourceCategory = req.query.category.trim()
  }

  const items = await RequirementModel.find(filter)
    .populate('ngo', 'displayName email organizationProfile')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (items.length > limit) {
    items.pop()
    nextCursor = makeCursor(items[items.length - 1])
  }

  res.status(200).json({ data: items, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/allocations — confirmed allocations ledger oversight
// ---------------------------------------------------------------------------

adminRouter.get('/allocations', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_STATES = ['pending', 'confirmed', 'failed']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.state === 'string' && VALID_STATES.includes(req.query.state)) {
    filter.state = req.query.state
  }

  const items = await AllocationRecordModel.find(filter)
    .populate('allocatedBy', 'displayName email role')
    .populate('donationId', 'resourceCategory quantity unit availabilityStatus')
    .populate('requirementId', 'resourceCategory quantityRequested unit status priority')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (items.length > limit) {
    items.pop()
    nextCursor = makeCursor(items[items.length - 1])
  }

  res.status(200).json({ data: items, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/tasks — volunteer tasks oversight
// ---------------------------------------------------------------------------

adminRouter.get('/tasks', requireAuth, requireRoles('admin'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const VALID_ASSIGNMENT = ['assigned', 'accepted', 'declined', 'cancelled', 'reassigned']
  const VALID_DELIVERY = ['pending', 'in_transit', 'delivered_pending_confirmation', 'delivered', 'failed']
  const filter: Record<string, unknown> = { ...buildCursorFilter(cursor) }

  if (typeof req.query.assignmentStatus === 'string' && VALID_ASSIGNMENT.includes(req.query.assignmentStatus)) {
    filter.assignmentStatus = req.query.assignmentStatus
  }
  if (typeof req.query.deliveryStatus === 'string' && VALID_DELIVERY.includes(req.query.deliveryStatus)) {
    filter.deliveryStatus = req.query.deliveryStatus
  }

  const items = await VolunteerTaskModel.find(filter)
    .populate('volunteer', 'displayName email')
    .populate('donation', 'resourceCategory unit')
    .populate('requirement', 'resourceCategory')
    .populate('report', 'title urgency status')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (items.length > limit) {
    items.pop()
    nextCursor = makeCursor(items[items.length - 1])
  }

  res.status(200).json({ data: items, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/admin/volunteer-safety/overdue — system-wide overdue safety check-ins
// ---------------------------------------------------------------------------

adminRouter.get('/volunteer-safety/overdue', requireAuth, requireRoles('admin'), async (_req, res) => {
  const tasks = await getOverdueVolunteerTasks()
  res.status(200).json({ data: tasks })
})

export default adminRouter
