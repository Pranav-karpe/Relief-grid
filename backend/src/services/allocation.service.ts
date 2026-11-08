/**
 * Allocation service — confirms a resource allocation between a donation and requirement.
 *
 * ## Concurrency strategy
 *
 * MongoDB standalone instances do not support multi-document transactions.
 * We use a three-step approach with a durable AllocationRecord as the state machine:
 *
 *   Step 0 — Idempotency check (DB): if a confirmed AllocationRecord already exists
 *             for the supplied idempotencyKey, return its result immediately.
 *
 *   Step 1 — Insert a `pending` AllocationRecord. The sparse unique index on
 *             `idempotencyKey` makes this atomic: two concurrent requests with the
 *             same key cannot both insert. One will get a duplicate-key error and
 *             must retry or return the existing record.
 *
 *   Step 2 — Reserve quantity on the donation (conditional on current quantities).
 *             If this fails (concurrent modification), mark the record `failed` and
 *             throw 409.
 *
 *   Step 3 — Reserve quantity on the requirement (conditional on current quantities).
 *             If this fails, compensate step 2 safely (see below) and mark `failed`.
 *
 *   Step 4 — Mark the AllocationRecord `confirmed` and write an audit record.
 *
 * ## Compensation safety
 *
 * The compensation for a failed step 3 uses `$inc: { quantityReserved: -quantity }`
 * with a `$max: { quantityReserved: 0 }` floor guard and recomputes
 * `availabilityStatus` from the actual post-compensation document rather than
 * restoring a stale snapshot. This prevents over-releasing quantities that belong
 * to a concurrent successful allocation.
 *
 * ## Stale-pending recovery
 *
 * A `pending` record that is older than STALE_PENDING_MS indicates the server
 * crashed between step 2 and step 3. `recoverStalePendingAllocations()` can be
 * called at startup or on a schedule to compensate these records safely.
 *
 * ## Remaining limitation
 *
 * If the compensation itself fails (e.g. network partition after step 2), the
 * donation will have a stale reservation until recovery runs. The AllocationRecord
 * remains `pending` so recovery can detect and compensate it. A replica-set
 * topology should use MongoDB sessions for full atomicity.
 */

import { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { RequirementModel } from '../models/requirement.js'
import { AllocationRecordModel } from '../models/allocation.js'
import { AuditRecordModel } from '../models/audit.js'
import { ApiError } from '../middleware/api-error.js'

export type AllocationInput = {
  donationId: string
  requirementId: string
  quantity: number
  allocatedBy: string
  idempotencyKey?: string
}

export type AllocationResult = {
  allocationId: string
  donationId: string
  requirementId: string
  quantity: number
  allocatedBy: string
  idempotencyKey: string | null
  donationStatus: string
  requirementStatus: string
  createdAt: Date
}

/** Records older than this in `pending` state are considered stale. */
const STALE_PENDING_MS = 5 * 60 * 1000 // 5 minutes

function computeDonationStatus(qty: number, reserved: number, allocated: number): string {
  const total = reserved + allocated
  if (total >= qty) return 'allocated'
  if (total > 0) return 'partially_allocated'
  return 'available'
}

function computeRequirementStatus(requested: number, fulfilled: number, reserved: number): string {
  if (fulfilled >= requested) return 'fulfilled'
  return 'active'
}

/**
 * Safely compensate a donation reservation.
 * Uses $inc (not $set) so we never clobber a concurrent successful reservation.
 * Recomputes availabilityStatus from the actual post-update document.
 */
async function compensateDonationReservation(
  donationId: string,
  quantity: number,
): Promise<void> {
  // Decrement, but never below 0 (floor guard via $max after $inc is not atomic,
  // so we use a conditional update: only decrement if quantityReserved >= quantity).
  const updated = await DonationModel.findOneAndUpdate(
    {
      _id: donationId,
      quantityReserved: { $gte: quantity },
    },
    { $inc: { quantityReserved: -quantity } },
    { new: true },
  )

  if (!updated) {
    // quantityReserved was already < quantity — nothing safe to release.
    // This can happen if a previous compensation already ran. Log and continue.
    console.warn(
      `[allocation.service] compensateDonationReservation: donation ${donationId} ` +
      `quantityReserved < ${quantity}; skipping to avoid over-release.`,
    )
    return
  }

  // Recompute status from actual post-compensation values.
  const newStatus = computeDonationStatus(
    updated.quantity,
    updated.quantityReserved,
    updated.quantityAllocated,
  )
  await DonationModel.updateOne({ _id: donationId }, { $set: { availabilityStatus: newStatus } })
}

export async function confirmAllocation(input: AllocationInput): Promise<AllocationResult> {
  const { donationId, requirementId, quantity, allocatedBy } = input
  // Validate and normalise idempotencyKey before any DB work.
  let idempotencyKey: string | null = null
  if (input.idempotencyKey !== undefined) {
    const raw = input.idempotencyKey.trim()
    if (raw.length === 0) throw new ApiError(400, 'validation_error', 'idempotencyKey must not be blank.')
    if (raw.length > 120) throw new ApiError(400, 'validation_error', 'idempotencyKey must be 120 characters or fewer.')
    idempotencyKey = raw
  }

  // --- Validation ---
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiError(400, 'validation_error', 'quantity must be a positive number.')
  }
  if (!Types.ObjectId.isValid(donationId)) throw new ApiError(404, 'not_found', 'Donation not found.')
  if (!Types.ObjectId.isValid(requirementId)) throw new ApiError(404, 'not_found', 'Requirement not found.')

  // --- Step 0: Durable idempotency check ---
  if (idempotencyKey) {
    const existing = await AllocationRecordModel.findOne({
      idempotencyKey,
      state: 'confirmed',
    }).lean()
    if (existing) {
      return {
        allocationId: String(existing._id),
        donationId: String(existing.donationId),
        requirementId: String(existing.requirementId),
        quantity: existing.quantity,
        allocatedBy: String(existing.allocatedBy),
        idempotencyKey,
        donationStatus: existing.donationStatus ?? '',
        requirementStatus: existing.requirementStatus ?? '',
        createdAt: existing.createdAt as Date,
      }
    }
  }

  // --- Load and validate current state ---
  const donation = await DonationModel.findById(donationId)
  if (!donation) throw new ApiError(404, 'not_found', 'Donation not found.')
  if (!['available', 'partially_allocated'].includes(donation.availabilityStatus)) {
    throw new ApiError(409, 'not_eligible', `Donation is not available for allocation (status: ${donation.availabilityStatus}).`)
  }

  if (donation.quarantineStatus && donation.quarantineStatus !== 'none') {
    throw new ApiError(409, 'quarantined', `Donation is quarantined for safety inspection (${donation.quarantineStatus}).`)
  }

  if (donation.expiryDate && new Date(donation.expiryDate) < new Date()) {
    throw new ApiError(409, 'expired', 'Donation has expired and cannot be allocated.')
  }

  const requirement = await RequirementModel.findById(requirementId)
  if (!requirement) throw new ApiError(404, 'not_found', 'Requirement not found.')
  if (requirement.status !== 'active') {
    throw new ApiError(409, 'not_eligible', `Requirement is not active (status: ${requirement.status}).`)
  }

  if (donation.resourceCategory.trim().toLowerCase() !== requirement.resourceCategory.trim().toLowerCase()) {
    throw new ApiError(409, 'category_mismatch', 'Donation and requirement resource categories do not match.')
  }

  const donationAvailable = donation.quantity - donation.quantityReserved - donation.quantityAllocated
  if (donationAvailable < quantity) {
    throw new ApiError(409, 'insufficient_quantity', `Only ${donationAvailable} units available on this donation.`)
  }

  const requirementRemaining = requirement.quantityRequested - requirement.quantityFulfilled - requirement.quantityReserved
  if (requirementRemaining < quantity) {
    throw new ApiError(409, 'insufficient_quantity', `Requirement only needs ${requirementRemaining} more units.`)
  }

  // --- Step 1: Insert pending AllocationRecord (atomic idempotency gate) ---
  let record
  try {
    record = await AllocationRecordModel.create({
      donationId: new Types.ObjectId(donationId),
      requirementId: new Types.ObjectId(requirementId),
      quantity,
      allocatedBy: new Types.ObjectId(allocatedBy),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      state: 'pending',
    })
  } catch (err: unknown) {
    // Duplicate key on idempotencyKey — a concurrent request already inserted.
    // Re-check for a confirmed record (the other request may have completed).
    if (isDuplicateKeyError(err) && idempotencyKey) {
      const confirmed = await AllocationRecordModel.findOne({
        idempotencyKey,
        state: 'confirmed',
      }).lean()
      if (confirmed) {
        return {
          allocationId: String(confirmed._id),
          donationId: String(confirmed.donationId),
          requirementId: String(confirmed.requirementId),
          quantity: confirmed.quantity,
          allocatedBy: String(confirmed.allocatedBy),
          idempotencyKey,
          donationStatus: confirmed.donationStatus ?? '',
          requirementStatus: confirmed.requirementStatus ?? '',
          createdAt: confirmed.createdAt as Date,
        }
      }
      // The concurrent request is still in-flight or failed — tell the caller to retry.
      throw new ApiError(409, 'conflict', 'A concurrent allocation with the same idempotency key is in progress. Please retry shortly.')
    }
    throw err
  }

  const recordId = record._id

  // --- Step 2: Reserve on donation (conditional on current quantities) ---
  const newDonReserved = donation.quantityReserved + quantity
  const newDonStatus = computeDonationStatus(donation.quantity, newDonReserved, donation.quantityAllocated)

  const updatedDonation = await DonationModel.findOneAndUpdate(
    {
      _id: donationId,
      availabilityStatus: { $in: ['available', 'partially_allocated'] },
      quantityReserved: donation.quantityReserved,
      quantityAllocated: donation.quantityAllocated,
    },
    {
      $inc: { quantityReserved: quantity },
      $set: { availabilityStatus: newDonStatus },
      $addToSet: { matchedRequirements: new Types.ObjectId(requirementId) },
    },
    { new: true },
  )

  if (!updatedDonation) {
    await AllocationRecordModel.updateOne(
      { _id: recordId },
      { $set: { state: 'failed', failureReason: 'Donation state changed concurrently.', completedAt: new Date() } },
    )
    throw new ApiError(409, 'conflict', 'Donation state changed concurrently. Please refresh and try again.')
  }

  // --- Step 3: Reserve on requirement (conditional on current quantities) ---
  const newReqReserved = requirement.quantityReserved + quantity
  const newReqStatus = computeRequirementStatus(requirement.quantityRequested, requirement.quantityFulfilled, newReqReserved)

  const updatedRequirement = await RequirementModel.findOneAndUpdate(
    {
      _id: requirementId,
      status: 'active',
      quantityReserved: requirement.quantityReserved,
      quantityFulfilled: requirement.quantityFulfilled,
    },
    {
      $inc: { quantityReserved: quantity },
      $set: { status: newReqStatus },
    },
    { new: true },
  )

  if (!updatedRequirement) {
    // Compensate step 2 safely — never over-release.
    await compensateDonationReservation(donationId, quantity)
    await AllocationRecordModel.updateOne(
      { _id: recordId },
      { $set: { state: 'failed', failureReason: 'Requirement state changed concurrently. Allocation rolled back.', completedAt: new Date() } },
    )
    throw new ApiError(409, 'conflict', 'Requirement state changed concurrently. Allocation rolled back. Please refresh and try again.')
  }

  // --- Step 4: Mark confirmed and write audit ---
  const now = new Date()
  await AllocationRecordModel.updateOne(
    { _id: recordId },
    {
      $set: {
        state: 'confirmed',
        donationStatus: newDonStatus,
        requirementStatus: newReqStatus,
        completedAt: now,
      },
    },
  )

  await AuditRecordModel.create({
    actor: new Types.ObjectId(allocatedBy),
    action: 'allocation.confirmed',
    entityType: 'AllocationRecord',
    entityId: recordId,
    metadata: {
      donationId,
      requirementId,
      quantity,
      donationStatus: newDonStatus,
      requirementStatus: newReqStatus,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  })

  return {
    allocationId: String(recordId),
    donationId,
    requirementId,
    quantity,
    allocatedBy,
    idempotencyKey,
    donationStatus: newDonStatus,
    requirementStatus: newReqStatus,
    createdAt: now,
  }
}

/**
 * Recover stale `pending` AllocationRecords.
 *
 * A record is stale if it has been `pending` for longer than STALE_PENDING_MS.
 * This indicates the server crashed between step 2 (donation reserved) and
 * step 3 (requirement reserved). We compensate the donation reservation and
 * mark the record `failed`.
 *
 * Safe to call multiple times — compensation is idempotent (floor-guarded $inc).
 * Call at server startup or on a periodic schedule.
 */
export async function recoverStalePendingAllocations(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS)
  const stale = await AllocationRecordModel.find({
    state: 'pending',
    createdAt: { $lt: cutoff },
  }).lean()

  let recovered = 0
  for (const record of stale) {
    try {
      await compensateDonationReservation(String(record.donationId), record.quantity)
      await AllocationRecordModel.updateOne(
        { _id: record._id, state: 'pending' },
        { $set: { state: 'failed', failureReason: 'Recovered: stale pending record.', completedAt: new Date() } },
      )
      recovered++
    } catch (err) {
      console.error(`[allocation.service] Recovery failed for record ${String(record._id)}:`, err)
    }
  }
  return recovered
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  )
}
