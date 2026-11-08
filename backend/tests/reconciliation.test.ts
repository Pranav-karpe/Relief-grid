import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { UserModel } from '../src/models/user.js'
import { RequirementModel } from '../src/models/requirement.js'
import { DonationModel } from '../src/models/donation.js'
import { AllocationRecordModel } from '../src/models/allocation.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { AuditRecordModel } from '../src/models/audit.js'
import { deliveryReconciliationService } from '../src/services/delivery-reconciliation.service.js'
import { confirmAllocation } from '../src/services/allocation.service.js'

let mongod: MongoMemoryServer
const NGO_ID = new Types.ObjectId().toHexString()
const VOLUNTEER_ID = new Types.ObjectId().toHexString()
const DONOR_ID = new Types.ObjectId().toHexString()

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  await UserModel.create([
    {
      _id: new Types.ObjectId(NGO_ID),
      email: 'reconcile-ngo@test.org',
      passwordHash: 'hash',
      role: 'ngo',
      displayName: 'Aid Foundation',
      accountStatus: 'active',
      ngoVerificationStatus: 'verified',
    },
    {
      _id: new Types.ObjectId(VOLUNTEER_ID),
      email: 'reconcile-vol@test.org',
      passwordHash: 'hash',
      role: 'volunteer',
      displayName: 'Field Driver',
      accountStatus: 'active',
      volunteerProfile: { currentWorkload: 1 },
    },
    {
      _id: new Types.ObjectId(DONOR_ID),
      email: 'reconcile-donor@test.org',
      passwordHash: 'hash',
      role: 'donor',
      displayName: 'Pharma Donor',
      accountStatus: 'active',
    },
  ])
})

after(async () => {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

test('ReconcileDelivery correctly reconciles partial delivery deficit across Task, Requirement, Donation, and AllocationRecord', async () => {
  const requirement = await RequirementModel.create({
    ngo: new Types.ObjectId(NGO_ID),
    resourceCategory: 'medical_supplies',
    description: 'First aid emergency packs',
    quantityRequested: 50,
    quantityFulfilled: 0,
    quantityReserved: 20,
    unit: 'kits',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [72.87, 19.07] },
    status: 'active',
  })

  const donation = await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    resourceCategory: 'medical_supplies',
    description: 'First aid kits batch 1',
    quantity: 50,
    quantityReserved: 20,
    quantityAllocated: 0,
    unit: 'kits',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.85, 19.05] },
    availabilityStatus: 'partially_allocated',
  })

  const allocationRecord = await AllocationRecordModel.create({
    donationId: donation._id,
    requirementId: requirement._id,
    quantity: 20,
    allocatedBy: new Types.ObjectId(NGO_ID),
    state: 'confirmed',
  })

  const task = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOLUNTEER_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    requirement: requirement._id,
    donation: donation._id,
    quantityTarget: 20,
    quantityRemaining: 20,
    assignedLocation: { type: 'Point', coordinates: [72.87, 19.07] },
    taskDetails: 'Deliver 20 kits to relief station',
    assignmentStatus: 'accepted',
    deliveryStatus: 'delivered_pending_confirmation',
    confirmationStatus: 'awaiting_confirmation',
  })

  // Deliver 16 out of 20 with 4 damaged in transit
  const result = await deliveryReconciliationService.reconcileDelivery({
    taskId: String(task._id),
    callerUserId: NGO_ID,
    action: 'confirm',
    deliveredQuantity: 16,
    discrepancyReason: 'damaged_in_transit',
    notes: '4 kits damaged due to water ingress during road transit.',
  })

  assert.equal(result.reconciled, true)
  assert.equal(result.alreadyReconciled, false)
  assert.equal(result.quantityTarget, 20)
  assert.equal(result.quantityDelivered, 16)
  assert.equal(result.quantityRemaining, 4)
  assert.equal(result.discrepancyReason, 'damaged_in_transit')

  // Verify task status
  const updatedTask = await VolunteerTaskModel.findById(task._id)
  assert.equal(updatedTask?.confirmationStatus, 'confirmed')
  assert.equal(updatedTask?.deliveryStatus, 'delivered')
  assert.equal(updatedTask?.reconciliationStatus, 'reconciled')
  assert.equal(updatedTask?.quantityDelivered, 16)
  assert.equal(updatedTask?.quantityRemaining, 4)

  // Verify Requirement: fulfilled increased by 16, reserved decremented by 20
  const updatedReq = await RequirementModel.findById(requirement._id)
  assert.equal(updatedReq?.quantityFulfilled, 16)
  assert.equal(updatedReq?.quantityReserved, 0)
  assert.equal(updatedReq?.status, 'active', 'Requirement still active since 16 < 50')

  // Verify Donation: allocated increased by 16, reserved decremented by 20 (4 units freed back to available)
  const updatedDon = await DonationModel.findById(donation._id)
  assert.equal(updatedDon?.quantityAllocated, 16)
  assert.equal(updatedDon?.quantityReserved, 0)
  assert.equal(updatedDon?.availabilityStatus, 'partially_allocated')

  // Verify AllocationRecord ledger update
  const updatedAlloc = await AllocationRecordModel.findById(allocationRecord._id)
  assert.ok(updatedAlloc?.reconciliation)
  assert.equal(updatedAlloc?.reconciliation?.quantityDelivered, 16)
  assert.equal(updatedAlloc?.reconciliation?.quantityDeficit, 4)
  assert.equal(updatedAlloc?.reconciliation?.discrepancyReason, 'damaged_in_transit')

  // Verify AuditRecord was created
  const audit = await AuditRecordModel.findOne({
    action: 'delivery.reconciled',
    entityId: task._id,
  })
  assert.ok(audit)
  assert.equal(audit.metadata.quantityDelivered, 16)
  assert.equal(audit.metadata.quantityRemaining, 4)
})

test('ReconcileDelivery is idempotent and prevents duplicate inventory modifications', async () => {
  const requirement = await RequirementModel.create({
    ngo: new Types.ObjectId(NGO_ID),
    resourceCategory: 'drinking_water',
    description: 'Bottled water cases',
    quantityRequested: 10,
    quantityFulfilled: 0,
    quantityReserved: 10,
    unit: 'cases',
    priority: 'critical',
    deliveryArea: { type: 'Point', coordinates: [72.87, 19.07] },
    status: 'active',
  })

  const task = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOLUNTEER_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    requirement: requirement._id,
    quantityTarget: 10,
    quantityRemaining: 10,
    assignedLocation: { type: 'Point', coordinates: [72.87, 19.07] },
    taskDetails: 'Deliver 10 cases of water',
    assignmentStatus: 'accepted',
    deliveryStatus: 'delivered_pending_confirmation',
    confirmationStatus: 'awaiting_confirmation',
  })

  // First confirmation
  const first = await deliveryReconciliationService.reconcileDelivery({
    taskId: String(task._id),
    callerUserId: NGO_ID,
    action: 'confirm',
    deliveredQuantity: 10,
  })
  assert.equal(first.reconciled, true)
  assert.equal(first.alreadyReconciled, false)

  const reqAfterFirst = await RequirementModel.findById(requirement._id)
  assert.equal(reqAfterFirst?.quantityFulfilled, 10)
  assert.equal(reqAfterFirst?.status, 'fulfilled')

  // Duplicate submission with same task
  const second = await deliveryReconciliationService.reconcileDelivery({
    taskId: String(task._id),
    callerUserId: NGO_ID,
    action: 'confirm',
    deliveredQuantity: 10,
  })
  assert.equal(second.reconciled, true)
  assert.equal(second.alreadyReconciled, true, 'Subsequent confirmation must be marked alreadyReconciled')

  // Requirement quantities must remain unchanged (no double fulfillment)
  const reqAfterSecond = await RequirementModel.findById(requirement._id)
  assert.equal(reqAfterSecond?.quantityFulfilled, 10, 'Fulfillment must not be double counted')
})

test('Direct allocation safely rejects quarantined and expired donations', async () => {
  const reqDoc = await RequirementModel.create({
    ngo: new Types.ObjectId(NGO_ID),
    resourceCategory: 'baby_food',
    description: 'Infant formula tins',
    quantityRequested: 10,
    unit: 'tins',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [72.87, 19.07] },
    status: 'active',
  })

  const quarantinedDonation = await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    resourceCategory: 'baby_food',
    description: 'Infant formula batch suspect',
    quantity: 10,
    unit: 'tins',
    condition: 'good',
    quarantineStatus: 'quarantined_safety',
    location: { type: 'Point', coordinates: [72.85, 19.05] },
    availabilityStatus: 'available',
  })

  await assert.rejects(
    () =>
      confirmAllocation({
        donationId: String(quarantinedDonation._id),
        requirementId: String(reqDoc._id),
        quantity: 5,
        allocatedBy: NGO_ID,
      }),
    /quarantined for safety inspection/i,
  )

  const expiredDonation = await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    resourceCategory: 'baby_food',
    description: 'Infant formula expired yesterday',
    quantity: 10,
    unit: 'tins',
    condition: 'good',
    expiryDate: new Date(Date.now() - 24 * 3600 * 1000),
    quarantineStatus: 'none',
    location: { type: 'Point', coordinates: [72.85, 19.05] },
    availabilityStatus: 'available',
  })

  await assert.rejects(
    () =>
      confirmAllocation({
        donationId: String(expiredDonation._id),
        requirementId: String(reqDoc._id),
        quantity: 5,
        allocatedBy: NGO_ID,
      }),
    /expired and cannot be allocated/i,
  )
})
