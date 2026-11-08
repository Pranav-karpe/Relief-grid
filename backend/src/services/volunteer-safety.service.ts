import { Types } from 'mongoose'
import { VolunteerTaskModel, type VolunteerTaskDocument } from '../models/task.js'
import { NotificationModel } from '../models/notification.js'
import { AuditRecordModel } from '../models/audit.js'

let safetyTimer: NodeJS.Timeout | undefined

export type SafetyCheckInScanResult = {
  alertedTasksCount: number
  alertedTaskIds: string[]
}

/**
 * Scans for active volunteer tasks where safety check-in is enabled, overdue,
 * and no alert has been dispatched yet.
 *
 * Rules:
 * - Only checks tasks in active transit ('accepted' and deliveryStatus in ['in_transit', 'delivered_pending_confirmation', 'pending']).
 * - Excludes completed, cancelled, declined, or reassigned tasks.
 * - Idempotently updates overdueAlertSent to prevent alert storms.
 * - Records an immutable audit log entry and creates a coordinator notification.
 * - Never introduces continuous GPS polling.
 */
export async function scanOverdueVolunteerCheckIns(): Promise<SafetyCheckInScanResult> {
  const now = new Date()

  // Find candidate tasks
  const overdueTasks = await VolunteerTaskModel.find({
    'safetyCheckIn.enabled': true,
    'safetyCheckIn.overdueAlertSent': false,
    'safetyCheckIn.nextCheckInDue': { $lt: now },
    assignmentStatus: 'accepted',
    deliveryStatus: { $in: ['pending', 'in_transit', 'delivered_pending_confirmation'] },
  })

  const alertedTaskIds: string[] = []

  for (const task of overdueTasks) {
    // Atomic update guard to ensure concurrent worker runs do not send duplicate alerts
    const claimed = await VolunteerTaskModel.findOneAndUpdate(
      {
        _id: task._id,
        'safetyCheckIn.overdueAlertSent': false,
        'safetyCheckIn.nextCheckInDue': { $lt: now },
      },
      {
        $set: {
          'safetyCheckIn.overdueAlertSent': true,
        },
      },
      { returnDocument: 'after' },
    )

    if (!claimed || !claimed.safetyCheckIn || !task.safetyCheckIn) continue

    const nextDue = task.safetyCheckIn.nextCheckInDue
    const dueTime = nextDue ? new Date(nextDue).getTime() : now.getTime()
    const overdueMinutes = Math.max(1, Math.round((now.getTime() - dueTime) / 60000))

    // Record escalation event in task history
    claimed.history.push({
      status: 'safety_checkin_overdue',
      changedBy: task.assignedByNgo || task.volunteer,
      changedAt: now,
      reason: `Safety check-in overdue by ${overdueMinutes} minutes (due at ${nextDue ? new Date(nextDue).toISOString() : 'now'}). Coordinator escalation triggered.`,
    })
    await claimed.save()

    // Dispatch notification to NGO coordinator
    if (task.assignedByNgo) {
      await NotificationModel.create({
        recipient: task.assignedByNgo,
        eventType: 'volunteer.overdue_checkin',
        title: '⚠️ Volunteer Safety Check-In Overdue',
        message: `Volunteer assigned to Task #${String(task._id).slice(-6)} is overdue for safety check-in by ${overdueMinutes} minutes.`,
        relatedEntityType: 'VolunteerTask',
        relatedEntityId: task._id,
      })
    }

    // Write durable audit record
    await AuditRecordModel.create({
      actor: task.assignedByNgo || task.volunteer,
      action: 'volunteer.safety_checkin_overdue',
      entityType: 'VolunteerTask',
      entityId: task._id,
      metadata: {
        taskId: String(task._id),
        volunteerId: String(task.volunteer),
        overdueMinutes,
        lastCheckInAt: task.safetyCheckIn.lastCheckInAt,
        nextCheckInDue: nextDue,
      },
    })

    alertedTaskIds.push(String(task._id))
  }

  return {
    alertedTasksCount: alertedTaskIds.length,
    alertedTaskIds,
  }
}

/**
 * Returns active overdue tasks for administrator or NGO monitoring dashboards.
 */
export async function getOverdueVolunteerTasks(options?: {
  ngoId?: string
}): Promise<VolunteerTaskDocument[]> {
  const filter: Record<string, unknown> = {
    'safetyCheckIn.enabled': true,
    'safetyCheckIn.nextCheckInDue': { $lt: new Date() },
    assignmentStatus: 'accepted',
    deliveryStatus: { $in: ['pending', 'in_transit', 'delivered_pending_confirmation'] },
  }

  if (options?.ngoId && Types.ObjectId.isValid(options.ngoId)) {
    filter.assignedByNgo = new Types.ObjectId(options.ngoId)
  }

  return VolunteerTaskModel.find(filter)
    .populate('volunteer', 'displayName email phone volunteerProfile')
    .populate('assignedByNgo', 'displayName email')
    .sort({ 'safetyCheckIn.nextCheckInDue': 1 })
    .lean() as unknown as VolunteerTaskDocument[]
}

/**
 * Starts periodic background scan for overdue volunteer check-ins.
 */
export function startSafetyMonitoring(intervalMs = 60000): NodeJS.Timeout {
  if (safetyTimer) {
    clearInterval(safetyTimer)
  }

  safetyTimer = setInterval(() => {
    scanOverdueVolunteerCheckIns().catch((err) => {
      console.error('[VolunteerSafetyMonitor] Scan error:', err)
    })
  }, intervalMs)

  safetyTimer.unref() // Allow node to cleanly exit during test teardown
  return safetyTimer
}

/**
 * Stops periodic safety monitor.
 */
export function stopSafetyMonitoring(): void {
  if (safetyTimer) {
    clearInterval(safetyTimer)
    safetyTimer = undefined
  }
}
