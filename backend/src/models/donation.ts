import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const donationSchema = new Schema(
  {
    donor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resourceCategory: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    quantity: { type: Number, required: true, min: 0 },
    quantityReserved: { type: Number, default: 0, min: 0 },
    quantityAllocated: { type: Number, default: 0, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    condition: { type: String, enum: ['new', 'good', 'fair', 'unknown'], required: true },
    expiryDate: Date,
    location: { type: geoPointSchema, required: true },
    availabilityStatus: { type: String, enum: ['available', 'reserved', 'partially_allocated', 'allocated', 'expired', 'cancelled'], default: 'available', required: true },
    matchedRequirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
  },
  { timestamps: true },
)

donationSchema.pre('validate', function () {
  if (this.quantityReserved + this.quantityAllocated > this.quantity) {
    this.invalidate('quantityReserved', 'Reserved and allocated quantities cannot exceed the donated quantity.')
  }
})

donationSchema.index({ location: '2dsphere' })
donationSchema.index({ donor: 1, availabilityStatus: 1 })
donationSchema.index({ resourceCategory: 1, availabilityStatus: 1, createdAt: -1 })

export type Donation = InferSchemaType<typeof donationSchema>
export type DonationDocument = HydratedDocument<Donation>
export const DonationModel = model<Donation>('Donation', donationSchema)