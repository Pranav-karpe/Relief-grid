import { Router } from 'express'
import { Types } from 'mongoose'
import { AlertModel } from '../models/alert.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const alertsRouter = Router()

// GET /api/alerts/active — fetch active emergency broadcasts
alertsRouter.get('/active', async (req, res) => {
  const role = typeof req.query.role === 'string' ? req.query.role : undefined
  const now = new Date()

  const filter: Record<string, unknown> = {
    active: true,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
  }

  if (role && role !== 'all') {
    filter.targetRole = { $in: ['all', role] }
  }

  const alerts = await AlertModel.find(filter)
    .sort({ severity: -1, createdAt: -1 })
    .limit(10)
    .lean()

  res.status(200).json({ data: alerts })
})

// POST /api/alerts — publish emergency broadcast (Admin only)
alertsRouter.post('/', requireAuth, requireRoles('admin'), async (req, res) => {
  const b = req.body as Record<string, unknown>

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  type AlertSeverity = 'info' | 'warning' | 'emergency'
  type TargetRole = 'all' | 'citizen' | 'donor' | 'volunteer' | 'ngo'

  const validSeverities: readonly AlertSeverity[] = ['info', 'warning', 'emergency']
  const validRoles: readonly TargetRole[] = ['all', 'citizen', 'donor', 'volunteer', 'ngo']

  const severity: AlertSeverity =
    typeof b.severity === 'string' && (validSeverities as readonly string[]).includes(b.severity)
      ? (b.severity as AlertSeverity)
      : 'warning'
  const targetRole: TargetRole =
    typeof b.targetRole === 'string' && (validRoles as readonly string[]).includes(b.targetRole)
      ? (b.targetRole as TargetRole)
      : 'all'

  if (title.length < 3 || title.length > 180) {
    throw new ApiError(400, 'validation_error', 'title must be between 3 and 180 characters.')
  }
  if (message.length < 5 || message.length > 2000) {
    throw new ApiError(400, 'validation_error', 'message must be between 5 and 2000 characters.')
  }

  let expiresAt: Date | undefined
  if (b.expiresAt) {
    const d = new Date(b.expiresAt as string)
    if (!isNaN(d.getTime())) expiresAt = d
  }

  const alert = await AlertModel.create({
    title,
    message,
    severity,
    targetRole,
    active: true,
    expiresAt,
    createdBy: new Types.ObjectId(req.auth!.userId),
  })

  res.status(201).json({ data: alert })
})

// PATCH /api/alerts/:id/deactivate — deactivate an alert (Admin only)
alertsRouter.patch('/:id/deactivate', requireAuth, requireRoles('admin'), async (req, res) => {
  const id = String(req.params.id)
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'not_found', 'Alert not found.')
  }

  const updated = await AlertModel.findByIdAndUpdate(
    id,
    { $set: { active: false } },
    { returnDocument: 'after' },
  ).lean()

  if (!updated) {
    throw new ApiError(404, 'not_found', 'Alert not found.')
  }

  res.status(200).json({ data: updated })
})

export default alertsRouter
