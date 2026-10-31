import { UserModel, type UserDocument } from '../models/user.js'
import { userRoles, type UserRole } from '../models/common.js'
import { createAccessToken } from './jwt.js'
import { hashPassword, verifyPassword } from './password.js'

export type RegistrationInput = {
  displayName: string
  email: string
  password: string
  phone?: string
  role?: Exclude<UserRole, 'admin'>
  skills?: string[]
  generalLocation?: { type: 'Point'; coordinates: [number, number] }
  organizationName?: string
  registrationNumber?: string
  darpanId?: string
}

export type AuthRepository = {
  findByEmail: (email: string) => Promise<UserDocument | null>
  create: (data: object) => Promise<UserDocument>
}

export class DuplicateEmailError extends Error {}
export class InvalidCredentialsError extends Error {}

export const userRepository: AuthRepository = {
  findByEmail: (email) => UserModel.findOne({ email }).select('+auth.passwordHash').exec(),
  create: (data) => UserModel.create(data),
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isPublicRole(role: string | undefined): role is Exclude<UserRole, 'admin'> {
  return role === undefined || (userRoles.includes(role as UserRole) && role !== 'admin')
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  )
}

export async function register(
  input: RegistrationInput,
  repository: AuthRepository,
): Promise<UserDocument> {
  const existingUser = await repository.findByEmail(normalizeEmail(input.email))
  if (existingUser) {
    throw new DuplicateEmailError('An account with this email already exists.')
  }

  const role = input.role ?? 'citizen'
  const data: Record<string, unknown> = {
    displayName: input.displayName.trim(),
    email: normalizeEmail(input.email),
    role,
    accountStatus: 'active',
    auth: { passwordHash: await hashPassword(input.password) },
  }

  if (input.phone) {
    data.phone = input.phone.trim()
  }

  if (role === 'volunteer') {
    data.volunteerProfile = {
      phone: input.phone?.trim() ?? '',
      skills: Array.isArray(input.skills) ? input.skills : [],
      availability: 'available',
      ...(input.generalLocation ? { generalLocation: input.generalLocation } : {}),
      serviceRadiusKm: 10,
      areas: [],
      verificationStatus: 'pending',
      currentWorkload: 0,
      affiliation: 'independent',
    }
  } else if (role === 'ngo') {
    data.organizationProfile = {
      name: input.organizationName?.trim() ?? '',
      registrationNumber: input.registrationNumber?.trim() ?? '',
      darpanId: input.darpanId?.trim() ?? '',
      verificationStatus: 'not_submitted',
    }
  }

  try {
    return await repository.create(data)
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new DuplicateEmailError('An account with this email already exists.')
    }
    throw error
  }
}

export async function login(
  email: string,
  password: string,
  repository: AuthRepository,
  secret: string,
  expiresInSeconds: number,
): Promise<{ user: UserDocument; token: string }> {
  const user = await repository.findByEmail(normalizeEmail(email))
  const passwordHash = user?.auth?.passwordHash
  const validPassword = passwordHash ? await verifyPassword(password, passwordHash) : false

  if (!user || !validPassword || user.accountStatus !== 'active') {
    throw new InvalidCredentialsError('Invalid email or password.')
  }

  return {
    user,
    token: createAccessToken(user.id, user.role, secret, expiresInSeconds),
  }
}
