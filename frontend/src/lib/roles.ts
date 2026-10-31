import type { UserRole } from '../api/auth'

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  citizen: '/dashboard/citizen',
  donor: '/dashboard/donor',
  volunteer: '/dashboard/volunteer',
  ngo: '/dashboard/ngo',
  admin: '/dashboard/admin',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: 'Citizen',
  donor: 'Donor',
  volunteer: 'Volunteer',
  ngo: 'NGO',
  admin: 'Administrator',
}

export const ALL_ROLES: UserRole[] = ['citizen', 'donor', 'volunteer', 'ngo', 'admin']

export function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ALL_ROLES.includes(value as UserRole)
}
