import { AuthApiError } from './auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminUser = {
  _id: string
  displayName: string
  email: string
  phone?: string
  role: string
  accountStatus: string
  emailVerified: boolean
  organizationProfile?: {
    name?: string
    registrationNumber?: string
    darpanId?: string
    contactPhone?: string
    website?: string
    verificationStatus?: string
  }
  volunteerProfile?: {
    phone?: string
    skills?: string[]
    availability?: string
    verificationStatus?: string
    currentWorkload?: number
    serviceRadiusKm?: number
    areas?: string[]
    experience?: string
  }
  createdAt: string
  updatedAt: string
}

export type AdminOverview = {
  users: {
    total: number
    active: number
    byRole?: {
      citizen: number
      donor: number
      volunteer: number
      ngo: number
      admin: number
    }
  }
  verifications?: {
    total: number
    pending: number
    approved: number
    rejected: number
    suspended?: number
    ngo: {
      total: number
      pending: number
      approved: number
      rejected: number
      suspended?: number
    }
    volunteer: {
      total: number
      pending: number
      approved: number
      rejected: number
    }
  }
  ngoVerifications: {
    total?: number
    pending: number
    approved: number
    rejected?: number
    suspended?: number
  }
  reports: {
    total?: number
    submitted: number
    underReview: number
    verified: number
    rejected?: number
    resolved?: number
    draft?: number
  }
  donations: {
    total?: number
    available: number
    reserved?: number
    partiallyAllocated?: number
    allocated?: number
    expired?: number
    cancelled?: number
  }
  requirements?: {
    total: number
    active: number
    fulfilled: number
    expired: number
    cancelled: number
  }
  allocations?: {
    total: number
    pending: number
    confirmed: number
    failed: number
  }
  complaints: {
    total?: number
    open: number
    underReview?: number
    resolved?: number
    dismissed?: number
  }
  tasks: {
    total?: number
    active: number
    byAssignment?: {
      assigned: number
      accepted: number
      declined: number
      cancelled: number
      reassigned: number
    }
    byDelivery?: {
      pending: number
      inTransit: number
      delivered: number
      failed: number
    }
  }
  recentActivity?: AuditLog[]
}

export type AssessmentReport = {
  assessment: string
  confidence: number
  recommendation: string
  fieldChecks?: {
    requiredFields: boolean
    validFormats: boolean
    suspiciousCombinations: boolean
  }
  duplicateChecks?: {
    duplicateRegFound: boolean
    duplicateNameFound: boolean
    duplicateContactFound: boolean
    matchingAccounts: string[]
  }
  registryChecks?: {
    checkedAt: string
    sourcesChecked: string[]
    registryMatchFound: boolean
    matchDetails: string
    inconclusive: boolean
  }
  summary: string
  flags: string[]
}

export type NgoVerification = {
  _id: string
  ngo: string | { _id: string; displayName: string; email: string; organizationProfile?: Record<string, unknown> }
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  submittedEvidenceRefs?: string[]
  submittedData?: {
    name?: string
    registrationNumber?: string
    darpanId?: string
    contactPhone?: string
    website?: string
  }
  assessmentReport?: AssessmentReport
  reason?: string
  reviewer?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type VolunteerVerification = {
  _id: string
  volunteer: string | { _id: string; displayName: string; email: string; volunteerProfile?: Record<string, unknown> }
  status: 'pending' | 'under_review' | 'approved' | 'verified' | 'rejected' | 'suspended'
  submittedData?: {
    name?: string
    phone?: string
    skills?: string[]
    serviceRadiusKm?: number
    experience?: string
  }
  assessmentReport?: AssessmentReport
  reason?: string
  reviewer?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export type TimelineEvent = {
  stage: 'submitted' | 'verified' | 'allocated' | 'assigned' | 'in_transit' | 'delivered' | 'disputed'
  title: string
  description?: string
  timestamp: string
  actorRole?: string
}

export type AdminReport = {
  _id: string
  reporter: string
  title: string
  description: string
  needCategory: string
  urgency: string
  status: string
  location: { type: 'Point'; coordinates: [number, number] }
  affectedPersonCount?: number
  requestedResources: { category: string; quantity: number; unit: string }[]
  evidenceRefs: string[]
  riskAssessment?: {
    riskLevel: 'low' | 'medium' | 'high'
    riskScore: number
    explanation: string
    flags: string[]
    possibleDuplicates?: string[]
    suggestedAction?: string
  }
  timeline?: TimelineEvent[]
  deliveryTask?: string
  assignedNgo?: string
  review?: { reviewer?: string; reviewedAt?: string; note?: string }
  createdAt: string
  updatedAt: string
}

export type AdminComplaint = {
  _id: string
  reporter: string
  subjectEntityType: string
  subjectEntityId: string
  description: string
  status: string
  reviewer?: string
  reason?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export type AuditLog = {
  _id: string
  actor?: { _id: string; displayName: string; email: string; role: string } | string
  action: string
  entityType: string
  entityId?: string
  correlationId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export type AdminResource = {
  _id: string
  donor?: { _id: string; displayName: string; email: string }
  resourceCategory: string
  description: string
  quantity: number
  quantityReserved: number
  quantityAllocated: number
  unit: string
  condition: string
  expiryDate?: string
  availabilityStatus: string
  createdAt: string
  updatedAt: string
}

export type AdminRequirement = {
  _id: string
  ngo?: {
    _id: string
    displayName: string
    email: string
    organizationProfile?: { name?: string; registrationNumber?: string }
  }
  resourceCategory: string
  description: string
  quantityRequested: number
  quantityFulfilled: number
  quantityReserved: number
  unit: string
  priority: string
  status: string
  neededBy?: string
  createdAt: string
  updatedAt: string
}

export type AdminAllocation = {
  _id: string
  donationId?: {
    _id: string
    resourceCategory: string
    quantity: number
    unit: string
    availabilityStatus: string
  }
  requirementId?: {
    _id: string
    resourceCategory: string
    quantityRequested: number
    unit: string
    status: string
    priority: string
  }
  allocatedBy?: {
    _id: string
    displayName: string
    email: string
    role: string
  }
  quantity: number
  state: 'pending' | 'confirmed' | 'failed'
  failureReason?: string
  idempotencyKey?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export type AdminTask = {
  _id: string
  volunteer?: {
    _id: string
    displayName: string
    email: string
  }
  donation?: {
    _id: string
    resourceCategory: string
    unit: string
  }
  requirement?: {
    _id: string
    resourceCategory: string
  }
  report?: {
    _id: string
    title: string
    urgency: string
    status: string
  }
  assignmentStatus: 'assigned' | 'accepted' | 'declined' | 'cancelled' | 'reassigned'
  pickupStatus: 'pending' | 'collected' | 'failed'
  deliveryStatus: 'pending' | 'in_transit' | 'delivered_pending_confirmation' | 'delivered' | 'failed'
  priority?: string
  taskDetails?: string
  acceptedAt?: string
  collectedAt?: string
  deliveredAt?: string
  confirmedAt?: string
  confirmationNotes?: string
  proofOfDeliveryRef?: string
  history?: Array<{
    status: string
    changedBy: { _id: string; displayName?: string; email?: string } | string
    changedAt: string
    reason?: string
  }>
  createdAt: string
  updatedAt: string
}

export type PageInfo = { nextCursor: string | null }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function parseList<T>(res: Response): Promise<{ data: T[]; page: PageInfo }> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new AuthApiError(err.code ?? 'api_error', err.message ?? `HTTP ${res.status}`, res.status)
  }
  const body = await res.json() as { data: T[]; page: PageInfo }
  return { data: body.data, page: body.page }
}

async function parseOne<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { code?: string; message?: string }
    throw new AuthApiError(err.code ?? 'api_error', err.message ?? `HTTP ${res.status}`, res.status)
  }
  const body = await res.json() as { data: T }
  return body.data
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getAdminOverview(token: string): Promise<AdminOverview> {
  const res = await fetch('/api/admin/overview', { headers: authHeader(token) })
  return parseOne<AdminOverview>(res)
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getAdminUsers(token: string, params: { cursor?: string; role?: string; accountStatus?: string; search?: string } = {}): Promise<{ data: AdminUser[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.role) q.set('role', params.role)
  if (params.accountStatus) q.set('accountStatus', params.accountStatus)
  if (params.search) q.set('search', params.search)
  const res = await fetch(`/api/admin/users${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminUser>(res)
}

export async function getAdminUser(token: string, userId: string): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${userId}`, { headers: authHeader(token) })
  return parseOne<AdminUser>(res)
}

export async function patchUserStatus(token: string, userId: string, accountStatus: string): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ accountStatus }),
  })
  return parseOne<AdminUser>(res)
}

// ---------------------------------------------------------------------------
// NGO Verifications
// ---------------------------------------------------------------------------

export async function getNgoVerifications(token: string, params: { cursor?: string; status?: string } = {}): Promise<{ data: NgoVerification[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  const res = await fetch(`/api/admin/ngos/verifications${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<NgoVerification>(res)
}

export async function getNgoVerification(token: string, id: string): Promise<{ verification: NgoVerification; ngo: AdminUser | null }> {
  const res = await fetch(`/api/admin/ngos/verifications/${id}`, { headers: authHeader(token) })
  return parseOne<{ verification: NgoVerification; ngo: AdminUser | null }>(res)
}

export async function approveNgoVerification(token: string, id: string): Promise<NgoVerification> {
  const res = await fetch(`/api/admin/ngos/verifications/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({}),
  })
  return parseOne<NgoVerification>(res)
}

export async function rejectNgoVerification(token: string, id: string, reason: string): Promise<NgoVerification> {
  const res = await fetch(`/api/admin/ngos/verifications/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ reason }),
  })
  return parseOne<NgoVerification>(res)
}

export const getVerifications = getNgoVerifications
export const getVerification = getNgoVerification
export const approveVerification = approveNgoVerification
export const rejectVerification = rejectNgoVerification

// ---------------------------------------------------------------------------
// Volunteer Verifications
// ---------------------------------------------------------------------------

export async function getVolunteerVerifications(
  token: string,
  params: { cursor?: string; status?: string } = {},
): Promise<{ data: VolunteerVerification[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  const res = await fetch(`/api/admin/volunteers/verifications${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<VolunteerVerification>(res)
}

export async function getVolunteerVerification(
  token: string,
  id: string,
): Promise<{ verification: VolunteerVerification; volunteer: AdminUser | null }> {
  const res = await fetch(`/api/admin/volunteers/verifications/${id}`, { headers: authHeader(token) })
  return parseOne<{ verification: VolunteerVerification; volunteer: AdminUser | null }>(res)
}

export async function approveVolunteerVerification(token: string, id: string): Promise<VolunteerVerification> {
  const res = await fetch(`/api/admin/volunteers/verifications/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({}),
  })
  return parseOne<VolunteerVerification>(res)
}

export async function rejectVolunteerVerification(token: string, id: string, reason: string): Promise<VolunteerVerification> {
  const res = await fetch(`/api/admin/volunteers/verifications/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ reason }),
  })
  return parseOne<VolunteerVerification>(res)
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function getAdminReports(
  token: string,
  params: { cursor?: string; status?: string; urgency?: string; riskLevel?: string } = {},
): Promise<{ data: AdminReport[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  if (params.urgency) q.set('urgency', params.urgency)
  if (params.riskLevel) q.set('riskLevel', params.riskLevel)
  const res = await fetch(`/api/admin/reports${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminReport>(res)
}

export async function getAdminReport(token: string, reportId: string): Promise<AdminReport> {
  const res = await fetch(`/api/admin/reports/${reportId}`, { headers: authHeader(token) })
  return parseOne<AdminReport>(res)
}

export async function patchReportStatus(token: string, reportId: string, status: string, note?: string): Promise<AdminReport> {
  const res = await fetch(`/api/admin/reports/${reportId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ status, ...(note ? { note } : {}) }),
  })
  return parseOne<AdminReport>(res)
}

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

export async function getAdminComplaints(token: string, params: { cursor?: string; status?: string } = {}): Promise<{ data: AdminComplaint[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  const res = await fetch(`/api/admin/complaints${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminComplaint>(res)
}

export async function getAdminComplaint(token: string, id: string): Promise<AdminComplaint> {
  const res = await fetch(`/api/admin/complaints/${id}`, { headers: authHeader(token) })
  return parseOne<AdminComplaint>(res)
}

export async function patchComplaintStatus(token: string, id: string, status: string, reason?: string): Promise<AdminComplaint> {
  const res = await fetch(`/api/admin/complaints/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  })
  return parseOne<AdminComplaint>(res)
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export async function getAuditLogs(token: string, params: { cursor?: string; entityType?: string; action?: string; actor?: string } = {}): Promise<{ data: AuditLog[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.entityType) q.set('entityType', params.entityType)
  if (params.action) q.set('action', params.action)
  if (params.actor) q.set('actor', params.actor)
  const res = await fetch(`/api/admin/audit-logs${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AuditLog>(res)
}

// ---------------------------------------------------------------------------
// Resource & Allocation Oversight
// ---------------------------------------------------------------------------

export async function getAdminResources(
  token: string,
  params: { cursor?: string; status?: string; category?: string; search?: string } = {},
): Promise<{ data: AdminResource[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  if (params.category) q.set('category', params.category)
  if (params.search) q.set('search', params.search)
  const res = await fetch(`/api/admin/resources${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminResource>(res)
}

export async function getAdminRequirements(
  token: string,
  params: { cursor?: string; status?: string; priority?: string; category?: string } = {},
): Promise<{ data: AdminRequirement[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.status) q.set('status', params.status)
  if (params.priority) q.set('priority', params.priority)
  if (params.category) q.set('category', params.category)
  const res = await fetch(`/api/admin/requirements${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminRequirement>(res)
}

export async function getAdminAllocations(
  token: string,
  params: { cursor?: string; state?: string } = {},
): Promise<{ data: AdminAllocation[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.state) q.set('state', params.state)
  const res = await fetch(`/api/admin/allocations${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminAllocation>(res)
}

// ---------------------------------------------------------------------------
// Volunteer Tasks Oversight
// ---------------------------------------------------------------------------

export async function getAdminTasks(
  token: string,
  params: { cursor?: string; assignmentStatus?: string; deliveryStatus?: string } = {},
): Promise<{ data: AdminTask[]; page: PageInfo }> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.assignmentStatus) q.set('assignmentStatus', params.assignmentStatus)
  if (params.deliveryStatus) q.set('deliveryStatus', params.deliveryStatus)
  const res = await fetch(`/api/admin/tasks${q.size ? `?${q}` : ''}`, { headers: authHeader(token) })
  return parseList<AdminTask>(res)
}
