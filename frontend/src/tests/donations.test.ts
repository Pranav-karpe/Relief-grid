import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthApiError } from '../api/auth'
import {
  createDonation,
  getMyDonations,
  getDonation,
  patchDonation,
  type Donation,
} from '../api/donations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'test-bearer-token'

const MOCK_DONATION: Donation = {
  _id: '000000000000000000000001',
  donor: '000000000000000000000010',
  resourceCategory: 'Water',
  description: 'Bottled water, 500ml bottles, sealed cases.',
  quantity: 100,
  quantityReserved: 0,
  quantityAllocated: 0,
  unit: 'cases',
  condition: 'new',
  location: { type: 'Point', coordinates: [72.8777, 19.076] },
  availabilityStatus: 'available',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const VALID_INPUT = {
  resourceCategory: 'Water',
  description: 'Bottled water, 500ml bottles, sealed cases.',
  quantity: 100,
  unit: 'cases',
  condition: 'new' as const,
  location: { type: 'Point' as const, coordinates: [72.8777, 19.076] as [number, number] },
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

// ---------------------------------------------------------------------------
// createDonation
// ---------------------------------------------------------------------------

describe('createDonation', () => {
  beforeEach(() => { vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_DONATION })) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/donations with Authorization header', async () => {
    const result = await createDonation(TOKEN, VALID_INPUT)
    expect(result._id).toBe(MOCK_DONATION._id)
    expect(result.availabilityStatus).toBe('available')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/donations')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('throws AuthApiError on 400 validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'resourceCategory is required.' }))
    await expect(createDonation(TOKEN, { ...VALID_INPUT, resourceCategory: '' })).rejects.toBeInstanceOf(AuthApiError)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Authentication is required.' }))
    await expect(createDonation('bad-token', VALID_INPUT)).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError with status 403 when not a donor', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(createDonation(TOKEN, VALID_INPUT)).rejects.toMatchObject({ status: 403 })
  })

  it('uses server-assigned _id, not a client-generated one', async () => {
    const serverDonation = { ...MOCK_DONATION, _id: 'server-assigned-id' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverDonation }))
    const result = await createDonation(TOKEN, VALID_INPUT)
    expect(result._id).toBe('server-assigned-id')
  })

  it('throws AuthApiError on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { code: 'internal_error', message: 'Internal server error.' }))
    await expect(createDonation(TOKEN, VALID_INPUT)).rejects.toMatchObject({ status: 500 })
  })
})

// ---------------------------------------------------------------------------
// getMyDonations
// ---------------------------------------------------------------------------

describe('getMyDonations', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns list and nextCursor from /api/donations/mine', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_DONATION], page: { nextCursor: null } }))
    const result = await getMyDonations(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_DONATION._id)
    expect(result.page.nextCursor).toBeNull()
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyDonations(TOKEN, 'abc123')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns empty list when donor has no donations', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getMyDonations(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getMyDonations(TOKEN)).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError with status 403 when not a donor', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(getMyDonations(TOKEN)).rejects.toMatchObject({ status: 403 })
  })

  it('returns nextCursor when more pages exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_DONATION], page: { nextCursor: 'next-page-cursor' } }))
    const result = await getMyDonations(TOKEN)
    expect(result.page.nextCursor).toBe('next-page-cursor')
  })
})

// ---------------------------------------------------------------------------
// getDonation
// ---------------------------------------------------------------------------

describe('getDonation', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns a single donation by ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_DONATION }))
    const result = await getDonation(TOKEN, MOCK_DONATION._id)
    expect(result._id).toBe(MOCK_DONATION._id)
    expect(result.resourceCategory).toBe('Water')
  })

  it('throws AuthApiError with status 404 for missing donation', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Donation not found.' }))
    await expect(getDonation(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 404 for another donor\'s donation (ownership enforced)', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Donation not found.' }))
    await expect(getDonation(TOKEN, '000000000000000000000002')).rejects.toMatchObject({ status: 404 })
  })

  it('throws AuthApiError with status 401 when unauthenticated', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getDonation('bad-token', MOCK_DONATION._id)).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// patchDonation
// ---------------------------------------------------------------------------

describe('patchDonation', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH with updated fields and returns updated donation', async () => {
    const updated = { ...MOCK_DONATION, resourceCategory: 'Food' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await patchDonation(TOKEN, MOCK_DONATION._id, { resourceCategory: 'Food' })
    expect(result.resourceCategory).toBe('Food')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 400 on invalid field', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'Field "donor" cannot be updated.' }))
    await expect(patchDonation(TOKEN, MOCK_DONATION._id, {})).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 409 on invalid status transition', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Only available donations can be cancelled.' }))
    await expect(patchDonation(TOKEN, MOCK_DONATION._id, { availabilityStatus: 'cancelled' })).rejects.toMatchObject({ status: 409 })
  })

  it('throws AuthApiError with status 403 when not a donor', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(patchDonation(TOKEN, MOCK_DONATION._id, { unit: 'kg' })).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError with status 404 for another donor\'s donation', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Donation not found.' }))
    await expect(patchDonation(TOKEN, '000000000000000000000002', { unit: 'kg' })).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// Status values
// ---------------------------------------------------------------------------

describe('donation status values', () => {
  it('all expected statuses are representable in the Donation type', () => {
    const statuses = ['available', 'reserved', 'partially_allocated', 'allocated', 'expired', 'cancelled']
    for (const s of statuses) {
      const d: Donation = { ...MOCK_DONATION, availabilityStatus: s as Donation['availabilityStatus'] }
      expect(d.availabilityStatus).toBe(s)
    }
  })

  it('all expected conditions are representable in the Donation type', () => {
    const conditions = ['new', 'good', 'fair', 'unknown']
    for (const c of conditions) {
      const d: Donation = { ...MOCK_DONATION, condition: c as Donation['condition'] }
      expect(d.condition).toBe(c)
    }
  })
})
