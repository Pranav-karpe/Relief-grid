import { Router } from 'express'
import { Types } from 'mongoose'
import { NotificationModel } from '../models/notification.js'
import { requireAuth } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const notificationsRouter = Router()

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

// ---------------------------------------------------------------------------
// GET /api/notifications — list own notifications (any authenticated user)
// ---------------------------------------------------------------------------

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
  const unreadOnly = req.query.unread === 'true'

  const filter: Record<string, unknown> = {
    recipient: new Types.ObjectId(req.auth!.userId),
    ...buildCursorFilter(cursor),
  }

  if (unreadOnly) filter.readAt = { $exists: false }

  const notifications = await NotificationModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  let nextCursor: string | null = null
  if (notifications.length > limit) {
    notifications.pop()
    const last = notifications[notifications.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: notifications, page: { nextCursor } })
})

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-count — count unread notifications
// ---------------------------------------------------------------------------

notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const count = await NotificationModel.countDocuments({
    recipient: new Types.ObjectId(req.auth!.userId),
    readAt: { $exists: false },
  })
  res.status(200).json({ data: { count } })
})

// ---------------------------------------------------------------------------
// PATCH /api/notifications/read-all — mark all own notifications as read
// ---------------------------------------------------------------------------

notificationsRouter.patch('/read-all', requireAuth, async (req, res) => {
  const result = await NotificationModel.updateMany(
    { recipient: new Types.ObjectId(req.auth!.userId), readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  )
  res.status(200).json({ data: { modifiedCount: result.modifiedCount } })
})

// ---------------------------------------------------------------------------
// PATCH /api/notifications/:notificationId/read — mark a notification as read
// ---------------------------------------------------------------------------

notificationsRouter.patch('/:notificationId/read', requireAuth, async (req, res) => {
  const id = String(req.params.notificationId)
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'not_found', 'Notification not found.')

  const updated = await NotificationModel.findOneAndUpdate(
    { _id: id, recipient: new Types.ObjectId(req.auth!.userId) },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean()

  if (!updated) throw new ApiError(404, 'not_found', 'Notification not found.')
  res.status(200).json({ data: updated })
})

export default notificationsRouter
