import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import http from 'node:http'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'
import { createAccessToken } from '../src/auth/jwt.js'
import app from '../src/app.js'
import { UserModel } from '../src/models/user.js'
import { DonationModel } from '../src/models/donation.js'
import { imageVerificationService } from '../src/services/image-verification.service.js'

let mongod: MongoMemoryServer
let server: http.Server
let baseUrl: string

const secret = process.env.JWT_SECRET ?? 'test-secret-that-is-longer-than-32-characters'
const DONOR_ID = new Types.ObjectId().toHexString()
const donorToken = createAccessToken(DONOR_ID, 'donor', secret, 3600)

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

// Minimal valid 1x1 JPEG buffer
const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
])

before(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())

  await UserModel.create({
    _id: new Types.ObjectId(DONOR_ID),
    email: 'evidence-donor@test.org',
    passwordHash: 'hash',
    role: 'donor',
    displayName: 'Evidence Donor',
    accountStatus: 'active',
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

test('ImageVerificationService validates MIME magic bytes and rejects counterfeit formats', () => {
  assert.equal(imageVerificationService.detectMimeType(validJpegBuffer), 'image/jpeg')

  const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  assert.equal(imageVerificationService.detectMimeType(fakePng), 'image/png')

  const invalid = Buffer.from('plain text header disguised as an image file')
  assert.equal(imageVerificationService.detectMimeType(invalid), 'unknown')

  const result = imageVerificationService.verifyAndSanitize(invalid, 'fake.jpg')
  assert.equal(result.isValid, false)
  assert.equal(result.reviewStatus, 'rejected')
})

test('POST /api/donations with evidence photos stores verified evidence with review status', async () => {
  const base64Photo = validJpegBuffer.toString('base64')

  const res = await req('POST', '/api/donations', donorToken, {
    resourceCategory: 'medical_supplies',
    description: 'Sterile surgical masks and gloves batch 402',
    quantity: 50,
    unit: 'boxes',
    condition: 'new',
    batchNumber: 'MED-2026-B402',
    coldChainRequired: false,
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    photos: [{ data: `data:image/jpeg;base64,${base64Photo}`, name: 'masks_box.jpg' }],
  })

  assert.equal(res.status, 201)
  assert.ok(res.body.data)
  assert.equal(res.body.data.batchNumber, 'MED-2026-B402')
  assert.equal(res.body.data.coldChainRequired, false)
  assert.ok(Array.isArray(res.body.data.evidencePhotos))
  assert.equal(res.body.data.evidencePhotos.length, 1)
  assert.equal(res.body.data.evidencePhotos[0].fileType, 'image/jpeg')
  assert.ok(res.body.data.evidencePhotos[0].url.startsWith('/uploads/evidence/'))
})

test('POST /api/donations rejects more than 3 evidence photos', async () => {
  const base64Photo = validJpegBuffer.toString('base64')

  const res = await req('POST', '/api/donations', donorToken, {
    resourceCategory: 'canned_food',
    description: 'Emergency ration tins high calorie nutrition',
    quantity: 100,
    unit: 'tins',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    photos: [
      { data: `data:image/jpeg;base64,${base64Photo}`, name: '1.jpg' },
      { data: `data:image/jpeg;base64,${base64Photo}`, name: '2.jpg' },
      { data: `data:image/jpeg;base64,${base64Photo}`, name: '3.jpg' },
      { data: `data:image/jpeg;base64,${base64Photo}`, name: '4.jpg' },
    ],
  })

  assert.equal(res.status, 400)
  assert.match(res.body.message, /maximum of 3 evidence photos/i)
})

test('POST /api/donations flags duplicate photos in upload batch', async () => {
  const base64Photo = validJpegBuffer.toString('base64')

  const res = await req('POST', '/api/donations', donorToken, {
    resourceCategory: 'water_purification',
    description: 'Chlorine purification tablets and filters',
    quantity: 200,
    unit: 'strips',
    condition: 'new',
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    photos: [
      { data: `data:image/jpeg;base64,${base64Photo}`, name: 'photo1.jpg' },
      { data: `data:image/jpeg;base64,${base64Photo}`, name: 'photo2.jpg' },
    ],
  })

  assert.equal(res.status, 201)
  assert.equal(res.body.data.evidencePhotos.length, 2)
  // Second photo should be flagged as SIMILAR_IMAGE
  const photo2 = res.body.data.evidencePhotos[1]
  assert.equal(photo2.reviewStatus, 'flagged')
  assert.ok(photo2.reviewFlags.includes('SIMILAR_IMAGE'))
})

test('POST /api/donations with expired date auto-quarantines item', async () => {
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const res = await req('POST', '/api/donations', donorToken, {
    resourceCategory: 'perishable_food',
    description: 'Pasteurized milk cartons expiring yesterday',
    quantity: 20,
    unit: 'cartons',
    condition: 'good',
    expiryDate: pastDate,
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
  })

  assert.equal(res.status, 201)
  assert.equal(res.body.data.availabilityStatus, 'expired')
  assert.equal(res.body.data.quarantineStatus, 'quarantined_expired')
})
