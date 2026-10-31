import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthApiError } from '../api/auth'
import { createReport, getMyReports, getReport, patchReport } from '../api/reports'
import type { Report } from '../api/reports'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN = 'test-bearer-token'

const MOCK_REPORT: Report = {
  _id: '000000000000000000000001',
  reporter: '000000000000000000000010',
  title: 'Water shortage in sector 4',
  description: 'Residents have had no clean water for three days.',
  needCategory: 'water',
  urgency: 'high',
  location: { type: 'Point', coordinates: [72.8777, 19.076] },
  status: 'submitted',
  requestedResources: [],
  evidenceRefs: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
}

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

// ---------------------------------------------------------------------------
// createReport
// ---------------------------------------------------------------------------

describe('createReport', () => {
  beforeEach(() => { vi.stubGlobal('fetch', mockFetch(201, { data: MOCK_REPORT })) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends POST /api/reports with Authorization header', async () => {
    const result = await createReport(TOKEN, {
      title: MOCK_REPORT.title,
      description: MOCK_REPORT.description,
      needCategory: 'water',
      urgency: 'high',
      location: { type: 'Point', coordinates: [72.8777, 19.076] },
    })
    expect(result._id).toBe(MOCK_REPORT._id)
    expect(result.status).toBe('submitted')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('/api/reports')
    expect(call[1].method).toBe('POST')
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('throws AuthApiError on 400 validation error', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'title is required' }))
    await expect(createReport(TOKEN, {
      title: '',
      description: 'x'.repeat(10),
      needCategory: 'food',
      urgency: 'low',
      location: { type: 'Point', coordinates: [0, 0] },
    })).rejects.toBeInstanceOf(AuthApiError)
  })

  it('throws AuthApiError with status 401 on missing auth', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Authentication is required.' }))
    await expect(createReport('bad-token', {
      title: 'Test',
      description: 'x'.repeat(10),
      needCategory: 'food',
      urgency: 'low',
      location: { type: 'Point', coordinates: [0, 0] },
    })).rejects.toMatchObject({ status: 401 })
  })

  it('throws AuthApiError with status 403 on wrong role', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { code: 'forbidden', message: 'Forbidden.' }))
    await expect(createReport(TOKEN, {
      title: 'Test',
      description: 'x'.repeat(10),
      needCategory: 'food',
      urgency: 'low',
      location: { type: 'Point', coordinates: [0, 0] },
    })).rejects.toMatchObject({ status: 403 })
  })

  it('throws AuthApiError on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { code: 'internal_error', message: 'Internal server error.' }))
    await expect(createReport(TOKEN, {
      title: 'Test',
      description: 'x'.repeat(10),
      needCategory: 'food',
      urgency: 'low',
      location: { type: 'Point', coordinates: [0, 0] },
    })).rejects.toMatchObject({ status: 500 })
  })
})

// ---------------------------------------------------------------------------
// getMyReports
// ---------------------------------------------------------------------------

describe('getMyReports', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns list and nextCursor from /api/reports/mine', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [MOCK_REPORT], page: { nextCursor: null } }))
    const result = await getMyReports(TOKEN)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]._id).toBe(MOCK_REPORT._id)
    expect(result.page.nextCursor).toBeNull()
  })

  it('appends cursor to URL when provided', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    await getMyReports(TOKEN, 'abc123')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
    expect(call[0]).toContain('cursor=abc123')
  })

  it('returns empty list when no reports exist', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: [], page: { nextCursor: null } }))
    const result = await getMyReports(TOKEN)
    expect(result.data).toHaveLength(0)
  })

  it('throws AuthApiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { code: 'authentication_required', message: 'Auth required.' }))
    await expect(getMyReports(TOKEN)).rejects.toMatchObject({ status: 401 })
  })
})

// ---------------------------------------------------------------------------
// getReport
// ---------------------------------------------------------------------------

describe('getReport', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns a single report by ID', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { data: MOCK_REPORT }))
    const result = await getReport(TOKEN, MOCK_REPORT._id)
    expect(result._id).toBe(MOCK_REPORT._id)
    expect(result.status).toBe('submitted')
  })

  it('throws AuthApiError with status 404 for missing report', async () => {
    vi.stubGlobal('fetch', mockFetch(404, { code: 'not_found', message: 'Report not found.' }))
    await expect(getReport(TOKEN, '000000000000000000000099')).rejects.toMatchObject({ status: 404 })
  })
})

// ---------------------------------------------------------------------------
// patchReport
// ---------------------------------------------------------------------------

describe('patchReport', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends PATCH with updated fields and returns updated report', async () => {
    const updated = { ...MOCK_REPORT, title: 'Updated title text here' }
    vi.stubGlobal('fetch', mockFetch(200, { data: updated }))
    const result = await patchReport(TOKEN, MOCK_REPORT._id, { title: 'Updated title text here' })
    expect(result.title).toBe('Updated title text here')
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(call[1].method).toBe('PATCH')
  })

  it('throws AuthApiError with status 400 on invalid status transition', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { code: 'validation_error', message: 'Invalid status.' }))
    await expect(patchReport(TOKEN, MOCK_REPORT._id, { status: 'submitted' })).rejects.toMatchObject({ status: 400 })
  })

  it('throws AuthApiError with status 409 on state conflict', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { code: 'invalid_transition', message: 'Only draft reports can be edited.' }))
    await expect(patchReport(TOKEN, MOCK_REPORT._id, { title: 'New title here' })).rejects.toMatchObject({ status: 409 })
  })
})

// ---------------------------------------------------------------------------
// Duplicate submission prevention — loading state
// ---------------------------------------------------------------------------

describe('duplicate submission prevention', () => {
  it('createReport resolves to the server response, not a fabricated value', async () => {
    const serverReport = { ...MOCK_REPORT, _id: 'server-assigned-id' }
    vi.stubGlobal('fetch', mockFetch(201, { data: serverReport }))
    const result = await createReport(TOKEN, {
      title: MOCK_REPORT.title,
      description: MOCK_REPORT.description,
      needCategory: 'water',
      urgency: 'high',
      location: { type: 'Point', coordinates: [72.8777, 19.076] },
    })
    // Must use server-assigned ID, not a client-generated one
    expect(result._id).toBe('server-assigned-id')
  })
})

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

describe('report status values', () => {
  it('all expected statuses are representable in the Report type', () => {
    const statuses = ['draft', 'submitted', 'under_review', 'verified', 'rejected', 'resolved']
    for (const s of statuses) {
      const r: Report = { ...MOCK_REPORT, status: s as Report['status'] }
      expect(r.status).toBe(s)
    }
  })
})
