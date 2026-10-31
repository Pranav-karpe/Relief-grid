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
import { VolunteerVerificationModel } from '../src/models/oversight.js'
import { evaluateNgoRegistration } from '../src/services/ngo-verification.service.js'
import { findMatches } from '../src/services/matching.service.js'
import { sendEmail } from '../src/services/email.service.js'

let mongod: MongoMemoryServer
let server: http.Server
let baseUrl: string

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'

const CITIZEN_ID = new Types.ObjectId().toHexString()
const DONOR_ID = new Types.ObjectId().toHexString()
const VERIFIED_NGO_ID = new Types.ObjectId().toHexString()
const OTHER_NGO_ID = new Types.ObjectId().toHexString()
const UNVERIFIED_NGO_ID = new Types.ObjectId().toHexString()
const VERIFIED_VOLUNTEER_ID = new Types.ObjectId().toHexString()
const UNVERIFIED_VOLUNTEER_ID = new Types.ObjectId().toHexString()
const SUSPENDED_VOLUNTEER_ID = new Types.ObjectId().toHexString()
const ADMIN_ID = new Types.ObjectId().toHexString()

const citizenToken = createAccessToken(CITIZEN_ID, 'citizen', secret, 3600)
const verifiedNgoToken = createAccessToken(VERIFIED_NGO_ID, 'ngo', secret, 3600)
const otherNgoToken = createAccessToken(OTHER_NGO_ID, 'ngo', secret, 3600)
const unverifiedNgoToken = createAccessToken(UNVERIFIED_NGO_ID, 'ngo', secret, 3600)
const verifiedVolunteerToken = createAccessToken(VERIFIED_VOLUNTEER_ID, 'volunteer', secret, 3600)
const unverifiedVolunteerToken = createAccessToken(UNVERIFIED_VOLUNTEER_ID, 'volunteer', secret, 3600)
const suspendedVolunteerToken = createAccessToken(SUSPENDED_VOLUNTEER_ID, 'volunteer', secret, 3600)
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
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) as Record<string, any> })
          } catch {
            resolve({ status: res.statusCode ?? 0, body: {} })
          }
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
  await mongoose.connect(mongod.getUri())

  // Seed test users with exact verification and role states
  await UserModel.create([
    {
      _id: new Types.ObjectId(CITIZEN_ID),
      displayName: 'Citizen Test',
      email: 'citizen@test.org',
      role: 'citizen',
      accountStatus: 'active',
      emailVerified: true,
    },
    {
      _id: new Types.ObjectId(DONOR_ID),
      displayName: 'Donor Test',
      email: 'donor@test.org',
      role: 'donor',
      accountStatus: 'active',
      emailVerified: true,
    },
    {
      _id: new Types.ObjectId(VERIFIED_NGO_ID),
      displayName: 'Verified NGO RedCross',
      email: 'ngo1@test.org',
      role: 'ngo',
      accountStatus: 'active',
      emailVerified: true,
      organizationProfile: {
        name: 'RedCross Relief Chapter',
        registrationNumber: 'NGO-RC-101',
        verificationStatus: 'verified',
        operatingRadiusKm: 50,
      },
    },
    {
      _id: new Types.ObjectId(OTHER_NGO_ID),
      displayName: 'Other Verified NGO',
      email: 'ngo2@test.org',
      role: 'ngo',
      accountStatus: 'active',
      emailVerified: true,
      organizationProfile: {
        name: 'BlueSky Relief',
        registrationNumber: 'NGO-BS-202',
        verificationStatus: 'verified',
        operatingRadiusKm: 50,
      },
    },
    {
      _id: new Types.ObjectId(UNVERIFIED_NGO_ID),
      displayName: 'Unverified NGO Newbie',
      email: 'ngounverified@test.org',
      role: 'ngo',
      accountStatus: 'active',
      emailVerified: true,
      organizationProfile: {
        name: 'Newbie Hope',
        registrationNumber: 'NGO-NH-999',
        verificationStatus: 'pending',
      },
    },
    {
      _id: new Types.ObjectId(VERIFIED_VOLUNTEER_ID),
      displayName: 'Verified Volunteer Alpha',
      email: 'vol.alpha@test.org',
      role: 'volunteer',
      accountStatus: 'active',
      emailVerified: true,
      volunteerProfile: {
        verificationStatus: 'verified',
        availability: 'available',
        currentWorkload: 0,
        skills: ['driving', 'first_aid'],
        generalLocation: {
          type: 'Point',
          coordinates: [72.8777, 19.076], // Central Mumbai
        },
      },
    },
    {
      _id: new Types.ObjectId(UNVERIFIED_VOLUNTEER_ID),
      displayName: 'Pending Volunteer Beta',
      email: 'vol.beta@test.org',
      role: 'volunteer',
      accountStatus: 'active',
      emailVerified: true,
      volunteerProfile: {
        verificationStatus: 'pending',
        availability: 'available',
        currentWorkload: 0,
        skills: ['general'],
      },
    },
    {
      _id: new Types.ObjectId(SUSPENDED_VOLUNTEER_ID),
      displayName: 'Suspended Volunteer Gamma',
      email: 'vol.gamma@test.org',
      role: 'volunteer',
      accountStatus: 'suspended',
      emailVerified: true,
      volunteerProfile: {
        verificationStatus: 'verified',
        availability: 'unavailable',
        currentWorkload: 0,
      },
    },
    {
      _id: new Types.ObjectId(ADMIN_ID),
      displayName: 'Super Admin',
      email: 'admin@reliefgrid.org',
      role: 'admin',
      accountStatus: 'active',
      emailVerified: true,
    },
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
// POINT A: NGO VERIFICATION INTEGRATION TEST
// ============================================================================
test('Point A: NGO verification returns pending_external_credentials and flags unconfigured live registry', async () => {
  const result = await evaluateNgoRegistration(UNVERIFIED_NGO_ID, {
    name: 'Apex Health Foundation',
    registrationNumber: 'DL/2021/0012345',
    darpanId: 'DL/2021/0012345',
    contactPhone: '+91 9876543210',
    website: 'https://apexhealth.org',
  })

  // Must not claim live external verification when NGO_DARPAN_API_KEY is unset
  assert.equal(result.registryChecks.syncStatus, 'pending_external_credentials')
  assert.equal(result.registryChecks.registryMatchFound, false)
  assert.equal(result.registryChecks.inconclusive, true)
  assert.ok(result.registryChecks.matchDetails.includes('unconfigured'))

  // Structural checks run correctly
  assert.equal(result.fieldChecks.requiredFields, true)
  assert.equal(result.fieldChecks.validFormats, true)
  assert.ok(result.confidence > 0)
})

// ============================================================================
// POINT B: CITIZEN RISK DETECTION & DUPLICATE CHECKS
// ============================================================================
test('Point B: Citizen risk detection allows genuine emergencies and flags duplicates without rejection', async () => {
  // 1. Submit genuine emergency report
  const res1 = await req('POST', '/api/reports', citizenToken, {
    title: 'Severe flash flood trapped 12 people on second floor',
    description: 'Rapidly rising water level in residential colony sector 4. Children and elderly need immediate rescue.',
    needCategory: 'shelter',
    urgency: 'critical',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(res1.status, 201)
  assert.equal(res1.body.data.status, 'submitted')
  assert.equal(res1.body.data.riskAssessment.possibleDuplicates.length, 0)
  assert.ok(res1.body.data.riskAssessment.riskScore <= 35, 'Genuine emergency must have low risk score')

  // 2. Submit very similar report nearby from same user (duplicate check)
  const res2 = await req('POST', '/api/reports', citizenToken, {
    title: 'Severe flash flood trapped people in sector 4',
    description: 'Rapidly rising water level in residential colony sector 4. Children and elderly need immediate rescue.',
    needCategory: 'shelter',
    urgency: 'critical',
    location: { type: 'Point', coordinates: [72.8780, 19.0762] }, // ~50 meters away
  })
  // Crucial requirement: Must never reject genuine emergencies; status is 201, flagged for review
  assert.equal(res2.status, 201)
  assert.ok(res2.body.data.riskAssessment.possibleDuplicates.length > 0)
  assert.ok(res2.body.data.riskAssessment.flags.some((f: string) => f.includes('Reporter previously submitted a highly similar report')))
})

// ============================================================================
// POINT C: VOLUNTEER VERIFICATION ENFORCEMENT & ADMIN APPROVAL
// ============================================================================
test('Point C: Volunteer verification guards prevent unverified volunteers, admin approves/rejects', async () => {
  // 1. Unverified volunteer cannot accept tasks
  const fakeTaskId = new Types.ObjectId().toHexString()
  const acceptRes = await req('POST', `/api/volunteer/tasks/${fakeTaskId}/accept`, unverifiedVolunteerToken)
  assert.equal(acceptRes.status, 403)
  assert.equal(acceptRes.body.code, 'volunteer_verification_required')

  // 2. Suspended volunteer cannot even authenticate (accountStatus: suspended)
  const suspendedRes = await req('POST', `/api/volunteer/tasks/${fakeTaskId}/accept`, suspendedVolunteerToken)
  assert.equal(suspendedRes.status, 401)
  assert.equal(suspendedRes.body.code, 'authentication_required')

  // 3. Admin verifies pending volunteer via verification queue
  const verRecord = await VolunteerVerificationModel.create({
    volunteer: new Types.ObjectId(UNVERIFIED_VOLUNTEER_ID),
    status: 'pending',
    submittedData: {
      name: 'Volunteer Beta',
      skills: ['driving'],
      serviceRadiusKm: 15,
    },
  })

  const approveRes = await req('POST', `/api/admin/volunteers/verifications/${verRecord._id}/approve`, adminToken)
  assert.equal(approveRes.status, 200)
  assert.equal(approveRes.body.data.status, 'approved')

  // Check in database that user volunteerProfile is updated to verified
  const updatedVol = await UserModel.findById(UNVERIFIED_VOLUNTEER_ID).lean()
  assert.equal(updatedVol?.volunteerProfile?.verificationStatus, 'verified')

  // 4. Admin rejection test on another pending verification
  const verRecord2 = await VolunteerVerificationModel.create({
    volunteer: new Types.ObjectId(UNVERIFIED_VOLUNTEER_ID),
    status: 'pending',
    submittedData: {
      name: 'Volunteer Beta 2',
      skills: ['general'],
    },
  })

  const rejectRes = await req('POST', `/api/admin/volunteers/verifications/${verRecord2._id}/reject`, adminToken, {
    reason: 'Incomplete contact address and unverified phone number.',
  })
  assert.equal(rejectRes.status, 200)
  assert.equal(rejectRes.body.data.status, 'rejected')
})

// ============================================================================
// POINT D: NGO DISPATCH, ISOLATION & WORKLOAD MANAGEMENT
// ============================================================================
test('Point D: Only verified NGOs can dispatch, tasks are strictly isolated between NGOs, and workloads update', async () => {
  // 1. Unverified NGO cannot query nearby volunteers
  const unverifiedNearby = await req('GET', '/api/ngo/volunteers/nearby?lat=19.076&lng=72.8777&radiusKm=10', unverifiedNgoToken)
  assert.equal(unverifiedNearby.status, 403)
  assert.equal(unverifiedNearby.body.code, 'ngo_verification_required')

  // 2. Verified NGO queries nearby volunteers within 10 km
  const nearbyRes = await req('GET', '/api/ngo/volunteers/nearby?lat=19.076&lng=72.8777&radiusKm=10', verifiedNgoToken)
  assert.equal(nearbyRes.status, 200)
  assert.ok(Array.isArray(nearbyRes.body.data))
  const foundVol = nearbyRes.body.data.find((v: any) => v._id === VERIFIED_VOLUNTEER_ID)
  assert.ok(foundVol, 'Verified volunteer at Mumbai coordinates must be found')

  // 3. Verified NGO dispatches task to verified volunteer
  const volBefore = await UserModel.findById(VERIFIED_VOLUNTEER_ID).lean()
  const initialWorkload = volBefore?.volunteerProfile?.currentWorkload || 0

  const dispatchRes = await req('POST', '/api/ngo/tasks', verifiedNgoToken, {
    volunteerId: VERIFIED_VOLUNTEER_ID,
    assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    taskDetails: 'Deliver 10 emergency rations to Sector 4 shelter.',
  })
  assert.equal(dispatchRes.status, 201)
  const taskId = dispatchRes.body.data._id

  // Verify volunteer workload incremented
  const volAfter = await UserModel.findById(VERIFIED_VOLUNTEER_ID).lean()
  assert.equal(volAfter?.volunteerProfile?.currentWorkload, initialWorkload + 1)

  // 4. Cross-NGO Isolation: Other NGO cannot access this task
  const crossAccess = await req('GET', `/api/ngo/tasks/${taskId}`, otherNgoToken)
  assert.equal(crossAccess.status, 404, 'Other NGO cannot access tasks dispatched by different NGO')

  // 5. Cross-NGO Isolation: Other NGO cannot confirm delivery
  const crossConfirm = await req('POST', `/api/ngo/tasks/${taskId}/confirm-delivery`, otherNgoToken, {
    action: 'confirm',
    notes: 'Illegitimate confirmation attempt',
  })
  assert.equal(crossConfirm.status, 403, 'Other NGO must be forbidden from confirming delivery')
})

// ============================================================================
// POINT E: COMPLETE DELIVERY LIFECYCLE & DISPUTE WORKFLOW
// ============================================================================
test('Point E: Complete delivery lifecycle (Citizen -> NGO -> Volunteer -> Delivered Pending -> Confirmed -> Resolved) and dispute flow', async () => {
  // Step 1: Citizen creates report via API
  const reportRes = await req('POST', '/api/reports', citizenToken, {
    title: 'Medical supply kits required for shelter',
    description: 'Elderly patients require chronic medicine and bandages.',
    needCategory: 'medical',
    urgency: 'high',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(reportRes.status, 201)
  const citizenReportId = reportRes.body.data._id

  // Step 2: NGO dispatches task linked to this citizen report
  const taskRes = await req('POST', '/api/ngo/tasks', verifiedNgoToken, {
    volunteerId: VERIFIED_VOLUNTEER_ID,
    reportId: citizenReportId,
    assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    taskDetails: 'Pickup medical supplies from depot and hand over to Shelter 3.',
  })
  assert.equal(taskRes.status, 201)
  const taskId = taskRes.body.data._id

  // Step 3: Volunteer accepts task
  const acceptRes = await req('POST', `/api/volunteer/tasks/${taskId}/accept`, verifiedVolunteerToken)
  assert.equal(acceptRes.status, 200)
  assert.equal(acceptRes.body.data.assignmentStatus, 'accepted')

  // Step 4: Volunteer marks pickup
  const pickupRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, verifiedVolunteerToken, {
    pickupStatus: 'collected',
  })
  assert.equal(pickupRes.status, 200)
  assert.equal(pickupRes.body.data.pickupStatus, 'collected')

  // Step 5: Volunteer marks in transit
  const transitRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, verifiedVolunteerToken, {
    deliveryStatus: 'in_transit',
  })
  assert.equal(transitRes.status, 200)
  assert.equal(transitRes.body.data.deliveryStatus, 'in_transit')

  // Step 6: Volunteer marks delivered -> sets delivered_pending_confirmation
  const deliverRes = await req('PATCH', `/api/volunteer/tasks/${taskId}/progress`, verifiedVolunteerToken, {
    deliveryStatus: 'delivered',
    proofOfDeliveryRef: 'DOC-PROOF-7712',
  })
  assert.equal(deliverRes.status, 200)
  assert.equal(deliverRes.body.data.deliveryStatus, 'delivered_pending_confirmation')

  // Citizen report is still not resolved yet
  const reportBeforeConfirm = await ReportModel.findById(citizenReportId).lean()
  assert.notEqual(reportBeforeConfirm?.status, 'resolved')

  // Step 7: NGO confirms delivery
  const confirmRes = await req('POST', `/api/ngo/tasks/${taskId}/confirm-delivery`, verifiedNgoToken, {
    action: 'confirm',
    notes: 'Receipt verified by on-site coordinator.',
  })
  assert.equal(confirmRes.status, 200)
  assert.equal(confirmRes.body.data.deliveryStatus, 'delivered')
  assert.equal(confirmRes.body.data.confirmationStatus, 'confirmed')

  // Citizen report is now resolved!
  const reportAfterConfirm = await ReportModel.findById(citizenReportId).lean()
  assert.equal(reportAfterConfirm?.status, 'resolved')
  const resolvedEvent = reportAfterConfirm?.timeline.find((t: any) => t.stage === 'delivered' || t.title?.includes('Confirmed'))
  assert.ok(resolvedEvent, 'Citizen report must have a resolved timeline event')

  // Step 8: Test Dispute Workflow on a second task
  const taskDisputeRes = await req('POST', '/api/ngo/tasks', verifiedNgoToken, {
    volunteerId: VERIFIED_VOLUNTEER_ID,
    assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    taskDetails: 'Second delivery batch.',
  })
  const disputeTaskId = taskDisputeRes.body.data._id

  const disputeActionRes = await req('POST', `/api/ngo/tasks/${disputeTaskId}/confirm-delivery`, verifiedNgoToken, {
    action: 'dispute',
    notes: 'Recipient reports package was missing insulin vials.',
  })
  assert.equal(disputeActionRes.status, 200)
  assert.equal(disputeActionRes.body.data.confirmationStatus, 'disputed')
  assert.equal(disputeActionRes.body.data.confirmationNotes, 'Recipient reports package was missing insulin vials.')
})

// ============================================================================
// POINT F: MATCHING ENGINE PROXIMITY GATE & EXPANSION
// ============================================================================
test('Point F: Matching engine enforces strict 10 km default cutoff and expands when authorized', async () => {
  // Create a requirement in Mumbai: [72.8777, 19.076]
  const reqDoc = await RequirementModel.create({
    ngo: new Types.ObjectId(VERIFIED_NGO_ID),
    title: 'Need 50 blankets',
    description: 'Emergency warm blankets for flood shelter',
    resourceCategory: 'blankets',
    quantityRequested: 50,
    unit: 'pieces',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [72.8777, 19.076] },
    status: 'active',
  })

  // Donor 1 offer is 3 km away: [72.9000, 19.080] (~3 km)
  await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    description: '30 warm blankets in good condition',
    resourceCategory: 'blankets',
    quantity: 30,
    unit: 'pieces',
    condition: 'new',
    availabilityStatus: 'available',
    location: { type: 'Point', coordinates: [72.9000, 19.080] },
  })

  // Donor 2 offer is 16 km away: [72.9800, 19.180] (~16 km)
  await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    description: '20 fleece blankets',
    resourceCategory: 'blankets',
    quantity: 20,
    unit: 'pieces',
    condition: 'new',
    availabilityStatus: 'available',
    location: { type: 'Point', coordinates: [72.9800, 19.180] },
  })

  // 1. Strict default 10 km search: Only Donor 1 should match
  const defaultMatches = await findMatches({
    requirementId: reqDoc._id.toHexString(),
  })
  assert.equal(defaultMatches.length, 1)
  assert.ok(defaultMatches[0].distanceKm <= 10, 'Default match must be within 10 km')

  // 2. Expanded search up to 25 km: Both donors match
  const expandedMatches = await findMatches({
    requirementId: reqDoc._id.toHexString(),
    maxDistanceKm: 25,
  })
  assert.equal(expandedMatches.length, 2, 'Expanded search must match both donors within 25 km')
})

// ============================================================================
// POINT G: NOTIFICATIONS AND GRACEFUL EMAIL FALLBACK
// ============================================================================
test('Point G: Email service provides graceful simulation fallback when SMTP is unconfigured', async () => {
  // Test email dispatch when SMTP credentials are not set
  const emailResult = await sendEmail({
    to: 'citizen.alert@test.org',
    subject: 'Emergency Status Update',
    bodyText: 'Your relief report has been assigned to an NGO.',
  })

  assert.equal(emailResult.success, true)
  assert.equal(emailResult.simulated, true)
})
