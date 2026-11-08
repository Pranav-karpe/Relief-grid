import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const alertSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    severity: {
      type: String,
      enum: ['info', 'warning', 'emergency'],
      default: 'warning',
      required: true,
    },
    targetRole: {
      type: String,
      enum: ['all', 'citizen', 'donor', 'volunteer', 'ngo'],
      default: 'all',
      required: true,
    },
    targetArea: {
      location: { type: geoPointSchema },
      radiusKm: { type: Number, default: 50 },
    },
    active: { type: Boolean, default: true, required: true },
    expiresAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

alertSchema.index({ active: 1, severity: 1, createdAt: -1 })
alertSchema.index({ expiresAt: 1 })

export type Alert = InferSchemaType<typeof alertSchema>
export type AlertDocument = HydratedDocument<Alert>
export const AlertModel = model<Alert>('Alert', alertSchema)

