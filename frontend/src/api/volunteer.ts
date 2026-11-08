import { AuthApiError } from './auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeoPoint = { type: 'Point'; coordinates: [number, number] }

export type AssignmentStatus = 'assigned' | 'accepted' | 'declined' | 'cancelled' | 'reassigned'
export type PickupStatus = 'pending' | 'collected' | 'failed'
export type DeliveryStatus = 'pending' | 'in_transit' | 'delivered_pending_confirmation' | 'delivered' | 'failed'
export type ConfirmationStatus = 'unconfirmed' | 'awaiting_confirmation' | 'confirmed' | 'disputed'

export type TaskHistoryEntry = {
  status: string
  changedBy: string
  changedAt: string
  reason?: string
}

export type ProofOfDelivery = {
  proofType: 'signature' | 'photo' | 'receipt' | 'multiple' | 'none'
  signatureData?: string
  photoUrl?: string
  receiptUrl?: string
  capturedAt?: string
}

export type ProxyHandover = {
  isProxy: boolean
  recipientType: 'primary_recipient' | 'proxy_coordinator' | 'community_shelter_lead' | 'family_member' | 'local_authority'
  recipientName?: string
  recipientPhone?: string
  reason?: string
}

export type SafetyCheckInHistory = {
  checkedInAt: string
  note?: string
  location?: GeoPoint
}

export type VolunteerTask = {
  _id: string
  volunteer: string
  donation?: string
  report?: string
  requirement?: string
  assignmentStatus: AssignmentStatus
  pickupStatus: PickupStatus
  deliveryStatus: DeliveryStatus
  confirmationStatus?: ConfirmationStatus
  priority?: 'low' | 'medium' | 'high' | 'critical'
  assignedLocation: GeoPoint
  pickupLocation?: GeoPoint
  destinationLocation?: GeoPoint
  taskDetails: string
  acceptedAt?: string
  collectedAt?: string
  deliveredAt?: string
  confirmedAt?: string
  confirmationNotes?: string
  proofOfDeliveryRef?: string
  proofOfDelivery?: ProofOfDelivery
  proxyHandover?: ProxyHandover
  quantityTarget?: number
  quantityDelivered?: number
  quantityRemaining?: number
  discrepancyReason?: string
  discrepancyNotes?: string
  requiredVehicleType?: string
  cargoWeightKg?: number
  cargoVolumeM3?: number
  safetyCheckIn?: {
    enabled: boolean
    intervalMinutes: number
    lastCheckInAt?: string
    nextCheckInDue?: string
    overdueAlertSent?: boolean
    history: SafetyCheckInHistory[]
  }
  history?: TaskHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export type VolunteerProfile = {
  _id: string
  displayName: string
  email: string
  phone?: string
  role: string
  volunteerProfile?: {
    phone?: string
    skills?: string[]
    availability?: 'available' | 'busy' | 'unavailable'
    serviceRadiusKm?: number
    areas?: string[]
    experience?: string
    vehicleType?: 'foot' | 'bicycle' | 'two_wheeler' | 'four_wheeler' | 'truck' | 'boat'
    cargoCapacityKg?: number
    volumeCapacityM3?: number
    verificationStatus?: string
    currentWorkload?: number
  }
}

export type ProgressInput = {
  pickupStatus?: PickupStatus
  deliveryStatus?: DeliveryStatus
  proofOfDeliveryRef?: string
  proofOfDelivery?: {
    proofType: 'signature' | 'photo' | 'receipt' | 'multiple' | 'none'
    signatureData?: string
    photoUrl?: string
    receiptUrl?: string
  }
  proxyHandover?: {
    isProxy: boolean
    recipientType: 'primary_recipient' | 'proxy_coordinator' | 'community_shelter_lead' | 'family_member' | 'local_authority'
    recipientName?: string
    recipientPhone?: string
    reason?: string
  }
  quantityDelivered?: number
  discrepancyReason?: string
  discrepancyNotes?: string
}

type ListResponse<T> = { data: T[]; page: { nextCursor: string | null } }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseResponse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { data?: T; code?: string; message?: string }
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

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function getVolunteerProfile(token: string): Promise<VolunteerProfile> {
  const res = await fetch('/api/volunteer/profile', { headers: authHeaders(token) })
  return parseResponse<VolunteerProfile>(res)
}

export async function getAssignedTasks(
  token: string,
  params?: { cursor?: string; assignmentStatus?: AssignmentStatus },
): Promise<ListResponse<VolunteerTask>> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.assignmentStatus) query.set('assignmentStatus', params.assignmentStatus)
  const url = `/api/volunteer/tasks/mine${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<VolunteerTask>(res)
}

export const getMyTasks = getAssignedTasks

export async function getTask(token: string, taskId: string): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}`, { headers: authHeaders(token) })
  return parseResponse<VolunteerTask>(res)
}

export async function acceptTask(token: string, taskId: string): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}/accept`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  return parseResponse<VolunteerTask>(res)
}

export async function declineTask(token: string, taskId: string, reason?: string): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}/decline`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(reason ? { reason } : {}),
  })
  return parseResponse<VolunteerTask>(res)
}

export async function updateProgress(
  token: string,
  taskId: string,
  input: ProgressInput,
): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}/progress`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  return parseResponse<VolunteerTask>(res)
}

export async function checkInTask(
  token: string,
  taskId: string,
  data?: { note?: string; location?: GeoPoint },
): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}/checkin`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data ?? {}),
  })
  return parseResponse<VolunteerTask>(res)
}

export async function releaseTask(
  token: string,
  taskId: string,
  reason: string,
): Promise<VolunteerTask> {
  const res = await fetch(`/api/volunteer/tasks/${taskId}/release`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ reason }),
  })
  return parseResponse<VolunteerTask>(res)
}

export async function getTaskHistory(
  token: string,
  params?: { cursor?: string },
): Promise<ListResponse<VolunteerTask>> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  const url = `/api/volunteer/history${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<VolunteerTask>(res)
}
