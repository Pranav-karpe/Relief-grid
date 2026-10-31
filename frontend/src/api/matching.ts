import { AuthApiError } from './auth'

export type ScoreFactors = {
  priorityScore: number
  coverageRatio: number
  urgencyBonus: number
  distancePenalty: number
}

export type MatchSuggestion = {
  donationId: string
  requirementId: string
  donationCategory: string
  requirementCategory: string
  availableQty: number
  remainingQty: number
  suggestedQty: number
  unit: string
  score: number
  scoreFactors: ScoreFactors
  distanceKm: number | null
  reasons: string[]
}

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

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** Admin-only: platform-wide suggestions */
export async function getMatchingSuggestions(
  token: string,
  params?: { limit?: number },
): Promise<MatchSuggestion[]> {
  const query = new URLSearchParams()
  if (params?.limit) query.set('limit', String(params.limit))
  const url = `/api/matching/suggestions${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseResponse<MatchSuggestion[]>(res)
}

/** Donor: suggestions for own donation */
export async function getMatchesForDonation(
  token: string,
  donationId: string,
  params?: { limit?: number },
): Promise<MatchSuggestion[]> {
  const query = new URLSearchParams()
  if (params?.limit) query.set('limit', String(params.limit))
  const url = `/api/matching/donations/${donationId}${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseResponse<MatchSuggestion[]>(res)
}

/** NGO: suggestions for own requirement */
export async function getMatchesForRequirement(
  token: string,
  requirementId: string,
  params?: { limit?: number },
): Promise<MatchSuggestion[]> {
  const query = new URLSearchParams()
  if (params?.limit) query.set('limit', String(params.limit))
  const url = `/api/matching/requirements/${requirementId}${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { headers: authHeaders(token) })
  return parseResponse<MatchSuggestion[]>(res)
}
