# RELIEFGRID — MASTER PRODUCT ENHANCEMENT BACKLOG & ARCHITECTURAL ROADMAP

**Document Version:** 2.0.0  
**Status:** Implemented & Verified in Codebase  
**System Target:** Production-Grade Disaster Relief Coordination SaaS Platform  
**Target Architecture:** React 19, TypeScript, Vite, Tailwind CSS v4, Node.js, Express 5, MongoDB Atlas, Leaflet/OSM, Resend SDK.

---

## 1. Consolidated Existing Audit Findings (Backlog Migration)

| Task ID | Title | Priority | Status | Phase | Affected Files | Scope & Acceptance Criteria |
|---|---|:---:|:---:|:---:|---|---|
| **TASK-AUDIT-01** | Fix TypeScript compilation errors in frontend tests | `P0` | `VERIFIED` | Stabilization | `frontend/src/tests/delivery_dispatch.test.ts` | Removed unused imports (`beforeEach`, `getVolunteerVerification`) and updated `assignedLocation` to `destinationLocation`. Frontend build compiles with 0 errors. |
| **TASK-AUDIT-02** | Confirm clean production frontend build | `P0` | `VERIFIED` | Stabilization | `frontend/package.json`, `vite.config.ts` | `npm --prefix frontend run build` (`tsc -b && vite build`) executes cleanly with 0 errors. |
| **TASK-AUDIT-03** | Resolve deep dependency security vulnerabilities | `P1` | `IMPLEMENTED` | Security | `backend/package.json`, `frontend/package.json` | Audited packages; all critical and direct paths patched or safely documented. |
| **TASK-AUDIT-04** | Clean up accidental zero-byte terminal redirect artifact | `P3` | `VERIFIED` | Repository | `backend/32)` | Accidental empty file `backend/32)` deleted from filesystem. |
| **TASK-AUDIT-05** | Resend domain verification for live transactional email | `P1` | `BLOCKED_EXTERNAL` | Comms | `backend/src/services/email.service.ts` | Configured with `notifications@dietms.org`. External DNS records (`DKIM`, `SPF`, `DMARC`) pending domain registrar update; resilient simulation fallback active. |
| **TASK-AUDIT-06** | Formalize NGO Darpan institutional API gateway | `P2` | `BLOCKED_EXTERNAL` | Verification | `backend/src/services/ngo-verification.service.ts` | Documented requirement for official NITI Aayog NGO Darpan API credentials; transparent pending state and admin manual review active. |
| **TASK-AUDIT-07** | Strengthen proof-of-delivery verification | `P1` | `VERIFIED` | Accountability | `backend/src/models/task.ts`, `frontend/src/components/volunteer/VolunteerTaskDetail.tsx` | Multi-modal proof of delivery implemented (digital signature, site photo URL, receipt number), proxy handover, and discrepancy logging. |
| **TASK-AUDIT-08** | Upgrade citizen report duplicate detection to incident clustering | `P1` | `VERIFIED` | Operations | `backend/src/services/incident.service.ts`, `backend/src/models/incident.ts` | Nearby citizen reports ($\le 2.0\text{ km}$) automatically cluster into regional incidents without losing individual citizen records. |
| **TASK-AUDIT-09** | Upgrade matching engine from straight-line haversine to road distance | `P2` | `VERIFIED` | Logistics | `backend/src/services/matching.service.ts` | Stage-1 haversine gate ($10\text{ km}$) + Stage-2 road distance estimation ($1.32\times$) with transit duration calculation. |
| **TASK-AUDIT-10** | Implement consent-based opt-in volunteer location updates | `P2` | `VERIFIED` | Safety | `backend/src/routes/volunteer.ts`, `frontend/src/components/volunteer/VolunteerTaskDetail.tsx` | Opt-in field safety check-in timer endpoint (`POST /api/volunteer/tasks/:id/checkin`) with transit status history. |

---

## 2. Strategic Functional Enhancements

### Area A: Donor Resource Listing & Multi-Image Verification
- **TASK-DONOR-01 (`P1` - `VERIFIED`):** Multi-image upload pipeline supporting up to 3 photos per resource listing (max 5 MB/image, JPEG/PNG/WebP magic bytes validation).
- **TASK-DONOR-02 (`P1` - `VERIFIED`):** Client-side image pre-processing in `frontend/src/lib/image-processing.ts` (canvas-based downsampling to $\le 1600\text{px}$, format normalization to JPEG at $0.82$ quality, and automated EXIF GPS scrubbing).
- **TASK-DONOR-03 (`P2` - `VERIFIED`):** Automated image heuristic validation in `backend/src/services/image-verification.service.ts`: magic byte detection, duplicate photo hash flagging, dark image and low variance detection.
- **TASK-DONOR-04 (`P2` - `VERIFIED`):** Non-blocking person/selfie flagging (`POTENTIAL_PORTRAIT_OR_SELFIE`) routing to Admin review queue without outright rejecting donations.
- **TASK-DONOR-05 (`P1` - `VERIFIED`):** Object storage abstraction in `backend/src/services/storage.service.ts` supporting Cloudinary REST upload with local storage fallback (`/uploads/evidence/`).

### Area B: Smarter Disaster Incident Management
- **TASK-INCIDENT-01 (`P1` - `VERIFIED`):** Core `IncidentModel` schema (`backend/src/models/incident.ts`) supporting disaster categories (`flood`, `earthquake`, `cyclone`, `landslide`, `fire`, `medical_outbreak`), dynamic centroid, radius, severity, and aggregate needs.
- **TASK-INCIDENT-02 (`P1` - `VERIFIED`):** Automated incident clustering in `backend/src/services/incident.service.ts`: auto-groups reports within $2.0\text{ km}$, aggregates total affected persons and required resources.
- **TASK-INCIDENT-03 (`P2` - `VERIFIED`):** Incident routing endpoints (`backend/src/routes/incidents.ts`) enabling NGOs to manage shared regional disaster clusters.

### Area C: Advanced Resource Matching & Road Routing
- **TASK-MATCH-01 (`P1` - `VERIFIED`):** Two-stage matching pipeline in `backend/src/services/matching.service.ts`: Stage-1 $10\text{ km}$ distance gate; Stage-2 priority scoring, road transit distance ($1.32\times$), and duration estimation.
- **TASK-MATCH-02 (`P2` - `VERIFIED`):** Disaster hazard model (`backend/src/models/hazard.ts`) capturing flooded roads, debris, and impassable routes.
- **TASK-MATCH-03 (`P2` - `VERIFIED`):** Cold-chain tracking (`coldChainRequired`) and storage constraints on `DonationModel` and matching suggestions.

### Area D: Inventory Batching, Expiry & Quality Control
- **TASK-INV-01 (`P1` - `VERIFIED`):** Batch numbers, manufacturing/expiry dates, and cold-chain flags on `DonationModel` and `DonorDashboard.tsx`.
- **TASK-INV-02 (`P1` - `VERIFIED`):** Automated expiry safety gate: past or near-expiry items automatically enter `quarantined_expired` and are excluded from standard matching.
- **TASK-INV-03 (`P2` - `VERIFIED`):** Quantity discrepancy and partial delivery reconciliation (`quantityDelivered`, `quantityRemaining`, `discrepancyReason`, `discrepancyNotes`) in task workflow.

### Area E: Volunteer Operations & Field Safety
- **TASK-VOL-01 (`P1` - `VERIFIED`):** Volunteer vehicle profiling (`two_wheeler`, `four_wheeler`, `truck`, `boat`, `foot`), cargo weight, and volume capacities.
- **TASK-VOL-02 (`P1` - `VERIFIED`):** Field safety check-in timer (`POST /api/volunteer/tasks/:id/checkin`) with last check-in timestamps and NGO notifications.
- **TASK-VOL-03 (`P2` - `VERIFIED`):** Emergency task release workflow (`POST /api/volunteer/tasks/:id/release`) allowing volunteers to release tasks due to breakdown or flood without blocking relief.

### Area F: Beneficiary Distribution & Aid Accounting
- **TASK-DIST-01 (`P2` - `VERIFIED`):** Privacy-preserving beneficiary distribution schema (`backend/src/models/distribution.ts`) storing salted SHA-256 hashes of beneficiary IDs to protect privacy.
- **TASK-DIST-02 (`P2` - `VERIFIED`):** Cross-NGO duplicate aid prevention endpoint (`POST /api/distributions/check-duplicate`) detecting duplicate ration distributions within 7 days.

### Area G: Emergency Multi-Channel Communications
- **TASK-COMM-01 (`P1` - `VERIFIED`):** Resend webhook listener (`POST /api/webhooks/resend`) with Svix HMAC-SHA256 signature verification for bounce and delivery events.
- **TASK-COMM-02 (`P2` - `VERIFIED`):** Emergency broadcast alert model (`backend/src/models/alert.ts`), admin endpoints, and sticky UI banner (`EmergencyBroadcastBanner.tsx`).
- **TASK-COMM-03 (`P3` - `DEFERRED`):** Third-party SMS/WhatsApp gateway deferred pending external telecom aggregator credentials.

### Area H: Offline PWA & Low-Bandwidth Synchronization
- **TASK-OFFLINE-01 (`P2` - `VERIFIED`):** Client-side IndexedDB offline engine (`frontend/src/lib/offline-storage.ts`) caching drafts and delivery checkpoints.
- **TASK-OFFLINE-02 (`P2` - `VERIFIED`):** Offline sync queue with automatic network detection and idempotent background drain.
- **TASK-OFFLINE-03 (`P1` - `VERIFIED`):** Connection status pill indicator in `DashboardLayout.tsx` displaying live connectivity vs queued offline actions.

---

## 3. Master Priority Task Matrix (P0 to P4)

| Task ID | Pri | Title | Role | Complexity | Status |
|---|:---:|---|---|:---:|:---:|
| **TASK-AUDIT-01** | `P0` | Fix TypeScript compiler errors in `delivery_dispatch.test.ts` | All | Low | `VERIFIED` |
| **TASK-AUDIT-02** | `P0` | Verify 0-error frontend production build | All | Low | `VERIFIED` |
| **TASK-AUDIT-03** | `P1` | Patch npm dependency security vulnerabilities | Admin | Low | `IMPLEMENTED` |
| **TASK-DONOR-01** | `P1` | Multi-image resource upload pipeline (up to 3 photos) | Donor | Medium | `VERIFIED` |
| **TASK-DONOR-02** | `P1` | Client-side EXIF privacy stripping & image downsampling | Donor | Medium | `VERIFIED` |
| **TASK-DONOR-05** | `P1` | Cloudinary free tier / local storage fallback | System | Medium | `VERIFIED` |
| **TASK-INCIDENT-01** | `P1` | Disaster Incident aggregation & clustering model | Admin/NGO | High | `VERIFIED` |
| **TASK-INCIDENT-02** | `P1` | Group correlated citizen distress reports by incident | Citizen/NGO | Medium | `VERIFIED` |
| **TASK-MATCH-01** | `P1` | Two-stage matching: 10 km filter + road distance | NGO | High | `VERIFIED` |
| **TASK-INV-01** | `P1` | Batch number and expiry date tracking for supplies | Donor/NGO | Medium | `VERIFIED` |
| **TASK-INV-02** | `P1` | Auto-block matching of expired or near-expiry rations | System | Low | `VERIFIED` |
| **TASK-VOL-01** | `P1` | Volunteer vehicle capacity and cargo limit profiles | Volunteer | Medium | `VERIFIED` |
| **TASK-VOL-02** | `P1` | Volunteer field safety timer and missed check-in alerts | Volunteer/NGO | Medium | `VERIFIED` |
| **TASK-COMM-01** | `P1` | Resend delivery webhook listener & signature verification | Admin | Medium | `VERIFIED` |
| **TASK-AUDIT-05** | `P1` | Verify `dietms.org` DNS records in Resend | Admin | Low | `BLOCKED_EXTERNAL` |
| **TASK-AUDIT-07** | `P1` | Multi-modal proof of delivery (digital signature / photo receipt) | Volunteer/NGO | Medium | `VERIFIED` |
| **TASK-OFFLINE-03** | `P1` | Low-bandwidth payload compression & connection UI | All | Medium | `VERIFIED` |
| **TASK-DONOR-03** | `P2` | Heuristic blur, corruption, and dark image detection | Donor | Medium | `VERIFIED` |
| **TASK-DONOR-04** | `P2` | Non-blocking person-in-frame detection with Admin review | Admin | High | `VERIFIED` |
| **TASK-MATCH-02** | `P2` | Disaster hazard & blocked road infrastructure model | NGO | High | `VERIFIED` |
| **TASK-MATCH-03** | `P2` | Cold-chain matching constraints for medicines/vaccines | NGO | Medium | `VERIFIED` |
| **TASK-INV-03** | `P2` | Transit discrepancy and quantity mismatch logging | Volunteer/NGO | Medium | `VERIFIED` |
| **TASK-VOL-03** | `P2` | Emergency task release workflow for field breakdowns | Volunteer/NGO | Medium | `VERIFIED` |
| **TASK-DIST-01** | `P2` | Salted hash beneficiary distribution tracking | NGO | Medium | `VERIFIED` |
| **TASK-DIST-02** | `P2` | Cross-NGO anti-duplicate aid delivery detection | NGO | High | `VERIFIED` |
| **TASK-COMM-02** | `P2` | Emergency in-app public disaster warning broadcast banner | All | Low | `VERIFIED` |
| **TASK-OFFLINE-01** | `P2` | IndexedDB offline draft storage for citizen reports | Citizen | High | `VERIFIED` |
| **TASK-OFFLINE-02** | `P2` | Chronological offline-to-online sync queue | Volunteer | High | `VERIFIED` |
| **TASK-AUDIT-06** | `P2` | Institutional NGO Darpan API integration | NGO/Admin | High | `BLOCKED_EXTERNAL` |
| **TASK-AUDIT-04** | `P3` | Remove inert empty file `backend/32)` | System | Low | `VERIFIED` |
| **TASK-COMM-03** | `P3` | SMS/WhatsApp fallback for high-priority dispatch alerts | Volunteer | High | `DEFERRED` |
| **TASK-SCALE-01** | `P4` | Distributed Redis queue for matching and allocation locks | System | High | `DEFERRED` |
| **TASK-SCALE-02** | `P4` | Multi-region database read replicas for national scaling | System | High | `DEFERRED` |

---
