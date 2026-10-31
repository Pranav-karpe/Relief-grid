export type UserRole = 'citizen' | 'donor' | 'volunteer' | 'ngo' | 'admin'

export type SafeUser = {
  id: string
  displayName: string
  email: string
  role: UserRole
  accountStatus: string
  emailVerified: boolean
  organizationProfile?: {
    name?: string
    registrationNumber?: string
    verificationStatus?: string
  }
}

export type AuthResult = { token: string; user: SafeUser }

type ApiErrorBody = { code?: string; message?: string }

export class AuthApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({})) as { data?: T } & ApiErrorBody
  if (!res.ok) {
    throw new AuthApiError(
      json.code ?? 'api_error',
      json.message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json.data as T
}

export async function register(
  displayName: string,
  email: string,
  password: string,
  role?: Exclude<UserRole, 'admin'>,
): Promise<SafeUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, email, password, ...(role ? { role } : {}) }),
  })
  return parseResponse<SafeUser>(res)
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return parseResponse<AuthResult>(res)
}

export async function getMe(token: string): Promise<SafeUser> {
  const res = await fetch('/api/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseResponse<SafeUser>(res)
}

export async function updateProfile(
  token: string,
  patch: { displayName?: string; organizationProfile?: { name?: string; registrationNumber?: string } },
): Promise<SafeUser> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  })
  return parseResponse<SafeUser>(res)
}
