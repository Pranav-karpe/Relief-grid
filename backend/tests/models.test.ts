import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Types } from 'mongoose'
import {
  DonationModel,
  NgoVerificationModel,
  ReportModel,
  RequirementModel,
  UserModel,
  VolunteerTaskModel,
} from '../src/models/index.js'

const userId = new Types.ObjectId()
const point = { type: 'Point' as const, coordinates: [72.8777, 19.076] as [number, number] }

test('User normalizes email and exposes the unique index', () => {
  const user = new UserModel({ displayName: 'Coordinator', email: 'COORDINATOR@EXAMPLE.ORG', role: 'citizen' })

  assert.equal(user.email, 'coordinator@example.org')
  assert.equal(UserModel.schema.path('email').options.unique, true)
  assert.equal(UserModel.schema.options.timestamps, true)
})

test('User rejects unsupported roles', async () => {
  const user = new UserModel({ displayName: 'Invalid', email: 'invalid@example.org', role: 'unknown' })

  await assert.rejects(user.validate(), /is not a valid enum value/)
})

test('Report requires a valid GeoJSON point and nonnegative counts', async () => {
  const report = new ReportModel({
    reporter: userId,
    title: 'Water shortage',
    description: 'Water is needed.',
    needCategory: 'water',
    location: point,
    affectedPersonCount: -1,
    urgency: 'high',
  })

  await assert.rejects(report.validate(), /Path `affectedPersonCount` .* less than minimum allowed value/)
  assert.equal(ReportModel.schema.indexes().some(([fields]) => fields.location === '2dsphere'), true)
})

test('Requirement and donation enforce quantity invariants', async () => {
  const requirement = new RequirementModel({
    ngo: userId,
    resourceCategory: 'water',
    description: 'Bottled water',
    quantityRequested: 10,
    quantityFulfilled: 8,
    quantityReserved: 3,
    unit: 'cases',
    priority: 'high',
    deliveryArea: point,
  })
  const donation = new DonationModel({
    donor: userId,
    resourceCategory: 'water',
    description: 'Bottled water',
    quantity: 10,
    quantityReserved: 6,
    quantityAllocated: 5,
    unit: 'cases',
    condition: 'new',
    location: point,
  })

  await assert.rejects(requirement.validate(), /cannot exceed the requested quantity/)
  await assert.rejects(donation.validate(), /cannot exceed the donated quantity/)
})

test('References, enums, timestamps and model exports are defined', () => {
  assert.equal(VolunteerTaskModel.schema.path('volunteer').options.ref, 'User')
  assert.equal(NgoVerificationModel.schema.path('ngo').options.ref, 'User')
  assert.equal(VolunteerTaskModel.schema.path('assignmentStatus').enumValues.includes('accepted'), true)
  assert.equal(VolunteerTaskModel.schema.options.timestamps, true)
  assert.equal(typeof ReportModel, 'function')
})