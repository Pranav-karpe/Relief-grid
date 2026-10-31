/**
 * Notification service — writes in-app notification records and triggers emails.
 *
 * This service stores persistent notification records in the database and
 * forwards notifications to the email service.
 * Errors are logged but never re-thrown — a notification failure must not
 * roll back the business operation that triggered it.
 */

import { Types } from 'mongoose'
import { NotificationModel } from '../models/notification.js'
import { UserModel } from '../models/user.js'
import { sendRoleNotification } from './email.service.js'

export type NotificationInput = {
  recipientId: string
  eventType: string
  title: string
  message: string
  relatedEntityType: string
  relatedEntityId: string
  /** Optional TTL — defaults to 30 days from now */
  expiresAt?: Date
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Write a single notification record and asynchronously dispatch email notification.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    await NotificationModel.create({
      recipient: new Types.ObjectId(input.recipientId),
      eventType: input.eventType,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: new Types.ObjectId(input.relatedEntityId),
      expiresAt: input.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS),
    })

    // Asynchronously dispatch email without blocking
    UserModel.findById(input.recipientId)
      .select('email displayName role')
      .lean()
      .then((user) => {
        if (user && user.email) {
          sendRoleNotification({
            role: user.role as 'citizen' | 'ngo' | 'donor' | 'volunteer' | 'admin',
            recipientName: user.displayName || 'ReliefGrid User',
            recipientEmail: user.email,
            title: input.title,
            message: input.message,
            metadata: {
              'Event Type': input.eventType,
              'Entity Reference': input.relatedEntityId,
            },
          }).catch((e) => console.error('[notification.service] Email delivery failed:', e))
        }
      })
      .catch((e) => console.error('[notification.service] User lookup for email failed:', e))
  } catch (err: unknown) {
    console.error('[notification.service] Failed to write notification:', err instanceof Error ? err.message : err)
  }
}

/**
 * Write multiple notifications concurrently.
 */
export async function notifyMany(inputs: NotificationInput[]): Promise<void> {
  await Promise.all(inputs.map(notify))
}
