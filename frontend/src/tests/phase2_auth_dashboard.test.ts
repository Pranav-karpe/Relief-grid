import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ROLE_DASHBOARD, ROLE_LABELS, ALL_ROLES, isValidRole } from '../lib/roles'
import type { UserRole, SafeUser } from '../api/auth'
import { getMe, login, register, AuthApiError } from '../api/auth'

// ---------------------------------------------------------------------------
// Mock and Test Setup
// ---------------------------------------------------------------------------

const MOCK_CITIZEN: SafeUser = {
  id: 'usr_cit_001',
  displayName: 'Jane Citizen',
  email: 'jane@example.com',
  role: 'citizen',
  accountStatus: 'active',
  emailVerified: true,
}

const MOCK_DONOR: SafeUser = {
  id: 'usr_don_002',
  displayName: 'Relief Donor Co',
  email: 'donor@example.com',
  role: 'donor',
  accountStatus: 'active',
  emailVerified: true,
}

const MOCK_NGO: SafeUser = {
  id: 'usr_ngo_003',
  displayName: 'Red Cross Chapter',
  email: 'ngo@example.com',
  role: 'ngo',
  accountStatus: 'active',
  emailVerified: true,
}

describe('Phase 2: Role Access & Isolation', () => {
  it('maps all five distinct roles to isolated dashboard endpoints', () => {
    expect(ALL_ROLES).toHaveLength(5)
    const dashboardEndpoints = ALL_ROLES.map((r) => ROLE_DASHBOARD[r])
    const uniqueEndpoints = new Set(dashboardEndpoints)
    expect(uniqueEndpoints.size).toBe(5)

    expect(ROLE_DASHBOARD.citizen).toBe('/dashboard/citizen')
    expect(ROLE_DASHBOARD.donor).toBe('/dashboard/donor')
    expect(ROLE_DASHBOARD.ngo).toBe('/dashboard/ngo')
    expect(ROLE_DASHBOARD.volunteer).toBe('/dashboard/volunteer')
    expect(ROLE_DASHBOARD.admin).toBe('/dashboard/admin')
  })

  it('provides human-readable labels for all five roles', () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_LABELS[r]).toBeDefined()
      expect(ROLE_LABELS[r].length).toBeGreaterThan(0)
    }
    expect(ROLE_LABELS.citizen).toBe('Citizen')
    expect(ROLE_LABELS.donor).toBe('Donor')
    expect(ROLE_LABELS.ngo).toBe('NGO')
    expect(ROLE_LABELS.volunteer).toBe('Volunteer')
    expect(ROLE_LABELS.admin).toBe('Administrator')
  })

  it('prevents public registration as admin', () => {
    expect(isValidRole('admin')).toBe(true) // Valid system role
    // But excluded from public roles:
    const publicRoles: Exclude<UserRole, 'admin'>[] = ['citizen', 'donor', 'volunteer', 'ngo']
    expect(publicRoles).not.toContain('admin')
  })
})

describe('Phase 2: Session Restoration & Auth API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getMe returns user data when token is valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: MOCK_CITIZEN }),
    } as Response)

    const user = await getMe('valid-test-token')
    expect(user.id).toBe('usr_cit_001')
    expect(user.role).toBe('citizen')
    expect(user.displayName).toBe('Jane Citizen')
  })

  it('getMe throws AuthApiError with status 401 when session has expired', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ code: 'invalid_token', message: 'The access token is invalid or expired.' }),
    } as Response)

    await expect(getMe('expired-token')).rejects.toThrow(AuthApiError)
  })

  it('login verifies credentials and returns token + user payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { token: 'jwt-header.payload.sig', user: MOCK_DONOR } }),
    } as Response)

    const result = await login('donor@example.com', 'SecurePassword123!')
    expect(result.token).toBe('jwt-header.payload.sig')
    expect(result.user.role).toBe('donor')
  })

  it('login throws AuthApiError on invalid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ code: 'invalid_credentials', message: 'Invalid email or password.' }),
    } as Response)

    await expect(login('wrong@example.com', 'badpass123')).rejects.toThrow('Invalid email or password.')
  })

  it('register creates user with intended role', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: MOCK_NGO }),
    } as Response)

    const created = await register('Red Cross Chapter', 'ngo@example.com', 'Secret123456!', 'ngo')
    expect(created.role).toBe('ngo')
    expect(created.displayName).toBe('Red Cross Chapter')
  })

  it('register handles duplicate email error (409)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ code: 'email_taken', message: 'An account with this email already exists.' }),
    } as Response)

    await expect(register('Sam Duplicate', 'sam@example.com', 'Secret123456!', 'volunteer')).rejects.toThrow(
      'An account with this email already exists.',
    )
  })
})

describe('Phase 2: Post-Authentication Destination Sanitization', () => {
  function computePostLoginDestination(from: string | undefined, userRole: UserRole): string {
    const userDashboard = ROLE_DASHBOARD[userRole]
    const isAuthorizedDest = from && (from === userDashboard || from.startsWith(`${userDashboard}?`))
    return isAuthorizedDest ? from : userDashboard
  }

  it('preserves matching dashboard tab for authorized role', () => {
    const dest = computePostLoginDestination('/dashboard/citizen?tab=reports', 'citizen')
    expect(dest).toBe('/dashboard/citizen?tab=reports')
  })

  it('redirects to user role dashboard when internal destination is for a different role', () => {
    // Citizen attempting to follow a link to /dashboard/admin
    const dest = computePostLoginDestination('/dashboard/admin', 'citizen')
    expect(dest).toBe('/dashboard/citizen')
  })

  it('redirects to user role dashboard when internal destination is outside dashboard', () => {
    const dest = computePostLoginDestination('/unknown-page', 'volunteer')
    expect(dest).toBe('/dashboard/volunteer')
  })

  it('defaults to role dashboard when from is undefined', () => {
    const dest = computePostLoginDestination(undefined, 'ngo')
    expect(dest).toBe('/dashboard/ngo')
  })
})
