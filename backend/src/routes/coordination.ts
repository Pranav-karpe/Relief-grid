import { Router } from 'express'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { createTask } from '../services/task-coordination.service.js'

const coordinationRouter = Router()

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validateGeoPoint(loc: unknown): [number, number] {
  if (
    typeof loc !== 'object' || loc === null ||
    (loc as Record<string, unknown>).type !== 'Point' ||
    !Array.isArray((loc as Record<string, unknown>).coordinates) ||
    ((loc as Record<string, unknown>).coordinates as unknown[]).length !== 2 ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[0] !== 'number' ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[1] !== 'number'
  ) {
    throw new ApiError(400, 'validation_error', 'assignedLocation must be a GeoJSON Point: { type: "Point", coordinates: [lng, lat] }.')
  }
  const [lng, lat] = (loc as { coordinates: number[] }).coordinates
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new ApiError(400, 'validation_error', 'coordinates must be valid [longitude, latitude] values.')
  }
  return [lng, lat]
}

// ---------------------------------------------------------------------------
// POST /api/coordination/tasks — create a volunteer task (admin only)
// ---------------------------------------------------------------------------

coordinationRouter.post('/tasks', requireAuth, requireRoles('admin'), async (req, res) => {
  const b = body(req.body)

  const volunteerId = typeof b.volunteerId === 'string' ? b.volunteerId.trim() : ''
  const taskDetails = typeof b.taskDetails === 'string' ? b.taskDetails.trim() : ''
  const donationId = typeof b.donationId === 'string' ? b.donationId.trim() : undefined
  const requirementId = typeof b.requirementId === 'string' ? b.requirementId.trim() : undefined
  const reportId = typeof b.reportId === 'string' ? b.reportId.trim() : undefined

  if (!volunteerId) throw new ApiError(400, 'validation_error', 'volunteerId is required.')
  if (!taskDetails) throw new ApiError(400, 'validation_error', 'taskDetails is required.')
  if (!b.assignedLocation) throw new ApiError(400, 'validation_error', 'assignedLocation is required.')

  const [lng, lat] = validateGeoPoint(b.assignedLocation)

  const task = await createTask({
    volunteerId,
    donationId: donationId || undefined,
    requirementId: requirementId || undefined,
    reportId: reportId || undefined,
    assignedLocation: { type: 'Point', coordinates: [lng, lat] },
    taskDetails,
    createdBy: req.auth!.userId,
  })

  res.status(201).json({ data: task })
})

// ---------------------------------------------------------------------------
// GET /api/coordination/tasks — list all tasks (admin only)
// ---------------------------------------------------------------------------

coordinationRouter.get('/tasks', requireAuth, requireRoles('admin'), async (req, res) => {
  const { VolunteerTaskModel } = await import('../models/task.js')
  const { Types } = await import('mongoose')

  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = {}

  if (typeof req.query.volunteerId === 'string' && Types.ObjectId.isValid(req.query.volunteerId)) {
    filter.volunteer = new Types.ObjectId(req.query.volunteerId)
  }
  if (typeof req.query.assignmentStatus === 'string') {
    filter.assignmentStatus = req.query.assignmentStatus
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

  const tasks = await VolunteerTaskModel.find(filter)
    .select('-history')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (tasks.length > limit) {
    tasks.pop()
    const last = tasks[tasks.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: tasks, page: { nextCursor } })
})

export default coordinationRouter
