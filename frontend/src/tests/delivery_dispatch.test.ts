import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getNearbyVolunteers,
  createNgoTask,
  getNgoTasks,
  confirmNgoTaskDelivery,
} from '../api/ngo'
import {
  getVolunteerVerifications,
  approveVolunteerVerification,
  rejectVolunteerVerification,
} from '../api/admin'

const TOKEN = 'mock-test-token'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('NGO Volunteer Dispatch & Task Oversight API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getNearbyVolunteers sends correct lat/lng/radius query', async () => {
    const mockVolunteers = [
      {
        _id: 'vol-1',
        displayName: 'Volunteer Alpha',
        skills: ['driving'],
        availability: 'available',
        currentWorkload: 1,
        serviceRadiusKm: 10,
        areas: ['Mumbai Central'],
        distanceKm: 3.2,
      },
    ]
    const fetchStub = mockFetch(200, { data: mockVolunteers })
    vi.stubGlobal('fetch', fetchStub)

    const result = await getNearbyVolunteers(TOKEN, { lat: 19.076, lng: 72.8777, radiusKm: 10 })
    expect(result).toHaveLength(1)
    expect(result[0].displayName).toBe('Volunteer Alpha')
    expect(fetchStub).toHaveBeenCalledWith(
      expect.stringContaining('/api/ngo/volunteers/nearby?lat=19.076&lng=72.8777&radiusKm=10'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
        }),
      }),
    )
  })

  it('createNgoTask sends POST /api/ngo/tasks with task details', async () => {
    const mockTask = {
      _id: 'task-101',
      volunteer: 'vol-1',
      taskDetails: 'Deliver first aid box',
      priority: 'high',
      assignmentStatus: 'assigned',
      pickupStatus: 'pending',
      deliveryStatus: 'pending',
      confirmationStatus: 'unconfirmed',
    }
    const fetchStub = mockFetch(201, { data: mockTask })
    vi.stubGlobal('fetch', fetchStub)

    const result = await createNgoTask(TOKEN, {
      volunteerId: 'vol-1',
      taskDetails: 'Deliver first aid box',
      priority: 'high',
      destinationLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
    })

    expect(result._id).toBe('task-101')
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/ngo/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          volunteerId: 'vol-1',
          taskDetails: 'Deliver first aid box',
          priority: 'high',
          destinationLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
        }),
      }),
    )
  })

  it('getNgoTasks retrieves dispatched tasks for calling NGO', async () => {
    const mockTasks = [
      {
        _id: 'task-101',
        taskDetails: 'Deliver food packets',
        assignmentStatus: 'accepted',
        deliveryStatus: 'in_transit',
      },
    ]
    const fetchStub = mockFetch(200, { data: mockTasks })
    vi.stubGlobal('fetch', fetchStub)

    const result = await getNgoTasks(TOKEN)
    expect(result).toHaveLength(1)
    expect(result[0].deliveryStatus).toBe('in_transit')
  })

  it('confirmNgoTaskDelivery posts confirmation to /api/ngo/tasks/:taskId/confirm-delivery', async () => {
    const confirmedTask = {
      _id: 'task-101',
      confirmationStatus: 'confirmed',
      deliveryStatus: 'delivered',
    }
    const fetchStub = mockFetch(200, { data: confirmedTask })
    vi.stubGlobal('fetch', fetchStub)

    const result = await confirmNgoTaskDelivery(TOKEN, 'task-101', 'confirm', 'Recipient verified')
    expect(result.confirmationStatus).toBe('confirmed')
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/ngo/tasks/task-101/confirm-delivery',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'confirm',
          notes: 'Recipient verified',
        }),
      }),
    )
  })
})

describe('Admin Volunteer Verification API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getVolunteerVerifications sends GET /api/admin/volunteers/verifications', async () => {
    const mockList = {
      data: [{ _id: 'ver-1', volunteer: 'vol-1', status: 'pending' }],
      page: { nextCursor: null },
    }
    const fetchStub = mockFetch(200, mockList)
    vi.stubGlobal('fetch', fetchStub)

    const result = await getVolunteerVerifications(TOKEN, { status: 'pending' })
    expect(result.data).toHaveLength(1)
    expect(result.data[0].status).toBe('pending')
  })

  it('approveVolunteerVerification sends POST /api/admin/volunteers/verifications/:id/approve', async () => {
    const mockApproved = { _id: 'ver-1', status: 'approved' }
    const fetchStub = mockFetch(200, { data: mockApproved })
    vi.stubGlobal('fetch', fetchStub)

    const result = await approveVolunteerVerification(TOKEN, 'ver-1')
    expect(result.status).toBe('approved')
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/admin/volunteers/verifications/ver-1/approve',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rejectVolunteerVerification sends POST /api/admin/volunteers/verifications/:id/reject with reason', async () => {
    const mockRejected = { _id: 'ver-1', status: 'rejected' }
    const fetchStub = mockFetch(200, { data: mockRejected })
    vi.stubGlobal('fetch', fetchStub)

    const result = await rejectVolunteerVerification(TOKEN, 'ver-1', 'Invalid government ID provided')
    expect(result.status).toBe('rejected')
    expect(fetchStub).toHaveBeenCalledWith(
      '/api/admin/volunteers/verifications/ver-1/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Invalid government ID provided' }),
      }),
    )
  })
})

