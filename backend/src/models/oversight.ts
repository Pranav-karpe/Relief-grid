import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

const assessmentReportSchema = new Schema(
  {
    assessment: {
      type: String,
      enum: ['appears_valid', 'needs_attention', 'possible_duplicate', 'incomplete_information', 'unable_to_verify', 'potentially_suspicious'],
      required: true,
      default: 'needs_attention',
    },
    confidence: { type: Number, min: 0, max: 100, default: 50 },
    recommendation: { type: String, maxlength: 500 },
    fieldChecks: {
      requiredFields: { type: Boolean, default: true },
      validFormats: { type: Boolean, default: true },
      suspiciousCombinations: { type: Boolean, default: false },
    },
    duplicateChecks: {
      duplicateRegFound: { type: Boolean, default: false },
      duplicateNameFound: { type: Boolean, default: false },
      duplicateContactFound: { type: Boolean, default: false },
      matchingAccounts: { type: [String], default: [] },
    },
    registryChecks: {
      checkedAt: Date,
      sourcesChecked: { type: [String], default: [] },
      registryMatchFound: { type: Boolean, default: false },
      matchDetails: { type: String, maxlength: 1000 },
      inconclusive: { type: Boolean, default: false },
    },
    summary: { type: String, maxlength: 2000 },
    flags: { type: [String], default: [] },
  },
  { _id: false },
)

const verificationSchema = new Schema(
  {
    ngo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'under_review', 'approved', 'rejected', 'suspended'], default: 'pending', required: true },
    submittedEvidenceRefs: { type: [String], default: [] },
    submittedData: {
      name: { type: String, maxlength: 160 },
      registrationNumber: { type: String, maxlength: 100 },
      darpanId: { type: String, maxlength: 100 },
      contactPhone: { type: String, maxlength: 30 },
      website: { type: String, maxlength: 200 },
    },
    assessmentReport: { type: assessmentReportSchema },
    reason: { type: String, maxlength: 2000 },
    reviewedAt: Date,
  },
  { timestamps: true },
)

verificationSchema.index({ ngo: 1, status: 1, createdAt: -1 })
verificationSchema.index({ status: 1, createdAt: -1 })

const volunteerVerificationSchema = new Schema(
  {
    volunteer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'under_review', 'approved', 'verified', 'rejected', 'suspended'], default: 'pending', required: true },
    submittedData: {
      name: { type: String, maxlength: 120 },
      phone: { type: String, maxlength: 30 },
      skills: { type: [String], default: [] },
      serviceRadiusKm: { type: Number },
      experience: { type: String, maxlength: 2000 },
    },
    assessmentReport: {
      assessment: {
        type: String,
        enum: ['appears_valid', 'needs_attention', 'possible_duplicate', 'incomplete_information', 'unable_to_verify', 'potentially_suspicious'],
        default: 'appears_valid',
      },
      confidence: { type: Number, default: 80 },
      duplicateFound: { type: Boolean, default: false },
      matchingAccounts: { type: [String], default: [] },
      flags: { type: [String], default: [] },
      summary: { type: String, maxlength: 1000 },
    },
    reason: { type: String, maxlength: 2000 },
    reviewedAt: Date,
  },
  { timestamps: true },
)

volunteerVerificationSchema.index({ volunteer: 1, status: 1, createdAt: -1 })
volunteerVerificationSchema.index({ status: 1, createdAt: -1 })

const complaintSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subjectEntityType: { type: String, required: true, trim: true, maxlength: 80 },
    subjectEntityId: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['open', 'under_review', 'resolved', 'dismissed'], default: 'open', required: true },
    reason: { type: String, maxlength: 2000 },
    resolvedAt: Date,
  },
  { timestamps: true },
)

complaintSchema.index({ status: 1, createdAt: -1 })
complaintSchema.index({ subjectEntityType: 1, subjectEntityId: 1 })

export type NgoVerification = InferSchemaType<typeof verificationSchema>
export type NgoVerificationDocument = HydratedDocument<NgoVerification>
export type VolunteerVerification = InferSchemaType<typeof volunteerVerificationSchema>
export type VolunteerVerificationDocument = HydratedDocument<VolunteerVerification>
export type Complaint = InferSchemaType<typeof complaintSchema>
export type ComplaintDocument = HydratedDocument<Complaint>
export const NgoVerificationModel = model<NgoVerification>('NgoVerification', verificationSchema)
export const VolunteerVerificationModel = model<VolunteerVerification>('VolunteerVerification', volunteerVerificationSchema)
export const ComplaintModel = model<Complaint>('Complaint', complaintSchema)
