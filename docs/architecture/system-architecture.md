# System Architecture

Status: Phase 13. Volunteer task management implemented.

ReliefGrid uses a modular monolith: a React frontend communicates with a
Node.js, Express, and TypeScript REST API backed by MongoDB Atlas through
Mongoose. The backend loads its environment file relative to the module path,
connects to MongoDB before listening, and exposes process health and database
readiness probes.

## Backend structure

```
backend/src/
  auth/         JWT creation/verification, password hashing, auth service
  config/       Environment validation, MongoDB connection
  middleware/   requireAuth, requireRoles, ApiError, error handler, rate limiter
  models/       Mongoose schemas: user, report, requirement, donation, task,
                notification, audit, oversight, common
  routes/       auth, reports, donations, ngo, volunteer, protected, health
  app.ts        Express app assembly
  server.ts     Process entry point
```

## Frontend structure

```
frontend/src/
  api/          Typed fetch wrappers: auth, reports, donations, ngo, volunteer
  components/
    auth/       AuthForm
    layout/     DashboardLayout
    ngo/        NgoProfileSection, NgoReportsSection, NgoRequirementsSection,
                NgoVerificationSection
    volunteer/  VolunteerTaskList, VolunteerTaskDetail, VolunteerHistorySection
    ui/         Badge, Button, Card, Input, SectionHeading, ReliefGridLogo,
                ThemeToggle
  hooks/        useAuth
  lib/          AuthContext, useAuthContext, roles, ThemeContext
  pages/
    dashboard/  AdminDashboard, CitizenDashboard, DonorDashboard, NgoDashboard,
                VolunteerDashboard
    DashboardRedirect, LandingPage, LoginPage, RegisterPage
  tests/        Vitest unit tests for all API modules and role utilities
```

## Authentication and authorization

JWT bearer tokens carry `userId` and `role`. The `requireAuth` middleware
verifies the token and performs a database lookup to confirm the user is active.
The `requireRoles` middleware enforces role-based access. The frontend is never
treated as a security boundary.

## Implemented modules

| Module | Backend routes | Frontend dashboard | Tests |
| --- | --- | --- | --- |
| Auth | `/api/auth/*`, `/api/users/me` | LoginPage, RegisterPage | auth.test.ts |
| Citizen reports | `/api/reports/*` | CitizenDashboard | reports.test.ts |
| Donor donations | `/api/donations/*` | DonorDashboard | donations.test.ts |
| NGO module | `/api/ngo/*` | NgoDashboard | ngo.test.ts |
| Volunteer tasks | `/api/volunteer/*` | VolunteerDashboard | volunteer.test.ts |

## Volunteer module (Phase 13)

The volunteer module implements task acceptance, progress tracking, and history
viewing. Task creation and assignment are coordinator operations blocked on the
Phase 15 matching engine. The volunteer workflow:

1. Coordinator creates a task assigned to a specific volunteer (Phase 15).
2. Volunteer sees the task in `GET /api/volunteer/tasks/mine`.
3. Volunteer accepts (`POST .../accept`) or declines (`POST .../decline`).
4. On acceptance, volunteer updates pickup and delivery progress (`PATCH .../progress`).
5. Volunteer submits delivery with optional proof reference.
6. Independent NGO/coordinator confirmation is required for final verification (Phase 14+).

Concurrency is handled with optimistic locking: accept/decline use
`findOneAndUpdate` with the current `assignmentStatus` in the filter.

## Deferred dependencies

- **Phase 14**: Notification delivery for task assignment and completion events.
- **Phase 15**: Matching engine, coordinator task creation, and task reassignment.
- **Phase 14+**: Independent delivery confirmation by NGO or coordinator.
- **Live browser/MongoDB verification**: Intentionally deferred to the
  verification stage.
