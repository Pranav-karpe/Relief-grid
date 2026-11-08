import { Router } from 'express'
import { Types } from 'mongoose'
import { ReportModel } from '../models/report.js'
import { requireAuth, requireRoles } from '../middleware/auth.js'
import { ApiError } from '../middleware/api-error.js'
import { evaluateReportAuthenticity } from '../services/citizen-risk.service.js'
import { incidentService } from '../services/incident.service.js'
import { eventBroadcaster } from '../services/event-broadcaster.js'

const reportsRouter = Router()

const ALLOWED_CATEGORIES = ['food', 'water', 'shelter', 'medical', 'other'] as const
const ALLOWED_URGENCIES = ['low', 'medium', 'high', 'critical'] as const
const CITIZEN_EDITABLE_STATUSES = ['draft'] as const
const CITIZEN_ALLOWED_STATUSES = ['draft', 'submitted'] as const

type Category = (typeof ALLOWED_CATEGORIES)[number]
type Urgency = (typeof ALLOWED_URGENCIES)[number]

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (ALLOWED_CATEGORIES as readonly string[]).includes(v)
}

function isUrgency(v: unknown): v is Urgency {
  return typeof v === 'string' && (ALLOWED_URGENCIES as readonly string[]).includes(v)
}

function body(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

function validateCreateInput(raw: unknown) {
  const b = body(raw)

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const needCategory = typeof b.needCategory === 'string' ? b.needCategory.trim() : ''
  const urgency = b.urgency

  if (title.length < 3 || title.length > 160) {
    throw new ApiError(400, 'validation_error', 'title must be between 3 and 160 characters.')
  }
  if (description.length < 10 || description.length > 5000) {
    throw new ApiError(400, 'validation_error', 'description must be between 10 and 5000 characters.')
  }
  if (!isCategory(needCategory)) {
    throw new ApiError(400, 'validation_error', `needCategory must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`)
  }
  if (!isUrgency(urgency)) {
    throw new ApiError(400, 'validation_error', `urgency must be one of: ${ALLOWED_URGENCIES.join(', ')}.`)
  }

  // Location: required GeoJSON point
  const loc = b.location
  if (
    typeof loc !== 'object' ||
    loc === null ||
    (loc as Record<string, unknown>).type !== 'Point' ||
    !Array.isArray((loc as Record<string, unknown>).coordinates) ||
    ((loc as Record<string, unknown>).coordinates as unknown[]).length !== 2 ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[0] !== 'number' ||
    typeof ((loc as Record<string, unknown>).coordinates as unknown[])[1] !== 'number'
  ) {
    throw new ApiError(400, 'validation_error', 'location must be a GeoJSON Point: { type: "Point", coordinates: [longitude, latitude] }.')
  }
  const [lng, lat] = (loc as { coordinates: number[] }).coordinates
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new ApiError(400, 'validation_error', 'coordinates must be valid [longitude, latitude] values.')
  }

  // Optional fields
  const affectedPersonCount = b.affectedPersonCount !== undefined ? Number(b.affectedPersonCount) : undefined
  if (affectedPersonCount !== undefined && (!Number.isInteger(affectedPersonCount) || affectedPersonCount < 0)) {
    throw new ApiError(400, 'validation_error', 'affectedPersonCount must be a non-negative integer.')
  }

  // Optional requestedResources
  const requestedResources: { category: string; quantity: number; unit: string }[] = []
  if (b.requestedResources !== undefined) {
    if (!Array.isArray(b.requestedResources)) {
      throw new ApiError(400, 'validation_error', 'requestedResources must be an array.')
    }
    for (const item of b.requestedResources as unknown[]) {
      const r = body(item)
      const cat = typeof r.category === 'string' ? r.category.trim() : ''
      const qty = Number(r.quantity)
      const unit = typeof r.unit === 'string' ? r.unit.trim() : ''
      if (cat.length === 0 || cat.length > 80) throw new ApiError(400, 'validation_error', 'Each resource category must be 1–80 characters.')
      if (!Number.isFinite(qty) || qty < 0) throw new ApiError(400, 'validation_error', 'Each resource quantity must be a non-negative number.')
      if (unit.length === 0 || unit.length > 40) throw new ApiError(400, 'validation_error', 'Each resource unit must be 1–40 characters.')
      requestedResources.push({ category: cat, quantity: qty, unit })
    }
  }

  const initialStatus: 'draft' | 'submitted' = b.status === 'draft' ? 'draft' : 'submitted'

  return {
    title,
    description,
    needCategory,
    urgency,
    location: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
    ...(affectedPersonCount !== undefined ? { affectedPersonCount } : {}),
    ...(requestedResources.length > 0 ? { requestedResources } : {}),
    status: initialStatus,
  }
}

// POST /api/reports — create a report (citizen only)
reportsRouter.post('/', requireAuth, requireRoles('citizen'), async (req, res) => {
  const validated = validateCreateInput(req.body)
  const userId = req.auth!.userId

  // Perform automated authenticity and duplicate check
  const riskAssessment = await evaluateReportAuthenticity({
    reporterId: userId,
    title: validated.title,
    description: validated.description,
    needCategory: validated.needCategory,
    urgency: validated.urgency,
    location: validated.location,
    affectedPersonCount: validated.affectedPersonCount,
    requestedResources: validated.requestedResources,
  })

  const initialTimeline = [
    {
      stage: validated.status,
      label: validated.status === 'draft' ? 'Draft Created' : 'Request Submitted',
      description: validated.status === 'draft'
        ? 'Relief draft saved by reporter.'
        : 'Emergency relief request submitted to operations queue.',
      actorRole: 'citizen',
      actorId: new Types.ObjectId(userId),
      timestamp: new Date(),
    },
  ]

  const report = await ReportModel.create({
    ...validated,
    reporter: new Types.ObjectId(userId),
    riskAssessment: {
      ...riskAssessment,
      possibleDuplicates: riskAssessment.possibleDuplicates.map((id) => new Types.ObjectId(id)),
    },
    timeline: initialTimeline,
  })

  if (report.status === 'submitted') {
    incidentService.clusterReport(report).catch((err) => {
      console.warn('[incidentService] clustering error:', err)
    })
  }

  eventBroadcaster.broadcast({
    type: 'REPORT_CREATED',
    payload: {
      reportId: report._id,
      title: report.title,
      needCategory: report.needCategory,
      urgency: report.urgency,
      status: report.status,
      reporterId: userId,
    },
    targetRoles: ['admin', 'ngo', 'citizen'],
  })

  res.status(201).json({ data: report })
})

// GET /api/reports/mine — list own reports (citizen only)
reportsRouter.get('/mine', requireAuth, requireRoles('citizen'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

  const filter: Record<string, unknown> = { reporter: new Types.ObjectId(req.auth!.userId) }

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { createdAt: string; _id: string }
      filter.$or = [
        { createdAt: { $lt: new Date(decoded.createdAt) } },
        { createdAt: new Date(decoded.createdAt), _id: { $lt: new Types.ObjectId(String(decoded._id)) } },
      ]
    } catch {
      throw new ApiError(400, 'validation_error', 'Invalid cursor.')
    }
  }

  const reports = await ReportModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean()

  let nextCursor: string | null = null
  if (reports.length > limit) {
    reports.pop()
    const last = reports[reports.length - 1]
    nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, _id: last._id })).toString('base64url')
  }

  res.status(200).json({ data: reports, page: { nextCursor } })
})

// GET /api/reports/:reportId — get own report by ID (citizen only)
reportsRouter.get('/:reportId', requireAuth, requireRoles('citizen'), async (req, res) => {
  const reportId = String(req.params.reportId)
  if (!Types.ObjectId.isValid(reportId)) {
    throw new ApiError(404, 'not_found', 'Report not found.')
  }
  const report = await ReportModel.findOne({
    _id: reportId,
    reporter: new Types.ObjectId(req.auth!.userId),
  }).lean()

  if (!report) throw new ApiError(404, 'not_found', 'Report not found.')
  res.status(200).json({ data: report })
})

// PATCH /api/reports/:reportId — update own draft report (citizen only)
reportsRouter.patch('/:reportId', requireAuth, requireRoles('citizen'), async (req, res) => {
  const reportId = String(req.params.reportId)
  if (!Types.ObjectId.isValid(reportId)) {
    throw new ApiError(404, 'not_found', 'Report not found.')
  }

  const report = await ReportModel.findOne({
    _id: reportId,
    reporter: new Types.ObjectId(req.auth!.userId),
  })

  if (!report) throw new ApiError(404, 'not_found', 'Report not found.')

  // Citizens may only edit drafts; they may submit (draft → submitted) but not set other statuses
  const b = body(req.body)

  // Reject attempts to set protected fields
  const forbidden = ['reporter', 'review', 'evidenceRefs', 'status', 'riskAssessment', 'timeline', 'deliveryTask'] as const
  for (const key of forbidden) {
    if (key in b && key !== 'status') {
      throw new ApiError(400, 'validation_error', `Field "${key}" cannot be updated through this endpoint.`)
    }
  }

  // Status transition: citizen may only submit a draft
  let isSubmitting = false
  if ('status' in b) {
    const newStatus = b.status
    if (!(CITIZEN_ALLOWED_STATUSES as readonly unknown[]).includes(newStatus)) {
      throw new ApiError(400, 'validation_error', `Citizens may only set status to: ${CITIZEN_ALLOWED_STATUSES.join(', ')}.`)
    }
    if (report.status !== 'draft') {
      throw new ApiError(409, 'invalid_transition', 'Only draft reports can be updated by the reporter.')
    }
    if (newStatus === 'submitted') {
      isSubmitting = true
    }
  } else {
    // Non-status edits only allowed on drafts
    if (!(CITIZEN_EDITABLE_STATUSES as readonly string[]).includes(report.status)) {
      throw new ApiError(409, 'invalid_transition', 'Only draft reports can be edited by the reporter.')
    }
  }

  const allowed: Record<string, unknown> = {}

  if (typeof b.title === 'string') {
    const t = b.title.trim()
    if (t.length < 3 || t.length > 160) throw new ApiError(400, 'validation_error', 'title must be between 3 and 160 characters.')
    allowed.title = t
  }
  if (typeof b.description === 'string') {
    const d = b.description.trim()
    if (d.length < 10 || d.length > 5000) throw new ApiError(400, 'validation_error', 'description must be between 10 and 5000 characters.')
    allowed.description = d
  }
  if (b.needCategory !== undefined) {
    if (!isCategory(b.needCategory)) throw new ApiError(400, 'validation_error', `needCategory must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`)
    allowed.needCategory = b.needCategory
  }
  if (b.urgency !== undefined) {
    if (!isUrgency(b.urgency)) throw new ApiError(400, 'validation_error', `urgency must be one of: ${ALLOWED_URGENCIES.join(', ')}.`)
    allowed.urgency = b.urgency
  }
  if ('status' in b) {
    allowed.status = b.status
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, 'validation_error', 'No updatable fields provided.')
  }

  const updateOp: Record<string, unknown> = { $set: allowed }

  if (isSubmitting) {
    // Re-evaluate authenticity and push timeline event
    const riskAssessment = await evaluateReportAuthenticity({
      reporterId: req.auth!.userId,
      title: (allowed.title as string) || report.title,
      description: (allowed.description as string) || report.description,
      needCategory: (allowed.needCategory as string) || report.needCategory,
      urgency: (allowed.urgency as string) || report.urgency,
      location: report.location,
      affectedPersonCount: report.affectedPersonCount ?? undefined,
    })
    allowed.riskAssessment = {
      ...riskAssessment,
      possibleDuplicates: riskAssessment.possibleDuplicates.map((id) => new Types.ObjectId(id)),
    }
    updateOp.$push = {
      timeline: {
        stage: 'submitted',
        label: 'Request Submitted',
        description: 'Draft submitted to operations queue.',
        actorRole: 'citizen',
        actorId: new Types.ObjectId(req.auth!.userId),
        timestamp: new Date(),
      },
    }
  }

  const updated = await ReportModel.findOneAndUpdate(
    { _id: reportId, reporter: new Types.ObjectId(req.auth!.userId) },
    updateOp,
    { new: true, runValidators: true },
  ).lean()

  if (!updated) throw new ApiError(404, 'not_found', 'Report not found.')
  res.status(200).json({ data: updated })
})

export default reportsRouter
