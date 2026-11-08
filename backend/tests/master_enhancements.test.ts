import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import http from 'node:http'
import crypto from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'
import { UserModel } from '../src/models/user.js'
import { ReportModel } from '../src/models/report.js'
import { IncidentModel } from '../src/models/incident.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { BeneficiaryDistributionModel } from '../src/models/distribution.js'
import { incidentService } from '../src/services/incident.service.js'

let mongod: MongoMemoryServer
let server: http.Server
let baseUrl: string

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'
const NGO_ID = new Types.ObjectId().toHexString()
const VOLUNTEER_ID = new Types.ObjectId().toHexString()
const ngoToken = createAccessToken(NGO_ID, 'ngo', secret, 3600)
const volunteerToken = createAccessToken(VOLUNTEER_ID, 'volunteer', secret, 3600)

type HttpResult = {
  status: number
  body: Record<string, any>
}

function req(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload))

    const url = new URL(path, baseUrl)
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) })
          } catch {
            resolve({ status: res.statusCode ?? 0, body: { raw } })
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

  await UserModel.create({
    _id: new Types.ObjectId(NGO_ID),
    email: 'ngo-master@test.org',
    passwordHash: 'hash',
    role: 'ngo',
    displayName: 'Master NGO',
    accountStatus: 'active',
    organizationProfile: {
      name: 'Master Relief NGO',
      registrationNumber: 'REG-12345',
      verificationStatus: 'verified',
    },
  })

  await UserModel.create({
    _id: new Types.ObjectId(VOLUNTEER_ID),
    email: 'vol-master@test.org',
    passwordHash: 'hash',
    role: 'volunteer',
    displayName: 'Master Volunteer',
    accountStatus: 'active',
    volunteerProfile: {
      phone: '+91 9876543210',
      verificationStatus: 'verified',
      vehicleType: 'two_wheeler',
      cargoCapacityKg: 40,
    },
  })

  server = http.createServer(app)
  await new Promise<void>((res) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr !== 'string') {
        baseUrl = `http://127.0.0.1:${addr.port}`
      }
      res()
    })
  })
})

after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()))
  await mongoose.disconnect()
  if (mongod) await mongod.stop()
})

test('IncidentService clusters reports within 2.0 km without losing citizen records', async () => {
  const report1 = await ReportModel.create({
    reporter: new Types.ObjectId(),
    title: 'Flood water submerged ground floor homes',
    description: 'Severe waterlogging trapped elderly residents inside apartment complex.',
    needCategory: 'shelter',
    urgency: 'critical',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    affectedPersonCount: 15,
    requestedResources: [{ category: 'drinking_water', quantity: 50, unit: 'litres' }],
    status: 'submitted',
  })

  const cluster1 = await incidentService.clusterReport(report1)
  assert.ok(cluster1._id)
  assert.equal(cluster1.incidentType, 'flood')
  assert.equal(cluster1.severity, 'critical')
  assert.equal(cluster1.totalAffectedPersons, 15)
  assert.equal(cluster1.linkedReports.length, 1)

  // Report 2 is ~0.5 km away from Report 1
  const report2 = await ReportModel.create({
    reporter: new Types.ObjectId(),
    title: 'Nearby community center flooded urgently needs water',
    description: 'Community hall holding evacuated families with children.',
    needCategory: 'water',
    urgency: 'high',
    location: { type: 'Point', coordinates: [72.88, 19.078] },
    affectedPersonCount: 30,
    requestedResources: [{ category: 'drinking_water', quantity: 100, unit: 'litres' }],
    status: 'submitted',
  })

  const cluster2 = await incidentService.clusterReport(report2)
  assert.equal(cluster2._id.toString(), cluster1._id.toString(), 'Should group into the same incident cluster')
  assert.equal(cluster2.linkedReports.length, 2)
  assert.equal(cluster2.totalAffectedPersons, 45)
  assert.equal(cluster2.needsSummary.length, 1)
  assert.equal(cluster2.needsSummary[0].totalQuantity, 150)
})

test('VolunteerTask progress records multi-modal proof and proxy handover', async () => {
  const task = await VolunteerTaskModel.create({
    volunteer: new Types.ObjectId(VOLUNTEER_ID),
    assignedByNgo: new Types.ObjectId(NGO_ID),
    taskDetails: 'Deliver 20 family hygiene kits to camp leader',
    assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    assignmentStatus: 'accepted',
    pickupStatus: 'collected',
    deliveryStatus: 'in_transit',
    quantityTarget: 20,
  })

  const res = await req('PATCH', `/api/volunteer/tasks/${task._id}/progress`, volunteerToken, {
    deliveryStatus: 'delivered',
    proofOfDelivery: {
      proofType: 'signature',
      signatureData: 'Digital acknowledgement: Ramesh Patil',
    },
    proxyHandover: {
      isProxy: true,
      recipientType: 'community_shelter_lead',
      recipientName: 'Ramesh Patil',
      recipientPhone: '+91 9988776655',
      reason: 'Citizen relocated to tent 4B',
    },
    quantityDelivered: 18,
    discrepancyReason: 'damaged_in_transit',
    discrepancyNotes: '2 kits damaged due to rain leak',
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.data.deliveryStatus, 'delivered_pending_confirmation')
  assert.equal(res.body.data.proofOfDelivery.proofType, 'signature')
  assert.equal(res.body.data.proxyHandover.isProxy, true)
  assert.equal(res.body.data.proxyHandover.recipientName, 'Ramesh Patil')
  assert.equal(res.body.data.quantityDelivered, 18)
  assert.equal(res.body.data.quantityRemaining, 2)
  assert.equal(res.body.data.discrepancyReason, 'damaged_in_transit')
})

test('POST /api/distributions/check-duplicate detects cross-NGO duplicate aid within 7 days', async () => {
  // Record an initial distribution by NGO
  const govtId = 'AADHAAR-9988-7766-5544'
  const recordRes = await req('POST', '/api/distributions', ngoToken, {
    beneficiaryGovtId: govtId,
    beneficiaryInitials: 'R. P.',
    rationCategory: 'food_grain_rations',
    quantityGiven: 10,
    unit: 'kg',
    campOrShelterName: 'Relief Shelter Alpha',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })
  assert.equal(recordRes.status, 201)

  // Another NGO checks the same beneficiary ID
  const checkRes = await req('POST', '/api/distributions/check-duplicate', ngoToken, {
    beneficiaryGovtId: govtId,
    rationCategory: 'food_grain_rations',
  })

  assert.equal(checkRes.status, 200)
  assert.equal(checkRes.body.data.isDuplicate, true)
  assert.match(checkRes.body.data.warning, /already received/i)
})

test('POST /api/webhooks/resend accepts webhook events', async () => {
  const res = await req('POST', '/api/webhooks/resend', undefined, {
    type: 'email.delivered',
    data: {
      email_id: 're_mock_event_123',
      to: ['citizen@test.org'],
    },
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.received, true)
  assert.equal(res.body.eventType, 'email.delivered')
})

