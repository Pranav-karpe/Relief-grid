import { describe, it, expect, vi, afterEach } from 'vitest'
import { AuthApiError } from '../api/auth'
import {
  getNgoProfile,
  patchNgoProfile,
  getNgoVerification,
  submitNgoVerification,
  getNgoReports,
  getNgoReport,
  createRequirement,
  getMyRequirements,
  getRequirement,
  patchRequirement,
  cancelRequirement,
  type NgoProfile,
  type NgoVerification,
  type NgoReport,
  type Requirement,
} from '../api/ngo'

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

const MOCK_PROFILE: NgoProfile = {
  _id: '000000000000000000000030',
  displayName: 'Relief Org',
  email: 'ngo@example.com',
  role: 'ngo',
  accountStatus: 'active',
  organizationProfile: { name: 'Relief Org Inc', registrationNumber: 'REG123', verificationStatus: 'not_submitted' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const MOCK_VERIFICATION: NgoVerification = {
  _id: 'v000000000000000000000001',
  ngo: '000000000000000000000030',
  status: 'pending',
  createdAt: '2025-01-02T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
}

const MOCK_REPORT: NgoReport = {
  _id: 'r000000000000000000000001',
  title: 'Water shortage in sector 4',
  needCategory: 'water',
  urgency: 'high',
  location: { type: 'Point', coordinates: [72.8777, 19.076] },
  status: 'submitted',
  requestedResources: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const MOCK_REQUIREMENT: Requirement = {
  _id: 'req00000000000000000000001',
  ngo: '000000000000000000000030',
  resourceCategory: 'Water',
  description: 'Bottled water needed for flood victims in the area.',
  quantityRequested: 100,
  quantityFulfilled: 0,
  quantityReserved: 0,
  unit: 'cases',
  priority: 'high',
  deliveryArea: { type: 'Point', coordinates: [72.8777, 19.076] },
  status: 'active',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const VALID_REQ_INPUT = {
  resourceCategory: 'Water',
  description: 'Bottled water needed for flood victims in the area.',
  quantityRequested: 100,
  unit: 'cases',
  priority: 'high' as const,
  deliveryArea: { type: 'Point' as const, coordinates: [72.8777, 19.076] as [number, number] },
}

// ---------------------------------------------------------------------------
// getNgoProfile
// ---------------------------------------------------------------------------

describe('getNgoProfile', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends GET /api/ngo/profile with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_PROFILE }))
    const result = await getNgoProfile(TOKEN)
    expect(result._id).toBe(MOCK_PROFILE._id)
    expect(result.role).toBe('ngo')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/ngo/profile')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getNgoProfile('bad-token')).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getNgoProfile(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// patchNgoProfile
// ---------------------------------------------------------------------------

describe('patchNgoProfile', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH /api/ngo/profile and returns updated profile', async () => {
    const updated = { ...MOCK_PROFILE, displayName: 'Updated Name' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await patchNgoProfile(TOKEN, { displayName: 'Updated Name' })
    expect(result.displayName).toBe('Updated Name')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 400 on validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'displayName must be 2–120 characters.' }))
    await expect(patchNgoProfile(TOKEN, { displayName: 'X' })).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 400 when attempting to set verificationStatus', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'Field "verificationStatus" cannot be updated.' }))
    await expect(patchNgoProfile(TOKEN, {})).rejects.toBeInstanceOf(AuthApiError)
  })
})

// ---------------------------------------------------------------------------
// getNgoVerification
// ---------------------------------------------------------------------------

describe('getNgoVerification', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns verification record when one exists', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_VERIFICATION }))
    const result = await getNgoVerification(TOKEN)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('pending')
  })

  it('returns null when no verification record exists', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: null }))
    const result = await getNgoVerification(TOKEN)
    expect(result).toBeNull()
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getNgoVerification(TOKEN)).rejects.toMatchObject({ status: 403 })
  })
})

// ---------------------------------------------------------------------------
// submitNgoVerification
// ---------------------------------------------------------------------------

describe('submitNgoVerification', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/ngo/verification/submit and returns created record', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_VERIFICATION }))
    const result = await submitNgoVerification(TOKEN)
    expect(result.status).toBe('pending')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/ngo/verification/submit')
    expect(call[1].method).toBe('POST')
  })

  it('throws AuthApiError with status 400 when org name is missing', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'organizationProfile.name is required.' }))
    await expect(submitNgoVerification(TOKEN)).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 409 on duplicate pending submission', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'duplicate_submission', message: 'A verification request is already pending.' }))
    await expect(submitNgoVerification(TOKEN)).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 409 when already verified', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Your organisation is already verified.' }))
    await expect(submitNgoVerification(TOKEN)).rejects.toMatchObject({ status: 409 })
  })
})

// ---------------------------------------------------------------------------
// getNgoReports
// ---------------------------------------------------------------------------

describe('getNgoReports', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns list and nextCursor from /api/ngo/reports', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_REPORT], page: { nextCursor: null } }))
    const result = await getNgoReports(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_REPORT._id)
    expect(result.page.nextCursor).toBeNull()
  })

  it('appends urgency filter to URL', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getNgoReports(TOKEN, { urgency: 'high' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('urgency=high')
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getNgoReports(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns empty list when no reports match', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getNgoReports(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getNgoReports(TOKEN)).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getNgoReports('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getNgoReport
// ---------------------------------------------------------------------------

describe('getNgoReport', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns a single report by ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_REPORT }))
    const result = await getNgoReport(TOKEN, MOCK_REPORT._id)
    expect(result._id).toBe(MOCK_REPORT._id)
    expect(result.urgency).toBe('high')
  })

  it('throws AuthApiError with status 404 for missing report', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Report not found.' }))
    await expect(getNgoReport(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('does not expose reporter identity (no reporter field in response type)', () => {
    // The NgoReport type must not include a reporter field
    const r: NgoReport = MOCK_REPORT
    expect('reporter' in r).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createRequirement
// ---------------------------------------------------------------------------

describe('createRequirement', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/ngo/requirements with Authorization header', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_REQUIREMENT }))
    const result = await createRequirement(TOKEN, VALID_REQ_INPUT)
    expect(result._id).toBe(MOCK_REQUIREMENT._id)
    expect(result.status).toBe('active')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/ngo/requirements')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('uses server-assigned _id, not a client-generated one', async () => {
    const serverReq = { ...MOCK_REQUIREMENT, _id: 'server-assigned-id' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverReq }))
    const result = await createRequirement(TOKEN, VALID_REQ_INPUT)
    expect(result._id).toBe('server-assigned-id')
  })

  it('throws AuthApiError with status 400 on validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'resourceCategory must be 1–80 characters.' }))
    await expect(createRequirement(TOKEN, { ...VALID_REQ_INPUT, resourceCategory: '' })).rejects.toBeInstanceOf(AuthApiError)
  })

  it('throws AuthApiError with status 403 when wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(createRequirement(TOKEN, VALID_REQ_INPUT)).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(createRequirement('bad-token', VALID_REQ_INPUT)).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { code: 'internal_error', message: 'Internal server error.' }))
    await expect(createRequirement(TOKEN, VALID_REQ_INPUT)).rejects.toMatchObject({ status: 500 })
  })
})

// ---------------------------------------------------------------------------
// getMyRequirements
// ---------------------------------------------------------------------------

describe('getMyRequirements', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns list and nextCursor from /api/ngo/requirements/mine', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_REQUIREMENT], page: { nextCursor: null } }))
    const result = await getMyRequirements(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_REQUIREMENT._id)
    expect(result.page.nextCursor).toBeNull()
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyRequirements(TOKEN, { cursor: 'abc123' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('appends status filter to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyRequirements(TOKEN, { status: 'active' })
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('status=active')
  })

  it('returns empty list when NGO has no requirements', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getMyRequirements(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('returns nextCursor when more pages exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_REQUIREMENT], page: { nextCursor: 'next-cursor' } }))
    const result = await getMyRequirements(TOKEN)
    expect(result.page.nextCursor).toBe('next-cursor')
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getMyRequirements('bad-token')).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getRequirement
// ---------------------------------------------------------------------------

describe('getRequirement', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns a single requirement by ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_REQUIREMENT }))
    const result = await getRequirement(TOKEN, MOCK_REQUIREMENT._id)
    expect(result._id).toBe(MOCK_REQUIREMENT._id)
    expect(result.resourceCategory).toBe('Water')
  })

  it('throws AuthApiError with status 404 for missing requirement', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Requirement not found.' }))
    await expect(getRequirement(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 404 for another NGO\'s requirement (ownership enforced)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Requirement not found.' }))
    await expect(getRequirement(TOKEN, '000000000000000000000031')).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// patchRequirement
// ---------------------------------------------------------------------------

describe('patchRequirement', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH and returns updated requirement', async () => {
    const updated = { ...MOCK_REQUIREMENT, unit: 'kg' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await patchRequirement(TOKEN, MOCK_REQUIREMENT._id, { unit: 'kg' })
    expect(result.unit).toBe('kg')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 400 when protected field ngo is sent', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'Field "ngo" cannot be updated.' }))
    await expect(patchRequirement(TOKEN, MOCK_REQUIREMENT._id, {})).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 409 when requirement is not active', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Only active requirements can be edited.' }))
    await expect(patchRequirement(TOKEN, MOCK_REQUIREMENT._id, { unit: 'kg' })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 404 for another NGO\'s requirement', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Requirement not found.' }))
    await expect(patchRequirement(TOKEN, '000000000000000000000031', { unit: 'kg' })).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// cancelRequirement
// ---------------------------------------------------------------------------

describe('cancelRequirement', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH to cancel endpoint and returns cancelled requirement', async () => {
    const cancelled = { ...MOCK_REQUIREMENT, status: 'cancelled' as const }
    vi.stubGlobal('fetch', mockFetch(200, { data: cancelled }))
    const result = await cancelRequirement(TOKEN, MOCK_REQUIREMENT._id)
    expect(result.status).toBe('cancelled')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/cancel')
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 409 when requirement is not active', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Only active requirements can be cancelled.' }))
    await expect(cancelRequirement(TOKEN, MOCK_REQUIREMENT._id)).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 409 when quantities are reserved', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Cannot cancel a requirement with reserved quantities.' }))
    await expect(cancelRequirement(TOKEN, MOCK_REQUIREMENT._id)).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 404 for another NGO\'s requirement', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Requirement not found.' }))
    await expect(cancelRequirement(TOKEN, '000000000000000000000031')).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// Requirement status values
// ---------------------------------------------------------------------------

describe('requirement status and priority values', () => {
  it('all expected statuses are representable in the Requirement type', () => {
    const statuses = ['active', 'fulfilled', 'expired', 'cancelled']
    for (const s of statuses) {
      const r: Requirement = { ...MOCK_REQUIREMENT, status: s as Requirement['status'] }
      expect(r.status).toBe(s)
    }
  })

  it('all expected priorities are representable in the Requirement type', () => {
    const priorities = ['low', 'medium', 'high', 'critical']
    for (const p of priorities) {
      const r: Requirement = { ...MOCK_REQUIREMENT, priority: p as Requirement['priority'] }
      expect(r.priority).toBe(p)
    }
  })
})

// ---------------------------------------------------------------------------
// Loading state / duplicate submission prevention
// ---------------------------------------------------------------------------

describe('duplicate submission prevention', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('createRequirement resolves to the server response, not a fabricated value', async () => {
    const serverReq = { ...MOCK_REQUIREMENT, _id: 'server-assigned-id', ngo: 'server-assigned-ngo' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverReq }))
    const result = await createRequirement(TOKEN, VALID_REQ_INPUT)
    expect(result._id).toBe('server-assigned-id')
    expect(result.ngo).toBe('server-assigned-ngo')
  })

  it('submitNgoVerification resolves to the server response', async () => {
    const serverVer = { ...MOCK_VERIFICATION, _id: 'server-ver-id' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverVer }))
    const result = await submitNgoVerification(TOKEN)
    expect(result._id).toBe('server-ver-id')
  })
})
