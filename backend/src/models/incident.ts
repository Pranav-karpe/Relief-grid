import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const incidentNeedsSummarySchema = new Schema(
  {
    category: { type: String, required: true },
    totalQuantity: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true },
  },
  { _id: false },
)

const incidentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    incidentType: {
      type: String,
      enum: ['flood', 'earthquake', 'cyclone', 'landslide', 'fire', 'medical_outbreak', 'infrastructure_failure', 'other'],
      default: 'flood',
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'monitoring', 'contained', 'resolved'],
      default: 'active',
      required: true,
    },
    centroid: { type: geoPointSchema, required: true },
    radiusKm: { type: Number, default: 2.0, min: 0.1, max: 20.0 },
    linkedReports: [{ type: Schema.Types.ObjectId, ref: 'Report' }],
    managingNgos: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    totalAffectedPersons: { type: Number, default: 0, min: 0 },
    needsSummary: { type: [incidentNeedsSummarySchema], default: [] },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
)

incidentSchema.index({ centroid: '2dsphere' })
incidentSchema.index({ status: 1, severity: 1, createdAt: -1 })
incidentSchema.index({ linkedReports: 1 })

export type Incident = InferSchemaType<typeof incidentSchema>
export type IncidentDocument = HydratedDocument<Incident>
export const IncidentModel = model<Incident>('Incident', incidentSchema)

