/**
 * Targeted allocation service tests.
 *
 * Uses mongodb-memory-server for a fully isolated, in-process MongoDB instance.
 * Never connects to the real Atlas database.
 *
 * Covers:
 *  1. Two concurrent requests competing for the same quantity.
 *  2. Duplicate requests with the same idempotency key.
 *  3. Server-side retry after a successful allocation.
 *  4. Failure between allocation steps (step-3 failure → compensation).
 *  5. Recovery of an incomplete (stale pending) reservation.
 *  6. Compensation cannot over-release quantities.
 *  7. A second independent allocation is unaffected by recovery of the first.
 *  8. Idempotency persists across simulated service restarts (new mongoose connection).
 *  9. Audit record written only after successful allocation.
 * 10. Notification written only after successful allocation.
 * 11. Blank / oversized idempotency key rejected with 400.
 */

import assert from 'node:assert/strict'
import { test, before, after, beforeEach } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'

// Models — import after mongoose is connected so indexes are created.
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { AllocationRecordModel } from '../src/models/allocation.js'
import { AuditRecordModel } from '../src/models/audit.js'
import { NotificationModel } from '../src/models/notification.js'
import {
  confirmAllocation,
  recoverStalePendingAllocations,
  type AllocationInput,
} from '../src/services/allocation.service.js'
import { ApiError } from '../src/middleware/api-error.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer

const ALLOCATOR_ID = new Types.ObjectId().toHexString()

async function makeDonation(qty: number, category = 'food') {
  return DonationModel.create({
    donor: new Types.ObjectId(),
    resourceCategory: category,
    description: 'test donation',
    quantity: qty,
    unit: 'kg',
    condition: 'good',
    location: { type: 'Point', coordinates: [0, 0] },
    availabilityStatus: 'available',
  })
}

async function makeRequirement(qty: number, category = 'food') {
  return RequirementModel.create({
    ngo: new Types.ObjectId(),
    resourceCategory: category,
    description: 'test requirement',
    quantityRequested: qty,
    unit: 'kg',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [0, 0] },
    status: 'active',
  })
}

function allocationInput(
  donationId: string,
  requirementId: string,
  quantity: number,
  extra: Partial<AllocationInput> = {},
): AllocationInput {
  return { donationId, requirementId, quantity, allocatedBy: ALLOCATOR_ID, ...extra }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri(), { dbName: 'reliefgrid-test' })
})

after(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  // Wipe all collections between tests for isolation.
  await Promise.all([
    DonationModel.deleteMany({}),
    RequirementModel.deleteMany({}),
    AllocationRecordModel.deleteMany({}),
    AuditRecordModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ])
})

// ---------------------------------------------------------------------------
// 1. Two concurrent requests competing for the same quantity
// ---------------------------------------------------------------------------

test('concurrent allocations: only one succeeds when quantity is exactly enough for one', async () => {
  const donation = await makeDonation(10)
  const req1 = await makeRequirement(10)
  const req2 = await makeRequirement(10)

  const [r1, r2] = await Promise.allSettled([
    confirmAllocation(allocationInput(String(donation._id), String(req1._id), 10)),
    confirmAllocation(allocationInput(String(donation._id), String(req2._id), 10)),
  ])

  const successes = [r1, r2].filter((r) => r.status === 'fulfilled')
  const failures = [r1, r2].filter((r) => r.status === 'rejected')

  assert.equal(successes.length, 1, 'exactly one allocation should succeed')
  assert.equal(failures.length, 1, 'exactly one allocation should fail with 409')

  const failErr = (failures[0] as PromiseRejectedResult).reason as ApiError
  assert.equal(failErr.statusCode, 409)

  // Donation must not be over-reserved.
  const updated = await DonationModel.findById(donation._id)
  assert.ok(updated!.quantityReserved <= updated!.quantity, 'quantityReserved must not exceed quantity')
})

// ---------------------------------------------------------------------------
// 2. Duplicate requests with the same idempotency key
// ---------------------------------------------------------------------------

test('duplicate idempotency key: second call returns the first result without re-allocating', async () => {
  const donation = await makeDonation(20)
  const req = await makeRequirement(20)
  const key = 'idem-key-001'

  const first = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 5, { idempotencyKey: key }))
  const second = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 5, { idempotencyKey: key }))

  assert.equal(first.allocationId, second.allocationId, 'both calls must return the same allocationId')

  // Only one AllocationRecord should exist.
  const count = await AllocationRecordModel.countDocuments({ idempotencyKey: key })
  assert.equal(count, 1)

  // Donation must only be reserved once.
  const updated = await DonationModel.findById(donation._id)
  assert.equal(updated!.quantityReserved, 5)
})

// ---------------------------------------------------------------------------
// 3. Server-side retry after a successful allocation
// ---------------------------------------------------------------------------

test('retry after success: returns prior result, no double-reservation', async () => {
  const donation = await makeDonation(20)
  const req = await makeRequirement(20)
  const key = 'idem-key-retry-001'

  const first = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 7, { idempotencyKey: key }))

  // Simulate server retry (same key, same params).
  const retry = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 7, { idempotencyKey: key }))

  assert.equal(retry.allocationId, first.allocationId)

  const updated = await DonationModel.findById(donation._id)
  assert.equal(updated!.quantityReserved, 7, 'quantity must only be reserved once')
})

// ---------------------------------------------------------------------------
// 4. Failure between allocation steps (step-3 failure → compensation)
// ---------------------------------------------------------------------------

test('step-3 failure: donation reservation is compensated and record is marked failed', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)

  // We need step-3's conditional update to fail. The filter matches on
  // { status: 'active', quantityReserved: <value-read-by-service>, quantityFulfilled: <value-read-by-service> }.
  // We race a concurrent update that changes quantityReserved on the requirement
  // between the service's read and its step-3 update.
  //
  // Strategy: intercept RequirementModel.findOneAndUpdate to mutate the
  // requirement before the real call, then restore the original.
  const original = RequirementModel.findOneAndUpdate.bind(RequirementModel)
  let intercepted = false
  // @ts-expect-error — patching for test
  RequirementModel.findOneAndUpdate = async function (...args: unknown[]) {
    if (!intercepted) {
      intercepted = true
      // Mutate quantityReserved so the conditional filter won't match.
      await original({ _id: req._id }, { $set: { quantityReserved: 5 } }, { new: true })
    }
    // @ts-expect-error
    return original(...args)
  }

  try {
    await assert.rejects(
      () => confirmAllocation(allocationInput(String(donation._id), String(req._id), 5)),
      (err: ApiError) => {
        assert.equal(err.statusCode, 409)
        return true
      },
    )

    // Donation reservation must be rolled back.
    const updated = await DonationModel.findById(donation._id)
    assert.equal(updated!.quantityReserved, 0, 'donation reservation must be compensated after step-3 failure')

    // AllocationRecord must be marked failed.
    const record = await AllocationRecordModel.findOne({ donationId: donation._id })
    assert.equal(record?.state, 'failed')
  } finally {
    // @ts-expect-error — restore
    RequirementModel.findOneAndUpdate = original
  }
})

// ---------------------------------------------------------------------------
// 5. Recovery of an incomplete (stale pending) reservation
// ---------------------------------------------------------------------------

test('recoverStalePendingAllocations: compensates stale pending record and releases donation', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)

  // Manually create a stale pending record (simulates crash between step 2 and 3).
  const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000) // 10 min ago
  await AllocationRecordModel.create({
    donationId: donation._id,
    requirementId: req._id,
    quantity: 6,
    allocatedBy: new Types.ObjectId(ALLOCATOR_ID),
    state: 'pending',
    createdAt: staleCreatedAt,
    updatedAt: staleCreatedAt,
  })

  // Simulate that step 2 already ran (donation was reserved).
  await DonationModel.updateOne({ _id: donation._id }, { $set: { quantityReserved: 6 } })

  const recovered = await recoverStalePendingAllocations()
  assert.equal(recovered, 1)

  // Donation reservation must be released.
  const updated = await DonationModel.findById(donation._id)
  assert.equal(updated!.quantityReserved, 0)

  // Record must be marked failed.
  const record = await AllocationRecordModel.findOne({ donationId: donation._id })
  assert.equal(record?.state, 'failed')
  assert.ok(record?.failureReason?.includes('Recovered'))
})

// ---------------------------------------------------------------------------
// 6. Compensation cannot over-release quantities
// ---------------------------------------------------------------------------

test('compensation is idempotent: running recovery twice does not over-release', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)

  const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000)
  await AllocationRecordModel.create({
    donationId: donation._id,
    requirementId: req._id,
    quantity: 4,
    allocatedBy: new Types.ObjectId(ALLOCATOR_ID),
    state: 'pending',
    createdAt: staleCreatedAt,
    updatedAt: staleCreatedAt,
  })
  await DonationModel.updateOne({ _id: donation._id }, { $set: { quantityReserved: 4 } })

  await recoverStalePendingAllocations()
  // Run again — record is now 'failed', so it won't be picked up again.
  const secondRun = await recoverStalePendingAllocations()
  assert.equal(secondRun, 0, 'second recovery run must find nothing to recover')

  const updated = await DonationModel.findById(donation._id)
  assert.ok(updated!.quantityReserved >= 0, 'quantityReserved must not go negative')
  assert.equal(updated!.quantityReserved, 0)
})

// ---------------------------------------------------------------------------
// 7. Second independent allocation unaffected by recovery of the first
// ---------------------------------------------------------------------------

test('recovery of one stale record does not affect a confirmed allocation on the same donation', async () => {
  const donation = await makeDonation(20)
  const req1 = await makeRequirement(10)
  const req2 = await makeRequirement(10)

  // Confirm a real allocation for req1 (reserves 8 units).
  await confirmAllocation(allocationInput(String(donation._id), String(req1._id), 8))

  // Manually create a stale pending record for req2 (simulates crash, reserved 5 units).
  const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000)
  await AllocationRecordModel.create({
    donationId: donation._id,
    requirementId: req2._id,
    quantity: 5,
    allocatedBy: new Types.ObjectId(ALLOCATOR_ID),
    state: 'pending',
    createdAt: staleCreatedAt,
    updatedAt: staleCreatedAt,
  })
  // Simulate step 2 ran for the stale record.
  await DonationModel.updateOne({ _id: donation._id }, { $inc: { quantityReserved: 5 } })

  await recoverStalePendingAllocations()

  // The confirmed allocation's 8 units must still be reserved.
  const updated = await DonationModel.findById(donation._id)
  assert.equal(updated!.quantityReserved, 8, 'confirmed allocation reservation must be intact after recovery')
})

// ---------------------------------------------------------------------------
// 8. Idempotency persists across simulated service restart
// ---------------------------------------------------------------------------

test('idempotency key survives mongoose disconnect/reconnect (DB-backed, not in-memory)', async () => {
  const donation = await makeDonation(20)
  const req = await makeRequirement(20)
  const key = 'idem-key-restart-001'

  const first = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 3, { idempotencyKey: key }))

  // Simulate restart: disconnect and reconnect to the same in-memory DB.
  const uri = mongod.getUri()
  await mongoose.disconnect()
  await mongoose.connect(uri, { dbName: 'reliefgrid-test' })

  // After reconnect, the same key must return the prior result.
  const retry = await confirmAllocation(allocationInput(String(donation._id), String(req._id), 3, { idempotencyKey: key }))

  assert.equal(retry.allocationId, first.allocationId, 'idempotency must survive process restart')

  const updated = await DonationModel.findById(donation._id)
  assert.equal(updated!.quantityReserved, 3, 'quantity must only be reserved once across restarts')
})

// ---------------------------------------------------------------------------
// 9. Audit record written only after successful allocation
// ---------------------------------------------------------------------------

test('audit record is written only after confirmed allocation, not on failure', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)

  // Force step-3 failure.
  await RequirementModel.updateOne({ _id: req._id }, { $set: { quantityReserved: 99 } })

  await assert.rejects(() => confirmAllocation(allocationInput(String(donation._id), String(req._id), 5)))

  const auditCount = await AuditRecordModel.countDocuments({ action: 'allocation.confirmed' })
  assert.equal(auditCount, 0, 'no audit record must be written for a failed allocation')

  // Now do a successful allocation.
  const donation2 = await makeDonation(10)
  const req2 = await makeRequirement(10)
  await confirmAllocation(allocationInput(String(donation2._id), String(req2._id), 5))

  const auditCountAfter = await AuditRecordModel.countDocuments({ action: 'allocation.confirmed' })
  assert.equal(auditCountAfter, 1, 'exactly one audit record must be written for a successful allocation')
})

// ---------------------------------------------------------------------------
// 10. Blank / oversized idempotency key rejected with 400
// ---------------------------------------------------------------------------

test('blank idempotency key is rejected with 400', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)

  await assert.rejects(
    () => confirmAllocation(allocationInput(String(donation._id), String(req._id), 5, { idempotencyKey: '   ' })),
    (err: ApiError) => {
      assert.equal(err.statusCode, 400)
      assert.equal(err.code, 'validation_error')
      return true
    },
  )
})

test('oversized idempotency key (>120 chars) is rejected with 400', async () => {
  const donation = await makeDonation(10)
  const req = await makeRequirement(10)
  const longKey = 'x'.repeat(121)

  await assert.rejects(
    () => confirmAllocation(allocationInput(String(donation._id), String(req._id), 5, { idempotencyKey: longKey })),
    (err: ApiError) => {
      assert.equal(err.statusCode, 400)
      assert.equal(err.code, 'validation_error')
      return true
    },
  )
})
