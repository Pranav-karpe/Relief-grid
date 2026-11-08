import crypto from 'node:crypto'
import { Router } from 'express'
import { ApiError } from '../middleware/api-error.js'

const webhooksRouter = Router()

/**
 * Validates Brevo webhook key/token if configured
 */
function verifyBrevoWebhook(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown>,
): boolean {
  const configuredSecret = process.env.BREVO_WEBHOOK_SECRET
  if (!configuredSecret) {
    return true // If no webhook secret configured, accept
  }

  const tokenHeader = (headers['x-sib-webhook-token'] || headers['x-brevo-webhook-token']) as string
  const tokenQuery = query.token as string

  return tokenHeader === configuredSecret || tokenQuery === configuredSecret
}

/**
 * Validates legacy Svix webhook signature using HMAC SHA-256
 */
function verifySvixSignature(
  payload: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): boolean {
  const svixId = headers['svix-id'] as string
  const svixTimestamp = headers['svix-timestamp'] as string
  const svixSignature = headers['svix-signature'] as string

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false
  }

  const timestampSec = parseInt(svixTimestamp, 10)
  const nowSec = Math.floor(Date.now() / 1000)
  if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
    return false
  }

  const toSign = `${svixId}.${svixTimestamp}.${payload}`
  const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const secretBytes = Buffer.from(cleanSecret, 'base64')

  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(toSign)
    .digest('base64')

  const passedSignatures = svixSignature.split(' ')
  return passedSignatures.some((sig) => {
    const versioned = sig.startsWith('v1,') ? sig.slice(3) : sig
    return crypto.timingSafeEqual(Buffer.from(versioned), Buffer.from(expectedSignature))
  })
}

/**
 * POST /api/webhooks/brevo — Brevo Transactional Email Event Webhook Listener
 * Handled events: delivered, soft_bounce, hard_bounce, spam, invalid_email, blocked, opened, click
 */
webhooksRouter.post(['/brevo', '/email'], async (req, res) => {
  if (!verifyBrevoWebhook(req.headers, req.query)) {
    throw new ApiError(401, 'invalid_signature', 'Invalid Brevo webhook authentication token.')
  }

  const payload = req.body as {
    event?: string
    email?: string
    id?: number
    date?: string
    'message-id'?: string
    tag?: string
  }

  const eventType = payload?.event || 'unknown'
  const targetEmail = payload?.email || 'unspecified'

  console.log(`[webhooks] Brevo transactional email event received: ${eventType} for ${targetEmail}`)

  switch (eventType) {
    case 'delivered':
      // Delivery confirmation from SMTP
      break
    case 'hard_bounce':
    case 'soft_bounce':
      console.warn(`[webhooks] Email bounce reported for ${targetEmail} (${eventType})`)
      break
    case 'spam':
      console.warn(`[webhooks] Spam complaint received for ${targetEmail}`)
      break
    default:
      break
  }

  res.status(200).json({ received: true, provider: 'brevo', eventType, email: targetEmail })
})

/**
 * POST /api/webhooks/resend — Backward compatible endpoint
 */
webhooksRouter.post('/resend', async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const rawBody = JSON.stringify(req.body)

  if (secret) {
    const isValid = verifySvixSignature(rawBody, req.headers, secret)
    if (!isValid) {
      throw new ApiError(401, 'invalid_signature', 'Invalid webhook signature.')
    }
  }

  const event = req.body as { type?: string; data?: Record<string, unknown> }
  const eventType = event.type || 'unknown'

  res.status(200).json({ received: true, eventType })
})

export default webhooksRouter
