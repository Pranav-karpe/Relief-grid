# API Contracts

Status: Phase 14. Administrator module implemented.

## Conventions

JSON responses use `{ "data": ... }` for a single resource and
`{ "data": [], "page": { "nextCursor": "..." } }` for lists. List endpoints
use cursor pagination with a stable `(createdAt, _id)` descending sort by
default. They accept `cursor` and `limit` (default 20, maximum 100), plus
resource-specific filters.

Errors use `{ "status": "error", "code": "...", "message": "...", "requestId": "..." }`.
Validation is `400`, authentication failure is `401`, authorization failure is
`403`, missing resources are `404`, conflicts are `409`, and unexpected errors
are `500` without stack traces or secret values.

## Health and readiness

| Method and route | Purpose | Auth | Response |
| --- | --- | --- | --- |
| `GET /api/health` | Process health probe. Implemented. | None | `200`, `{ status: "ok", service: "reliefgrid-api" }` |
| `GET /api/readiness` | Application and database readiness. Implemented. | None | `200` when ready; `503` with `status: "not_ready"` otherwise |

## Users and account profiles

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `POST /api/auth/register` | Create an account with a password | Public | `201` safe user profile |
| `POST /api/auth/login` | Authenticate with email and password | Public | `200` bearer token and safe user |
| `GET /api/users/me` | Read the authenticated user's profile | Bearer token | `200` safe profile |
| `PATCH /api/users/me` | Update own profile | Authenticated | Allowed profile fields; `200` updated safe profile |
| `GET /api/role-access/ngo` | Protected role example | NGO or admin | `200`, otherwise `401`/`403` |
| `GET /api/role-access/admin` | Protected role example | Admin | `200`, otherwise `401`/`403` |

Authentication failures use generic messages. `JWT_SECRET` must be supplied
through the backend environment and must be at least 32 characters.

## Reports (implemented)

All report endpoints require a valid Bearer JWT token with the `citizen` role.
Ownership is enforced server-side: the `reporter` field is always set from
`req.auth.userId` and never from client input. Inaccessible records return 404
to avoid revealing that another user's record exists.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `POST /api/reports` | Create a relief request | Bearer, citizen | See fields below; `201` report |
| `GET /api/reports/mine` | List own reports | Bearer, citizen | Cursor-paginated list; `200` |
| `GET /api/reports/:reportId` | Get own report by ID | Bearer, citizen | `200` report or `404` |
| `PATCH /api/reports/:reportId` | Update own draft report | Bearer, citizen | Allowed fields; `200` or `409` |

### POST /api/reports — request fields

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `title` | string | Yes | 3–160 characters |
| `description` | string | Yes | 10–5000 characters |
| `needCategory` | string | Yes | `food`, `water`, `shelter`, `medical`, `other` |
| `urgency` | string | Yes | `low`, `medium`, `high`, `critical` |
| `location` | GeoJSON Point | Yes | `{ type: "Point", coordinates: [lng, lat] }` |
| `affectedPersonCount` | number | No | Non-negative integer |
| `requestedResources` | array | No | `[{ category, quantity, unit }]` |
| `status` | string | No | `draft` or `submitted` (default: `submitted`) |

### Report status lifecycle

Statuses: `draft` → `submitted` → `under_review` → `verified` | `rejected` → `resolved`.

Citizens may only set `draft` or `submitted`. All other transitions are
performed by reviewers in later phases.

## NGO module (implemented)

All NGO endpoints require a valid Bearer JWT token with the `ngo` role.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/ngo/profile` | Read own NGO profile | Bearer, ngo | `200` safe profile |
| `PATCH /api/ngo/profile` | Update own NGO profile | Bearer, ngo | Allowed fields; `200` |
| `GET /api/ngo/verification` | Read own verification status | Bearer, ngo | `200` |
| `POST /api/ngo/verification/submit` | Submit verification documents | Bearer, ngo | `200` |
| `GET /api/ngo/reports` | List reports visible to NGO | Bearer, ngo | Cursor-paginated; `200` |
| `GET /api/ngo/reports/:id` | Get report detail | Bearer, ngo | `200` or `404` |
| `POST /api/ngo/requirements` | Create a resource requirement | Bearer, ngo | `201` requirement |
| `GET /api/ngo/requirements/mine` | List own requirements | Bearer, ngo | Cursor-paginated; `200` |
| `GET /api/ngo/requirements/:id` | Get own requirement detail | Bearer, ngo | `200` or `404` |
| `PATCH /api/ngo/requirements/:id` | Update own requirement | Bearer, ngo | Allowed fields; `200` |
| `PATCH /api/ngo/requirements/:id/cancel` | Cancel own requirement | Bearer, ngo | `200` or `409` |

## Donations (implemented)

All donation endpoints require a valid Bearer JWT token with the `donor` role.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `POST /api/donations` | Create a donation listing | Bearer, donor | `201` donation |
| `GET /api/donations/mine` | List own donations | Bearer, donor | Cursor-paginated; `200` |
| `GET /api/donations/:id` | Get own donation detail | Bearer, donor | `200` or `404` |
| `PATCH /api/donations/:id` | Update own donation | Bearer, donor | Allowed fields; `200` |

## Volunteer tasks (Phase 13 — implemented)

All volunteer endpoints require a valid Bearer JWT token with the `volunteer` role.
Ownership is enforced server-side: every query filters by `volunteer: req.auth.userId`.
Inaccessible records return `404` to avoid revealing another volunteer's tasks.

Task creation is performed by coordinators/admins (not yet implemented — blocked
on Phase 15 matching engine). Volunteers cannot self-assign tasks.

### Task status lifecycle

#### assignmentStatus

| Status | Meaning | Volunteer-settable |
| --- | --- | --- |
| `assigned` | Coordinator assigned the task | No — set by coordinator |
| `accepted` | Volunteer accepted the task | Yes — via `/accept` |
| `declined` | Volunteer declined the task | Yes — via `/decline` |
| `cancelled` | Task cancelled by coordinator | No |
| `reassigned` | Coordinator reassigned to this volunteer | No — set by coordinator |

Valid volunteer transitions: `assigned` → `accepted` or `declined`; `reassigned` → `accepted` or `declined`; `accepted` → `cancelled` (not yet exposed as a volunteer action).

#### pickupStatus (only when assignmentStatus is `accepted`)

`pending` → `collected` | `failed`

#### deliveryStatus (only when assignmentStatus is `accepted`)

`pending` → `in_transit` → `delivered` | `failed`

Delivery confirmation (marking a task fully complete) requires independent
confirmation by an NGO or coordinator. A volunteer submitting `deliveryStatus: delivered`
records the submission but does not constitute verified completion.

### Endpoints

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/volunteer/tasks/mine` | List own assigned tasks | Bearer, volunteer | Cursor-paginated; optional `assignmentStatus` filter; `200` |
| `GET /api/volunteer/tasks/:taskId` | Get own task detail (with history) | Bearer, volunteer | `200` or `404` |
| `POST /api/volunteer/tasks/:taskId/accept` | Accept an assigned task | Bearer, volunteer | `200` updated task or `409` conflict |
| `POST /api/volunteer/tasks/:taskId/decline` | Decline an assigned task | Bearer, volunteer | `200` updated task or `409` conflict |
| `PATCH /api/volunteer/tasks/:taskId/progress` | Update pickup/delivery progress | Bearer, volunteer | Allowed fields only; `200` or `409` |
| `GET /api/volunteer/history` | List completed/declined/cancelled tasks | Bearer, volunteer | Cursor-paginated; `200` |

### PATCH /api/volunteer/tasks/:taskId/progress — allowed fields

| Field | Type | Constraints |
| --- | --- | --- |
| `pickupStatus` | string | Valid transition from current `pickupStatus` |
| `deliveryStatus` | string | Valid transition from current `deliveryStatus` |
| `proofOfDeliveryRef` | string | Max 500 chars; only when `deliveryStatus` is `delivered` |

Protected fields rejected with `400 validation_error`: `volunteer`, `donation`, `report`,
`requirement`, `assignmentStatus`, `assignedLocation`, `taskDetails`, `acceptedAt`,
`deliveredAt`, `history`.

### Concurrency

Accept and decline use optimistic concurrency: `findOneAndUpdate` with the
current `assignmentStatus` in the filter. If the task was modified concurrently,
the update returns `null` and the endpoint responds `409 conflict`.

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `validation_error` | 400 | Invalid or missing field, or protected field in body |
| `authentication_required` | 401 | Missing or invalid token |
| `forbidden` | 403 | Authenticated but wrong role |
| `not_found` | 404 | Task does not exist or belongs to another volunteer |
| `invalid_transition` | 409 | Status transition not permitted, or task not accepted |
| `conflict` | 409 | Concurrent state change; client should refresh and retry |
| `internal_error` | 500 | Unexpected server error (no stack trace) |

### Known limitations and deferred dependencies

- Task creation (`POST /api/tasks`) requires a coordinator role and the Phase 15
  matching engine. Not implemented in Phase 13.
- `GET /api/volunteer/tasks/available` (self-assignment claiming) is not supported
  because the existing lifecycle requires coordinator assignment. Tasks are always
  pre-assigned to a specific volunteer.
- Delivery verification (independent NGO/coordinator confirmation) is not yet
  implemented. The `deliveredAt` timestamp is set when the volunteer submits
  `deliveryStatus: delivered`, but no separate confirmation endpoint exists.
- Notifications for task assignment and completion events depend on the
  notification delivery service (Phase 14+). The notification model exists but
  no events are emitted from volunteer routes in Phase 13.

## Administrator module (Phase 14 — implemented)

All administrator endpoints require a valid Bearer JWT token with the `admin` role.
The role is verified against the live database on every request via `requireAuth`.
Administrators cannot be created through public registration.

### Provisioning

Use the one-time CLI script (never an HTTP route):

```
cd backend
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<strong-password> npx tsx scripts/seed-admin.ts
```

Required environment variables: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 12 chars).
The script refuses to overwrite an existing account or elevate a non-admin user.

### Overview

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/overview` | Platform-wide live metrics | Bearer, admin | `200` counts object |

Response shape:
```json
{
  "data": {
    "users": { "total": 0, "active": 0 },
    "ngoVerifications": { "pending": 0, "approved": 0 },
    "reports": { "submitted": 0, "underReview": 0, "verified": 0 },
    "donations": { "available": 0 },
    "complaints": { "open": 0 },
    "tasks": { "active": 0 }
  }
}
```

### User management

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/users` | List users | Bearer, admin | Cursor-paginated; filters: `role`, `accountStatus`, `search`; `200` |
| `GET /api/admin/users/:userId` | Get user detail | Bearer, admin | `200` safe user or `404` |
| `PATCH /api/admin/users/:userId/status` | Change account status | Bearer, admin | `{ accountStatus }` body; `200` or `409` |

Safe user response never includes `auth` (password hash, tokens).

Allowed `accountStatus` transitions: `pending` → `active`/`closed`; `active` → `suspended`/`closed`; `suspended` → `active`/`closed`; `closed` → (none).

Safeguards: administrators cannot suspend or close their own account (`409 forbidden_self_action`). The last active administrator cannot be deactivated (`409 last_admin`).

### NGO verification

Verification lifecycle: `pending` → `approved` or `rejected`.

Registering as an NGO does not automatically make the organization verified.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/ngos/verifications` | List verifications | Bearer, admin | Cursor-paginated; `status` filter (default `pending`); `200` |
| `GET /api/admin/ngos/verifications/:id` | Get verification + NGO user | Bearer, admin | `200` `{ verification, ngo }` or `404` |
| `POST /api/admin/ngos/verifications/:id/approve` | Approve pending verification | Bearer, admin | `200` updated record or `409` |
| `POST /api/admin/ngos/verifications/:id/reject` | Reject pending verification | Bearer, admin | `{ reason }` (5–2000 chars required); `200` or `400`/`409` |

Approval and rejection use optimistic concurrency. Both update the NGO user's `organizationProfile.verificationStatus` and write an audit record.

### Report oversight

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/reports` | List reports | Bearer, admin | Cursor-paginated; `status`, `urgency` filters; `200` |
| `GET /api/admin/reports/:reportId` | Get report detail | Bearer, admin | `200` or `404` |
| `PATCH /api/admin/reports/:reportId/status` | Change report status | Bearer, admin | `{ status, note? }` body; `200` or `409` |

Admin report status transitions: `submitted` → `under_review`/`rejected`; `under_review` → `verified`/`rejected`; `verified` → `resolved`.

### Complaint management

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/complaints` | List complaints | Bearer, admin | Cursor-paginated; `status` filter; `200` |
| `GET /api/admin/complaints/:complaintId` | Get complaint detail | Bearer, admin | `200` or `404` |
| `PATCH /api/admin/complaints/:complaintId/status` | Change complaint status | Bearer, admin | `{ status, reason? }` body; `200` or `409` |

Complaint status transitions: `open` → `under_review`/`dismissed`; `under_review` → `resolved`/`dismissed`.

### Audit logs

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/admin/audit-logs` | Read-only paginated audit log | Bearer, admin | Cursor-paginated; `entityType`, `actor` filters; `200` |

Audit logs are read-only. No edit or delete endpoint exists. The `metadata` field is omitted from list responses.

Audit events written by Phase 14: `user.status_changed`, `ngo_verification.approved`, `ngo_verification.rejected`, `report.status_changed`, `complaint.status_changed`.

### Error codes (administrator module)

| Code | HTTP | Meaning |
| --- | --- | --- |
| `validation_error` | 400 | Invalid or missing field |
| `authentication_required` | 401 | Missing or invalid token |
| `forbidden` | 403 | Authenticated but not admin |
| `not_found` | 404 | Resource does not exist |
| `invalid_transition` | 409 | Status transition not permitted |
| `conflict` | 409 | Concurrent state change |
| `forbidden_self_action` | 409 | Admin attempted to suspend/close own account |
| `last_admin` | 409 | Cannot deactivate the last active administrator |
| `internal_error` | 500 | Unexpected server error (no stack trace) |

## Notifications (Phase 15 — implemented)

In-app notification storage only. Not email, SMS, push, or guaranteed real-time delivery.
Polling (60-second interval) is used in the frontend; no WebSocket dependency.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/notifications` | List own notifications | Bearer, any role | Cursor-paginated; `unread`, `cursor`, `limit` params; `200` |
| `GET /api/notifications/unread-count` | Count unread notifications | Bearer, any role | `200` `{ count: number }` |
| `PATCH /api/notifications/:id/read` | Mark a notification as read | Bearer, any role | `200` updated notification or `404` |
| `PATCH /api/notifications/read-all` | Mark all own notifications as read | Bearer, any role | `200` `{ modifiedCount: number }` |

Users can only read and update their own notifications (filtered by `recipient = req.auth.userId`).

### Notification event types

| Event type | Trigger | Recipient |
| --- | --- | --- |
| `allocation.reserved` | Allocation confirmed | Donor (donation owner) |
| `allocation.confirmed` | Allocation confirmed by admin | NGO (requirement owner) |
| `task.assigned` | Task created by coordinator | Volunteer |

## Matching engine (Phase 15 — implemented)

Deterministic donation-to-requirement matching. Viewing suggestions never modifies quantities.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `GET /api/matching/suggestions` | Platform-wide suggestions | Bearer, admin | `200` array of `MatchSuggestion` |
| `GET /api/matching/donations/:donationId` | Suggestions for a donation | Bearer, donor (own) or admin | `200` array or `404` |
| `GET /api/matching/requirements/:requirementId` | Suggestions for a requirement | Bearer, ngo (own) or admin | `200` array or `404` |

### MatchSuggestion response shape

```json
{
  "donationId": "...",
  "requirementId": "...",
  "donationCategory": "Water",
  "requirementCategory": "Water",
  "availableQty": 50,
  "remainingQty": 100,
  "suggestedQty": 50,
  "unit": "cases",
  "score": 5.5,
  "scoreFactors": { "priorityScore": 3, "coverageRatio": 0.5, "urgencyBonus": 2, "distancePenalty": 0 },
  "distanceKm": null,
  "reasons": ["Category match: \"Water\"", "Priority: high (score 3)"]
}
```

### Scoring factors

1. Category compatibility — prerequisite (exact case-insensitive match)
2. Priority score: `critical=4`, `high=3`, `medium=2`, `low=1`
3. Coverage ratio: `min(available, remaining) / remaining`, capped at 1.0
4. Urgency bonus: `+2` if `neededBy` within 3 days, `+1` if within 7 days
5. Distance penalty: `-0.1` per 100 km (only when both locations are valid)

Tie-breaking: requirement `_id` ascending (deterministic).

## Allocations (Phase 15 — implemented)

Safe resource allocation with optimistic concurrency. Two-phase conditional update with compensation.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `POST /api/allocations` | Confirm a resource allocation | Bearer, ngo (own req) or admin | `201` `AllocationResult` or `409` |
| `GET /api/allocations/mine` | List own allocated requirements | Bearer, ngo | `200` cursor-paginated requirements |

### POST /api/allocations — request fields

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `donationId` | string | Yes | Valid ObjectId |
| `requirementId` | string | Yes | Valid ObjectId; NGO must own it |
| `quantity` | number | Yes | Positive finite number |
| `idempotencyKey` | string | No | Max 120 chars; prevents duplicate allocations |

### Concurrency strategy

Two-phase optimistic conditional update:
1. Reserve on donation (conditional on current `quantityReserved` and `quantityAllocated`).
2. Reserve on requirement (conditional on current `quantityReserved` and `quantityFulfilled`).
3. If step 2 fails, compensate by releasing the donation reservation.

Limitation: if compensation also fails (network partition), the donation has a stale reservation.
A replica-set topology should use MongoDB sessions for full atomicity.

## Volunteer task coordination (Phase 15 — implemented)

Task creation is admin-only. Volunteers cannot self-assign.

| Method and route | Purpose | Auth/role | Contract |
| --- | --- | --- | --- |
| `POST /api/coordination/tasks` | Create and assign a volunteer task | Bearer, admin | `201` task or `400`/`404` |
| `GET /api/coordination/tasks` | List all tasks | Bearer, admin | Cursor-paginated; `volunteerId`, `assignmentStatus` filters; `200` |

### POST /api/coordination/tasks — request fields

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `volunteerId` | string | Yes | Valid ObjectId; user must have `volunteer` role and `active` status |
| `taskDetails` | string | Yes | 5–3000 characters |
| `assignedLocation` | GeoJSON Point | Yes | `{ type: "Point", coordinates: [lng, lat] }` |
| `donationId` | string | No | Optional linked donation |
| `requirementId` | string | No | Optional linked requirement |
| `reportId` | string | No | Optional linked report |

