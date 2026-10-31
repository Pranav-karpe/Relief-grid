import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    eventType: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    relatedEntityType: { type: String, required: true, trim: true, maxlength: 80 },
    relatedEntityId: { type: Schema.Types.ObjectId, required: true },
    readAt: Date,
    expiresAt: Date,
  },
  { timestamps: true },
)

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 })
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type Notification = InferSchemaType<typeof notificationSchema>
export type NotificationDocument = HydratedDocument<Notification>
export const NotificationModel = model<Notification>('Notification', notificationSchema)