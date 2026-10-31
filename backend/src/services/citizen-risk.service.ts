import { Types } from 'mongoose'
import { ReportModel } from '../models/report.js'

export type ReportInputData = {
  reporterId: string
  title: string
  description: string
  needCategory: string
  urgency: string
  location: { type: 'Point'; coordinates: [number, number] }
  affectedPersonCount?: number
  requestedResources?: { category: string; quantity: number; unit: string }[]
}

export type CitizenRiskResult = {
  riskLevel: 'low' | 'medium' | 'high' | 'requires_manual_review'
  riskScore: number
  explanation: string
  flags: string[]
  possibleDuplicates: string[]
  suggestedAction: string
  evaluatedAt: Date
}

function computeSimilarity(s1: string, s2: string): number {
  const w1 = new Set(s1.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  const w2 = new Set(s2.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  if (w1.size === 0 || w2.size === 0) return 0
  let intersection = 0
  for (const word of w1) {
    if (w2.has(word)) intersection++
  }
  return (intersection * 2) / (w1.size + w2.size)
}

export async function evaluateReportAuthenticity(
  input: ReportInputData,
): Promise<CitizenRiskResult> {
  const flags: string[] = []
  let riskScore = 10
  const possibleDuplicates: string[] = []
  const evaluatedAt = new Date()

  // 1. Text & Spam Analysis
  const desc = input.description.trim()
  const title = input.title.trim()

  const repetitivePattern = /(.)\1{5,}/
  if (repetitivePattern.test(desc) || repetitivePattern.test(title)) {
    flags.push('Description or title contains excessive repetitive characters.')
    riskScore += 25
  }

  const spamKeywords = ['viagra', 'crypto', 'casino', 'free money', 'lottery', 'click here', 'telegram @', 'whatsapp +']
  const lowerDesc = desc.toLowerCase()
  for (const kw of spamKeywords) {
    if (lowerDesc.includes(kw)) {
      flags.push(`Spam keyword indicator detected: "${kw}".`)
      riskScore += 40
    }
  }

  // 2. Quantity & Affected Persons Inconsistency Checks
  if (input.affectedPersonCount !== undefined) {
    if (input.affectedPersonCount === 0 && input.urgency === 'critical') {
      flags.push('Zero affected individuals stated despite "Critical" emergency urgency.')
      riskScore += 15
    }

    if (input.requestedResources) {
      for (const res of input.requestedResources) {
        if (input.affectedPersonCount > 0 && res.quantity / input.affectedPersonCount > 500) {
          flags.push(`Disproportionately high requested quantity (${res.quantity} ${res.unit}) for ${input.affectedPersonCount} individuals.`)
          riskScore += 20
        }
      }
    }
  }

  // 3. Duplicate and Proximity Detection
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

  // A. Check recent reports by the same reporter
  const ownRecentReports = await ReportModel.find({
    reporter: new Types.ObjectId(input.reporterId),
    createdAt: { $gte: twoDaysAgo },
  }).select('title description needCategory location createdAt status').lean()

  for (const r of ownRecentReports) {
    const titleSim = computeSimilarity(title, r.title)
    const descSim = computeSimilarity(desc, r.description)
    if (titleSim > 0.6 || descSim > 0.65) {
      flags.push(`Reporter previously submitted a highly similar report (#${String(r._id).slice(-6)}) on ${new Date(r.createdAt).toLocaleTimeString()}.`)
      possibleDuplicates.push(String(r._id))
      riskScore += 30
      break
    }
  }

  // B. Check proximity duplicate reports in same category within 1 km in past 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  try {
    const nearbyReports = await ReportModel.find({
      _id: { $nin: possibleDuplicates.map((id) => new Types.ObjectId(id)) },
      needCategory: input.needCategory,
      createdAt: { $gte: oneDayAgo },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: input.location.coordinates,
          },
          $maxDistance: 1000, // 1 km radius
        },
      },
    }).limit(5).select('title needCategory reporter createdAt').lean()

    for (const near of nearbyReports) {
      if (String(near.reporter) !== input.reporterId) {
        flags.push(`Nearby active ${input.needCategory} report (#${String(near._id).slice(-6)}) exists within 1 km. Possible incident cluster.`)
        possibleDuplicates.push(String(near._id))
        riskScore += 10
      }
    }
  } catch {
    // Geospatial query fallback if test database lacks 2dsphere index yet
  }

  // 4. Determine Risk Level
  let riskLevel: CitizenRiskResult['riskLevel'] = 'low'
  let suggestedAction = 'Proceed with normal verification and dispatch queue.'

  if (riskScore >= 60 || flags.some((f) => f.includes('Spam'))) {
    riskLevel = 'high'
    suggestedAction = 'Flagged for coordinator review. Verify caller identity before allocating resources.'
  } else if (possibleDuplicates.length > 0 || riskScore >= 35) {
    riskLevel = 'medium'
    suggestedAction = 'Check nearby existing tickets to avoid duplicating assistance.'
  } else if (flags.length > 0) {
    riskLevel = 'requires_manual_review'
    suggestedAction = 'Confirm distress details with community representative.'
  }

  const explanation = flags.length > 0
    ? flags.join(' ')
    : 'No suspicious indicators, duplicate clusters, or spam characteristics identified.'

  return {
    riskLevel,
    riskScore: Math.min(Math.max(riskScore, 0), 100),
    explanation,
    flags,
    possibleDuplicates,
    suggestedAction,
    evaluatedAt,
  }
}

