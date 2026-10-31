import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const taskHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now, required: true },
    reason: { type: String, maxlength: 1000 },
  },
  { _id: false },
)

const taskSchema = new Schema(
  {
    volunteer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedByNgo: { type: Schema.Types.ObjectId, ref: 'User' },
    donation: { type: Schema.Types.ObjectId, ref: 'Donation' },
    report: { type: Schema.Types.ObjectId, ref: 'Report' },
    requirement: { type: Schema.Types.ObjectId, ref: 'Requirement' },
    assignmentStatus: { type: String, enum: ['assigned', 'accepted', 'declined', 'cancelled', 'reassigned'], default: 'assigned', required: true },
    pickupStatus: { type: String, enum: ['pending', 'collected', 'failed'], default: 'pending', required: true },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'in_transit', 'delivered_pending_confirmation', 'delivered', 'failed'],
      default: 'pending',
      required: true,
    },
    confirmationStatus: {
      type: String,
      enum: ['unconfirmed', 'awaiting_confirmation', 'confirmed', 'disputed'],
      default: 'unconfirmed',
      required: true,
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    assignedLocation: { type: geoPointSchema, required: true },
    pickupLocation: { type: geoPointSchema },
    destinationLocation: { type: geoPointSchema },
    taskDetails: { type: String, required: true, trim: true, maxlength: 3000 },
    acceptedAt: Date,
    collectedAt: Date,
    deliveredAt: Date,
    confirmedAt: Date,
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmationNotes: { type: String, maxlength: 1000 },
    proofOfDeliveryRef: { type: String, maxlength: 500 },
    history: { type: [taskHistorySchema], default: [] },
  },
  { timestamps: true },
)

taskSchema.index({ volunteer: 1, assignmentStatus: 1, createdAt: -1 })
taskSchema.index({ deliveryStatus: 1, createdAt: -1 })
taskSchema.index({ assignedByNgo: 1, createdAt: -1 })
taskSchema.index({ report: 1 })
taskSchema.index({ requirement: 1 })

export type VolunteerTask = InferSchemaType<typeof taskSchema>
export type VolunteerTaskDocument = HydratedDocument<VolunteerTask>
export const VolunteerTaskModel = model<VolunteerTask>('VolunteerTask', taskSchema)
