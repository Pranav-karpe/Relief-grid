# ReliefGrid — Transactional Email Provider Migration: Resend to Brevo SMTP

**Document Version:** 1.0.0  
**Date:** October 31, 2026  
**Status:** Completed & Verified  
**Provider:** Brevo SMTP Relay (`smtp-relay.brevo.com`) via `nodemailer`  
**Classification:** Strictly Transactional Email Infrastructure  

---

## 1. Executive Summary

ReliefGrid has successfully migrated its transactional email subsystem from the proprietary Resend Node.js SDK to **Brevo SMTP relay** powered by **Nodemailer**. 

### Key Highlights:
- **Zero Advertising or Marketing Policy:** ReliefGrid only transmits high-priority disaster relief notifications (distress calls, task deployments, aid allocation tracking, and emergency alerts). No promotional material or newsletters are permitted.
- **Provider Decoupling:** Migrated to standardized SMTP protocol (`smtp-relay.brevo.com` on port `587` with STARTTLS), preventing single-vendor lock-in.
- **Non-Crashing Resilient Design:** If Brevo SMTP credentials are not yet configured or if the application is running in automated test/offline environments, the email subsystem gracefully drops into safe simulation mode (`{ success: true, simulated: true }`) without throwing unhandled rejections or halting API processing.
- **Zero Secret Leakage:** All error handlers and diagnostic routines automatically scrub sensitive Brevo SMTP keys and login usernames before writing to log streams or returning API error messages.
- **Full Coverage of All 8 Core Transactional Notifications:** End-to-end support for Citizens, NGOs, Donors, Volunteers, and Emergency Command Admins.

---

## 2. Environment Variable Configuration Guide

To enable live email delivery through Brevo, configure the following variables in `backend/.env`.

> [!IMPORTANT]
> `backend/.env` is strictly ignored by Git and must never be committed or shared.

### Environment Specification

| Variable Name | Required | Default / Value | Description |
| :--- | :---: | :--- | :--- |
| `SMTP_HOST` | Yes | `smtp-relay.brevo.com` | Brevo SMTP server endpoint. |
| `SMTP_PORT` | Yes | `587` | Port 587 uses STARTTLS (recommended). Alternatively 465 for TLS. |
| `SMTP_SECURE` | Yes | `false` | Set to `false` when using port 587 (STARTTLS). Set to `true` if using port 465. |
| `SMTP_USER` | Yes | `<your-brevo-smtp-login>` | Your registered Brevo SMTP login email (found in Brevo SMTP dashboard). |
| `SMTP_PASS` | Yes | `<your-brevo-smtp-key>` | Brevo SMTP key generated in SMTP settings (starts with `xsmtpsib-...`). |
| `EMAIL_FROM` | Yes | `<your-verified-sender@domain.com>` | Sender address verified in your Brevo account. |
| `EMAIL_FROM_NAME`| No | `"ReliefGrid Team"` | Display name presented in email inboxes. |

### Example `.env` Snippet

```env
# Brevo SMTP Transactional Email Configuration
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-login@domain.com"
SMTP_PASS="xsmtpsib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
EMAIL_FROM="verified-sender@yourdomain.com"
EMAIL_FROM_NAME="ReliefGrid Team"
```

---

## 3. Step-by-Step Brevo Setup & Sender Verification Guide

Follow these steps to set up your Brevo account and obtain verified SMTP credentials:

### Step 1: Create a Brevo Account
1. Visit [https://www.brevo.com/](https://www.brevo.com/) and create a free transactional account.
2. Complete account profile setup.

### Step 2: Generate an SMTP Key
1. In the Brevo dashboard, navigate to the top-right profile dropdown and select **SMTP & API** (or go to [https://app.brevo.com/settings/keys/smtp](https://app.brevo.com/settings/keys/smtp)).
2. Click on the **SMTP** tab.
3. Note your **SMTP Server** (`smtp-relay.brevo.com`), **Port** (`587`), and **Login** email.
4. Click **Generate a new SMTP key**.
5. Give the key a descriptive name (e.g., `reliefgrid-production-smtp`).
6. Copy the generated master SMTP key immediately and paste it into `backend/.env` under `SMTP_PASS`.

> [!WARNING]
> Do NOT use an API key from the "API keys" tab. Brevo requires a dedicated **SMTP key** generated under the **SMTP** tab for SMTP relay authentication.

### Step 3: Verify Your Sender Email Address or Domain
Brevo strictly blocks emails sent from unverified addresses. You must verify your sender:

#### Option A: Verify a Single Sender Email (Fastest)
1. In Brevo, go to **Senders, Domains & Dedicated IPs** -> **Senders** ([https://app.brevo.com/senders](https://app.brevo.com/senders)).
2. Click **Add a sender**.
3. Enter the sender name (e.g., `ReliefGrid Team`) and your sender email address (e.g., `your-name@gmail.com` or custom address).
4. Brevo sends a 6-digit confirmation code or verification link to that address.
5. Click the link or enter the verification code.
6. Once verified, set `EMAIL_FROM` in `backend/.env` to this exact email address.

#### Option B: Authenticate Your Custom Domain (Recommended for Production)
1. Go to **Senders, Domains & Dedicated IPs** -> **Domains**.
2. Click **Add a domain**.
3. Add the Brevo DNS records (SPF, DKIM, DMARC TXT records) to your domain DNS provider.
4. Once verified, any address on that domain (e.g., `notifications@yourdomain.com`) can send transactional emails with 100% inbox deliverability.

> [!NOTE]
> Do NOT use unverified educational institution domains (such as `dietms.org`) unless you have authorized administrative access to that domain's DNS records. For development, use a verified personal email address in Brevo Senders.

---

## 4. Architecture of the Nodemailer Brevo Service

```
                      +---------------------------------------+
                      |       ReliefGrid Event Triggers       |
                      |  (Citizen, NGO, Donor, Volunteer,     |
                      |          Emergency Admin)             |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      sendRoleNotification() /         |
                      |    Dedicated Transactional Handlers   |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |   renderHtmlEmail() Responsive Dark   |
                      |       Template + Text Fallback        |
                      +-------------------+-------------------+
                                          |
                                          v
                          +---------------+---------------+
                          | Is SMTP Configured & Enabled? |
                          +---------------+---------------+
                                 /                 \
                           YES  /                   \  NO / TEST
                               v                     v
                +-------------------------+   +-------------------------+
                |    Nodemailer Brevo     |   | Safe Simulation Mode    |
                |   smtp-relay.brevo.com  |   | (Logs intent safely,    |
                |   Port 587 (STARTTLS)   |   | returns { simulated })  |
                +------------+------------+   +-------------------------+
                             |
                     +-------+-------+
                    /                 \
             SUCCESS                   FAILURE
                v                         v
     +--------------------+    +----------------------------+
     | Return { success } |    | Redact Sensitive Keys      |
     | Message ID logged  |    | Return { success: false }  |
     | No unhandled rejs  |    | Server never crashes       |
     +--------------------+    +----------------------------+
```

### Components Implemented:
1. **`backend/src/services/email.service.ts`:**
   - Transport creation via `nodemailer.createTransport()`.
   - Lazy singleton instantiation with `getTransporter()`.
   - Test injector `setTestTransporter()` for deterministic unit testing without live network calls.
   - Credential redactor `sanitizeErrorMessage()`.
   - Startup & on-demand health check `verifyEmailTransport()`.
2. **`backend/src/routes/health.ts`:**
   - Exposes `GET /api/email-status` returning live transport status.
3. **`backend/src/routes/webhooks.ts`:**
   - Exposes `POST /api/webhooks/brevo` for real-time delivery, bounce, and spam event ingestion.
   - Retains `POST /api/webhooks/resend` for legacy compatibility.
4. **`backend/src/server.ts`:**
   - Asynchronously performs transport check during startup and logs status.

---

## 5. List of All 8 Transactional Email Triggers & Templates

All 8 core emergency coordination flows are fully implemented with tailored subjects, metadata tables, and action links:

### 1. Citizen Distress Report Confirmation
- **Function:** `sendReportConfirmation(...)`
- **Target Role:** Citizen (`citizen`)
- **Trigger:** Citizen submits a new emergency distress report.
- **Subject:** `[ReliefGrid] Distress Report Received & Queued`
- **Body Content:** Acknowledges incident receipt, coordinates location, informs that nearby NGOs have been notified, and provides tracking link.

### 2. NGO New-Report Notification
- **Function:** `sendNgoNewReportAlert(...)`
- **Target Role:** NGO Operational Response Team (`ngo`)
- **Trigger:** Verified distress report matches NGO operational coverage zone.
- **Subject:** `[ReliefGrid] URGENT: New [URGENCY] Disaster Report in Your Operational Area`
- **Body Content:** Emergency details, location name, estimated affected persons count, direct link to open NGO Response Console.

### 3. Donor Resource Allocation Notification
- **Function:** `sendDonorAllocationNotification(...)`
- **Target Role:** Donor (`donor`)
- **Trigger:** An NGO allocates donated aid inventory to an active disaster incident.
- **Subject:** `[ReliefGrid] Your Donated Aid Has Been Allocated to Relief Operations`
- **Body Content:** Details specific donation item, quantity dispatched, target relief camp/zone, operational incident name.

### 4. Volunteer Task Assignment Notification
- **Function:** `sendVolunteerTaskAssignment(...)`
- **Target Role:** Volunteer Field Responder (`volunteer`)
- **Trigger:** Volunteer is assigned to a relief distribution, search & rescue, or medical mission.
- **Subject:** `[ReliefGrid] Field Mission Assignment: [Mission Name]`
- **Body Content:** Deployment site, priority level, reporting schedule, safety protocols, and direct task accept link.

### 5. Delivery Status Notification
- **Function:** `sendDeliveryStatusUpdate(...)`
- **Target Role:** Citizen / Shelter Coordinator (`citizen`)
- **Trigger:** Logistics consignment moves to `dispatched`, `in_transit`, or `delayed`.
- **Subject:** `[ReliefGrid] Relief Shipment Status: [STATUS]`
- **Body Content:** Consignment tracking ID, real-time status, destination camp, live transit notes.

### 6. NGO Delivery Confirmation Notification
- **Function:** `sendNgoDeliveryConfirmation(...)`
- **Target Role:** NGO Logistics Overseer (`ngo`)
- **Trigger:** Field volunteer or distribution point manager marks delivery completed and verified.
- **Subject:** `[ReliefGrid] Relief Delivery Verified and Confirmed at Destination`
- **Body Content:** Digital receipt confirmation, inspector name, timestamp, summarized inventory items.

### 7. Account Verification / Password Reset Email
- **Function:** `sendAuthVerificationEmail(...)`
- **Target Role:** Any Responder Role (`citizen`, `ngo`, `volunteer`, `donor`, `admin`)
- **Trigger:** User registration verification or password reset request.
- **Subject:** `[ReliefGrid] Verify Your ReliefGrid Responder Account` / `[ReliefGrid] ReliefGrid Password Reset Request`
- **Body Content:** One-time secure verification or reset link with explicit expiration countdown (e.g. 30 minutes).

### 8. Emergency Administrative Notification / Critical Broadcast
- **Function:** `sendEmergencyBroadcastEmail(...)`
- **Target Role:** All Responders / Regional Teams (`admin`)
- **Trigger:** Emergency Command Center issues high-severity disaster advisory, dam discharge warning, or red alert.
- **Subject:** `[ReliefGrid] [EMERGENCY BROADCAST - [LEVEL]] [Title]`
- **Body Content:** Issuing authority advisory, affected region boundary, life-safety evacuation instructions, link to live incident map.

---

## 6. Verification & Test Results

### 1. Dedicated Brevo SMTP Test Suite (`backend/tests/brevo_smtp.test.ts`)
| Test Case | Result | Duration |
| :--- | :---: | :---: |
| Brevo SMTP config loader loads host, port, and security defaults | **PASSED** | 1.5 ms |
| `sendEmail` gracefully simulates delivery when credentials unconfigured | **PASSED** | 0.6 ms |
| `verifyEmailTransport` reports unconfigured simulated mode when credentials missing | **PASSED** | 0.6 ms |
| Mocked Brevo SMTP transport captures recipient, subject, and dark HTML | **PASSED** | 0.5 ms |
| Brevo SMTP failure (535 Auth / 550 Unverified) sanitizes secrets in logs | **PASSED** | 1.1 ms |
| All 8 transactional notification types generate correct recipients, subjects, and payloads | **PASSED** | 2.9 ms |
| `GET /api/email-status` returns operational status | **PASSED** | 452.3 ms |
| `POST /api/webhooks/brevo` receives transactional delivery events | **PASSED** | 27.1 ms |

### 2. Full Regression Test Suite
- **TypeScript Typecheck (`npm --prefix backend run typecheck`):** **PASSED (0 errors)**
- **Backend Test Suite (51/51 tests passed):**
  - `auth.test.ts`: 22/22 passed
  - `brevo_smtp.test.ts`: 8/8 passed
  - `demo_verification.test.ts`: 8/8 passed
  - `notifications.test.ts`: 13/13 passed
- **Frontend Build (`npm --prefix frontend run build`):** **PASSED (0 errors)**
- **Frontend Test Suite (`npm --prefix frontend run test`):** **282/282 passed across 12 test files**

---

## 7. Troubleshooting Guide for Common Brevo Errors

### 1. Error: `535 5.7.8 Authentication credentials invalid`
- **Cause:** Incorrect `SMTP_USER` or `SMTP_PASS`.
- **Fix:**
  1. Ensure you copied your **SMTP Key** (from *SMTP & API* -> *SMTP*), not an API Key or account login password.
  2. Verify `SMTP_USER` matches your Brevo SMTP login email.
  3. Ensure no trailing whitespaces or quotation marks are included.

### 2. Error: `550 5.1.8 Sender address rejected` or `Sender not verified`
- **Cause:** The address in `EMAIL_FROM` has not been verified in the Brevo account.
- **Fix:**
  1. Open Brevo -> *Senders, Domains & Dedicated IPs* -> *Senders*.
  2. Confirm your sender email address status shows green (**Verified**).
  3. Update `EMAIL_FROM` in `backend/.env` to match that exact address.

### 3. Error: `ESOCKETTIMEDOUT` or `Connection timeout on port 587`
- **Cause:** Local ISP or cloud firewall blocks outbound port 587.
- **Fix:**
  1. Change `SMTP_PORT=465` and `SMTP_SECURE=true` in `backend/.env`.
  2. Test `GET http://localhost:5000/api/email-status` to verify connection.

### 4. Emails landing in Spam or Junk
- **Fix:**
  1. Authenticate your domain with Brevo using SPF, DKIM, and DMARC DNS records.
  2. Avoid using generic unauthenticated sender addresses.

---

## 8. Security Considerations

1. **Credential Isolation:** Neither `SMTP_PASS` nor `SMTP_USER` are hardcoded anywhere in the codebase.
2. **Git Exclusion:** `backend/.env` is strictly verified as ignored by Git (`git check-ignore -v backend/.env`).
3. **No Secret Bleed:** Even if Brevo throws an SMTP error during an API call, `sanitizeErrorMessage()` redacts both the SMTP login and SMTP key before any log is written or returned.
4. **Non-Blocking Execution:** Notification dispatches never block critical transactional DB operations; any delivery failure is logged and isolated.
5. **No Commercial Use:** The application is strictly locked to transactional disaster-relief notifications.

