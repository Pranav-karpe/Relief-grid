import { AuthApiError } from './auth'

export type GeoPoint = { type: 'Point'; coordinates: [number, number] }

export type CoordinationTask = {
  _id: string
  volunteer: string
  donation?: string
  report?: string
  requirement?: string
  assignmentStatus: string
  pickupStatus: string
  deliveryStatus: string
  assignedLocation: GeoPoint
  taskDetails: string
  acceptedAt?: string
  collectedAt?: string
  deliveredAt?: string
  proofOfDeliveryRef?: string
  createdAt: string
  updatedAt: string
}

export type CreateTaskInput = {
  volunteerId: string
  taskDetails: string
  assignedLocation: GeoPoint
  donationId?: string
  requirementId?: string
  reportId?: string
}

type ListResponse<T> = { data: T[]; page: { nextCursor: string | null } }

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({})) as { data?: T; code?: string; message?: string }
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
  const json = await res.json().catch(() => ({})) as ListResponse<T> & { code?: string; message?: string }
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

/** Admin only: create a volunteer task */
export async function createCoordinationTask(
  token: string,
  input: CreateTaskInput,
): Promise<CoordinationTask> {
  const res = await fetch('/api/coordination/tasks', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  return parseResponse<CoordinationTask>(res)
}

/** Admin only: list all tasks with optional filters */
export async function getCoordinationTasks(
  token: string,
  params?: { cursor?: string; limit?: number; volunteerId?: string; assignmentStatus?: string },
): Promise<ListResponse<CoordinationTask>> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.volunteerId) query.set('volunteerId', params.volunteerId)
  if (params?.assignmentStatus) query.set('assignmentStatus', params.assignmentStatus)
  const url = `/api/coordination/tasks${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<CoordinationTask>(res)
}
