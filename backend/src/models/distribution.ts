import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const beneficiaryDistributionSchema = new Schema(
  {
    ngo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    beneficiaryIdHash: { type: String, required: true, index: true },
    beneficiaryInitials: { type: String, required: true, trim: true, maxlength: 10 },
    rationCategory: { type: String, required: true, trim: true, maxlength: 80 },
    quantityGiven: { type: Number, required: true, min: 0.1 },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
    campOrShelterName: { type: String, trim: true, maxlength: 120 },
    location: { type: geoPointSchema, required: true },
    distributedAt: { type: Date, default: Date.now, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

beneficiaryDistributionSchema.index({ beneficiaryIdHash: 1, rationCategory: 1, distributedAt: -1 })
beneficiaryDistributionSchema.index({ ngo: 1, distributedAt: -1 })
beneficiaryDistributionSchema.index({ location: '2dsphere' })

export type BeneficiaryDistribution = InferSchemaType<typeof beneficiaryDistributionSchema>
export type BeneficiaryDistributionDocument = HydratedDocument<BeneficiaryDistribution>
export const BeneficiaryDistributionModel = model<BeneficiaryDistribution>(
  'BeneficiaryDistribution',
  beneficiaryDistributionSchema,
)

