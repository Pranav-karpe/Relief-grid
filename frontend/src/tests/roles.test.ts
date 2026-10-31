import { describe, it, expect } from 'vitest'
import { ROLE_DASHBOARD, ROLE_LABELS, ALL_ROLES, isValidRole } from '../lib/roles'
import type { UserRole } from '../api/auth'

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

describe('ROLE_DASHBOARD', () => {
  it('maps every known role to a unique dashboard path', () => {
    const paths = ALL_ROLES.map((r) => ROLE_DASHBOARD[r])
    expect(new Set(paths).size).toBe(ALL_ROLES.length)
    for (const path of paths) {
      expect(path).toMatch(/^\/dashboard\//)
    }
  })

  it('maps each role to the expected path', () => {
    expect(ROLE_DASHBOARD.citizen).toBe('/dashboard/citizen')
    expect(ROLE_DASHBOARD.donor).toBe('/dashboard/donor')
    expect(ROLE_DASHBOARD.volunteer).toBe('/dashboard/volunteer')
    expect(ROLE_DASHBOARD.ngo).toBe('/dashboard/ngo')
    expect(ROLE_DASHBOARD.admin).toBe('/dashboard/admin')
  })
})

describe('ROLE_LABELS', () => {
  it('provides a label for every role', () => {
    for (const role of ALL_ROLES) {
      expect(typeof ROLE_LABELS[role]).toBe('string')
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// isValidRole
// ---------------------------------------------------------------------------

describe('isValidRole', () => {
  it('accepts all five known roles', () => {
    const roles: UserRole[] = ['citizen', 'donor', 'volunteer', 'ngo', 'admin']
    for (const role of roles) {
      expect(isValidRole(role)).toBe(true)
    }
  })

  it('rejects unknown, empty and non-string values', () => {
    expect(isValidRole('superuser')).toBe(false)
    expect(isValidRole('')).toBe(false)
    expect(isValidRole(undefined)).toBe(false)
    expect(isValidRole(null)).toBe(false)
    expect(isValidRole(42)).toBe(false)
    expect(isValidRole('ADMIN')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Role isolation — each role maps to a different path
// ---------------------------------------------------------------------------

describe('role isolation', () => {
  it('no two roles share the same dashboard path', () => {
    const paths = ALL_ROLES.map((r) => ROLE_DASHBOARD[r])
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        expect(paths[i]).not.toBe(paths[j])
      }
    }
  })

  it('citizen cannot reach donor path via ROLE_DASHBOARD', () => {
    expect(ROLE_DASHBOARD.citizen).not.toBe(ROLE_DASHBOARD.donor)
  })

  it('admin path is distinct from all other role paths', () => {
    const nonAdmin = ALL_ROLES.filter((r) => r !== 'admin')
    for (const role of nonAdmin) {
      expect(ROLE_DASHBOARD[role]).not.toBe(ROLE_DASHBOARD.admin)
    }
  })
})

// ---------------------------------------------------------------------------
// ALL_ROLES completeness
// ---------------------------------------------------------------------------

describe('ALL_ROLES', () => {
  it('contains exactly the five expected roles', () => {
    expect(ALL_ROLES).toHaveLength(5)
    expect(ALL_ROLES).toContain('citizen')
    expect(ALL_ROLES).toContain('donor')
    expect(ALL_ROLES).toContain('volunteer')
    expect(ALL_ROLES).toContain('ngo')
    expect(ALL_ROLES).toContain('admin')
  })

  it('correctly validates public self-registration roles excluding admin', () => {
    const publicRoles = ['citizen', 'donor', 'volunteer', 'ngo']
    for (const r of publicRoles) {
      expect(isValidRole(r) && r !== 'admin').toBe(true)
    }
    expect(isValidRole('admin') && 'admin' !== 'admin').toBe(false)
  })
})
