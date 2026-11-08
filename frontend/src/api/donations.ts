import { AuthApiError } from './auth'

export type DonationCondition = 'new' | 'good' | 'fair' | 'unknown'
export type DonationStatus =
  | 'available'
  | 'reserved'
  | 'partially_allocated'
  | 'allocated'
  | 'expired'
  | 'cancelled'

export type GeoPoint = { type: 'Point'; coordinates: [number, number] }

export type EvidencePhoto = {
  storageKey: string
  url: string
  fileType: string
  fileSize: number
  reviewStatus: 'clean' | 'flagged' | 'rejected' | 'pending'
  reviewFlags: string[]
  uploadedAt: string
}

export type Donation = {
  _id: string
  donor: string
  resourceCategory: string
  description: string
  quantity: number
  quantityReserved: number
  quantityAllocated: number
  unit: string
  condition: DonationCondition
  batchNumber?: string
  manufacturingDate?: string
  expiryDate?: string
  coldChainRequired?: boolean
  quarantineStatus?: 'none' | 'quarantined_expired' | 'quarantined_safety'
  evidencePhotos?: EvidencePhoto[]
  location: GeoPoint
  availabilityStatus: DonationStatus
  createdAt: string
  updatedAt: string
}

export type CreateDonationInput = {
  resourceCategory: string
  description: string
  quantity: number
  unit: string
  condition: DonationCondition
  location: GeoPoint
  batchNumber?: string
  manufacturingDate?: string
  expiryDate?: string
  coldChainRequired?: boolean
  photos?: Array<{ data: string; name?: string }>
}

export type PatchDonationInput = {
  resourceCategory?: string
  description?: string
  quantity?: number
  unit?: string
  condition?: DonationCondition
  batchNumber?: string
  manufacturingDate?: string | null
  expiryDate?: string | null
  coldChainRequired?: boolean
  availabilityStatus?: 'available' | 'cancelled'
}

type ListResponse = { data: Donation[]; page: { nextCursor: string | null } }

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

async function parseListResponse(res: Response): Promise<ListResponse> {
  const json = (await res.json().catch(() => ({}))) as ListResponse & { code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      (json as { code?: string }).code ?? 'api_error',
      (json as { message?: string }).message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json
}

export async function createDonation(token: string, input: CreateDonationInput): Promise<Donation> {
  const res = await fetch('/api/donations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  return parseResponse<Donation>(res)
}

export async function uploadDonationPhotos(
  token: string,
  donationId: string,
  photos: Array<{ data: string; name?: string }>,
): Promise<Donation> {
  const res = await fetch(`/api/donations/${donationId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ photos }),
  })
  return parseResponse<Donation>(res)
}

export async function getMyDonations(token: string, cursor?: string): Promise<ListResponse> {
  const url = cursor ? `/api/donations/mine?cursor=${encodeURIComponent(cursor)}` : '/api/donations/mine'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return parseListResponse(res)
}

export async function getDonation(token: string, donationId: string): Promise<Donation> {
  const res = await fetch(`/api/donations/${donationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseResponse<Donation>(res)
}

export async function patchDonation(token: string, donationId: string, patch: PatchDonationInput): Promise<Donation> {
  const res = await fetch(`/api/donations/${donationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  })
  return parseResponse<Donation>(res)
}
