/**
 * AllocationRecord model — durable record of every confirmed allocation.
 *
 * Dual purpose:
 *   1. Idempotency: the unique index on `idempotencyKey` (sparse) prevents two
 *      successful allocations from sharing the same key, even across restarts or
 *      multiple server instances.
 *   2. Audit trail: every confirmed allocation is recorded here in addition to
 *      the AuditRecord, giving a queryable allocation ledger.
 *
 * States:
 *   - `pending`   — step 1 (donation reservation) succeeded; step 2 not yet done.
 *   - `confirmed` — both steps succeeded; allocation is complete.
 *   - `failed`    — step 2 failed and compensation was attempted.
 *
 * The `pending` state enables recovery: a background process (or the next
 * request) can detect stale `pending` records and attempt compensation.
 * A record stays `pending` only if the server crashed between step 1 and step 2.
 */

import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'

const allocationRecordSchema = new Schema(
  {
    donationId: { type: Schema.Types.ObjectId, ref: 'Donation', required: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true },
    quantity: { type: Number, required: true, min: 1 },
    allocatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Caller-supplied idempotency key. Sparse unique index prevents duplicates. */
    idempotencyKey: { type: String, trim: true, maxlength: 120 },
    state: {
      type: String,
      enum: ['pending', 'confirmed', 'failed'],
      default: 'pending',
      required: true,
    },
    donationStatus: { type: String, trim: true, maxlength: 40 },
    requirementStatus: { type: String, trim: true, maxlength: 40 },
    /** ISO timestamp of when the record reached its terminal state. */
    completedAt: Date,
    /** Reason stored when state transitions to `failed`. */
    failureReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

// Sparse unique index: only rows that have an idempotencyKey are constrained.
// Two requests with the same key cannot both insert a confirmed record.
allocationRecordSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true },
)

// Support querying allocations by donation or requirement.
allocationRecordSchema.index({ donationId: 1, state: 1 })
allocationRecordSchema.index({ requirementId: 1, state: 1 })
// Support stale-pending recovery queries.
allocationRecordSchema.index({ state: 1, createdAt: 1 })

export type AllocationRecord = InferSchemaType<typeof allocationRecordSchema>
export type AllocationRecordDocument = HydratedDocument<AllocationRecord>
export const AllocationRecordModel = model<AllocationRecord>('AllocationRecord', allocationRecordSchema)
