import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { UserModel } from '../src/models/user.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { NotificationModel } from '../src/models/notification.js'
import { AuditRecordModel } from '../src/models/audit.js'
import {
  scanOverdueVolunteerCheckIns,
  getOverdueVolunteerTasks,
} from '../src/services/volunteer-safety.service.js'

let mongod: MongoMemoryServer
const NGO_ID = new Types.ObjectId().toHexString()
const VOL_1_ID = new Types.ObjectId().toHexString()
const VOL_2_ID = new Types.ObjectId().toHexString()

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  await UserModel.create([
    {
      _id: new Types.ObjectId(NGO_ID),
      email: 'safety-ngo@test.org',
      passwordHash: 'hash',
      role: 'ngo',
      displayName: 'Safety First NGO',
      accountStatus: 'active',
    },
    {
      _id: new Types.ObjectId(VOL_1_ID),
      email: 'vol-active@test.org',
      passwordHash: 'hash',
      role: 'volunteer',
      displayName: 'Active Field Volunteer',
      accountStatus: 'active',
    },
    {
      _id: new Types.ObjectId(VOL_2_ID),
      email: 'vol-completed@test.org',
      passwordHash: 'hash',
      role: 'volunteer',
      displayName: 'Completed Volunteer',
      accountStatus: 'active',
    },
  ])
})

after(async () => {
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

test('scanOverdueVolunteerCheckIns detects overdue transit tasks and dispatches coordinator notification without duplicates', async () => {
  const overdueTime = new Date(Date.now() - 45 * 60 * 1000) // 45 minutes ago

  // 1. Active task in transit, overdue
  const activeOverdueTask = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOL_1_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    assignmentStatus: 'accepted',
    deliveryStatus: 'in_transit',
    assignedLocation: { type: 'Point', coordinates: [72.87, 19.07] },
    taskDetails: 'Deliver oxygen cylinders to field hospital',
    safetyCheckIn: {
      enabled: true,
      intervalMinutes: 30,
      nextCheckInDue: overdueTime,
      overdueAlertSent: false,
      history: [],
    },
  })

  // 2. Completed task with past due time (must be ignored)
  await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOL_2_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    assignmentStatus: 'accepted',
    deliveryStatus: 'delivered',
    assignedLocation: { type: 'Point', coordinates: [72.87, 19.07] },
    taskDetails: 'Delivered blankets yesterday',
    safetyCheckIn: {
      enabled: true,
      intervalMinutes: 30,
      nextCheckInDue: overdueTime,
      overdueAlertSent: false,
      history: [],
    },
  })

  // 3. Cancelled task with past due time (must be ignored)
  await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOL_1_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    assignmentStatus: 'cancelled',
    deliveryStatus: 'in_transit',
    assignedLocation: { type: 'Point', coordinates: [72.87, 19.07] },
    taskDetails: 'Cancelled relief task',
    safetyCheckIn: {
      enabled: true,
      intervalMinutes: 30,
      nextCheckInDue: overdueTime,
      overdueAlertSent: false,
      history: [],
    },
  })

  // Run initial scan
  const scanResult1 = await scanOverdueVolunteerCheckIns()
  assert.equal(scanResult1.alertedTasksCount, 1)
  assert.ok(scanResult1.alertedTaskIds.includes(String(activeOverdueTask._id)))

  // Check task updated state
  const updatedTask = await VolunteerTaskModel.findById(activeOverdueTask._id)
  assert.equal(updatedTask?.safetyCheckIn?.overdueAlertSent, true)
  assert.ok(updatedTask?.history?.some((h) => h.status === 'safety_checkin_overdue'))

  // Check coordinator notification
  const notification = await NotificationModel.findOne({
    recipient: new Types.ObjectId(NGO_ID),
    relatedEntityId: activeOverdueTask._id,
  })
  assert.ok(notification)
  assert.equal(notification.eventType, 'volunteer.overdue_checkin')
  assert.match(notification.title, /Safety Check-In Overdue/i)

  // Check audit record
  const audit = await AuditRecordModel.findOne({
    action: 'volunteer.safety_checkin_overdue',
    entityId: activeOverdueTask._id,
  })
  assert.ok(audit)
  assert.equal(audit.metadata.overdueMinutes >= 40, true)

  // Run second scan immediately (idempotency check: duplicate alerts must NOT be sent)
  const scanResult2 = await scanOverdueVolunteerCheckIns()
  assert.equal(scanResult2.alertedTasksCount, 0, 'No duplicate alert should be sent on subsequent scans')

  // Query overdue tasks for dashboard view
  const dashboardTasks = await getOverdueVolunteerTasks({ ngoId: NGO_ID })
  assert.equal(dashboardTasks.length, 1)
  assert.equal(String(dashboardTasks[0]._id), String(activeOverdueTask._id))
})

