import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const requirementSchema = new Schema(
  {
    ngo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resourceCategory: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    quantityRequested: { type: Number, required: true, min: 0 },
    quantityFulfilled: { type: Number, default: 0, min: 0 },
    quantityReserved: { type: Number, default: 0, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    deliveryArea: { type: geoPointSchema, required: true },
    status: { type: String, enum: ['active', 'fulfilled', 'expired', 'cancelled'], default: 'active', required: true },
    neededBy: Date,
  },
  { timestamps: true },
)

requirementSchema.pre('validate', function () {
  if (this.quantityFulfilled + this.quantityReserved > this.quantityRequested) {
    this.invalidate('quantityFulfilled', 'Fulfilled and reserved quantities cannot exceed the requested quantity.')
  }
})

requirementSchema.index({ ngo: 1, status: 1 })
requirementSchema.index({ deliveryArea: '2dsphere' })
requirementSchema.index({ status: 1, priority: 1, neededBy: 1 })

export type Requirement = InferSchemaType<typeof requirementSchema>
export type RequirementDocument = HydratedDocument<Requirement>
export const RequirementModel = model<Requirement>('Requirement', requirementSchema)