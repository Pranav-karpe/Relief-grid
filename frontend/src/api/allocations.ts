import { AuthApiError } from './auth'

export type AllocationResult = {
  allocationId: string
  donationId: string
  requirementId: string
  quantity: number
  allocatedBy: string
  idempotencyKey: string | null
  donationStatus: string
  requirementStatus: string
  createdAt: string
}

export type ConfirmAllocationInput = {
  donationId: string
  requirementId: string
  quantity: number
  idempotencyKey?: string
}

export type AllocatedRequirement = {
  _id: string
  ngo: string
  resourceCategory: string
  quantityRequested: number
  quantityFulfilled: number
  quantityReserved: number
  unit: string
  priority: string
  status: string
  createdAt: string
  updatedAt: string
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

/** NGO or admin: confirm a resource allocation */
export async function confirmAllocation(
  token: string,
  input: ConfirmAllocationInput,
): Promise<AllocationResult> {
  const res = await fetch('/api/allocations', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  return parseResponse<AllocationResult>(res)
}

/** NGO: list own requirements that have allocations */
export async function getMyAllocations(
  token: string,
  params?: { limit?: number },
): Promise<ListResponse<AllocatedRequirement>> {
  const query = new URLSearchParams()
  if (params?.limit) query.set('limit', String(params.limit))
  const url = `/api/allocations/mine${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseListResponse<AllocatedRequirement>(res)
}
