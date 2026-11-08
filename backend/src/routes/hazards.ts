import { Router } from 'express'
import { Types } from 'mongoose'
import { HazardModel } from '../models/hazard.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const hazardsRouter = Router()

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

const ALLOWED_HAZARD_TYPES = [
  'flooded_road',
  'bridge_collapse',
  'landslide_debris',
  'fallen_tree_lines',
  'active_fire',
  'security_checkpoint',
  'other',
] as const

const ALLOWED_SEVERITIES = [
  'caution',
  'impassable_for_two_wheelers',
  'impassable_all_vehicles',
  'fatal_hazard',
] as const

const ALLOWED_STATUSES = ['active', 'cleared', 'verified'] as const

// ---------------------------------------------------------------------------
// GET /api/hazards — list active / reported hazards
// ---------------------------------------------------------------------------
hazardsRouter.get('/', requireAuth, async (req, res) => {
  const filter: Record<string, unknown> = {}

  if (typeof req.query.status === 'string' && ALLOWED_STATUSES.includes(req.query.status as any)) {
    filter.status = req.query.status
  } else {
    filter.status = 'active'
  }

  if (typeof req.query.hazardType === 'string' && ALLOWED_HAZARD_TYPES.includes(req.query.hazardType as any)) {
    filter.hazardType = req.query.hazardType
  }

  if (typeof req.query.severity === 'string' && ALLOWED_SEVERITIES.includes(req.query.severity as any)) {
    filter.severity = req.query.severity
  }

  // Geo-spatial proximity query if lat & lng provided
  if (req.query.lat && req.query.lng) {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    const radiusKm = Number(req.query.radiusKm) || 25
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      filter.location = {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      }
    }
  }

  const hazards = await HazardModel.find(filter)
    .populate('reportedBy', 'displayName role')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()

  res.status(200).json({ data: hazards })
})

// ---------------------------------------------------------------------------
// POST /api/hazards — report a road/environmental hazard
// ---------------------------------------------------------------------------
hazardsRouter.post(
  '/',
  requireAuth,
  requireRoles('volunteer', 'ngo', 'admin'),
  async (req, res) => {
    const b = body(req.body)
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    const hazardType = typeof b.hazardType === 'string' ? b.hazardType : 'flooded_road'
    const severity = typeof b.severity === 'string' ? b.severity : 'impassable_all_vehicles'
    const description = typeof b.description === 'string' ? b.description.trim() : ''
    const radiusMeters = Number(b.radiusMeters) || 200

    if (title.length < 3 || title.length > 150) {
      throw new ApiError(400, 'validation_error', 'title must be between 3 and 150 characters.')
    }

    if (!ALLOWED_HAZARD_TYPES.includes(hazardType as any)) {
      throw new ApiError(400, 'validation_error', `hazardType must be one of: ${ALLOWED_HAZARD_TYPES.join(', ')}`)
    }

    if (!ALLOWED_SEVERITIES.includes(severity as any)) {
      throw new ApiError(400, 'validation_error', `severity must be one of: ${ALLOWED_SEVERITIES.join(', ')}`)
    }

    if (radiusMeters < 10 || radiusMeters > 10000) {
      throw new ApiError(400, 'validation_error', 'radiusMeters must be between 10 and 10000 meters.')
    }

    // Validate location coordinates
    let coordinates: [number, number]
    if (
      b.location &&
      typeof b.location === 'object' &&
      Array.isArray((b.location as any).coordinates) &&
      (b.location as any).coordinates.length === 2
    ) {
      const [lng, lat] = (b.location as any).coordinates.map(Number)
      if (!Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new ApiError(400, 'validation_error', 'Coordinates must be valid [longitude, latitude].')
      }
      coordinates = [lng, lat]
    } else {
      throw new ApiError(400, 'validation_error', 'Valid GeoJSON Point location is required.')
    }

    const hazard = await HazardModel.create({
      title,
      hazardType: hazardType as (typeof ALLOWED_HAZARD_TYPES)[number],
      severity: severity as (typeof ALLOWED_SEVERITIES)[number],
      description,
      radiusMeters,
      location: { type: 'Point', coordinates },
      reportedBy: new Types.ObjectId(req.auth!.userId),
      status: 'active',
    })

    res.status(201).json({ data: hazard })
  },
)

// ---------------------------------------------------------------------------
// PATCH /api/hazards/:id — update hazard status (clear / verify)
// ---------------------------------------------------------------------------
hazardsRouter.patch(
  '/:id',
  requireAuth,
  requireRoles('ngo', 'admin', 'volunteer'),
  async (req, res) => {
    const id = String(req.params.id)
    if (!Types.ObjectId.isValid(id)) {
      throw new ApiError(404, 'not_found', 'Hazard not found.')
    }

    const hazard = await HazardModel.findById(id)
    if (!hazard) {
      throw new ApiError(404, 'not_found', 'Hazard not found.')
    }

    const b = body(req.body)
    const newStatus = b.status
    if (newStatus !== undefined) {
      if (!ALLOWED_STATUSES.includes(newStatus as any)) {
        throw new ApiError(400, 'validation_error', `status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
      }
      hazard.status = newStatus as (typeof ALLOWED_STATUSES)[number]
      if (newStatus === 'cleared') {
        hazard.clearedAt = new Date()
      }
    }

    if (typeof b.description === 'string') {
      hazard.description = b.description.trim()
    }

    await hazard.save()
    res.status(200).json({ data: hazard })
  },
)

export default hazardsRouter

