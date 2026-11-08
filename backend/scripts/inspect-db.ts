import '../src/config/env.js'
import mongoose from 'mongoose'
import { UserModel } from '../src/models/user.js'
import { ReportModel } from '../src/models/report.js'
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { AllocationRecordModel } from '../src/models/allocation.js'
import { IncidentModel } from '../src/models/incident.js'
import { HazardModel } from '../src/models/hazard.js'
import { AlertModel } from '../src/models/alert.js'
import { NotificationModel } from '../src/models/notification.js'
import { AuditRecordModel } from '../src/models/audit.js'
import { NgoVerificationModel, VolunteerVerificationModel } from '../src/models/oversight.js'

async function inspect() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is not set')
    process.exit(1)
  }

  await mongoose.connect(uri)
  try {
    const [
      users,
      reports,
      donations,
      requirements,
      tasks,
      allocations,
      incidents,
      hazards,
      alerts,
      notifications,
      auditRecords,
      ngoVerifs,
      volVerifs,
    ] = await Promise.all([
      UserModel.countDocuments(),
      ReportModel.countDocuments(),
      DonationModel.countDocuments(),
      RequirementModel.countDocuments(),
      VolunteerTaskModel.countDocuments(),
      AllocationRecordModel.countDocuments(),
      IncidentModel.countDocuments(),
      HazardModel.countDocuments(),
      AlertModel.countDocuments(),
      NotificationModel.countDocuments(),
      AuditRecordModel.countDocuments(),
      NgoVerificationModel.countDocuments(),
      VolunteerVerificationModel.countDocuments(),
    ])

    console.log(JSON.stringify({
      users,
      reports,
      donations,
      requirements,
      tasks,
      allocations,
      incidents,
      hazards,
      alerts,
      notifications,
      auditRecords,
      ngoVerifs,
      volVerifs,
    }, null, 2))

    // Also list user emails and roles to inspect existing accounts
    const existingUsers = await UserModel.find({}).select('email role displayName accountStatus').lean()
    console.log('Existing users in DB:', existingUsers)
  } finally {
    await mongoose.disconnect()
  }
}

inspect().catch(err => {
  console.error('Inspect error:', err)
  process.exit(1)
})

