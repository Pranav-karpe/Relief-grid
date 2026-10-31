import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { accountStatuses, userRoles, verificationStatuses, geoPointSchema } from './common.js'

const userSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 30 },
    role: { type: String, enum: userRoles, required: true },
    accountStatus: { type: String, enum: accountStatuses, default: 'pending', required: true },
    emailVerified: { type: Boolean, default: false, required: true },
    auth: {
      passwordHash: { type: String, select: false },
      emailVerificationTokenHash: { type: String, select: false },
      emailVerificationExpiresAt: { type: Date, select: false },
    },
    organizationProfile: {
      name: { type: String, trim: true, maxlength: 160 },
      registrationNumber: { type: String, trim: true, maxlength: 100 },
      darpanId: { type: String, trim: true, maxlength: 100 },
      contactPhone: { type: String, trim: true, maxlength: 30 },
      website: { type: String, trim: true, maxlength: 200 },
      verificationStatus: { type: String, enum: verificationStatuses, default: 'not_submitted' },
      verifiedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      rejectionReason: { type: String, maxlength: 2000 },
    },
    volunteerProfile: {
      phone: { type: String, trim: true, maxlength: 30 },
      skills: { type: [String], default: [] },
      availability: { type: String, enum: ['available', 'busy', 'unavailable'], default: 'available' },
      generalLocation: { type: geoPointSchema },
      serviceRadiusKm: { type: Number, default: 10, min: 1, max: 100 },
      areas: { type: [String], default: [] },
      experience: { type: String, maxlength: 2000 },
      verificationStatus: { type: String, enum: verificationStatuses, default: 'pending' },
      verifiedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      rejectionReason: { type: String, maxlength: 2000 },
      currentWorkload: { type: Number, default: 0, min: 0 },
      affiliation: { type: String, enum: ['independent', 'ngo'], default: 'independent' },
      affiliatedNgo: { type: Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true },
)

userSchema.index({ role: 1, accountStatus: 1 })
userSchema.index({ 'volunteerProfile.generalLocation': '2dsphere' })
userSchema.index({ 'volunteerProfile.verificationStatus': 1, 'volunteerProfile.availability': 1 })
userSchema.index({ 'organizationProfile.verificationStatus': 1 })

export type User = InferSchemaType<typeof userSchema>
export type UserDocument = HydratedDocument<User>
export type SafeUser = Omit<User, 'auth'>
export const UserModel = model<User>('User', userSchema)
