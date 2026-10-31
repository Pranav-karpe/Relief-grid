import { Schema } from 'mongoose'

export const userRoles = ['citizen', 'donor', 'volunteer', 'ngo', 'admin'] as const
export type UserRole = (typeof userRoles)[number]

export const accountStatuses = ['pending', 'active', 'suspended', 'closed'] as const
export type AccountStatus = (typeof accountStatuses)[number]

export const verificationStatuses = ['not_submitted', 'pending', 'under_review', 'verified', 'rejected', 'suspended'] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

export const geoPointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          value.length === 2 &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: 'Coordinates must be [longitude, latitude].',
      },
    },
  },
  { _id: false },
)

export type GeoPoint = {
  type: 'Point'
  coordinates: [number, number]
}

export const referenceSchema = {
  type: Schema.Types.ObjectId,
  ref: 'User',
}