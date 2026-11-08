/**
 * Brevo SMTP Transactional Email Notification Service — ReliefGrid Disaster Platform
 *
 * Migration:
 * Replaces Resend with official Nodemailer Brevo (formerly Sendinblue) SMTP relay.
 *
 * Brevo SMTP Specifications:
 * - Host: smtp-relay.brevo.com
 * - Port: 587 (STARTTLS, secure: false) or 465 (TLS, secure: true)
 * - User: Brevo SMTP login (configured in Brevo -> SMTP & API -> SMTP)
 * - Pass: Brevo generated SMTP key (NOT general API key)
 * - From: Verified sender email address configured in Brevo account
 *
 * Operational Rules:
 * - Transactional emails ONLY (disaster alerts, confirmations, allocations, task assignments).
 * - Safe fallback: if Brevo credentials are not configured or in test environments,
 *   simulates delivery safely without crashing or throwing unhandled rejections.
 * - Credential protection: never logs or leaks SMTP passwords in error messages or diagnostics.
 * - Responsive dark aesthetic matching ReliefGrid core UI.
 */

import nodemailer from 'nodemailer'
import type { Transporter, SentMessageInfo } from 'nodemailer'
import { config } from '../config/env.js'

export type EmailPayload = {
  to: string
  subject: string
  html?: string
  text?: string
  bodyText?: string
}

export type RoleEmailContext = {
  role: 'citizen' | 'ngo' | 'donor' | 'volunteer' | 'admin'
  recipientName: string
  recipientEmail: string
  title: string
  message: string
  actionUrl?: string
  actionText?: string
  metadata?: Record<string, string | number>
}

export type EmailSendResult = {
  success: boolean
  messageId?: string
  simulated?: boolean
  error?: string
}

export type BrevoSmtpConfig = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  fromAddress: string
  fromName: string
  from: string
  isConfigured: boolean
}

let activeTransporter: Transporter | null = null

/**
 * Returns active Brevo SMTP configuration
 */
export function getBrevoSmtpConfig(): BrevoSmtpConfig {
  const host = config.smtpHost || process.env.SMTP_HOST || 'smtp-relay.brevo.com'
  const port = Number(config.smtpPort || process.env.SMTP_PORT) || 587
  const secure = config.smtpSecure ?? (process.env.SMTP_SECURE === 'true')
  const user = config.smtpUser || process.env.SMTP_USER || undefined
  const pass = config.smtpPass || process.env.SMTP_PASS || undefined
  const fromAddress = config.emailFrom || process.env.EMAIL_FROM || process.env.EMAIL_FROM_ADDRESS || 'notifications@reliefgrid.org'
  const fromName = config.emailFromName || process.env.EMAIL_FROM_NAME || 'ReliefGrid Team'

  const isConfigured = Boolean(
    user &&
    user.trim().length > 0 &&
    pass &&
    pass.trim().length > 0 &&
    !user.includes('<') &&
    !pass.includes('<'),
  )

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromAddress,
    fromName,
    from: `"${fromName}" <${fromAddress}>`,
    isConfigured,
  }
}

/**
 * Allow test suites or custom callers to inject mock transporter
 */
export function setTestTransporter(transporter: Transporter | null): void {
  activeTransporter = transporter
}

/**
 * Retrieves or lazily initializes the Nodemailer SMTP transporter
 */
export function getTransporter(): Transporter | null {
  if (activeTransporter) {
    return activeTransporter
  }

  const cfg = getBrevoSmtpConfig()
  if (!cfg.isConfigured || !cfg.user || !cfg.pass) {
    return null
  }

  activeTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
  })

  return activeTransporter
}

/**
 * Strips sensitive credentials from error strings before logging
 */
function sanitizeErrorMessage(rawMessage: string): string {
  const cfg = getBrevoSmtpConfig()
  let sanitized = rawMessage
  if (cfg.pass && cfg.pass.length > 3) {
    sanitized = sanitized.split(cfg.pass).join('[REDACTED_SMTP_KEY]')
  }
  if (cfg.user && cfg.user.length > 3) {
    sanitized = sanitized.split(cfg.user).join('[REDACTED_SMTP_LOGIN]')
  }
  return sanitized
}

/**
 * Startup or on-demand connection verification
 */
export async function verifyEmailTransport(): Promise<{
  connected: boolean
  message: string
  details?: Record<string, unknown>
}> {
  const cfg = getBrevoSmtpConfig()
  const transporter = getTransporter()

  if (!transporter && !cfg.isConfigured) {
    return {
      connected: false,
      message: 'Brevo SMTP credentials are not configured. ReliefGrid email service is operating in simulated mode.',
      details: {
        host: cfg.host,
        port: cfg.port,
        configured: false,
        simulated: true,
      },
    }
  }

  if (!transporter) {
    return {
      connected: false,
      message: 'Unable to initialize Brevo SMTP transporter.',
      details: { configured: false },
    }
  }

  try {
    await transporter.verify()
    return {
      connected: true,
      message: `Brevo SMTP connection verified successfully (${cfg.host}:${cfg.port}). Ready for transactional notifications.`,
      details: {
        host: cfg.host,
        port: cfg.port,
        sender: cfg.from,
        secure: cfg.secure,
      },
    }
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>
    const rawMsg = (errorObj?.message as string) || 'SMTP verification error'
    const sanitizedMsg = sanitizeErrorMessage(rawMsg)
    console.error(`[email.service] Brevo SMTP verification failed: ${sanitizedMsg}`)
    return {
      connected: false,
      message: sanitizedMsg,
      details: {
        host: cfg.host,
        port: cfg.port,
        code: errorObj?.code,
        responseCode: errorObj?.responseCode,
      },
    }
  }
}

/**
 * Renders dark-mode disaster relief HTML email
 */
export function renderHtmlEmail(ctx: RoleEmailContext): string {
  const metaRows = ctx.metadata
    ? Object.entries(ctx.metadata)
        .map(
          ([k, v]) => `<tr>
            <td style="padding: 6px 12px; color: #94a3b8; font-size: 13px; font-weight: 500;">${k}</td>
            <td style="padding: 6px 12px; color: #f8fafc; font-size: 13px; font-weight: 600;">${v}</td>
          </tr>`,
        )
        .join('')
    : ''

  const actionButton = ctx.actionUrl
    ? `<div style="margin-top: 28px; text-align: center;">
        <a href="${ctx.actionUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
          ${ctx.actionText || 'View in ReliefGrid'}
        </a>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ctx.title}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="padding: 24px 32px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom: 1px solid #334155;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td>
              <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #60a5fa;">ReliefGrid</span>
              <span style="font-size: 11px; margin-left: 8px; background-color: #1e3a8a; color: #93c5fd; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${ctx.role.toUpperCase()}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Content -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #f8fafc;">${ctx.title}</h2>
        <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">Dear ${ctx.recipientName},</p>
        <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">${ctx.message}</p>

        ${
          metaRows
            ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 20px 0; background-color: #1e293b; border-radius: 8px; overflow: hidden;">
                ${metaRows}
              </table>`
            : ''
        }

        ${actionButton}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748b;">
          This is an automated transactional notification from ReliefGrid Disaster Relief Coordination Platform.
        </p>
        <p style="margin: 6px 0 0 0; font-size: 11px; color: #475569;">
          Secure coordination protocol. Never share authentication credentials.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Dispatch a transactional email notification via Brevo SMTP or safe fallback.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const cfg = getBrevoSmtpConfig()
  const html = payload.html || `<p>${payload.text || payload.bodyText || ''}</p>`
  const text = payload.text || payload.bodyText || ''

  const isTestMode =
    process.env.NODE_ENV === 'test' ||
    process.execArgv.includes('--test') ||
    Boolean(process.env.VITEST) ||
    Boolean((process as unknown as { env: Record<string, unknown> }).env.NODE_TEST_CONTEXT)

  const shouldSendRealSmtp = cfg.isConfigured && (!isTestMode || process.env.ENABLE_LIVE_BREVO_SMTP === 'true')

  // 1. Live Brevo SMTP Dispatch
  if (shouldSendRealSmtp || activeTransporter) {
    try {
      const transporter = getTransporter()
      if (!transporter) {
        throw new Error('Transporter unavailable')
      }

      const info: SentMessageInfo = await transporter.sendMail({
        from: cfg.from,
        to: payload.to,
        subject: payload.subject,
        text,
        html,
      })

      const messageId = (info?.messageId as string) || undefined
      console.log(`[email.service] Brevo SMTP dispatched email to "${payload.to}". Message ID: ${messageId || 'unknown'}`)
      return {
        success: true,
        messageId,
      }
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>
      const rawMsg = (errorObj?.message as string) || String(err)
      const sanitizedMsg = sanitizeErrorMessage(rawMsg)
      console.error(`[email.service] Brevo SMTP dispatch failure for "${payload.to}": ${sanitizedMsg}`)
      return {
        success: false,
        error: sanitizedMsg,
      }
    }
  }

  // 2. Resilient Simulation Fallback (Credentials unconfigured or test execution)
  console.log(
    `[email.service] [Simulation] Brevo SMTP unconfigured or test execution active. Simulated delivery to "${payload.to}" with subject: "${payload.subject}".`,
  )
  return {
    success: true,
    simulated: true,
  }
}

/**
 * Dispatch a role-tailored notification email
 */
export async function sendRoleNotification(ctx: RoleEmailContext): Promise<EmailSendResult> {
  const html = renderHtmlEmail(ctx)
  const text = `${ctx.title}\n\nDear ${ctx.recipientName},\n\n${ctx.message}\n\n${
    ctx.metadata
      ? Object.entries(ctx.metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : ''
  }\n\nReliefGrid Coordination Platform`

  return sendEmail({
    to: ctx.recipientEmail,
    subject: `[ReliefGrid] ${ctx.title}`,
    html,
    text,
  })
}

// ---------------------------------------------------------------------------
// 8 Dedicated Transactional Email Notification Handlers
// ---------------------------------------------------------------------------

/**
 * 1. Citizen Report Confirmation
 */
export async function sendReportConfirmation(params: {
  citizenEmail: string
  citizenName: string
  reportId: string
  disasterType: string
  locationName: string
  urgency?: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'citizen',
    recipientEmail: params.citizenEmail,
    recipientName: params.citizenName,
    title: 'Disress Report Received & Queued',
    message: `Your report regarding the ${params.disasterType} event at ${params.locationName} has been received and verified by the coordination engine. Responding NGOs and relief teams in your area have been notified.`,
    metadata: {
      'Report Reference': params.reportId,
      'Disaster Type': params.disasterType,
      'Location': params.locationName,
      'Priority': params.urgency || 'High',
    },
    actionText: 'Track Report Status',
    actionUrl: `/reports/${params.reportId}`,
  })
}

/**
 * 2. NGO New-Report Notification
 */
export async function sendNgoNewReportAlert(params: {
  ngoEmail: string
  ngoName: string
  reportId: string
  disasterType: string
  urgency: string
  locationName: string
  affectedPersons?: number
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'ngo',
    recipientEmail: params.ngoEmail,
    recipientName: params.ngoName,
    title: `URGENT: New ${params.urgency.toUpperCase()} Disaster Report in Your Operational Area`,
    message: `A new verified distress report requiring response attention has been submitted in your coverage area (${params.locationName}). Review the requirements and deploy resources accordingly.`,
    metadata: {
      'Report Reference': params.reportId,
      'Incident Type': params.disasterType,
      'Urgency Level': params.urgency,
      'Location': params.locationName,
      'Estimated Affected': params.affectedPersons ?? 'Under Assessment',
    },
    actionText: 'Open NGO Response Console',
    actionUrl: `/ngo/reports/${params.reportId}`,
  })
}

/**
 * 3. Donor Resource Allocation Notification
 */
export async function sendDonorAllocationNotification(params: {
  donorEmail: string
  donorName: string
  donationTitle: string
  quantityAllocated: number | string
  targetIncident: string
  locationName: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'donor',
    recipientEmail: params.donorEmail,
    recipientName: params.donorName,
    title: 'Your Donated Aid Has Been Allocated to Relief Operations',
    message: `Great news! Your contribution of "${params.donationTitle}" has been allocated to active relief operations addressing ${params.targetIncident} at ${params.locationName}.`,
    metadata: {
      'Donation Item': params.donationTitle,
      'Quantity Dispatched': String(params.quantityAllocated),
      'Target Zone': params.locationName,
      'Operational Target': params.targetIncident,
    },
    actionText: 'View Aid Tracking',
    actionUrl: `/donor/dashboard`,
  })
}

/**
 * 4. Volunteer Task Assignment Notification
 */
export async function sendVolunteerTaskAssignment(params: {
  volunteerEmail: string
  volunteerName: string
  taskId: string
  taskTitle: string
  location: string
  urgency: string
  scheduledAt?: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'volunteer',
    recipientEmail: params.volunteerEmail,
    recipientName: params.volunteerName,
    title: `Field Mission Assignment: ${params.taskTitle}`,
    message: `You have been deployed to a relief task at ${params.location}. Please review the safety guidelines and confirm deployment through your field console.`,
    metadata: {
      'Task Reference': params.taskId,
      'Mission': params.taskTitle,
      'Deployment Site': params.location,
      'Priority': params.urgency,
      'Schedule': params.scheduledAt || 'Immediate Deployment',
    },
    actionText: 'Accept and View Task Details',
    actionUrl: `/volunteer/tasks/${params.taskId}`,
  })
}

/**
 * 5. Delivery Status Notification
 */
export async function sendDeliveryStatusUpdate(params: {
  recipientEmail: string
  recipientName: string
  deliveryId: string
  status: 'dispatched' | 'in_transit' | 'delivered' | 'delayed'
  destination: string
  trackingNotes?: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'citizen',
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    title: `Relief Shipment Status: ${params.status.replace('_', ' ').toUpperCase()}`,
    message: `The delivery of emergency relief supplies destined for ${params.destination} has been updated to status: "${params.status.replace('_', ' ')}".`,
    metadata: {
      'Consignment ID': params.deliveryId,
      'Current Status': params.status,
      'Destination': params.destination,
      'Notes': params.trackingNotes || 'Operating within scheduled relief logistics corridor.',
    },
    actionText: 'Track Delivery Live',
    actionUrl: `/deliveries/${params.deliveryId}`,
  })
}

/**
 * 6. NGO Delivery Confirmation Notification
 */
export async function sendNgoDeliveryConfirmation(params: {
  ngoEmail: string
  ngoName: string
  deliveryId: string
  confirmedBy: string
  verifiedAt: string
  itemsDeliveredSummary: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'ngo',
    recipientEmail: params.ngoEmail,
    recipientName: params.ngoName,
    title: 'Relief Delivery Verified and Confirmed at Destination',
    message: `Consignment ${params.deliveryId} has been successfully verified upon arrival at the distribution site. Digital receipt and chain-of-custody reconciliation have been finalized.`,
    metadata: {
      'Delivery Ref': params.deliveryId,
      'Verified By': params.confirmedBy,
      'Delivered At': params.verifiedAt,
      'Consignment Summary': params.itemsDeliveredSummary,
    },
    actionText: 'View Verification Audit Record',
    actionUrl: `/ngo/deliveries/${params.deliveryId}`,
  })
}

/**
 * 7. Account Verification / Password Reset Email
 */
export async function sendAuthVerificationEmail(params: {
  userEmail: string
  userName: string
  actionType: 'account_verification' | 'password_reset'
  actionUrl: string
  expiresInMinutes: number
}): Promise<EmailSendResult> {
  const isReset = params.actionType === 'password_reset'
  const title = isReset ? 'ReliefGrid Password Reset Request' : 'Verify Your ReliefGrid Responder Account'
  const message = isReset
    ? `We received a request to reset the password for your ReliefGrid account. If you made this request, please click the secure link below within ${params.expiresInMinutes} minutes.`
    : `Welcome to ReliefGrid. Please verify your email address to complete your responder profile activation. This link is valid for ${params.expiresInMinutes} minutes.`

  return sendRoleNotification({
    role: 'citizen',
    recipientEmail: params.userEmail,
    recipientName: params.userName,
    title,
    message,
    metadata: {
      'Security Action': isReset ? 'Password Reset' : 'Email Verification',
      'Valid For': `${params.expiresInMinutes} minutes`,
    },
    actionText: isReset ? 'Reset My Password' : 'Confirm Email Address',
    actionUrl: params.actionUrl,
  })
}

/**
 * 8. Emergency Administrative Notification / Critical Broadcast
 */
export async function sendEmergencyBroadcastEmail(params: {
  recipientEmail: string
  recipientName: string
  alertLevel: 'advisory' | 'warning' | 'severe' | 'extreme'
  title: string
  instructions: string
  affectedRegion: string
}): Promise<EmailSendResult> {
  return sendRoleNotification({
    role: 'admin',
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    title: `[EMERGENCY BROADCAST - ${params.alertLevel.toUpperCase()}] ${params.title}`,
    message: `ATTENTION: An emergency disaster alert has been issued for the ${params.affectedRegion} operational zone. Please follow safety instructions immediately:\n\n${params.instructions}`,
    metadata: {
      'Alert Severity': params.alertLevel.toUpperCase(),
      'Affected Zone': params.affectedRegion,
      'Issuing Authority': 'ReliefGrid Emergency Command Center',
    },
    actionText: 'View Live Incident Map',
    actionUrl: `/map`,
  })
}
