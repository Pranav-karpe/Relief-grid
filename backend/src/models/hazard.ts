import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const hazardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    hazardType: {
      type: String,
      enum: [
        'flooded_road',
        'bridge_collapse',
        'landslide_debris',
        'fallen_tree_lines',
        'active_fire',
        'security_checkpoint',
        'other',
      ],
      default: 'flooded_road',
      required: true,
    },
    severity: {
      type: String,
      enum: ['caution', 'impassable_for_two_wheelers', 'impassable_all_vehicles', 'fatal_hazard'],
      default: 'impassable_all_vehicles',
      required: true,
    },
    location: { type: geoPointSchema, required: true },
    radiusMeters: { type: Number, default: 200, min: 10, max: 10000 },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['active', 'cleared', 'verified'],
      default: 'active',
      required: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },
    clearedAt: Date,
  },
  { timestamps: true },
)

hazardSchema.index({ location: '2dsphere' })
hazardSchema.index({ status: 1, hazardType: 1, createdAt: -1 })

export type Hazard = InferSchemaType<typeof hazardSchema>
export type HazardDocument = HydratedDocument<Hazard>
export const HazardModel = model<Hazard>('Hazard', hazardSchema)

