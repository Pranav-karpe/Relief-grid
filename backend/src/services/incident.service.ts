import { Types } from 'mongoose'
import { IncidentModel, type IncidentDocument } from '../models/incident.js'
import { ReportModel, type ReportDocument } from '../models/report.js'

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export type IncidentType =
  | 'flood'
  | 'earthquake'
  | 'cyclone'
  | 'landslide'
  | 'fire'
  | 'medical_outbreak'
  | 'infrastructure_failure'
  | 'other'

function inferIncidentType(category: string, title: string): IncidentType {
  const text = `${category} ${title}`.toLowerCase()
  if (text.includes('flood') || text.includes('waterlog') || text.includes('submerged')) return 'flood'
  if (text.includes('quake') || text.includes('collapse') || text.includes('rubble')) return 'earthquake'
  if (text.includes('cyclone') || text.includes('storm') || text.includes('hurricane') || text.includes('wind')) return 'cyclone'
  if (text.includes('landslide') || text.includes('mudslide')) return 'landslide'
  if (text.includes('fire') || text.includes('smoke') || text.includes('burn')) return 'fire'
  if (text.includes('epidemic') || text.includes('outbreak') || text.includes('infection') || text.includes('poisoning')) return 'medical_outbreak'
  return 'flood'
}

function mapUrgencyToSeverity(urgency?: string): 'low' | 'medium' | 'high' | 'critical' {
  if (urgency === 'critical') return 'critical'
  if (urgency === 'high') return 'high'
  if (urgency === 'medium') return 'medium'
  return 'low'
}

export class IncidentService {
  /**
   * Clusters a citizen distress report into an incident within 2.0 km.
   * If a matching active incident exists nearby, links it and recomputes the centroid and needs.
   * If not, instantiates a new incident cluster.
   */
  public async clusterReport(report: ReportDocument): Promise<IncidentDocument> {
    if (!report.location || !Array.isArray(report.location.coordinates)) {
      throw new Error('Report location is missing or invalid.')
    }

    const [repLng, repLat] = report.location.coordinates
    const incidentType = inferIncidentType(report.needCategory, report.title)
    const severity = mapUrgencyToSeverity(report.urgency)

    // Look for active or monitoring incidents of matching or broad type
    const activeIncidents = await IncidentModel.find({
      status: { $in: ['active', 'monitoring'] },
    })

    let closestIncident: IncidentDocument | null = null
    let minDistance = 2.0 // Clustering radius threshold: 2.0 km

    for (const incident of activeIncidents) {
      const [incLng, incLat] = incident.centroid.coordinates
      const dist = haversineKm(repLng, repLat, incLng, incLat)
      if (dist <= minDistance) {
        minDistance = dist
        closestIncident = incident
      }
    }

    if (closestIncident) {
      // Check if report is already linked
      const alreadyLinked = closestIncident.linkedReports.some(
        (id) => id.toString() === report._id.toString(),
      )
      if (!alreadyLinked) {
        closestIncident.linkedReports.push(report._id as Types.ObjectId)
      }

      // Elevate severity if incoming report is higher severity
      const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
      if (severityRank[severity] > severityRank[closestIncident.severity]) {
        closestIncident.severity = severity
      }

      await this.recalculateIncident(closestIncident)
      return closestIncident
    }

    // Otherwise, create a new incident cluster
    const needsSummary = (report.requestedResources || []).map((r) => ({
      category: r.category,
      totalQuantity: r.quantity,
      unit: r.unit,
    }))

    const titlePrefix = incidentType.charAt(0).toUpperCase() + incidentType.slice(1).replace('_', ' ')
    const newIncident = await IncidentModel.create({
      title: `${titlePrefix} Cluster: ${report.title.slice(0, 45)}`,
      incidentType,
      severity,
      status: 'active',
      centroid: { type: 'Point', coordinates: [repLng, repLat] },
      radiusKm: 2.0,
      linkedReports: [report._id],
      totalAffectedPersons: report.affectedPersonCount || 1,
      needsSummary,
    })

    return newIncident
  }

  /**
   * Recalculates centroid, total affected persons, and needs summary across all linked reports.
   */
  public async recalculateIncident(incident: IncidentDocument): Promise<void> {
    const reports = await ReportModel.find({
      _id: { $in: incident.linkedReports },
    }).lean()

    if (reports.length === 0) return

    let sumLng = 0
    let sumLat = 0
    let countCoords = 0
    let totalPersons = 0
    const needsMap = new Map<string, { totalQuantity: number; unit: string }>()

    for (const rep of reports) {
      if (rep.location?.coordinates) {
        sumLng += rep.location.coordinates[0]
        sumLat += rep.location.coordinates[1]
        countCoords++
      }
      totalPersons += rep.affectedPersonCount || 1

      for (const req of rep.requestedResources || []) {
        const key = `${req.category}_${req.unit}`
        const existing = needsMap.get(key)
        if (existing) {
          existing.totalQuantity += req.quantity
        } else {
          needsMap.set(key, { totalQuantity: req.quantity, unit: req.unit })
        }
      }
    }

    if (countCoords > 0) {
      incident.centroid = {
        type: 'Point',
        coordinates: [sumLng / countCoords, sumLat / countCoords],
      }
    }

    incident.totalAffectedPersons = totalPersons
    incident.needsSummary = Array.from(needsMap.entries()).map(([key, val]) => ({
      category: key.split('_')[0],
      totalQuantity: val.totalQuantity,
      unit: val.unit,
    })) as any

    // If all linked reports are resolved, mark incident contained
    const allResolved = reports.every((r) => r.status === 'resolved')
    if (allResolved && incident.status === 'active') {
      incident.status = 'contained'
    }

    await incident.save()
  }
}

export const incidentService = new IncidentService()
