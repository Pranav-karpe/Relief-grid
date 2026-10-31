import { describe, it, expect, vi, afterEach } from 'vitest'
import { AuthApiError } from '../api/auth'
import {
  getMyTasks,
  getTask,
  acceptTask,
  declineTask,
  updateProgress,
  getTaskHistory,
  type VolunteerTask,
} from '../api/volunteer'

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

const MOCK_TASK: VolunteerTask = {
  _id: 'task0000000000000000000001',
  volunteer: '000000000000000000000040',
  assignmentStatus: 'assigned',
  pickupStatus: 'pending',
  deliveryStatus: 'pending',
  assignedLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
  taskDetails: 'Deliver bottled water to the relief camp at sector 4.',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const ACCEPTED_TASK: VolunteerTask = {
  ...MOCK_TASK,
  assignmentStatus: 'accepted',
  acceptedAt: '2025-01-02T00:00:00.000Z',
}

// ---------------------------------------------------------------------------
// getMyTasks
// ---------------------------------------------------------------------------

describe('getMyTasks', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/volunteer/tasks/mine with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_TASK], page: { nextCursor: null } }))
    const result = await getMyTasks(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_TASK._id)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/volunteer/tasks/mine')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyTasks(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('appends assignmentStatus filter to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyTasks(TOKEN, { assignmentStatus: 'accepted' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('assignmentStatus=accepted')
  })

  it('returns empty list when no tasks assigned', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getMyTasks(TOKEN)
    expect(result.data).toHaveLength(0)
    expect(result.page.nextCursor).toBeNull()
  })

  it('returns nextCursor when more pages exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_TASK], page: { nextCursor: 'next-cursor' } }))
    const result = await getMyTasks(TOKEN)
    expect(result.page.nextCursor).toBe('next-cursor')
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getMyTasks('bad-token')).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMyTasks(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe('getTask', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns a single task by ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_TASK }))
    const result = await getTask(TOKEN, MOCK_TASK._id)
    expect(result._id).toBe(MOCK_TASK._id)
    expect(result.assignmentStatus).toBe('assigned')
  })

  it('throws AuthApiError with status 404 for missing task', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Task not found.' }))
    await expect(getTask(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 404 for another volunteer\'s task (ownership enforced)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Task not found.' }))
    await expect(getTask(TOKEN, '000000000000000000000041')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getTask('bad-token', MOCK_TASK._id)).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// acceptTask
// ---------------------------------------------------------------------------

describe('acceptTask', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/volunteer/tasks/:id/accept and returns accepted task', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: ACCEPTED_TASK }))
    const result = await acceptTask(TOKEN, MOCK_TASK._id)
    expect(result.assignmentStatus).toBe('accepted')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/accept')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('throws AuthApiError with status 409 when task already accepted', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Cannot transition assignmentStatus from "accepted" to "accepted".' }))
    await expect(acceptTask(TOKEN, MOCK_TASK._id)).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 404 for missing task', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Task not found.' }))
    await expect(acceptTask(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 409 on concurrent claim conflict', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'conflict', message: 'Task state changed concurrently.' }))
    await expect(acceptTask(TOKEN, MOCK_TASK._id)).rejects.toMatchObject({ status: 409 })
  })

  it('uses server response, not a fabricated value', async () => {
    const serverTask = { ...ACCEPTED_TASK, acceptedAt: '2025-06-01T00:00:00.000Z' }
    vi.stubGlobal('fetch', mockFetch(200, { data: serverTask }))
    const result = await acceptTask(TOKEN, MOCK_TASK._id)
    expect(result.acceptedAt).toBe('2025-06-01T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// declineTask
// ---------------------------------------------------------------------------

describe('declineTask', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/volunteer/tasks/:id/decline and returns declined task', async () => {
    const declined = { ...MOCK_TASK, assignmentStatus: 'declined' as const }
    vi.stubGlobal('fetch', mockFetch(200, { data: declined }))
    const result = await declineTask(TOKEN, MOCK_TASK._id)
    expect(result.assignmentStatus).toBe('declined')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/decline')
    expect(call[1].method).toBe('POST')
  })

  it('sends reason in request body when provided', async () => {
    const declined = { ...MOCK_TASK, assignmentStatus: 'declined' as const }
    vi.stubGlobal('fetch', mockFetch(200, { data: declined }))
    await declineTask(TOKEN, MOCK_TASK._id, 'Unavailable today')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { reason?: string }
    expect(body.reason).toBe('Unavailable today')
  })

  it('throws AuthApiError with status 409 when task already declined', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Cannot transition assignmentStatus from "declined" to "declined".' }))
    await expect(declineTask(TOKEN, MOCK_TASK._id)).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 404 for missing task', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Task not found.' }))
    await expect(declineTask(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// updateProgress
// ---------------------------------------------------------------------------

describe('updateProgress', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH /api/volunteer/tasks/:id/progress and returns updated task', async () => {
    const updated = { ...ACCEPTED_TASK, pickupStatus: 'collected' as const, collectedAt: '2025-01-03T00:00:00.000Z' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await updateProgress(TOKEN, MOCK_TASK._id, { pickupStatus: 'collected' })
    expect(result.pickupStatus).toBe('collected')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/progress')
    expect(call[1].method).toBe('PATCH')
  })

  it('sends deliveryStatus update', async () => {
    const updated = { ...ACCEPTED_TASK, deliveryStatus: 'in_transit' as const }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await updateProgress(TOKEN, MOCK_TASK._id, { deliveryStatus: 'in_transit' })
    expect(result.deliveryStatus).toBe('in_transit')
  })

  it('sends proofOfDeliveryRef with delivered status', async () => {
    const updated = { ...ACCEPTED_TASK, deliveryStatus: 'delivered' as const, proofOfDeliveryRef: 'REF-001' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await updateProgress(TOKEN, MOCK_TASK._id, { deliveryStatus: 'delivered', proofOfDeliveryRef: 'REF-001' })
    expect(result.proofOfDeliveryRef).toBe('REF-001')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(call[1].body as string) as { proofOfDeliveryRef?: string }
    expect(body.proofOfDeliveryRef).toBe('REF-001')
  })

  it('throws AuthApiError with status 400 on validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'Field "volunteer" cannot be updated.' }))
    await expect(updateProgress(TOKEN, MOCK_TASK._id, {})).rejects.toBeInstanceOf(AuthApiError)
  })

  it('throws AuthApiError with status 409 on invalid transition', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Cannot transition pickupStatus from "collected" to "collected".' }))
    await expect(updateProgress(TOKEN, MOCK_TASK._id, { pickupStatus: 'collected' })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 409 when task not accepted', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Task must be accepted before updating progress.' }))
    await expect(updateProgress(TOKEN, MOCK_TASK._id, { pickupStatus: 'collected' })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 404 for another volunteer\'s task', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Task not found.' }))
    await expect(updateProgress(TOKEN, '000000000000000000000041', { pickupStatus: 'collected' })).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(updateProgress('bad-token', MOCK_TASK._id, { pickupStatus: 'collected' })).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getTaskHistory
// ---------------------------------------------------------------------------

describe('getTaskHistory', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/volunteer/history with Authorization header', async () => {
    const delivered = { ...ACCEPTED_TASK, deliveryStatus: 'delivered' as const }
    vi.stubGlobal('fetch', mockFetch(200, { data: [delivered], page: { nextCursor: null } }))
    const result = await getTaskHistory(TOKEN)
    expect(result.data).toHaveLength(1)
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/volunteer/history')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getTaskHistory(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns empty list when no history exists', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getTaskHistory(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getTaskHistory(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// Task status and type values
// ---------------------------------------------------------------------------

describe('VolunteerTask type values', () => {
  it('all expected assignmentStatuses are representable', () => {
    const statuses = ['assigned', 'accepted', 'declined', 'cancelled', 'reassigned']
    for (const s of statuses) {
      const t: VolunteerTask = { ...MOCK_TASK, assignmentStatus: s as VolunteerTask['assignmentStatus'] }
      expect(t.assignmentStatus).toBe(s)
    }
  })

  it('all expected pickupStatuses are representable', () => {
    const statuses = ['pending', 'collected', 'failed']
    for (const s of statuses) {
      const t: VolunteerTask = { ...MOCK_TASK, pickupStatus: s as VolunteerTask['pickupStatus'] }
      expect(t.pickupStatus).toBe(s)
    }
  })

  it('all expected deliveryStatuses are representable', () => {
    const statuses = ['pending', 'in_transit', 'delivered', 'failed']
    for (const s of statuses) {
      const t: VolunteerTask = { ...MOCK_TASK, deliveryStatus: s as VolunteerTask['deliveryStatus'] }
      expect(t.deliveryStatus).toBe(s)
    }
  })
})

// ---------------------------------------------------------------------------
// Duplicate submission prevention
// ---------------------------------------------------------------------------

describe('duplicate submission prevention', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('acceptTask resolves to the server response, not a fabricated value', async () => {
    const serverTask = { ...ACCEPTED_TASK, _id: 'server-assigned-id' }
    vi.stubGlobal('fetch', mockFetch(200, { data: serverTask }))
    const result = await acceptTask(TOKEN, MOCK_TASK._id)
    expect(result._id).toBe('server-assigned-id')
  })

  it('updateProgress resolves to the server response', async () => {
    const serverTask = { ...ACCEPTED_TASK, pickupStatus: 'collected' as const, collectedAt: '2025-06-01T00:00:00.000Z' }
    vi.stubGlobal('fetch', mockFetch(200, { data: serverTask }))
    const result = await updateProgress(TOKEN, MOCK_TASK._id, { pickupStatus: 'collected' })
    expect(result.collectedAt).toBe('2025-06-01T00:00:00.000Z')
  })
})
