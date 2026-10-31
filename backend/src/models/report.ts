import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { geoPointSchema } from './common.js'

const resourceRequestSchema = new Schema(
  {
    category: { type: String, required: true, trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false },
)

const riskAssessmentSchema = new Schema(
  {
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'requires_manual_review'],
      default: 'low',
    },
    riskScore: { type: Number, default: 10, min: 0, max: 100 },
    explanation: { type: String, maxlength: 1000 },
    flags: { type: [String], default: [] },
    possibleDuplicates: [{ type: Schema.Types.ObjectId, ref: 'Report' }],
    suggestedAction: { type: String, maxlength: 500 },
    evaluatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const timelineEventSchema = new Schema(
  {
    stage: { type: String, required: true },
    label: { type: String },
    title: { type: String },
    description: { type: String },
    actorRole: { type: String },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
)

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    needCategory: { type: String, required: true, trim: true, maxlength: 80 },
    location: { type: geoPointSchema, required: true },
    affectedPersonCount: { type: Number, min: 0 },
    requestedResources: { type: [resourceRequestSchema], default: [] },
    urgency: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'verified', 'matched', 'allocated', 'volunteer_assigned', 'in_transit', 'delivered_pending_confirmation', 'rejected', 'resolved'],
      default: 'submitted',
      required: true,
    },
    evidenceRefs: { type: [String], default: [] },
    riskAssessment: { type: riskAssessmentSchema },
    timeline: { type: [timelineEventSchema], default: [] },
    deliveryTask: { type: Schema.Types.ObjectId, ref: 'VolunteerTask' },
    assignedNgo: { type: Schema.Types.ObjectId, ref: 'User' },
    review: {
      reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
      note: { type: String, maxlength: 2000 },
    },
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
)

reportSchema.index({ location: '2dsphere' })
reportSchema.index({ status: 1, urgency: 1, createdAt: -1 })
reportSchema.index({ reporter: 1, createdAt: -1 })
reportSchema.index({ 'riskAssessment.riskLevel': 1 })

export type Report = InferSchemaType<typeof reportSchema>
export type ReportDocument = HydratedDocument<Report>
export const ReportModel = model<Report>('Report', reportSchema)
