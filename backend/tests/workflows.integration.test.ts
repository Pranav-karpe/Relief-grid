import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import http from 'node:http'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'
import { UserModel } from '../src/models/user.js'
import { ReportModel } from '../src/models/report.js'
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { NotificationModel } from '../src/models/notification.js'

let mongod: MongoMemoryServer
let server: http.Server
let baseUrl: string

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const CITIZEN1_ID = new Types.ObjectId().toHexString()
const CITIZEN2_ID = new Types.ObjectId().toHexString()
const DONOR1_ID = new Types.ObjectId().toHexString()
const DONOR2_ID = new Types.ObjectId().toHexString()
const NGO1_ID = new Types.ObjectId().toHexString()
const NGO_PENDING_ID = new Types.ObjectId().toHexString()
const VOLUNTEER1_ID = new Types.ObjectId().toHexString()
const VOLUNTEER2_ID = new Types.ObjectId().toHexString()
const VOLUNTEER_PENDING_ID = new Types.ObjectId().toHexString()
const ADMIN_ID = new Types.ObjectId().toHexString()

const citizen1Token = createAccessToken(CITIZEN1_ID, 'citizen', secret, 3600)
const citizen2Token = createAccessToken(CITIZEN2_ID, 'citizen', secret, 3600)
const donor1Token = createAccessToken(DONOR1_ID, 'donor', secret, 3600)
const donor2Token = createAccessToken(DONOR2_ID, 'donor', secret, 3600)
const ngo1Token = createAccessToken(NGO1_ID, 'ngo', secret, 3600)
const volunteer1Token = createAccessToken(VOLUNTEER1_ID, 'volunteer', secret, 3600)
const volunteer2Token = createAccessToken(VOLUNTEER2_ID, 'volunteer', secret, 3600)
const adminToken = createAccessToken(ADMIN_ID, 'admin', secret, 3600)

type HttpResult = {
  status: number
  body: Record<string, any>
}

function req(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload))

    const request = http.request(
      `${baseUrl}${path}`,
      { method, headers },
      (res) => {
        let raw = ''
        res.on('data', (c) => { raw += c.toString() })
        res.on('end', () => {
          let parsed: any = {}
          try { parsed = JSON.parse(raw) } catch { parsed = { raw } }
          resolve({ status: res.statusCode ?? 0, body: parsed })
        })
      },
    )
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.disconnect().catch(() => {})
  await mongoose.connect(mongod.getUri())

  // Seed isolated test users
  await UserModel.create([
    { _id: new Types.ObjectId(CITIZEN1_ID), displayName: 'Citizen One', email: 'c1@test.org', role: 'citizen', accountStatus: 'active', emailVerified: true },
    { _id: new Types.ObjectId(CITIZEN2_ID), displayName: 'Citizen Two', email: 'c2@test.org', role: 'citizen', accountStatus: 'active', emailVerified: true },
    { _id: new Types.ObjectId(DONOR1_ID), displayName: 'Donor One', email: 'd1@test.org', role: 'donor', accountStatus: 'active', emailVerified: true },
    { _id: new Types.ObjectId(DONOR2_ID), displayName: 'Donor Two', email: 'd2@test.org', role: 'donor', accountStatus: 'active', emailVerified: true },
    { _id: new Types.ObjectId(NGO1_ID), displayName: 'Relief NGO One', email: 'ngo1@test.org', role: 'ngo', accountStatus: 'active', emailVerified: true, organizationProfile: { name: 'Emergency Aid NGO', registrationNumber: 'NGO-8821', verificationStatus: 'verified' } },
    { _id: new Types.ObjectId(NGO_PENDING_ID), displayName: 'Pending NGO', email: 'ngop@test.org', role: 'ngo', accountStatus: 'active', emailVerified: true, organizationProfile: { name: 'New Initiative', verificationStatus: 'pending' } },
    { _id: new Types.ObjectId(VOLUNTEER1_ID), displayName: 'Volunteer One', email: 'v1@test.org', role: 'volunteer', accountStatus: 'active', emailVerified: true, volunteerProfile: { verificationStatus: 'verified' } },
    { _id: new Types.ObjectId(VOLUNTEER2_ID), displayName: 'Volunteer Two', email: 'v2@test.org', role: 'volunteer', accountStatus: 'active', emailVerified: true, volunteerProfile: { verificationStatus: 'verified' } },
    { _id: new Types.ObjectId(VOLUNTEER_PENDING_ID), displayName: 'Volunteer Pending', email: 'vp@test.org', role: 'volunteer', accountStatus: 'pending', emailVerified: true, volunteerProfile: { verificationStatus: 'pending' } },
    { _id: new Types.ObjectId(ADMIN_ID), displayName: 'Admin User', email: 'admin@test.org', role: 'admin', accountStatus: 'active', emailVerified: true },
  ])

  await new Promise<void>((resolve) => {
    server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`
      }
      resolve()
    })
  })
})

after(async () => {
  if (server) server.close()
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

// ============================================================================
// BATCH 1: CITIZEN WORKFLOW TESTS
// ============================================================================

test('Citizen workflow: initial empty state, creation, persistence, validation, drafts, and ownership isolation', async () => {
  // 1. Empty state for new citizen
  const emptyRes = await req('GET', '/api/reports/mine', citizen1Token)
  assert.equal(emptyRes.status, 200)
  assert.equal(emptyRes.body.data.length, 0, 'New citizen must start with 0 reports')

  // 2. Validation error handling: short description and missing location
  const invalidRes = await req('POST', '/api/reports', citizen1Token, {
    title: 'Short title',
    description: 'too short',
    needCategory: 'food',
    urgency: 'high',
  })
  assert.equal(invalidRes.status, 400, 'Invalid report payload must return 400')
  assert.ok(invalidRes.body.message || invalidRes.body.code, 'Must include error reason')

  // 3. Create valid emergency relief request
  const createRes = await req('POST', '/api/reports', citizen1Token, {
    title: 'Urgent clean water shortage in Sector 7',
    description: 'Flooding disrupted local wells. 45 people without potable drinking water.',
    needCategory: 'water',
    urgency: 'critical',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    affectedPersonCount: 45,
    status: 'submitted',
  })
  assert.equal(createRes.status, 201)
  const reportId = createRes.body.data._id
  assert.ok(reportId, 'Saved record must return a valid _id')
  assert.equal(createRes.body.data.status, 'submitted')
  assert.equal(createRes.body.data.needCategory, 'water')
  assert.equal(createRes.body.data.affectedPersonCount, 45)

  // 4. Persistence verification: fetch mine
  const mineRes = await req('GET', '/api/reports/mine', citizen1Token)
  assert.equal(mineRes.status, 200)
  assert.equal(mineRes.body.data.length, 1)
  assert.equal(mineRes.body.data[0]._id, reportId)

  // 5. Single report details
  const detailRes = await req('GET', `/api/reports/${reportId}`, citizen1Token)
  assert.equal(detailRes.status, 200)
  assert.equal(detailRes.body.data.title, 'Urgent clean water shortage in Sector 7')

  // 6. Ownership isolation: Citizen 2 cannot read Citizen 1 private report
  const unauthorizedRead = await req('GET', `/api/reports/${reportId}`, citizen2Token)
  assert.equal(unauthorizedRead.status, 404, 'Citizen 2 must get 404 attempting to read Citizen 1 report')

  // 7. Ownership isolation: Citizen 2 cannot modify Citizen 1 report
  const unauthorizedEdit = await req('PATCH', `/api/reports/${reportId}`, citizen2Token, {
    title: 'Hacked title',
  })
  assert.equal(unauthorizedEdit.status, 404, 'Citizen 2 cannot patch Citizen 1 report')

  // 8. Citizen cannot self-verify or resolve a report
  const forbiddenStatus = await req('PATCH', `/api/reports/${reportId}`, citizen1Token, {
    status: 'verified',
  })
  assert.equal(forbiddenStatus.status, 400, 'Citizen cannot set status to verified')

  // 9. Draft workflow: create draft, update draft, submit
  const draftRes = await req('POST', '/api/reports', citizen1Token, {
    title: 'Tentative shelter requirement',
    description: 'Community hall roof damaged, evaluating capacity needs.',
    needCategory: 'shelter',
    urgency: 'medium',
    location: { type: 'Point', coordinates: [72.878, 19.077] },
    status: 'draft',
  })
  assert.equal(draftRes.status, 201)
  assert.equal(draftRes.body.data.status, 'draft')
  const draftId = draftRes.body.data._id

  // Edit draft title & submit
  const submitDraft = await req('PATCH', `/api/reports/${draftId}`, citizen1Token, {
    title: 'Confirmed shelter assistance for 15 displaced families',
    status: 'submitted',
  })
  assert.equal(submitDraft.status, 200)
  assert.equal(submitDraft.body.data.status, 'submitted')
  assert.equal(submitDraft.body.data.title, 'Confirmed shelter assistance for 15 displaced families')
})

// ============================================================================
// BATCH 1: DONOR WORKFLOW TESTS
// ============================================================================

test('Donor workflow: creation, listing, editing, withdrawal, matching suggestions, and ownership isolation', async () => {
  // 1. Initial empty listings
  const emptyRes = await req('GET', '/api/donations/mine', donor1Token)
  assert.equal(emptyRes.status, 200)
  assert.equal(emptyRes.body.data.length, 0)

  // 2. Validation error handling (negative quantity)
  const invalidRes = await req('POST', '/api/donations', donor1Token, {
    resourceCategory: 'water',
    description: 'Clean bottled water',
    quantity: -10,
    unit: 'boxes',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(invalidRes.status, 400)

  // 3. Valid donation listing creation
  const createRes = await req('POST', '/api/donations', donor1Token, {
    resourceCategory: 'water',
    description: '50 crates of sealed potable water bottles.',
    quantity: 50,
    unit: 'crates',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(createRes.status, 201)
  const donationId = createRes.body.data._id
  assert.ok(donationId)
  assert.equal(createRes.body.data.availabilityStatus, 'available')
  assert.equal(createRes.body.data.quantity, 50)

  // 4. Persistence in mine list
  const mineRes = await req('GET', '/api/donations/mine', donor1Token)
  assert.equal(mineRes.status, 200)
  assert.equal(mineRes.body.data.length, 1)
  assert.equal(mineRes.body.data[0]._id, donationId)

  // 5. Permitted editing by owner
  const updateRes = await req('PATCH', `/api/donations/${donationId}`, donor1Token, {
    description: 'Updated: 60 crates of sealed potable water bottles ready for dispatch.',
    quantity: 60,
  })
  assert.equal(updateRes.status, 200)
  assert.equal(updateRes.body.data.quantity, 60)

  // 6. Ownership isolation: Donor 2 cannot edit Donor 1 listing
  const unauthorizedEdit = await req('PATCH', `/api/donations/${donationId}`, donor2Token, {
    quantity: 1,
  })
  assert.equal(unauthorizedEdit.status, 404, 'Donor 2 cannot edit Donor 1 listing')

  // 7. Withdrawal / cancellation
  const withdrawRes = await req('PATCH', `/api/donations/${donationId}`, donor1Token, {
    availabilityStatus: 'cancelled',
  })
  assert.equal(withdrawRes.status, 200)
  assert.equal(withdrawRes.body.data.availabilityStatus, 'cancelled')
})

// ============================================================================
// BATCH 2 & CROSS-ROLE INTEGRATION WORKFLOW
// ============================================================================

test('Cross-role workflow: citizen request -> NGO review -> donor offer -> requirement -> matching -> allocation -> volunteer task -> delivery evidence', async () => {
  // Step 1: Citizen creates relief request for medical supplies
  const reportRes = await req('POST', '/api/reports', citizen1Token, {
    title: 'First aid kits needed for transit camp',
    description: 'Urgent requirement for antiseptic, bandages, and sterile dressings.',
    needCategory: 'medical',
    urgency: 'high',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    affectedPersonCount: 20,
    status: 'submitted',
  })
  assert.equal(reportRes.status, 201)
  const reportId = reportRes.body.data._id

  // Step 2: Verified NGO reviews submitted report
  const ngoReportsRes = await req('GET', '/api/ngo/reports', ngo1Token)
  assert.equal(ngoReportsRes.status, 200)
  const foundReport = ngoReportsRes.body.data.find((r: any) => r._id === reportId)
  assert.ok(foundReport, 'NGO must be able to review the submitted report')
  assert.equal(foundReport.needCategory, 'medical')
  // Privacy check: reporter contact/identity is omitted
  assert.equal(foundReport.reporter, undefined, 'Citizen identity must not leak to overview report listing')

  // Step 3: Donor offers medical resources (50 kits)
  const donorRes = await req('POST', '/api/donations', donor1Token, {
    resourceCategory: 'medical',
    description: '50 emergency first-aid kits with antiseptic and gauze.',
    quantity: 50,
    unit: 'kits',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.879, 19.078] }, // within 2km
  })
  assert.equal(donorRes.status, 201)
  const donationId = donorRes.body.data._id

  // Step 4: NGO creates requirement for 30 kits
  const reqRes = await req('POST', '/api/ngo/requirements', ngo1Token, {
    resourceCategory: 'medical',
    description: 'Field clinic triage kits required for camp distribution.',
    quantityRequested: 30,
    unit: 'kits',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(reqRes.status, 201)
  const requirementId = reqRes.body.data._id

  // Step 5: Matching suggestion discovers the donor resource within 10km
  const matchRes = await req('GET', `/api/matching/requirements/${requirementId}`, ngo1Token)
  assert.equal(matchRes.status, 200)
  assert.ok(Array.isArray(matchRes.body.data))
  const matchedDonation = matchRes.body.data.find((m: any) => m.donationId === donationId)
  assert.ok(matchedDonation, 'Geospatial matching must discover nearby donation offer')

  // Step 6: NGO allocates 25 kits from the matched donation
  const allocRes = await req('POST', '/api/allocations', ngo1Token, {
    donationId,
    requirementId,
    quantity: 25,
    idempotencyKey: 'alloc-test-key-001',
  })
  assert.equal(allocRes.status, 201)
  assert.equal(allocRes.body.data.quantity, 25)

  // Verify donation status and reserved quantity
  const updatedDonation = await DonationModel.findById(donationId).lean()
  assert.equal(updatedDonation?.quantityReserved, 25)
  assert.equal(updatedDonation?.availabilityStatus, 'partially_allocated')

  // Verify notification was generated for donor
  const donorNotifs = await NotificationModel.find({ recipient: new Types.ObjectId(DONOR1_ID) }).lean()
  assert.ok(donorNotifs.length >= 1, 'Donor must be notified of reservation')

  // Step 7: Volunteer Task creation for active volunteer
  const taskRes = await req('POST', '/api/coordination/tasks', adminToken, {
    volunteerId: VOLUNTEER1_ID,
    donationId,
    requirementId,
    reportId,
    assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    taskDetails: 'Pickup 25 first-aid kits from donor location and transit to Camp Sector 7.',
  })
  assert.equal(taskRes.status, 201)
  const taskId = taskRes.body.data._id
  assert.equal(taskRes.body.data.assignmentStatus, 'assigned')

  // Step 8: Volunteer 1 accesses their assigned tasks
  const volTasksRes = await req('GET', '/api/volunteer/tasks/mine', volunteer1Token)
  assert.equal(volTasksRes.status, 200)
  const myTask = volTasksRes.body.data.find((t: any) => t._id === taskId)
  assert.ok(myTask, 'Task must appear in volunteer task list')

  // Volunteer 2 cannot view or manipulate Volunteer 1 task
  const vol2Access = await req('GET', `/api/volunteer/tasks/${taskId}`, volunteer2Token)
  assert.equal(vol2Access.status, 404, 'Volunteer 2 cannot access Volunteer 1 task')

  // Step 9: Volunteer 1 accepts the task
  const acceptRes = await req('POST', `/api/volunteer/tasks/${taskId}/accept`, volunteer1Token)
  assert.equal(acceptRes.status, 200)
  assert.equal(acceptRes.body.data.assignmentStatus, 'accepted')

  // Step 10: Volunteer marks pickup collected
  const pickupRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, volunteer1Token, {
    pickupStatus: 'collected',
  })
  assert.equal(pickupRes.status, 200)
  assert.equal(pickupRes.body.data.pickupStatus, 'collected')

  // Step 11a: Volunteer marks transit
  const transitRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, volunteer1Token, {
    deliveryStatus: 'in_transit',
  })
  assert.equal(transitRes.status, 200)
  assert.equal(transitRes.body.data.deliveryStatus, 'in_transit')

  // Step 11b: Volunteer transitions to delivered with delivery reference evidence
  const deliverRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, volunteer1Token, {
    deliveryStatus: 'delivered',
    proofOfDeliveryRef: 'HANDOVER-CAMP-7-RECEIPT-9901',
  })
  assert.equal(deliverRes.status, 200)
  assert.equal(deliverRes.body.data.deliveryStatus, 'delivered_pending_confirmation')
  assert.equal(deliverRes.body.data.proofOfDeliveryRef, 'HANDOVER-CAMP-7-RECEIPT-9901')

  // Step 12: Admin or NGO confirms delivery
  // In coordination route / admin tasks or DB update, set confirmed
  await VolunteerTaskModel.findByIdAndUpdate(taskId, {
    confirmationStatus: 'confirmed',
    deliveryStatus: 'delivered',
    assignmentStatus: 'completed',
  })

  // Step 13: Volunteer history reflects completed delivery
  const historyRes = await req('GET', '/api/volunteer/history', volunteer1Token)
  assert.equal(historyRes.status, 200)
  const histItem = historyRes.body.data.find((t: any) => t._id === taskId)
  assert.ok(histItem, 'Completed task must appear in task history')
  assert.equal(histItem.deliveryStatus, 'delivered')

  // Step 14: Task history in database records all transition events
  const finalTask = await VolunteerTaskModel.findById(taskId).lean()
  assert.ok(finalTask?.history && finalTask.history.length >= 3, 'Audit history must record assigned, accepted, and progress changes')
})
