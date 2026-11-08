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

const checkInEntrySchema = new Schema(
  {
    checkedInAt: { type: Date, default: Date.now, required: true },
    note: { type: String, maxlength: 500 },
    location: { type: geoPointSchema },
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
    assignmentStatus: {
      type: String,
      enum: ['assigned', 'accepted', 'declined', 'cancelled', 'reassigned'],
      default: 'assigned',
      required: true,
    },
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

    // Multi-modal proof of delivery
    proofOfDelivery: {
      proofType: {
        type: String,
        enum: ['signature', 'photo', 'receipt', 'multiple', 'none'],
        default: 'none',
      },
      signatureData: { type: String }, // Base64 data URL or storage URL
      photoUrl: { type: String },
      receiptUrl: { type: String },
      capturedAt: { type: Date },
    },

    // Proxy handover details
    proxyHandover: {
      isProxy: { type: Boolean, default: false },
      recipientType: {
        type: String,
        enum: [
          'primary_recipient',
          'proxy_coordinator',
          'community_shelter_lead',
          'family_member',
          'local_authority',
        ],
        default: 'primary_recipient',
      },
      recipientName: { type: String, trim: true, maxlength: 120 },
      recipientPhone: { type: String, trim: true, maxlength: 30 },
      reason: { type: String, trim: true, maxlength: 500 },
    },

    // Partial delivery & quantity discrepancy reconciliation
    quantityTarget: { type: Number, min: 0 },
    quantityDelivered: { type: Number, min: 0 },
    quantityRemaining: { type: Number, min: 0 },
    reconciliationStatus: {
      type: String,
      enum: ['none', 'reconciled'],
      default: 'none',
    },
    reconciledAt: Date,
    discrepancyReason: {
      type: String,
      enum: [
        'none',
        'damaged_in_transit',
        'partial_recipient_capacity',
        'shortage_at_pickup',
        'transport_capacity_limit',
        'other',
      ],
      default: 'none',
    },
    discrepancyNotes: { type: String, trim: true, maxlength: 1000 },

    // Vehicle cargo compatibility
    requiredVehicleType: {
      type: String,
      enum: ['foot', 'bicycle', 'two_wheeler', 'four_wheeler', 'truck', 'boat', 'any'],
      default: 'any',
    },
    cargoWeightKg: { type: Number, min: 0 },
    cargoVolumeM3: { type: Number, min: 0 },

    // Safety check-in timer
    safetyCheckIn: {
      enabled: { type: Boolean, default: false },
      intervalMinutes: { type: Number, default: 30 },
      lastCheckInAt: { type: Date },
      nextCheckInDue: { type: Date },
      overdueAlertSent: { type: Boolean, default: false },
      history: { type: [checkInEntrySchema], default: [] },
    },

    history: { type: [taskHistorySchema], default: [] },
  },
  { timestamps: true },
)

taskSchema.index({ volunteer: 1, assignmentStatus: 1, createdAt: -1 })
taskSchema.index({ deliveryStatus: 1, createdAt: -1 })
taskSchema.index({ assignedByNgo: 1, createdAt: -1 })
taskSchema.index({ report: 1 })
taskSchema.index({ requirement: 1 })
taskSchema.index({ 'safetyCheckIn.nextCheckInDue': 1, 'safetyCheckIn.enabled': 1 })

export type VolunteerTask = InferSchemaType<typeof taskSchema>
export type VolunteerTaskDocument = HydratedDocument<VolunteerTask>
export const VolunteerTaskModel = model<VolunteerTask>('VolunteerTask', taskSchema)
