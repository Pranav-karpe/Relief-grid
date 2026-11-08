import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import http from 'node:http'
import mongoose from 'mongoose'
import app from '../src/app.js'
import { UserModel } from '../src/models/user.js'
import { IncidentModel } from '../src/models/incident.js'
import { ReportModel } from '../src/models/report.js'
import { DonationModel } from '../src/models/donation.js'
import { RequirementModel } from '../src/models/requirement.js'
import { VolunteerTaskModel } from '../src/models/task.js'
import { AllocationRecordModel } from '../src/models/allocation.js'
import { seedDemoData, DEMO_ACCOUNTS, DEMO_PASSWORD } from '../scripts/seed-demo-data.js'

let server: http.Server
let baseUrl: string

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
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI must be configured in environment')

  await mongoose.connect(uri)

  // Seed demo data idempotently
  await seedDemoData()

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
})

test('Every demo account authenticates successfully and receives correct role & JWT token', async () => {
  for (const acc of DEMO_ACCOUNTS) {
    const res = await req('POST', '/api/auth/login', undefined, {
      email: acc.email,
      password: DEMO_PASSWORD,
    })

    assert.equal(
      res.status,
      200,
      `Login failed for demo account ${acc.email} (${acc.role}): ${JSON.stringify(res.body)}`,
    )
    assert.ok(res.body.data?.token, `Missing token for ${acc.email}`)
    assert.equal(res.body.data?.user?.role, acc.role, `Role mismatch for ${acc.email}`)
    assert.equal(res.body.data?.user?.email, acc.email)
  }
})

test('Admin dashboard API returns live aggregated platform metrics with demo records', async () => {
  const loginRes = await req('POST', '/api/auth/login', undefined, {
    email: 'admin.demo@reliefgrid.org',
    password: DEMO_PASSWORD,
  })
  const token = loginRes.body.data.token

  const overviewRes = await req('GET', '/api/admin/overview', token)
  assert.equal(overviewRes.status, 200)

  const data = overviewRes.body.data
  assert.ok(data.users.total >= 10, 'Expected at least 10 users in total')
  assert.ok(data.users.byRole.admin >= 1, 'Expected at least 1 admin')
  assert.ok(data.users.byRole.ngo >= 2, 'Expected at least 2 NGOs')
  assert.ok(data.users.byRole.volunteer >= 3, 'Expected at least 3 volunteers')
  assert.ok(data.users.byRole.citizen >= 2, 'Expected at least 2 citizens')
  assert.ok(data.users.byRole.donor >= 2, 'Expected at least 2 donors')

  assert.ok(data.reports.total >= 4, 'Expected at least 4 reports')
  assert.ok(data.donations.total >= 5, 'Expected at least 5 donations')
  assert.ok(data.requirements.total >= 3, 'Expected at least 3 requirements')
  assert.ok(data.allocations.total >= 2, 'Expected at least 2 allocations')
  assert.ok(data.tasks.total >= 3, 'Expected at least 3 tasks')
})

test('Citizen dashboard API returns reports and progress history for Rahul Sharma', async () => {
  const loginRes = await req('POST', '/api/auth/login', undefined, {
    email: 'citizen.rahul@reliefgrid.org',
    password: DEMO_PASSWORD,
  })
  const token = loginRes.body.data.token

  const reportsRes = await req('GET', '/api/reports/mine', token)
  assert.equal(reportsRes.status, 200)
  assert.ok(Array.isArray(reportsRes.body.data))
  assert.ok(reportsRes.body.data.length >= 2, 'Expected Rahul to have at least 2 reports')

  const verifiedReport = reportsRes.body.data.find(
    (r: any) => r.title.includes('Urgent drinking water') && r.status === 'verified',
  )
  assert.ok(verifiedReport, 'Expected verified in-progress report for Rahul')

  const resolvedReport = reportsRes.body.data.find(
    (r: any) => r.title.includes('Medical emergency') && r.status === 'resolved',
  )
  assert.ok(resolvedReport, 'Expected resolved report for Rahul')
})

test('Donor dashboard API returns listed donations, allocation progress, and matching suggestions', async () => {
  const loginRes = await req('POST', '/api/auth/login', undefined, {
    email: 'donor.tata@reliefgrid.org',
    password: DEMO_PASSWORD,
  })
  const token = loginRes.body.data.token

  const donationsRes = await req('GET', '/api/donations/mine', token)
  assert.equal(donationsRes.status, 200)
  assert.ok(Array.isArray(donationsRes.body.data))
  assert.ok(donationsRes.body.data.length >= 3, 'Expected Tata Relief Trust to have at least 3 donations')

  const waterDonation = donationsRes.body.data.find((d: any) => d.resourceCategory === 'drinking_water')
  assert.ok(waterDonation)
  assert.equal(waterDonation.quantity, 200)
  assert.equal(waterDonation.quantityReserved, 50)
  assert.equal(waterDonation.quantityAllocated, 50)
  assert.equal(waterDonation.availabilityStatus, 'partially_allocated')
})

test('NGO dashboard API returns requirements, task oversight, and pending allocations for SEWA NGO', async () => {
  const loginRes = await req('POST', '/api/auth/login', undefined, {
    email: 'ngo.sewa@reliefgrid.org',
    password: DEMO_PASSWORD,
  })
  const token = loginRes.body.data.token

  // Requirements check
  const reqRes = await req('GET', '/api/ngo/requirements/mine', token)
  assert.equal(reqRes.status, 200)
  assert.ok(reqRes.body.data.length >= 2)

  // Dispatched tasks check
  const tasksRes = await req('GET', '/api/ngo/tasks', token)
  assert.equal(tasksRes.status, 200)
  assert.ok(tasksRes.body.data.length >= 2)

  const inTransitTask = tasksRes.body.data.find((t: any) => t.deliveryStatus === 'in_transit')
  assert.ok(inTransitTask, 'Expected in-transit task for SEWA NGO')
  assert.equal(inTransitTask.priority, 'critical')

  const deliveredTask = tasksRes.body.data.find((t: any) => t.deliveryStatus === 'delivered')
  assert.ok(deliveredTask, 'Expected delivered task for SEWA NGO')
  assert.equal(deliveredTask.confirmationStatus, 'confirmed')
  assert.equal(deliveredTask.reconciliationStatus, 'reconciled')
  assert.equal(deliveredTask.quantityDelivered, 40)
  assert.equal(deliveredTask.quantityRemaining, 10)
})

test('Volunteer dashboard API returns assigned tasks, transit details, and check-in timer for Arjun Verma', async () => {
  const loginRes = await req('POST', '/api/auth/login', undefined, {
    email: 'vol.arjun@reliefgrid.org',
    password: DEMO_PASSWORD,
  })
  const token = loginRes.body.data.token

  const tasksRes = await req('GET', '/api/volunteer/tasks/mine', token)
  assert.equal(tasksRes.status, 200)
  assert.ok(tasksRes.body.data.length >= 1)

  const activeTask = tasksRes.body.data.find((t: any) => t.deliveryStatus === 'in_transit')
  assert.ok(activeTask, 'Expected active task for Arjun')
  assert.ok(activeTask.safetyCheckIn)
  assert.equal(activeTask.safetyCheckIn.enabled, true)
  assert.ok(activeTask.safetyCheckIn.nextCheckInDue)

  const historyRes = await req('GET', '/api/volunteer/history', token)
  assert.equal(historyRes.status, 200)
  assert.ok(historyRes.body.data.some((t: any) => t.deliveryStatus === 'delivered'))
})

test('Entity relationships connect accurately across Incidents, Reports, Allocations, and Tasks', async () => {
  const incident = await IncidentModel.findOne({ title: /Mithi River Basin/i }).lean()
  assert.ok(incident)
  assert.ok(incident.linkedReports.length >= 2)

  const task = await VolunteerTaskModel.findOne({ taskDetails: /Transport 50 cartons/i }).lean()
  assert.ok(task)
  assert.ok(task.report)
  assert.ok(task.requirement)
  assert.ok(task.donation)
  assert.ok(task.volunteer)
  assert.ok(task.assignedByNgo)

  const report = await ReportModel.findById(task.report).lean()
  assert.ok(report)
  assert.equal(String(report.deliveryTask), String(task._id))

  const alloc = await AllocationRecordModel.findOne({ requirementId: task.requirement }).lean()
  assert.ok(alloc)
  assert.equal(String(alloc.donationId), String(task.donation))
})

test('Pre-existing non-demo user accounts were untouched and remain active', async () => {
  const existingUsers = await UserModel.find({
    email: { $in: ['karpepranav7@gmail.com', 'jayashrishimpi387@gmail.com', 'pranav@gmail.com'] },
  }).lean()

  assert.equal(existingUsers.length, 3, 'Pre-existing users must remain preserved in database')
  for (const u of existingUsers) {
    assert.equal(u.accountStatus, 'active')
  }
})

