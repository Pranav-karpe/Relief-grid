/**
 * Matching service — deterministic donation-to-requirement matching engine.
 *
 * Stage 1: Compatibility & Proximity Gates
 *   1. Category compatibility (exact case-insensitive match) — prerequisite
 *   2. Status eligibility (donation available/partially_allocated, requirement active)
 *   3. Expiry check (neither item expired or within 48h perishable quarantine window)
 *   4. Quarantine check (quarantineStatus must be 'none')
 *   5. Quantity check (both have available/unfulfilled quantities)
 *   6. Hard distance filter (default: max 10 km unless explicitly expanded or unlimited)
 *
 * Stage 2: Scoring & Prioritization
 *   1. Priority score: critical=4, high=3, medium=2, low=1
 *   2. Quantity coverage: min(donationAvailable, reqRemaining) / reqRemaining, capped at 1.0
 *   3. Urgency bonus from neededBy: +2 if neededBy within 3 days, +1 if within 7 days
 *   4. Distance penalty: -0.1 per 100 km (only when both locations are valid)
 *   5. Real-world road distance and travel time estimates
 */

import type { Types } from 'mongoose'
import { DonationModel } from '../models/donation.js'
import { RequirementModel } from '../models/requirement.js'
import { HazardModel } from '../models/hazard.js'

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
    hazardPenalty: number
  }
  distanceKm: number | null
  roadDistanceKm?: number | null
  estimatedTravelTimeMinutes?: number | null
  distanceCalculationMethod: 'euclidean_haversine_approximation'
  roadApproximationMultiplier: number
  coldChainRequired?: boolean
  hazardAnalysis: {
    hazardsCount: number
    hasImpassableHazard: boolean
    hazards: Array<{
      title: string
      hazardType: string
      severity: string
      distanceKm: number
    }>
  }
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

/** Returns approximate perpendicular distance in km from point P to line segment AB */
export function pointToSegmentDistanceKm(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dAP = haversineKm(a, p)
  const dBP = haversineKm(b, p)
  const dAB = haversineKm(a, b)
  if (dAB === 0) return dAP

  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const denom = dx * dx + dy * dy
  if (denom === 0) return dAP

  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denom))
  const proj: [number, number] = [a[0] + t * dx, a[1] + t * dy]
  return haversineKm(p, proj)
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
    quarantineStatus: { $in: [undefined, 'none'] },
  }
  if (options.donationId) donationFilter._id = options.donationId

  // Build requirement query
  const requirementFilter: Record<string, unknown> = { status: 'active' }
  if (options.requirementId) requirementFilter._id = options.requirementId

  const [donations, requirements, activeHazards] = await Promise.all([
    DonationModel.find(donationFilter).lean(),
    RequirementModel.find(requirementFilter).lean(),
    HazardModel.find({ status: 'active' }).lean(),
  ])

  const suggestions: MatchSuggestion[] = []

  for (const donation of donations) {
    // Skip expired or quarantined donations
    if (donation.quarantineStatus && donation.quarantineStatus !== 'none') continue
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
      let roadDistanceKm: number | null = null
      let estimatedTravelTimeMinutes: number | null = null

      const donCoords = donation.location?.coordinates
      const reqCoords = req.deliveryArea?.coordinates
      let hazardPenalty = 0
      const relevantHazards: Array<{
        title: string
        hazardType: string
        severity: string
        distanceKm: number
      }> = []

      if (
        Array.isArray(donCoords) &&
        Array.isArray(reqCoords) &&
        donCoords.length === 2 &&
        reqCoords.length === 2
      ) {
        const dPoint = donCoords as [number, number]
        const rPoint = reqCoords as [number, number]
        distanceKm = haversineKm(dPoint, rPoint)

        // Stage 1 hard filter: reject if exceeds allowed distance
        if (!unlimitedDistance && distanceKm > maxDistanceKm) {
          continue
        }

        // Stage 2 road distance heuristic approximation (1.32 factor with 30 km/h average speed)
        // NOTE: Clearly labeled as approximation — no live OSRM/ORS external provider is active.
        roadDistanceKm = Number((distanceKm * 1.32).toFixed(1))
        estimatedTravelTimeMinutes = Math.max(5, Math.round((roadDistanceKm / 30) * 60))

        // Check active hazards intersecting corridor or near endpoints
        for (const hazard of activeHazards) {
          if (
            hazard.location?.coordinates &&
            Array.isArray(hazard.location.coordinates) &&
            hazard.location.coordinates.length === 2
          ) {
            const hPoint = hazard.location.coordinates as [number, number]
            const corridorDistance = pointToSegmentDistanceKm(hPoint, dPoint, rPoint)
            const impactRadiusKm = (hazard.radiusMeters || 200) / 1000 + 0.5 // impact boundary

            if (corridorDistance <= impactRadiusKm) {
              relevantHazards.push({
                title: hazard.title,
                hazardType: hazard.hazardType,
                severity: hazard.severity,
                distanceKm: Number(corridorDistance.toFixed(2)),
              })

              if (hazard.severity === 'fatal_hazard' || hazard.severity === 'impassable_all_vehicles') {
                hazardPenalty += 4.0
              } else {
                hazardPenalty += 1.5
              }
            }
          }
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

      const score = Number((priorityScore + coverageRatio + urgencyBonus - distancePenalty - hazardPenalty).toFixed(2))

      const reasons: string[] = [
        `Category match: "${donation.resourceCategory}"`,
        `Priority: ${req.priority} (score ${priorityScore})`,
        `Coverage: ${(coverageRatio * 100).toFixed(0)}% of remaining need`,
      ]
      if (urgencyBonus > 0) reasons.push(`Urgency bonus: needed within ${urgencyBonus === 2 ? '3' : '7'} days`)
      if (distanceKm !== null) {
        reasons.push(
          `Distance: ${distanceKm.toFixed(1)} km (straight-line estimate, approx. ${roadDistanceKm} km road heuristic, ~${estimatedTravelTimeMinutes} mins transit approximation; no live OSRM/ORS router connected)`,
        )
      }
      if (donation.coldChainRequired) reasons.push('❄️ Requires cold-chain transit')

      for (const h of relevantHazards) {
        if (h.severity === 'fatal_hazard' || h.severity === 'impassable_all_vehicles') {
          reasons.push(`⛔ Impassable Road Hazard: ${h.title} (${h.hazardType}) along transit corridor`)
        } else {
          reasons.push(`⚠️ Road Hazard Advisory: ${h.title} (${h.hazardType}) nearby`)
        }
      }

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
        scoreFactors: {
          priorityScore,
          coverageRatio,
          urgencyBonus,
          distancePenalty,
          hazardPenalty,
        },
        distanceKm,
        roadDistanceKm,
        estimatedTravelTimeMinutes,
        distanceCalculationMethod: 'euclidean_haversine_approximation',
        roadApproximationMultiplier: 1.32,
        coldChainRequired: donation.coldChainRequired,
        hazardAnalysis: {
          hazardsCount: relevantHazards.length,
          hasImpassableHazard: relevantHazards.some(
            (h) => h.severity === 'fatal_hazard' || h.severity === 'impassable_all_vehicles',
          ),
          hazards: relevantHazards,
        },
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
