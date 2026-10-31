/**
 * Matching service — deterministic donation-to-requirement matching engine.
 *
 * Stage 1: Compatibility & Proximity Gates
 *   1. Category compatibility (exact case-insensitive match) — prerequisite
 *   2. Status eligibility (donation available/partially_allocated, requirement active)
 *   3. Expiry check (neither item expired)
 *   4. Quantity check (both have available/unfulfilled quantities)
 *   5. Hard distance filter (default: max 10 km unless explicitly expanded or unlimited)
 *
 * Stage 2: Scoring & Prioritization
 *   1. Priority score: critical=4, high=3, medium=2, low=1
 *   2. Quantity coverage: min(donationAvailable, reqRemaining) / reqRemaining, capped at 1.0
 *   3. Urgency bonus from neededBy: +2 if neededBy within 3 days, +1 if within 7 days
 *   4. Distance penalty: -0.1 per 100 km (only when both locations are valid)
 *
 * Total score is a float. Higher is better. Tie-breaking: requirement _id ascending.
 * Distance is a ranking factor only — not proof of operational feasibility.
 */

import type { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { RequirementModel } from '../models/requirement.js'

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
  scoreFactors: {
    priorityScore: number
    coverageRatio: number
    urgencyBonus: number
    distancePenalty: number
  }
  distanceKm: number | null
  reasons: string[]
}

const PRIORITY_SCORE: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/** Haversine distance in km between two [lng, lat] points */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLon = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

function normalizeCategory(s: string): string {
  return s.trim().toLowerCase()
}

export type MatchOptions = {
  /** Filter to a specific donation ID */
  donationId?: string
  /** Filter to a specific requirement ID */
  requirementId?: string
  /** Max results returned */
  limit?: number
  /** Hard maximum distance filter in km (defaults to 10 km unless explicitly set or relaxed) */
  maxDistanceKm?: number
  /** Set true to bypass the hard 10 km distance filter (e.g. for nationwide digital/bulk supplies) */
  unlimitedDistance?: boolean
}

/**
 * Find matching suggestions between available donations and active requirements.
 * Enforces Stage 1 hard 10 km filter before scoring.
 */
export async function findMatches(options: MatchOptions = {}): Promise<MatchSuggestion[]> {
  const limit = Math.min(options.limit ?? 20, 100)
  const maxDistanceKm = options.maxDistanceKm !== undefined ? options.maxDistanceKm : 10
  const unlimitedDistance = Boolean(options.unlimitedDistance)
  const now = new Date()

  // Build donation query
  const donationFilter: Record<string, unknown> = {
    availabilityStatus: { $in: ['available', 'partially_allocated'] },
  }
  if (options.donationId) donationFilter._id = options.donationId

  // Build requirement query
  const requirementFilter: Record<string, unknown> = { status: 'active' }
  if (options.requirementId) requirementFilter._id = options.requirementId

  const [donations, requirements] = await Promise.all([
    DonationModel.find(donationFilter).lean(),
    RequirementModel.find(requirementFilter).lean(),
  ])

  const suggestions: MatchSuggestion[] = []

  for (const donation of donations) {
    // Skip expired donations
    if (donation.expiryDate && donation.expiryDate < now) continue

    const availableQty = donation.quantity - donation.quantityReserved - donation.quantityAllocated
    if (availableQty <= 0) continue

    const donCat = normalizeCategory(donation.resourceCategory)

    for (const req of requirements) {
      const reqCat = normalizeCategory(req.resourceCategory)

      // Category must match exactly (case-insensitive)
      if (donCat !== reqCat) continue

      // Skip expired requirements
      if (req.neededBy && req.neededBy < now) continue

      const remainingQty = req.quantityRequested - req.quantityFulfilled - req.quantityReserved
      if (remainingQty <= 0) continue

      // Proximity check (Stage 1 Hard Filter: max 10 km default)
      let distanceKm: number | null = null
      const donCoords = donation.location?.coordinates
      const reqCoords = req.deliveryArea?.coordinates
      if (
        Array.isArray(donCoords) &&
        Array.isArray(reqCoords) &&
        donCoords.length === 2 &&
        reqCoords.length === 2
      ) {
        distanceKm = haversineKm(
          donCoords as [number, number],
          reqCoords as [number, number],
        )

        // Stage 1 hard filter: reject if exceeds allowed distance
        if (!unlimitedDistance && distanceKm > maxDistanceKm) {
          continue
        }
      }

      // Scoring (Stage 2)
      const priorityScore = PRIORITY_SCORE[req.priority] ?? 1
      const suggestedQty = Math.min(availableQty, remainingQty)
      const coverageRatio = Math.min(suggestedQty / remainingQty, 1.0)

      let urgencyBonus = 0
      if (req.neededBy) {
        const daysUntil = (req.neededBy.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        if (daysUntil <= 3) urgencyBonus = 2
        else if (daysUntil <= 7) urgencyBonus = 1
      }

      let distancePenalty = 0
      if (distanceKm !== null) {
        distancePenalty = (distanceKm / 100) * 0.1
      }

      const score = priorityScore + coverageRatio + urgencyBonus - distancePenalty

      const reasons: string[] = [
        `Category match: "${donation.resourceCategory}"`,
        `Priority: ${req.priority} (score ${priorityScore})`,
        `Coverage: ${(coverageRatio * 100).toFixed(0)}% of remaining need`,
      ]
      if (urgencyBonus > 0) reasons.push(`Urgency bonus: needed within ${urgencyBonus === 2 ? '3' : '7'} days`)
      if (distanceKm !== null) reasons.push(`Distance: ${distanceKm.toFixed(1)} km (within ${maxDistanceKm} km zone)`)

      suggestions.push({
        donationId: String((donation as { _id: Types.ObjectId })._id),
        requirementId: String((req as { _id: Types.ObjectId })._id),
        donationCategory: donation.resourceCategory,
        requirementCategory: req.resourceCategory,
        availableQty,
        remainingQty,
        suggestedQty,
        unit: donation.unit,
        score,
        scoreFactors: { priorityScore, coverageRatio, urgencyBonus, distancePenalty },
        distanceKm,
        reasons,
      })
    }
  }

  // Sort: highest score first; tie-break by requirementId ascending (deterministic)
  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.requirementId < b.requirementId ? -1 : 1
  })

  return suggestions.slice(0, limit)
}
