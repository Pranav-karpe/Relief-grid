import { Router } from 'express'
import { Types } from 'mongoose'
import { VolunteerTaskModel } from '../models/task.js'
import { ReportModel } from '../models/report.js'
import { UserModel } from '../models/user.js'
import { requireAuth, requireRoles, requireVerifiedVolunteer } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const volunteerRouter = Router()

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validId(id: string): boolean {
  return Types.ObjectId.isValid(id)
}

// Valid status transitions for volunteer-controlled fields
const ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  assigned: ['accepted', 'declined'],
  accepted: ['cancelled'],
  declined: [],
  cancelled: [],
  reassigned: ['accepted', 'declined'],
}

const PICKUP_TRANSITIONS: Record<string, string[]> = {
  pending: ['collected', 'failed'],
  collected: [],
  failed: [],
}

const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_transit'],
  in_transit: ['delivered', 'delivered_pending_confirmation', 'failed'],
  delivered_pending_confirmation: [],
  delivered: [],
  failed: [],
}

function assertTransition(
  transitions: Record<string, string[]>,
  current: string,
  next: string,
  label: string,
): void {
  if (!transitions[current]?.includes(next)) {
    throw new ApiError(409, 'invalid_transition', `Cannot transition ${label} from "${current}" to "${next}".`)
  }
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

// ---------------------------------------------------------------------------
// GET /api/volunteer/profile — get own volunteer profile & verification status
// ---------------------------------------------------------------------------

volunteerRouter.get('/profile', requireAuth, requireRoles('volunteer'), async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId).select('displayName email phone role volunteerProfile').lean()
  if (!user) throw new ApiError(404, 'not_found', 'User not found.')
  res.status(200).json({ data: user })
})

// ---------------------------------------------------------------------------
// GET /api/volunteer/tasks/mine — list own assigned tasks
// ---------------------------------------------------------------------------

volunteerRouter.get('/tasks/mine', requireAuth, requireRoles('volunteer'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = {
    volunteer: new Types.ObjectId(req.auth!.userId),
    ...buildCursorFilter(cursor),
  }

  const VALID_ASSIGNMENT = ['assigned', 'accepted', 'declined', 'cancelled', 'reassigned']
  if (typeof req.query.assignmentStatus === 'string' && VALID_ASSIGNMENT.includes(req.query.assignmentStatus)) {
    filter.assignmentStatus = req.query.assignmentStatus
  }

  const tasks = await VolunteerTaskModel.find(filter)
    .select('-history')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (tasks.length > limit) {
    tasks.pop()
    nextCursor = makeCursor(tasks[tasks.length - 1])
  }

  res.status(200).json({ data: tasks, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/volunteer/tasks/:taskId — get own task detail
// ---------------------------------------------------------------------------

volunteerRouter.get('/tasks/:taskId', requireAuth, requireRoles('volunteer'), async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!validId(taskId)) throw new ApiError(404, 'not_found', 'Task not found.')

  const task = await VolunteerTaskModel.findOne({
    _id: taskId,
    volunteer: new Types.ObjectId(req.auth!.userId),
  }).lean()

  if (!task) throw new ApiError(404, 'not_found', 'Task not found.')
  res.status(200).json({ data: task })
})

// ---------------------------------------------------------------------------
// POST /api/volunteer/tasks/:taskId/accept — accept an assigned task
// Verified volunteer only
// ---------------------------------------------------------------------------

volunteerRouter.post('/tasks/:taskId/accept', requireAuth, requireRoles('volunteer'), requireVerifiedVolunteer, async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!validId(taskId)) throw new ApiError(404, 'not_found', 'Task not found.')

  const task = await VolunteerTaskModel.findOne({
    _id: taskId,
    volunteer: new Types.ObjectId(req.auth!.userId),
  })
  if (!task) throw new ApiError(404, 'not_found', 'Task not found.')

  assertTransition(ASSIGNMENT_TRANSITIONS, task.assignmentStatus, 'accepted', 'assignmentStatus')

  const updated = await VolunteerTaskModel.findOneAndUpdate(
    {
      _id: taskId,
      volunteer: new Types.ObjectId(req.auth!.userId),
      assignmentStatus: task.assignmentStatus,
    },
    {
      $set: { assignmentStatus: 'accepted', acceptedAt: new Date() },
      $push: {
        history: {
          status: 'accepted',
          changedBy: new Types.ObjectId(req.auth!.userId),
          changedAt: new Date(),
        },
      },
    },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Task state changed concurrently. Please refresh and try again.')

  // Increment volunteer workload
  await UserModel.findByIdAndUpdate(req.auth!.userId, {
    $inc: { 'volunteerProfile.currentWorkload': 1 },
  })

  // Update citizen report timeline if linked
  if (task.report) {
    await ReportModel.findByIdAndUpdate(task.report, {
      $set: { status: 'volunteer_assigned' },
      $push: {
        timeline: {
          stage: 'volunteer_assigned',
          label: 'Volunteer Accepted Assignment',
          description: 'Field volunteer accepted transit logistics and is proceeding to pickup.',
          actorRole: 'volunteer',
          actorId: new Types.ObjectId(req.auth!.userId),
          timestamp: new Date(),
        },
      },
    })
  }

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// POST /api/volunteer/tasks/:taskId/decline — decline an assigned task
// ---------------------------------------------------------------------------

volunteerRouter.post('/tasks/:taskId/decline', requireAuth, requireRoles('volunteer'), async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!validId(taskId)) throw new ApiError(404, 'not_found', 'Task not found.')

  const b = body(req.body)
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 1000) : undefined

  const task = await VolunteerTaskModel.findOne({
    _id: taskId,
    volunteer: new Types.ObjectId(req.auth!.userId),
  })
  if (!task) throw new ApiError(404, 'not_found', 'Task not found.')

  assertTransition(ASSIGNMENT_TRANSITIONS, task.assignmentStatus, 'declined', 'assignmentStatus')

  const updated = await VolunteerTaskModel.findOneAndUpdate(
    {
      _id: taskId,
      volunteer: new Types.ObjectId(req.auth!.userId),
      assignmentStatus: task.assignmentStatus,
    },
    {
      $set: { assignmentStatus: 'declined' },
      $push: {
        history: {
          status: 'declined',
          changedBy: new Types.ObjectId(req.auth!.userId),
          changedAt: new Date(),
          ...(reason ? { reason } : {}),
        },
      },
    },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Task state changed concurrently. Please refresh and try again.')
  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// PATCH /api/volunteer/tasks/:taskId/progress — update pickup/delivery status
// Verified volunteer only
// ---------------------------------------------------------------------------

volunteerRouter.patch('/tasks/:taskId/progress', requireAuth, requireRoles('volunteer'), requireVerifiedVolunteer, async (req, res) => {
  const taskId = String(req.params.taskId)
  if (!validId(taskId)) throw new ApiError(404, 'not_found', 'Task not found.')

  const b = body(req.body)

  const protectedFields = [
    'volunteer', 'donation', 'report', 'requirement', 'assignmentStatus',
    'assignedLocation', 'taskDetails', 'acceptedAt', 'deliveredAt', 'confirmedAt', 'confirmedBy', 'confirmationStatus', 'history'
  ]
  for (const key of protectedFields) {
    if (key in b) throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
  }

  const task = await VolunteerTaskModel.findOne({
    _id: taskId,
    volunteer: new Types.ObjectId(req.auth!.userId),
  })
  if (!task) throw new ApiError(404, 'not_found', 'Task not found.')

  if (task.assignmentStatus !== 'accepted') {
    throw new ApiError(409, 'invalid_transition', 'Task must be accepted before updating progress.')
  }

  const allowed: Record<string, unknown> = {}
  const historyEntry: { status: string; changedBy: Types.ObjectId; changedAt: Date; reason?: string } = {
    status: '',
    changedBy: new Types.ObjectId(req.auth!.userId),
    changedAt: new Date(),
  }

  if (b.pickupStatus !== undefined) {
    const next = String(b.pickupStatus)
    assertTransition(PICKUP_TRANSITIONS, task.pickupStatus, next, 'pickupStatus')
    allowed.pickupStatus = next
    historyEntry.status = `pickup:${next}`
    if (next === 'collected') allowed.collectedAt = new Date()
  }

  let markedDelivered = false
  if (b.deliveryStatus !== undefined) {
    const nextRaw = String(b.deliveryStatus)
    const next = nextRaw === 'delivered' ? 'delivered_pending_confirmation' : nextRaw
    assertTransition(DELIVERY_TRANSITIONS, task.deliveryStatus, next, 'deliveryStatus')
    allowed.deliveryStatus = next
    historyEntry.status = historyEntry.status ? `${historyEntry.status},delivery:${next}` : `delivery:${next}`
    if (next === 'delivered_pending_confirmation') {
      markedDelivered = true
      allowed.deliveredAt = new Date()
      allowed.confirmationStatus = 'awaiting_confirmation'
    }
  }

  if (b.proofOfDeliveryRef !== undefined) {
    if (b.deliveryStatus !== 'delivered' && b.deliveryStatus !== 'delivered_pending_confirmation') {
      throw new ApiError(400, 'validation_error', 'proofOfDeliveryRef can only be set when marking delivery.')
    }
    if (typeof b.proofOfDeliveryRef !== 'string' || b.proofOfDeliveryRef.trim().length > 500) {
      throw new ApiError(400, 'validation_error', 'proofOfDeliveryRef must be a string up to 500 characters.')
    }
    allowed.proofOfDeliveryRef = b.proofOfDeliveryRef.trim()
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const updated = await VolunteerTaskModel.findOneAndUpdate(
    {
      _id: taskId,
      volunteer: new Types.ObjectId(req.auth!.userId),
      assignmentStatus: 'accepted',
    },
    {
      $set: allowed,
      $push: { history: historyEntry },
    },
    { new: true, runValidators: true },
  ).lean()

  if (!updated) throw new ApiError(409, 'conflict', 'Task state changed concurrently. Please refresh and try again.')

  // Update citizen report timeline when in transit or delivered
  if (task.report) {
    if (allowed.deliveryStatus === 'in_transit') {
      await ReportModel.findByIdAndUpdate(task.report, {
        $set: { status: 'in_transit' },
        $push: {
          timeline: {
            stage: 'in_transit',
            label: 'Supplies In Transit',
            description: 'Volunteer picked up supplies and is en route to destination.',
            actorRole: 'volunteer',
            actorId: new Types.ObjectId(req.auth!.userId),
            timestamp: new Date(),
          },
        },
      })
    } else if (markedDelivered) {
      await ReportModel.findByIdAndUpdate(task.report, {
        $set: { status: 'delivered_pending_confirmation' },
        $push: {
          timeline: {
            stage: 'delivered_pending_confirmation',
            label: 'Delivery Marked Complete (Awaiting Confirmation)',
            description: 'Volunteer arrived at destination and recorded delivery proof. Awaiting NGO confirmation.',
            actorRole: 'volunteer',
            actorId: new Types.ObjectId(req.auth!.userId),
            timestamp: new Date(),
          },
        },
      })
    }
  }

  res.status(200).json({ data: updated })
})

// ---------------------------------------------------------------------------
// GET /api/volunteer/history — completed/cancelled task history
// ---------------------------------------------------------------------------

volunteerRouter.get('/history', requireAuth, requireRoles('volunteer'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = {
    volunteer: new Types.ObjectId(req.auth!.userId),
    ...buildCursorFilter(cursor),
    $or: [
      { assignmentStatus: { $in: ['declined', 'cancelled'] } },
      { deliveryStatus: { $in: ['delivered_pending_confirmation', 'delivered', 'failed'] } },
    ],
  }

  const tasks = await VolunteerTaskModel.find(filter)
    .select('-history')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (tasks.length > limit) {
    tasks.pop()
    nextCursor = makeCursor(tasks[tasks.length - 1])
  }

  res.status(200).json({ data: tasks, page: { nextCursor } })
})

export default volunteerRouter
