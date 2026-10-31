import { AuthApiError } from './auth'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type GeoPoint = { type: 'Point'; coordinates: [number, number] }

export type VerificationStatus = 'not_submitted' | 'pending' | 'under_review' | 'verified' | 'rejected' | 'suspended'

export type NgoProfile = {
  _id: string
  displayName: string
  email: string
  phone?: string
  role: string
  accountStatus: string
  organizationProfile?: {
    name?: string
    registrationNumber?: string
    darpanId?: string
    contactPhone?: string
    website?: string
    verificationStatus?: VerificationStatus
    verifiedAt?: string
    rejectionReason?: string
  }
  createdAt: string
  updatedAt: string
}

export type NgoVerification = {
  _id: string
  ngo: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  submittedData?: {
    name?: string
    registrationNumber?: string
    darpanId?: string
    contactPhone?: string
    website?: string
  }
  assessmentReport?: {
    assessment: string
    confidence: number
    recommendation: string
    summary: string
    flags: string[]
    duplicateChecks?: {
      duplicateRegFound: boolean
      duplicateNameFound: boolean
      duplicateContactFound: boolean
      matchingAccounts: string[]
    }
    registryChecks?: {
      checkedAt: string
      sourcesChecked: string[]
      registryMatchFound: boolean
      matchDetails: string
      inconclusive: boolean
    }
  }
  reason?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type TimelineEvent = {
  stage: 'submitted' | 'verified' | 'allocated' | 'assigned' | 'in_transit' | 'delivered' | 'disputed'
  title: string
  description?: string
  timestamp: string
  actorRole?: string
}

export type NgoReport = {
  _id: string
  title: string
  needCategory: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  location: GeoPoint
  status: string
  affectedPersonCount?: number
  requestedResources: { category: string; quantity: number; unit: string }[]
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high'
    riskScore: number
    explanation: string
    flags: string[]
  }
  timeline?: TimelineEvent[]
  deliveryTask?: string
  assignedNgo?: string
  createdAt: string
  updatedAt: string
}

export type RequirementStatus = 'active' | 'fulfilled' | 'expired' | 'cancelled'
export type RequirementPriority = 'low' | 'medium' | 'high' | 'critical'

export type Requirement = {
  _id: string
  ngo: string
  resourceCategory: string
  description: string
  quantityRequested: number
  quantityFulfilled: number
  quantityReserved: number
  unit: string
  priority: RequirementPriority
  deliveryArea: GeoPoint
  status: RequirementStatus
  neededBy?: string
  createdAt: string
  updatedAt: string
}

export type CreateRequirementInput = {
  resourceCategory: string
  description: string
  quantityRequested: number
  unit: string
  priority: RequirementPriority
  deliveryArea: GeoPoint
  neededBy?: string
}

export type PatchRequirementInput = {
  resourceCategory?: string
  description?: string
  quantityRequested?: number
  unit?: string
  priority?: RequirementPriority
  deliveryArea?: GeoPoint
  neededBy?: string | null
}

export type NearbyVolunteer = {
  _id: string
  displayName: string
  skills: string[]
  availability: 'available' | 'busy' | 'unavailable'
  currentWorkload: number
  serviceRadiusKm: number
  areas: string[]
  phone?: string
  distanceKm: number
}

export type NgoTask = {
  _id: string
  volunteer: {
    _id: string
    displayName: string
    email?: string
    volunteerProfile?: {
      phone?: string
      skills?: string[]
    }
  }
  report?: {
    _id: string
    title: string
    needCategory: string
    urgency: string
    status: string
    location?: GeoPoint
    affectedPersonCount?: number
  }
  requirement?: {
    _id: string
    resourceCategory: string
    description: string
    unit: string
    quantityRequested: number
  }
  assignmentStatus: 'assigned' | 'accepted' | 'declined' | 'cancelled' | 'reassigned'
  pickupStatus: 'pending' | 'collected' | 'failed'
  deliveryStatus: 'pending' | 'in_transit' | 'delivered_pending_confirmation' | 'delivered' | 'failed'
  confirmationStatus: 'unconfirmed' | 'awaiting_confirmation' | 'confirmed' | 'disputed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  taskDetails: string
  pickupLocation?: GeoPoint
  destinationLocation?: GeoPoint
  acceptedAt?: string
  collectedAt?: string
  deliveredAt?: string
  confirmedAt?: string
  confirmationNotes?: string
  createdAt: string
  updatedAt: string
}

export type CreateTaskInput = {
  volunteerId: string
  taskDetails: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  reportId?: string
  requirementId?: string
  pickupLocation?: GeoPoint
  destinationLocation?: GeoPoint
}

type ListResponse<T> = { data: T[]; page: { nextCursor: string | null } }

// ---------------------------------------------------------------------------
// Shared fetch helpers
// ---------------------------------------------------------------------------

async function parseResponse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { data?: T } & { code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      json.code ?? 'api_error',
      json.message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json.data as T
}

async function parseListResponse<T>(res: Response): Promise<ListResponse<T>> {
  const json = (await res.json().catch(() => ({}))) as ListResponse<T> & { code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      (json as { code?: string }).code ?? 'api_error',
      (json as { message?: string }).message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ---------------------------------------------------------------------------
// NGO profile
// ---------------------------------------------------------------------------

export async function getNgoProfile(token: string): Promise<NgoProfile> {
  const res = await fetch('/api/ngo/profile', { headers: authHeaders(token) })
  return parseResponse<NgoProfile>(res)
}

export async function patchNgoProfile(
  token: string,
  patch: {
    displayName?: string
    phone?: string
    organizationProfile?: {
      name?: string
      registrationNumber?: string
      darpanId?: string
      contactPhone?: string
      website?: string
    }
  },
): Promise<NgoProfile> {
  const res = await fetch('/api/ngo/profile', {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  })
  return parseResponse<NgoProfile>(res)
}

// ---------------------------------------------------------------------------
// NGO verification
// ---------------------------------------------------------------------------

export async function getNgoVerification(token: string): Promise<NgoVerification | null> {
  const res = await fetch('/api/ngo/verification', { headers: authHeaders(token) })
  return parseResponse<NgoVerification | null>(res)
}

export async function submitNgoVerification(
  token: string,
  payload?: {
    organizationName?: string
    registrationNumber?: string
    darpanId?: string
    contactPhone?: string
    website?: string
  },
): Promise<NgoVerification> {
  const res = await fetch('/api/ngo/verification/submit', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload ?? {}),
  })
  return parseResponse<NgoVerification>(res)
}

// ---------------------------------------------------------------------------
// NGO report review
// ---------------------------------------------------------------------------

export async function getNgoReports(
  token: string,
  params?: { cursor?: string; urgency?: string; needCategory?: string; status?: string },
): Promise<ListResponse<NgoReport>> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.urgency) query.set('urgency', params.urgency)
  if (params?.needCategory) query.set('needCategory', params.needCategory)
  if (params?.status) query.set('status', params.status)
  const url = `/api/ngo/reports${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<NgoReport>(res)
}

export async function getNgoReport(token: string, reportId: string): Promise<NgoReport> {
  const res = await fetch(`/api/ngo/reports/${reportId}`, { headers: authHeaders(token) })
  return parseResponse<NgoReport>(res)
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export async function createRequirement(token: string, input: CreateRequirementInput): Promise<Requirement> {
  const res = await fetch('/api/ngo/requirements', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  return parseResponse<Requirement>(res)
}

export async function getMyRequirements(
  token: string,
  params?: { cursor?: string; status?: string },
): Promise<ListResponse<Requirement>> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.status) query.set('status', params.status)
  const url = `/api/ngo/requirements/mine${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<Requirement>(res)
}

export async function getRequirement(token: string, requirementId: string): Promise<Requirement> {
  const res = await fetch(`/api/ngo/requirements/${requirementId}`, { headers: authHeaders(token) })
  return parseResponse<Requirement>(res)
}

export async function patchRequirement(
  token: string,
  requirementId: string,
  patch: PatchRequirementInput,
): Promise<Requirement> {
  const res = await fetch(`/api/ngo/requirements/${requirementId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  })
  return parseResponse<Requirement>(res)
}

export async function cancelRequirement(token: string, requirementId: string): Promise<Requirement> {
  const res = await fetch(`/api/ngo/requirements/${requirementId}/cancel`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  return parseResponse<Requirement>(res)
}

// ---------------------------------------------------------------------------
// Nearby Volunteers Discovery (10 km default strict filter)
// ---------------------------------------------------------------------------

export async function getNearbyVolunteers(
  token: string,
  options: { lat: number; lng: number; radiusKm?: number; availability?: string },
): Promise<NearbyVolunteer[]> {
  const query = new URLSearchParams({
    lat: String(options.lat),
    lng: String(options.lng),
    radiusKm: String(options.radiusKm ?? 10),
  })
  if (options.availability) query.set('availability', options.availability)

  const res = await fetch(`/api/ngo/volunteers/nearby?${query.toString()}`, {
    headers: authHeaders(token),
  })
  return parseResponse<NearbyVolunteer[]>(res)
}

// ---------------------------------------------------------------------------
// NGO Task Dispatch & Confirmation
// ---------------------------------------------------------------------------

export async function createNgoTask(token: string, input: CreateTaskInput): Promise<NgoTask> {
  const res = await fetch('/api/ngo/tasks', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  return parseResponse<NgoTask>(res)
}

export async function getNgoTasks(
  token: string,
  params?: { deliveryStatus?: string; confirmationStatus?: string },
): Promise<NgoTask[]> {
  const query = new URLSearchParams()
  if (params?.deliveryStatus) query.set('deliveryStatus', params.deliveryStatus)
  if (params?.confirmationStatus) query.set('confirmationStatus', params.confirmationStatus)
  const url = `/api/ngo/tasks${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseResponse<NgoTask[]>(res)
}

export async function confirmNgoTaskDelivery(
  token: string,
  taskId: string,
  action: 'confirm' | 'dispute',
  notes?: string,
): Promise<NgoTask> {
  const res = await fetch(`/api/ngo/tasks/${taskId}/confirm-delivery`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action, notes }),
  })
  return parseResponse<NgoTask>(res)
}
