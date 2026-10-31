import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getMatchingSuggestions,
  getMatchesForDonation,
  getMatchesForRequirement,
  type MatchSuggestion,
} from '../api/matching'
import {
  confirmAllocation,
  getMyAllocations,
  type AllocationResult,
  type AllocatedRequirement,
} from '../api/allocations'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  type Notification,
} from '../api/notifications'
import {
  createCoordinationTask,
  getCoordinationTasks,
  type CoordinationTask,
} from '../api/coordination'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'test-bearer-token'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

const MOCK_SUGGESTION: MatchSuggestion = {
  donationId: '000000000000000000000010',
  requirementId: '000000000000000000000020',
  donationCategory: 'Water',
  requirementCategory: 'Water',
  availableQty: 50,
  remainingQty: 100,
  suggestedQty: 50,
  unit: 'cases',
  score: 5.5,
  scoreFactors: { priorityScore: 3, coverageRatio: 0.5, urgencyBonus: 2, distancePenalty: 0 },
  distanceKm: null,
  reasons: ['Category match: "Water"', 'Priority: high (score 3)'],
}

const MOCK_ALLOCATION: AllocationResult = {
  allocationId: '000000000000000000000030',
  donationId: '000000000000000000000010',
  requirementId: '000000000000000000000020',
  quantity: 50,
  allocatedBy: '000000000000000000000003',
  idempotencyKey: null,
  donationStatus: 'partially_allocated',
  requirementStatus: 'active',
  createdAt: '2025-01-01T00:00:00.000Z',
}

const MOCK_NOTIFICATION: Notification = {
  _id: 'notif000000000000000000001',
  recipient: '000000000000000000000003',
  eventType: 'allocation.confirmed',
  title: 'Resource allocation confirmed',
  message: '50 units of "Water" have been allocated.',
  relatedEntityType: 'Requirement',
  relatedEntityId: '000000000000000000000020',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const MOCK_TASK: CoordinationTask = {
  _id: 'task0000000000000000000001',
  volunteer: '000000000000000000000005',
  assignmentStatus: 'assigned',
  pickupStatus: 'pending',
  deliveryStatus: 'pending',
  assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
  taskDetails: 'Deliver bottled water to the relief camp at sector 4.',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// getMatchingSuggestions (admin only)
// ---------------------------------------------------------------------------

describe('getMatchingSuggestions', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/matching/suggestions with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_SUGGESTION] }))
    const result = await getMatchingSuggestions(TOKEN)
    expect(result).toHaveLength(1)
    expect(result[0].donationId).toBe(MOCK_SUGGESTION.donationId)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/matching/suggestions')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('appends limit to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [] }))
    await getMatchingSuggestions(TOKEN, { limit: 5 })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('limit=5')
  })

  it('returns empty array when no suggestions exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [] }))
    const result = await getMatchingSuggestions(TOKEN)
    expect(result).toHaveLength(0)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMatchingSuggestions(TOKEN)).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getMatchingSuggestions('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getMatchesForDonation (donor or admin)
// ---------------------------------------------------------------------------

describe('getMatchesForDonation', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/matching/donations/:id with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_SUGGESTION] }))
    const result = await getMatchesForDonation(TOKEN, MOCK_SUGGESTION.donationId)
    expect(result).toHaveLength(1)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain(`/api/matching/donations/${MOCK_SUGGESTION.donationId}`)
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('returns suggestion with score factors and reasons', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_SUGGESTION] }))
    const result = await getMatchesForDonation(TOKEN, MOCK_SUGGESTION.donationId)
    expect(result[0].scoreFactors.priorityScore).toBe(3)
    expect(result[0].reasons).toContain('Category match: "Water"')
  })

  it('throws AuthApiError with status 404 for unknown donation', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Donation not found.' }))
    await expect(getMatchesForDonation(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMatchesForDonation(TOKEN, MOCK_SUGGESTION.donationId)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// getMatchesForRequirement (ngo or admin)
// ---------------------------------------------------------------------------

describe('getMatchesForRequirement', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/matching/requirements/:id with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_SUGGESTION] }))
    const result = await getMatchesForRequirement(TOKEN, MOCK_SUGGESTION.requirementId)
    expect(result).toHaveLength(1)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain(`/api/matching/requirements/${MOCK_SUGGESTION.requirementId}`)
  })

  it('throws AuthApiError with status 404 for unknown requirement', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Requirement not found.' }))
    await expect(getMatchesForRequirement(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMatchesForRequirement(TOKEN, MOCK_SUGGESTION.requirementId)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// confirmAllocation (ngo or admin)
// ---------------------------------------------------------------------------

describe('confirmAllocation', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/allocations with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_ALLOCATION }))
    const result = await confirmAllocation(TOKEN, {
      donationId: MOCK_ALLOCATION.donationId,
      requirementId: MOCK_ALLOCATION.requirementId,
      quantity: 50,
    })
    expect(result.donationId).toBe(MOCK_ALLOCATION.donationId)
    expect(result.quantity).toBe(50)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/allocations')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('sends idempotencyKey when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_ALLOCATION }))
    await confirmAllocation(TOKEN, {
      donationId: MOCK_ALLOCATION.donationId,
      requirementId: MOCK_ALLOCATION.requirementId,
      quantity: 50,
      idempotencyKey: 'idem-key-001',
    })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { idempotencyKey?: string }
    expect(body.idempotencyKey).toBe('idem-key-001')
  })

  it('throws AuthApiError with status 400 on validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'quantity must be a positive number.' }))
    await expect(confirmAllocation(TOKEN, { donationId: 'x', requirementId: 'y', quantity: 0 })).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 409 on conflict', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'conflict', message: 'Donation state changed concurrently.' }))
    await expect(confirmAllocation(TOKEN, { donationId: 'x', requirementId: 'y', quantity: 10 })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 409 on insufficient quantity', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'insufficient_quantity', message: 'Only 5 units available.' }))
    await expect(confirmAllocation(TOKEN, { donationId: 'x', requirementId: 'y', quantity: 100 })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(confirmAllocation(TOKEN, { donationId: 'x', requirementId: 'y', quantity: 10 })).rejects.toMatchObject({ status: 403 })
  })

  it('uses server-confirmed result, not a fabricated value', async () => {
    const serverResult = { ...MOCK_ALLOCATION, donationStatus: 'allocated' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverResult }))
    const result = await confirmAllocation(TOKEN, { donationId: 'x', requirementId: 'y', quantity: 50 })
    expect(result.donationStatus).toBe('allocated')
  })
})

// ---------------------------------------------------------------------------
// getMyAllocations (ngo)
// ---------------------------------------------------------------------------

describe('getMyAllocations', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const MOCK_REQ: AllocatedRequirement = {
    _id: '000000000000000000000020',
    ngo: '000000000000000000000003',
    resourceCategory: 'Water',
    quantityRequested: 100,
    quantityFulfilled: 0,
    quantityReserved: 50,
    unit: 'cases',
    priority: 'high',
    status: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }

  it('sends GET /api/allocations/mine with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_REQ], page: { nextCursor: null } }))
    const result = await getMyAllocations(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].quantityReserved).toBe(50)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/allocations/mine')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('returns empty list when no allocations exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getMyAllocations(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMyAllocations(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// getNotifications
// ---------------------------------------------------------------------------

describe('getNotifications', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/notifications with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_NOTIFICATION], page: { nextCursor: null } }))
    const result = await getNotifications(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].eventType).toBe('allocation.confirmed')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/notifications')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('appends unread=true filter when requested', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getNotifications(TOKEN, { unread: true })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('unread=true')
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getNotifications(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns nextCursor when more pages exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_NOTIFICATION], page: { nextCursor: 'next-cursor' } }))
    const result = await getNotifications(TOKEN)
    expect(result.page.nextCursor).toBe('next-cursor')
  })

  it('returns empty list when no notifications exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getNotifications(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getNotifications('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

describe('getUnreadCount', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns count from /api/notifications/unread-count', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: { count: 3 } }))
    const count = await getUnreadCount(TOKEN)
    expect(count).toBe(3)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toBe('/api/notifications/unread-count')
  })

  it('returns 0 when no unread notifications', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: { count: 0 } }))
    const count = await getUnreadCount(TOKEN)
    expect(count).toBe(0)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getUnreadCount('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------

describe('markAsRead', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH /api/notifications/:id/read and returns updated notification', async () => {
    const read = { ...MOCK_NOTIFICATION, readAt: '2025-01-02T00:00:00.000Z' }
    vi.stubGlobal('fetch', mockFetch(200, { data: read }))
    const result = await markAsRead(TOKEN, MOCK_NOTIFICATION._id)
    expect(result.readAt).toBe('2025-01-02T00:00:00.000Z')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain(`/api/notifications/${MOCK_NOTIFICATION._id}/read`)
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 404 for another user\'s notification', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Notification not found.' }))
    await expect(markAsRead(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(markAsRead('bad-token', MOCK_NOTIFICATION._id)).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// markAllAsRead
// ---------------------------------------------------------------------------

describe('markAllAsRead', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH /api/notifications/read-all and returns modifiedCount', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: { modifiedCount: 5 } }))
    const result = await markAllAsRead(TOKEN)
    expect(result.modifiedCount).toBe(5)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/notifications/read-all')
    expect(call[1].method).toBe('PATCH')
  })

  it('returns 0 when no unread notifications to mark', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: { modifiedCount: 0 } }))
    const result = await markAllAsRead(TOKEN)
    expect(result.modifiedCount).toBe(0)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(markAllAsRead('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// createCoordinationTask (admin only)
// ---------------------------------------------------------------------------

describe('createCoordinationTask', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const VALID_INPUT = {
    volunteerId: '000000000000000000000005',
    taskDetails: 'Deliver bottled water to the relief camp at sector 4.',
    assignedLocation: { type: 'Point' as const, coordinates: [72.8777, 19.076] as [number, number] },
  }

  it('sends POST /api/coordination/tasks with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_TASK }))
    const result = await createCoordinationTask(TOKEN, VALID_INPUT)
    expect(result._id).toBe(MOCK_TASK._id)
    expect(result.assignmentStatus).toBe('assigned')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/coordination/tasks')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('sends optional donationId and requirementId when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_TASK }))
    await createCoordinationTask(TOKEN, {
      ...VALID_INPUT,
      donationId: '000000000000000000000010',
      requirementId: '000000000000000000000020',
    })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { donationId?: string; requirementId?: string }
    expect(body.donationId).toBe('000000000000000000000010')
    expect(body.requirementId).toBe('000000000000000000000020')
  })

  it('throws AuthApiError with status 400 on validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'volunteerId is required.' }))
    await expect(createCoordinationTask(TOKEN, { ...VALID_INPUT, volunteerId: '' })).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(createCoordinationTask(TOKEN, VALID_INPUT)).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError with status 404 when volunteer not found', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Volunteer not found.' }))
    await expect(createCoordinationTask(TOKEN, VALID_INPUT)).rejects.toMatchObject({ status: 404 })
  })

  it('uses server-assigned _id, not a client-generated one', async () => {
    const serverTask = { ...MOCK_TASK, _id: 'server-assigned-id' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverTask }))
    const result = await createCoordinationTask(TOKEN, VALID_INPUT)
    expect(result._id).toBe('server-assigned-id')
  })
})

// ---------------------------------------------------------------------------
// getCoordinationTasks (admin only)
// ---------------------------------------------------------------------------

describe('getCoordinationTasks', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/coordination/tasks with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_TASK], page: { nextCursor: null } }))
    const result = await getCoordinationTasks(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_TASK._id)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/coordination/tasks')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('appends volunteerId filter to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getCoordinationTasks(TOKEN, { volunteerId: '000000000000000000000005' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('volunteerId=000000000000000000000005')
  })

  it('appends assignmentStatus filter to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getCoordinationTasks(TOKEN, { assignmentStatus: 'accepted' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('assignmentStatus=accepted')
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getCoordinationTasks(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns empty list when no tasks exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getCoordinationTasks(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getCoordinationTasks(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// MatchSuggestion type values
// ---------------------------------------------------------------------------

describe('MatchSuggestion type values', () => {
  it('suggestion has all required fields', () => {
    const s: MatchSuggestion = MOCK_SUGGESTION
    expect(typeof s.score).toBe('number')
    expect(Array.isArray(s.reasons)).toBe(true)
    expect(s.scoreFactors).toBeDefined()
  })

  it('distanceKm can be null when locations are unavailable', () => {
    const s: MatchSuggestion = { ...MOCK_SUGGESTION, distanceKm: null }
    expect(s.distanceKm).toBeNull()
  })

  it('distanceKm can be a number when locations are available', () => {
    const s: MatchSuggestion = { ...MOCK_SUGGESTION, distanceKm: 42.5 }
    expect(s.distanceKm).toBe(42.5)
  })
})
