/**
 * Task coordination service — creates volunteer tasks.
 *
 * Only administrators can create tasks. Volunteers cannot self-assign.
 * The task links a volunteer to an optional donation, requirement, and/or report.
 * The assignedLocation must be a valid GeoJSON Point.
 */

import { Types } from 'mongoose'
import { VolunteerTaskModel } from '../models/task.js'
import { UserModel } from '../models/user.js'
import { AuditRecordModel } from '../models/audit.js'
import { ApiError } from '../middleware/api-error.js'
import { notify } from './notification.service.js'

export type CreateTaskInput = {
  volunteerId: string
  donationId?: string
  requirementId?: string
  reportId?: string
  assignedLocation: { type: 'Point'; coordinates: [number, number] }
  taskDetails: string
  createdBy: string
}

export async function createTask(input: CreateTaskInput) {
  const { volunteerId, donationId, requirementId, reportId, assignedLocation, taskDetails, createdBy } = input

  if (!Types.ObjectId.isValid(volunteerId)) {
    throw new ApiError(400, 'validation_error', 'volunteerId is not a valid ID.')
  }

  const volunteer = await UserModel.findById(volunteerId).select('role accountStatus volunteerProfile.verificationStatus').lean()
  if (!volunteer) throw new ApiError(404, 'not_found', 'Volunteer not found.')
  if (volunteer.role !== 'volunteer') {
    throw new ApiError(400, 'validation_error', 'The specified user is not a volunteer.')
  }
  if (volunteer.accountStatus !== 'active') {
    throw new ApiError(409, 'not_eligible', 'Volunteer account is not active.')
  }
  if (volunteer.volunteerProfile?.verificationStatus !== 'verified') {
    throw new ApiError(403, 'volunteer_not_verified', 'Cannot assign tasks to an unverified volunteer.')
  }

  if (taskDetails.trim().length < 5 || taskDetails.trim().length > 3000) {
    throw new ApiError(400, 'validation_error', 'taskDetails must be 5–3000 characters.')
  }

  const task = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(volunteerId),
    ...(donationId ? { donation: new Types.ObjectId(donationId) } : {}),
    ...(requirementId ? { requirement: new Types.ObjectId(requirementId) } : {}),
    ...(reportId ? { report: new Types.ObjectId(reportId) } : {}),
    assignmentStatus: 'assigned',
    pickupStatus: 'pending',
    deliveryStatus: 'pending',
    assignedLocation,
    taskDetails: taskDetails.trim(),
    history: [{
      status: 'assigned',
      changedBy: new Types.ObjectId(createdBy),
      changedAt: new Date(),
    }],
  })

  await AuditRecordModel.create({
    actor: new Types.ObjectId(createdBy),
    action: 'task.created',
    entityType: 'VolunteerTask',
    entityId: task._id,
    metadata: { volunteerId, donationId, requirementId, reportId },
  })

  await UserModel.findByIdAndUpdate(volunteerId, {
    $inc: { 'volunteerProfile.currentWorkload': 1 },
  })

  // Notify the volunteer
  await notify({
    recipientId: volunteerId,
    eventType: 'task.assigned',
    title: 'New task assigned',
    message: taskDetails.trim().slice(0, 200),
    relatedEntityType: 'VolunteerTask',
    relatedEntityId: String(task._id),
  })

  return task
}
