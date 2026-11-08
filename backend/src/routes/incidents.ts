import { Router } from 'express'
import { Types } from 'mongoose'
import { IncidentModel } from '../models/incident.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'

const incidentsRouter = Router()

// GET /api/incidents — list incidents
incidentsRouter.get('/', async (req, res) => {
  const filter: Record<string, unknown> = {}

  if (typeof req.query.status === 'string' && req.query.status) {
    filter.status = req.query.status
  }
  if (typeof req.query.severity === 'string' && req.query.severity) {
    filter.severity = req.query.severity
  }
  if (typeof req.query.incidentType === 'string' && req.query.incidentType) {
    filter.incidentType = req.query.incidentType
  }

  const limit = Math.min(Number(req.query.limit) || 50, 100)

  const incidents = await IncidentModel.find(filter)
    .sort({ severity: -1, createdAt: -1 })
    .limit(limit)
    .lean()

  res.status(200).json({ data: incidents })
})

// GET /api/incidents/:id — get incident details
incidentsRouter.get('/:id', async (req, res) => {
  const id = String(req.params.id)
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  const incident = await IncidentModel.findById(id)
    .populate('linkedReports', 'title needCategory urgency status location affectedPersonCount requestedResources createdAt')
    .populate('managingNgos', 'displayName email organizationProfile.name')
    .lean()

  if (!incident) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  res.status(200).json({ data: incident })
})

// PATCH /api/incidents/:id/status — update status (NGO or Admin only)
incidentsRouter.patch('/:id/status', requireAuth, requireRoles('ngo', 'admin'), async (req, res) => {
  const id = String(req.params.id)
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  const body = req.body as Record<string, unknown>
  const status = typeof body.status === 'string' ? body.status : ''
  const validStatuses = ['active', 'monitoring', 'contained', 'resolved']

  if (!validStatuses.includes(status)) {
    throw new ApiError(400, 'validation_error', `Status must be one of: ${validStatuses.join(', ')}.`)
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined

  const updated = await IncidentModel.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        ...(notes ? { notes } : {}),
      },
    },
    { returnDocument: 'after' },
  ).lean()

  if (!updated) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  res.status(200).json({ data: updated })
})

// POST /api/incidents/:id/manage — NGO joins incident management
incidentsRouter.post('/:id/manage', requireAuth, requireRoles('ngo'), async (req, res) => {
  const id = String(req.params.id)
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  const updated = await IncidentModel.findByIdAndUpdate(
    id,
    {
      $addToSet: { managingNgos: new Types.ObjectId(req.auth!.userId) },
    },
    { returnDocument: 'after' },
  ).lean()

  if (!updated) {
    throw new ApiError(404, 'not_found', 'Incident not found.')
  }

  res.status(200).json({ data: updated })
})

export default incidentsRouter

