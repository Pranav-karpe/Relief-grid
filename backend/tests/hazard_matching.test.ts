import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import http from 'node:http'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'
import { UserModel } from '../src/models/user.js'
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { HazardModel } from '../src/models/hazard.js'
import { findMatches } from '../src/services/matching.service.js'

let mongod: MongoMemoryServer
let server: http.Server
let baseUrl: string

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'
const NGO_ID = new Types.ObjectId().toHexString()
const VOL_ID = new Types.ObjectId().toHexString()
const DONOR_ID = new Types.ObjectId().toHexString()

const ngoToken = createAccessToken(NGO_ID, 'ngo', secret, 3600)
const volToken = createAccessToken(VOL_ID, 'volunteer', secret, 3600)

type HttpResult = {
  status: number
  body: Record<string, any>
}

function req(method: string, path: string, token?: string, body?: unknown): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
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

  await UserModel.create([
    {
      _id: new Types.ObjectId(NGO_ID),
      email: 'hazard-ngo@test.org',
      passwordHash: 'hash',
      role: 'ngo',
      displayName: 'Hazard Response NGO',
      accountStatus: 'active',
    },
    {
      _id: new Types.ObjectId(VOL_ID),
      email: 'hazard-vol@test.org',
      passwordHash: 'hash',
      role: 'volunteer',
      displayName: 'Field Scout Volunteer',
      accountStatus: 'active',
    },
  ])

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

test('Hazard APIs enforce authentication, authorization, and validation', async () => {
  // 1. Unauthenticated request rejected
  const unauth = await req('POST', '/api/hazards', undefined, {
    title: 'Bridge washaway',
    location: { type: 'Point', coordinates: [72.87, 19.07] },
  })
  assert.equal(unauth.status, 401)

  // 2. Volunteer can report hazard
  const createRes = await req('POST', '/api/hazards', volToken, {
    title: 'Severe landslide blocking highway NH48',
    hazardType: 'landslide_debris',
    severity: 'impassable_all_vehicles',
    radiusMeters: 500,
    location: { type: 'Point', coordinates: [72.88, 19.08] },
    description: 'Boulders and mud blocking both transit lanes',
  })
  assert.equal(createRes.status, 201)
  assert.equal(createRes.body.data.title, 'Severe landslide blocking highway NH48')
  assert.equal(createRes.body.data.status, 'active')

  const hazardId = createRes.body.data._id

  // 3. NGO can view active hazards
  const listRes = await req('GET', '/api/hazards?status=active', ngoToken)
  assert.equal(listRes.status, 200)
  assert.ok(Array.isArray(listRes.body.data))
  assert.ok(listRes.body.data.some((h: any) => h._id === hazardId))

  // 4. Update status to cleared
  const patchRes = await req('PATCH', `/api/hazards/${hazardId}`, ngoToken, {
    status: 'cleared',
    description: 'Road cleared by local civil defense bulldozer',
  })
  assert.equal(patchRes.status, 200)
  assert.equal(patchRes.body.data.status, 'cleared')
  assert.ok(patchRes.body.data.clearedAt)
})

test('Delivery matching applies transparent hazard penalty and labels distance as approximation', async () => {
  // Clear hazards
  await HazardModel.deleteMany({})

  // Donation at [72.80, 19.00]
  const donation = await DonationModel.create({
    donor: new Types.ObjectId(DONOR_ID),
    resourceCategory: 'tents_shelter',
    description: 'Weatherproof disaster tents batch A',
    quantity: 100,
    unit: 'tents',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.8, 19.0] },
    availabilityStatus: 'available',
  })

  // Requirement at [72.86, 19.06] (~9 km distance)
  const requirement = await RequirementModel.create({
    ngo: new Types.ObjectId(NGO_ID),
    resourceCategory: 'tents_shelter',
    description: 'Emergency shelter requirement',
    quantityRequested: 100,
    unit: 'tents',
    priority: 'high',
    deliveryArea: { type: 'Point', coordinates: [72.86, 19.06] },
    status: 'active',
  })

  // 1. Matches without hazard
  const matchesBefore = await findMatches({
    donationId: String(donation._id),
    requirementId: String(requirement._id),
  })
  assert.equal(matchesBefore.length, 1)
  const match1 = matchesBefore[0]
  assert.equal(match1.scoreFactors.hazardPenalty, 0)
  assert.equal(match1.distanceCalculationMethod, 'euclidean_haversine_approximation')
  assert.equal(match1.roadApproximationMultiplier, 1.32)
  assert.match(match1.reasons.find((r) => r.startsWith('Distance:')) || '', /no live OSRM\/ORS router/i)

  const baselineScore = match1.score

  // 2. Create active impassable flood hazard along midpoint [72.83, 19.03]
  const hazard = await HazardModel.create({
    title: 'Flash flood water overtopping causeway',
    hazardType: 'flooded_road',
    severity: 'impassable_all_vehicles',
    radiusMeters: 400,
    location: { type: 'Point', coordinates: [72.83, 19.03] },
    reportedBy: new Types.ObjectId(VOL_ID),
    status: 'active',
  })

  // 3. Matches with active hazard on corridor
  const matchesWithHazard = await findMatches({
    donationId: String(donation._id),
    requirementId: String(requirement._id),
  })
  assert.equal(matchesWithHazard.length, 1)
  const match2 = matchesWithHazard[0]
  assert.equal(match2.scoreFactors.hazardPenalty, 4.0, 'Impassable hazard must apply 4.0 penalty')
  assert.equal(match2.score, Number((baselineScore - 4.0).toFixed(2)))
  assert.equal(match2.hazardAnalysis.hasImpassableHazard, true)
  assert.ok(match2.reasons.some((r) => r.includes('Impassable Road Hazard')))

  // 4. Clear the hazard
  await HazardModel.findByIdAndUpdate(hazard._id, { status: 'cleared', clearedAt: new Date() })

  const matchesAfterClear = await findMatches({
    donationId: String(donation._id),
    requirementId: String(requirement._id),
  })
  assert.equal(matchesAfterClear[0].scoreFactors.hazardPenalty, 0, 'Cleared hazard must not penalize routes')
})

