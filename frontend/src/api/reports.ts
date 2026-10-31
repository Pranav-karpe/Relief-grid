import { AuthApiError } from './auth'

export type ReportStatus = 'draft' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'resolved'
export type ReportUrgency = 'low' | 'medium' | 'high' | 'critical'
export type ReportCategory = 'food' | 'water' | 'shelter' | 'medical' | 'other'

export type GeoPoint = { type: 'Point'; coordinates: [number, number] }

export type ResourceRequest = { category: string; quantity: number; unit: string }

export type TimelineEvent = {
  stage: 'submitted' | 'verified' | 'allocated' | 'assigned' | 'in_transit' | 'delivered' | 'disputed'
  title: string
  description?: string
  timestamp: string
  actorRole?: string
}

export type Report = {
  _id: string
  reporter: string
  title: string
  description: string
  needCategory: ReportCategory
  urgency: ReportUrgency
  location: GeoPoint
  status: ReportStatus
  affectedPersonCount?: number
  requestedResources: ResourceRequest[]
  evidenceRefs: string[]
  timeline?: TimelineEvent[]
  deliveryTask?: string | Record<string, unknown>
  assignedNgo?: string | Record<string, unknown>
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high'
    riskScore: number
    explanation: string
    flags: string[]
  }
  createdAt: string
  updatedAt: string
}

export type CreateReportInput = {
  title: string
  description: string
  needCategory: ReportCategory
  urgency: ReportUrgency
  location: GeoPoint
  affectedPersonCount?: number
  requestedResources?: ResourceRequest[]
  status?: 'draft' | 'submitted'
}

export type PatchReportInput = {
  title?: string
  description?: string
  needCategory?: ReportCategory
  urgency?: ReportUrgency
  status?: 'draft' | 'submitted'
}

type ListResponse = { data: Report[]; page: { nextCursor: string | null } }

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({})) as { data?: T } & { code?: string; message?: string }
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
  const json = await res.json().catch(() => ({})) as ListResponse & { code?: string; message?: string }
  if (!res.ok) {
    throw new AuthApiError(
      (json as { code?: string }).code ?? 'api_error',
      (json as { message?: string }).message ?? `Request failed with status ${res.status}`,
      res.status,
    )
  }
  return json
}

export async function createReport(token: string, input: CreateReportInput): Promise<Report> {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  return parseResponse<Report>(res)
}

export async function getMyReports(token: string, cursor?: string): Promise<ListResponse> {
  const url = cursor ? `/api/reports/mine?cursor=${encodeURIComponent(cursor)}` : '/api/reports/mine'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return parseListResponse(res)
}

export async function getReport(token: string, reportId: string): Promise<Report> {
  const res = await fetch(`/api/reports/${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseResponse<Report>(res)
}

export async function patchReport(token: string, reportId: string, patch: PatchReportInput): Promise<Report> {
  const res = await fetch(`/api/reports/${reportId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  })
  return parseResponse<Report>(res)
}
