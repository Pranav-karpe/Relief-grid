import path from 'node:path'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import errorHandler from './middleware/error-handler.js'
import notFound from './middleware/not-found.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import protectedRouter from './routes/protected.js'
import reportsRouter from './routes/reports.js'
import donationsRouter from './routes/donations.js'
import ngoRouter from './routes/ngo.js'
import volunteerRouter from './routes/volunteer.js'
import adminRouter from './routes/admin.js'
import notificationsRouter from './routes/notifications.js'
import matchingRouter from './routes/matching.js'
import allocationsRouter from './routes/allocations.js'
import coordinationRouter from './routes/coordination.js'
import incidentsRouter from './routes/incidents.js'
import alertsRouter from './routes/alerts.js'
import webhooksRouter from './routes/webhooks.js'
import distributionsRouter from './routes/distributions.js'
import hazardsRouter from './routes/hazards.js'
import eventsRouter from './routes/events.js'
import { createRateLimiter } from './middleware/rate-limiter.js'

const app = express()

// ---------------------------------------------------------------------------
// Security headers — applied to every response
// ---------------------------------------------------------------------------
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-XSS-Protection', '0') // modern browsers ignore it; CSP is the right control
  next()
})

// ---------------------------------------------------------------------------
// CORS — allow the Vite dev origin; tighten in production via ALLOWED_ORIGIN env
// ---------------------------------------------------------------------------
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// ---------------------------------------------------------------------------
// Static file serving for uploads (evidence photos, receipts, delivery proofs)
// ---------------------------------------------------------------------------
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'uploads'), {
    dotfiles: 'ignore',
    index: false,
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
    },
  }),
)

// ---------------------------------------------------------------------------
// Body parsing (10mb to accommodate base64 evidence uploads & signatures)
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }))

// ---------------------------------------------------------------------------
// General API rate limiter — protects all /api routes from bulk scraping
// ---------------------------------------------------------------------------
const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,   // 1 minute
  max: 120,              // 120 req/min per IP across all API routes
})

app.use('/api', apiRateLimiter)

app.use('/api', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api', protectedRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/donations', donationsRouter)
app.use('/api/ngo', ngoRouter)
app.use('/api/volunteer', volunteerRouter)
app.use('/api/admin', adminRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/matching', matchingRouter)
app.use('/api/allocations', allocationsRouter)
app.use('/api/coordination', coordinationRouter)
app.use('/api/incidents', incidentsRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api', eventsRouter)
app.use('/api/distributions', distributionsRouter)
app.use('/api/hazards', hazardsRouter)
app.use(notFound)
app.use(errorHandler)

export default app
