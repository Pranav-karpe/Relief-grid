# Architecture Decisions

## ADR-001: Initial technology proposal

Status: Accepted.

- React + TypeScript + Vite for the frontend.
- Node.js + Express + TypeScript for the backend.
- MongoDB Atlas for persistence.
- Modular monolith architecture initially.

Reason: a practical, modular foundation for a student-scale project.

## ADR-002: Phase 7 document model baseline

Status: Accepted.

- Use one `users` collection for all five roles.
- Use separate collections for reports, NGO requirements, donations, volunteer
	tasks, notifications, audit records, NGO verification, and complaints.
- Represent operational locations as GeoJSON `Point` values with `2dsphere`
	indexes where proximity queries are needed.
- Keep quantity reservations and allocations explicit and validate their upper
	bounds at the document layer; enforce concurrency with atomic service updates.
- Keep NGO verification separate from the user profile because submitted profile
	data and a reviewer decision have different lifecycles.

## ADR-003: Phase 13 volunteer task workflow

Status: Accepted.

### Decision

Volunteers cannot self-assign tasks. The `volunteer` field on `VolunteerTask`
is required and set at task creation by a coordinator. The volunteer workflow
is: receive assignment → accept or decline → update pickup/delivery progress →
submit delivery.

### Rationale

The existing `VolunteerTask` schema has `volunteer` as a required field with no
mechanism for claiming from a pool. Self-assignment would require a separate
`available` status and a claiming endpoint, which depends on the Phase 15
matching engine. Implementing fake claiming in Phase 13 would create a
misleading workflow.

### Consequences

- `GET /api/volunteer/tasks/available` is not implemented. There is no pool of
  unclaimed tasks in the current schema.
- Task creation (`POST /api/tasks`) is deferred to Phase 15.
- The volunteer dashboard shows assigned tasks and history only.

### Concurrency strategy

Accept and decline use optimistic concurrency via `findOneAndUpdate` with the
current `assignmentStatus` in the filter. If the document was modified between
the read and the update, the update returns `null` and the endpoint responds
`409 conflict`. This prevents double-acceptance without requiring a transaction.

### Delivery confirmation

A volunteer submitting `deliveryStatus: delivered` records the event and sets
`deliveredAt`. The frontend explicitly informs the volunteer that independent
confirmation by an NGO or coordinator is required. No volunteer-facing
confirmation endpoint exists; this is a Phase 14+ dependency.

### Protected fields

The progress endpoint enforces an explicit allowlist. The following fields are
rejected with `400 validation_error` if present in the request body:
`volunteer`, `donation`, `report`, `requirement`, `assignmentStatus`,
`assignedLocation`, `taskDetails`, `acceptedAt`, `deliveredAt`, `history`.

### Notifications

The `notification` model exists but no notification events are emitted from
volunteer routes in Phase 13. Task assignment and completion notifications
depend on the Phase 14 notification delivery service.

## ADR-004: Phase 15 shared relief services

Status: Accepted.

### Matching engine

A deterministic scoring engine compares available donations against active
requirements by category (exact case-insensitive match), priority, coverage
ratio, urgency, and distance. Scores are floats; tie-breaking uses requirement
`_id` ascending. Viewing suggestions never modifies quantities. Distance is a
ranking factor only — not proof of operational feasibility.

### Allocation safety

Two-phase optimistic conditional update without MongoDB transactions (standalone
instance). The `AllocationRecord` collection is the durable state machine:

- `pending`   — donation reserved; requirement reservation not yet attempted.
- `confirmed` — both reservations succeeded; allocation is complete.
- `failed`    — step failed; compensation was attempted.

A sparse unique index on `AllocationRecord.idempotencyKey` is the authoritative
idempotency gate. It is database-backed and survives process restarts and
multiple server instances. In-memory maps are not used. Callers supply an
idempotency key (max 120 non-blank characters); blank or oversized keys are
rejected with 400.

Compensation uses a conditional `$inc: { quantityReserved: -quantity }` with a
`$gte: quantity` filter guard so it never releases more than was reserved by
this allocation. Status is recomputed from the actual post-update document.

Stale `pending` records (older than 5 minutes) indicate a crash between step 1
and step 2. `recoverStalePendingAllocations()` is called at startup and can be
scheduled periodically to compensate these records safely.

Limitation: if compensation itself fails (e.g. network partition after step 1),
the donation retains a stale reservation until recovery runs. The record stays
`pending` so recovery can detect it. A replica-set topology should use MongoDB
sessions for full atomicity.

### Volunteer task coordination

Task creation is admin-only (`POST /api/coordination/tasks`). The service
validates that the target user has `role: volunteer` and `accountStatus: active`.
An audit record and a notification are written after successful creation.
Volunteers cannot self-assign through any public endpoint.

### Notification service

A single `notify()` / `notifyMany()` helper writes `Notification` documents.
Errors are swallowed — a notification failure must not roll back the business
operation. The frontend polls the unread count every 60 seconds and cleans up
the interval on unmount. No WebSocket or external push provider is required.

### Frontend test environment

Vitest 5.x with `@vitejs/plugin-react` v6 and Node.js 24 requires `pool: vmForks`
to correctly initialize the worker context. A separate `vitest.config.ts` (without
the React/Tailwind plugins) is used so the test runner does not load build-only
plugins. The `vite.config.ts` remains unchanged for production builds.

### AI integration

No AI provider adapter was implemented in Phase 15. The deterministic matching
engine provides explainable suggestions without an external provider. AI
assistance is deferred to a future phase when a safe, optional adapter can be
added without blocking core workflows.

### Map/location support

No mapping library was added in Phase 15. GeoJSON coordinates are stored and
validated on the backend. Location data is used for distance scoring in the
matching engine. A map rendering component is deferred to Phase 17 (visual
polish), where a free OpenStreetMap-compatible library (e.g. Leaflet) will be
integrated without exposing private addresses to unauthorized users.

## ADR-005: Phase 16 security and integration hardening

Status: Accepted.

### Security headers

Every response now includes `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
and `X-XSS-Protection: 0` (disabled in favour of CSP, which is deferred to
Phase 17 when the full content policy can be defined).

### CORS

A single-origin CORS policy is enforced in `app.ts`. The allowed origin
defaults to `http://localhost:5173` (Vite dev server) and is overridden by the
`ALLOWED_ORIGIN` environment variable in production. Preflight `OPTIONS`
requests are handled inline. No third-party `cors` package is required.

Required production configuration: set `ALLOWED_ORIGIN` to the deployed
frontend URL before going live.

### General API rate limiter

A 120 req/min per-IP rate limiter is applied to all `/api` routes in addition
to the existing 20 req/15 min limiter on auth endpoints. Both limiters are
in-process and reset on restart. For multi-instance deployments a shared
Redis-backed store should replace the in-process map.

### Body size limit

`express.json()` is now configured with `{ limit: '64kb' }` to prevent
oversized payload attacks.

### Rules of Hooks fix

`NgoDashboard.tsx` called `useEffect` after a conditional `return null`,
violating the React Rules of Hooks. The hook is now unconditional; the early
return follows it. The `// eslint-disable-next-line react-hooks/rules-of-hooks`
suppression comment has been removed.

### Session restore failure UX

`ProtectedRoute` previously redirected silently to `/login` on `restore_failed`
(server temporarily unreachable). It now shows an inline retry/sign-out UI with
the actual error message, so users with a valid token are not forced to
re-authenticate after a transient network error.

### Remaining limitations

- CORS `ALLOWED_ORIGIN` must be set in production. The default `localhost:5173`
  is not safe for a deployed environment.
- Rate limiters are in-process. A multi-instance deployment requires a shared
  store (e.g. Redis).
- CSP headers are deferred to Phase 17.
- Delivery confirmation by NGO/coordinator is not yet implemented (Phase 14+
  dependency, noted in ADR-003).
- `findOneAndUpdate` with `{ new: true }` produces Mongoose deprecation warnings
  across the codebase. Migration to `{ returnDocument: 'after' }` is deferred
  to a dedicated cleanup phase to avoid scope creep.

## ADR-006: Phase 17 UI/UX polish and maps

Status: Accepted.

### Map component

A reusable `LocationMap` component was added in
`frontend/src/components/ui/LocationMap.tsx` using Leaflet 1.9.x and
OpenStreetMap tiles. Key decisions:

- Leaflet is dynamically imported (`import('leaflet')`) so it does not block
  the initial bundle.
- Coordinates follow GeoJSON order `[longitude, latitude]` throughout. Leaflet
  receives `[lat, lng]` internally.
- Invalid, missing, or out-of-range coordinates are filtered before rendering.
  A count of skipped markers is shown to the user.
- An accessible `<details>` text/list alternative is always rendered below the
  map so screen-reader users and users with JavaScript disabled can read
  location data.
- Tile provider: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`.
  Attribution is rendered inside the map as required by the OSM tile usage
  policy. No API key is required.
- The component shows only records passed to it by the parent; authorization
  is enforced at the API layer before data reaches the component.
- Live tracking and route optimization are not implemented.

### Integration points

- `NgoReportsSection` — shows a single-marker map in the report detail view.
- `CitizenDashboard` — shows a single-marker map in the report detail panel.
- `DonorDashboard` — shows a single-marker map in the donation detail view.

### Lint warnings (set-state-in-effect)

Oxlint reports 15 `react/set-state-in-effect` warnings and 1
`react/only-export-components` warning. These are all false positives for the
pattern `useEffect(() => { void load() }, [load])` where `load` is a
`useCallback`-memoized async function that sets state after an awaited
operation — not synchronously inside the effect body. The React team
explicitly endorses this pattern for data fetching. Restructuring every
data-fetching hook to use a different pattern would increase complexity without
improving correctness. The warnings are documented here and left as-is.

The `only-export-components` warning on `ThemeContext.tsx` is a known
false positive for context files that export both a context and a hook.

### Remaining deferred items

- CSP headers (deferred from Phase 16).
- NGO/coordinator delivery confirmation.
- Multi-marker map views (e.g. all reports on a single map) — deferred to a
  future phase when a list endpoint with location data is available.
- AI integration remains optional and deferred.
