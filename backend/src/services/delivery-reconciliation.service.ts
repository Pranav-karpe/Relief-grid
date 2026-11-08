import { Types } from 'mongoose'
import { VolunteerTaskModel, type VolunteerTaskDocument } from '../models/task.js'
import { RequirementModel } from '../models/requirement.js'
import { DonationModel } from '../models/donation.js'
import { AllocationRecordModel } from '../models/allocation.js'
import { UserModel } from '../models/user.js'
import { ReportModel } from '../models/report.js'
import { AuditRecordModel } from '../models/audit.js'
import { ApiError } from '../middleware/api-error.js'

export type DiscrepancyReason =
  | 'none'
  | 'damaged_in_transit'
  | 'partial_recipient_capacity'
  | 'shortage_at_pickup'
  | 'transport_capacity_limit'
  | 'other'

export type ReconcileDeliveryInput = {
  taskId: string
  callerUserId: string
  action: 'confirm' | 'dispute'
  deliveredQuantity?: number
  discrepancyReason?: DiscrepancyReason
  notes?: string
}

export type ReconcileDeliveryResult = {
  task: VolunteerTaskDocument
  reconciled: boolean
  alreadyReconciled: boolean
  quantityTarget: number
  quantityDelivered: number
  quantityRemaining: number
  discrepancyReason: string
}

export class DeliveryReconciliationService {
  /**
   * Reconciles volunteer delivery and synchronizes inventory across Task, Requirement, Donation, and AllocationRecord.
   */
  public async reconcileDelivery(input: ReconcileDeliveryInput): Promise<ReconcileDeliveryResult> {
    const { taskId, callerUserId, action, notes } = input

    if (!Types.ObjectId.isValid(taskId)) {
      throw new ApiError(404, 'not_found', 'Task not found.')
    }

    const task = await VolunteerTaskModel.findById(taskId)
    if (!task) {
      throw new ApiError(404, 'not_found', 'Task not found.')
    }

    const isOwner =
      (task.assignedByNgo && task.assignedByNgo.toString() === callerUserId) ||
      (task.createdBy && task.createdBy.toString() === callerUserId)

    if (!isOwner) {
      throw new ApiError(403, 'forbidden', 'You can only confirm tasks assigned by your organisation.')
    }

    if (action === 'dispute') {
      task.confirmationStatus = 'disputed'
      task.confirmedAt = new Date()
      task.confirmedBy = new Types.ObjectId(callerUserId)
      task.confirmationNotes = notes || 'Delivery disputed by NGO'

      task.history.push({
        status: 'disputed',
        changedBy: new Types.ObjectId(callerUserId),
        changedAt: new Date(),
        reason: notes || 'Delivery disputed by NGO',
      })

      await task.save()

      if (task.report) {
        await ReportModel.findByIdAndUpdate(task.report, {
          $push: {
            timeline: {
              stage: 'disputed',
              title: 'Delivery Disputed by NGO',
              description: notes || 'NGO raised a dispute regarding the relief delivery.',
              timestamp: new Date(),
              actorRole: 'ngo',
            },
          },
        })
      }

      await AuditRecordModel.create({
        actor: new Types.ObjectId(callerUserId),
        action: 'delivery.disputed',
        entityType: 'VolunteerTask',
        entityId: task._id,
        metadata: {
          taskId,
          notes,
        },
      })

      return {
        task,
        reconciled: false,
        alreadyReconciled: false,
        quantityTarget: task.quantityTarget ?? 0,
        quantityDelivered: task.quantityDelivered ?? 0,
        quantityRemaining: task.quantityRemaining ?? 0,
        discrepancyReason: task.discrepancyReason ?? 'none',
      }
    }

    // --- Action: Confirm ---
    // Idempotency check: if already confirmed and reconciled, return immediately
    if (task.confirmationStatus === 'confirmed' && task.reconciliationStatus === 'reconciled') {
      return {
        task,
        reconciled: true,
        alreadyReconciled: true,
        quantityTarget: task.quantityTarget ?? 0,
        quantityDelivered: task.quantityDelivered ?? 0,
        quantityRemaining: task.quantityRemaining ?? 0,
        discrepancyReason: task.discrepancyReason ?? 'none',
      }
    }

    const targetQty = task.quantityTarget ?? task.quantityRemaining ?? 0
    let deliveredQty = targetQty

    if (input.deliveredQuantity !== undefined) {
      const parsedDelivered = Number(input.deliveredQuantity)
      if (!Number.isFinite(parsedDelivered) || parsedDelivered < 0) {
        throw new ApiError(400, 'validation_error', 'deliveredQuantity must be a non-negative number.')
      }
      if (targetQty > 0 && parsedDelivered > targetQty) {
        throw new ApiError(
          400,
          'validation_error',
          `deliveredQuantity (${parsedDelivered}) cannot exceed target quantity (${targetQty}).`,
        )
      }
      deliveredQty = parsedDelivered
    }

    const remainingDeficit = Math.max(0, targetQty - deliveredQty)
    const reason: DiscrepancyReason = input.discrepancyReason ?? (remainingDeficit > 0 ? 'other' : 'none')

    // 1. Reconcile Requirement quantities atomically
    if (task.requirement) {
      const requirement = await RequirementModel.findById(task.requirement)
      if (requirement) {
        const reservedToRelease = Math.min(requirement.quantityReserved, targetQty)
        const newFulfilled = requirement.quantityFulfilled + deliveredQty
        const isNowFulfilled = newFulfilled >= requirement.quantityRequested

        await RequirementModel.findByIdAndUpdate(task.requirement, {
          $inc: {
            quantityFulfilled: deliveredQty,
            quantityReserved: -reservedToRelease,
          },
          $set: {
            status: isNowFulfilled ? 'fulfilled' : requirement.status,
          },
        })
      }
    }

    // 2. Reconcile Donation inventory quantities atomically
    if (task.donation) {
      const donation = await DonationModel.findById(task.donation)
      if (donation) {
        const reservedToRelease = Math.min(donation.quantityReserved, targetQty)
        const newAllocated = donation.quantityAllocated + deliveredQty
        const postReserved = Math.max(0, donation.quantityReserved - reservedToRelease)
        const totalCommitted = newAllocated + postReserved

        let newAvailability = donation.availabilityStatus
        if (totalCommitted >= donation.quantity) {
          newAvailability = 'allocated'
        } else if (totalCommitted > 0) {
          newAvailability = 'partially_allocated'
        } else {
          newAvailability = 'available'
        }

        await DonationModel.findByIdAndUpdate(task.donation, {
          $inc: {
            quantityAllocated: deliveredQty,
            quantityReserved: -reservedToRelease,
          },
          $set: {
            availabilityStatus: newAvailability,
          },
        })
      }
    }

    // 3. Update AllocationRecord if linked
    if (task.donation && task.requirement) {
      await AllocationRecordModel.findOneAndUpdate(
        {
          donationId: task.donation,
          requirementId: task.requirement,
          state: 'confirmed',
        },
        {
          $set: {
            reconciliation: {
              reconciledAt: new Date(),
              quantityDelivered: deliveredQty,
              quantityDeficit: remainingDeficit,
              discrepancyReason: reason,
              taskId: task._id,
            },
          },
        },
      )
    }

    // 4. Update task document
    task.confirmationStatus = 'confirmed'
    task.deliveryStatus = 'delivered'
    task.confirmedAt = new Date()
    task.confirmedBy = new Types.ObjectId(callerUserId)
    task.confirmationNotes = notes || 'Delivery confirmed by NGO'
    task.quantityDelivered = deliveredQty
    task.quantityRemaining = remainingDeficit
    task.discrepancyReason = reason
    task.discrepancyNotes = notes
    task.reconciliationStatus = 'reconciled'
    task.reconciledAt = new Date()

    task.history.push({
      status: 'confirmed',
      changedBy: new Types.ObjectId(callerUserId),
      changedAt: new Date(),
      reason: notes
        ? `${notes} (Reconciled: ${deliveredQty}/${targetQty} delivered, ${remainingDeficit} deficit, reason: ${reason})`
        : `Delivery confirmed. Reconciled ${deliveredQty}/${targetQty} units (Deficit: ${remainingDeficit}).`,
    })

    await task.save()

    // 5. Decrement volunteer workload
    if (task.volunteer) {
      await UserModel.findByIdAndUpdate(task.volunteer, {
        $inc: { 'volunteerProfile.currentWorkload': -1 },
      })
    }

    // 6. Resolve report if linked
    if (task.report) {
      const resolutionNote =
        remainingDeficit > 0
          ? `Delivered ${deliveredQty} of ${targetQty} units (${reason}). Field relief partially or fully satisfied.`
          : 'Delivery fully confirmed by NGO. Relief completed.'

      await ReportModel.findByIdAndUpdate(task.report, {
        $set: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: new Types.ObjectId(callerUserId),
          resolutionNote,
        },
        $push: {
          timeline: {
            stage: 'delivered',
            title: remainingDeficit > 0 ? 'Delivery Confirmed (Partial Reconciliation)' : 'Delivery Confirmed & Resolved',
            description: resolutionNote,
            timestamp: new Date(),
            actorRole: 'ngo',
          },
        },
      })
    }

    // 7. Write durable audit trail
    await AuditRecordModel.create({
      actor: new Types.ObjectId(callerUserId),
      action: 'delivery.reconciled',
      entityType: 'VolunteerTask',
      entityId: task._id,
      metadata: {
        taskId: String(task._id),
        quantityTarget: targetQty,
        quantityDelivered: deliveredQty,
        quantityRemaining: remainingDeficit,
        discrepancyReason: reason,
        requirementId: task.requirement ? String(task.requirement) : null,
        donationId: task.donation ? String(task.donation) : null,
      },
    })

    return {
      task,
      reconciled: true,
      alreadyReconciled: false,
      quantityTarget: targetQty,
      quantityDelivered: deliveredQty,
      quantityRemaining: remainingDeficit,
      discrepancyReason: reason,
    }
  }
}

export const deliveryReconciliationService = new DeliveryReconciliationService()

