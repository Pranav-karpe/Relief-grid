import type { Request, Response, NextFunction } from 'express'
import { ApiError } from './api-error.js'

export interface RateLimiterOptions {
  windowMs: number
  max: number
  message?: string
  keyGenerator?: (req: Request) => string
  skip?: (req: Request) => boolean
}

export interface ClientRecord {
  count: number
  resetTime: number
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
    skip,
  } = options

  const hits = new Map<string, ClientRecord>()

  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key)
      }
    }
  }, Math.max(windowMs, 60000))

  if (cleanupTimer.unref) {
    cleanupTimer.unref()
  }

  const limiter = (req: Request, res: Response, next: NextFunction) => {
    if (skip && skip(req)) {
      return next()
    }

    const key = keyGenerator(req)
    const now = Date.now()
    const record = hits.get(key)

    if (!record || now > record.resetTime) {
      hits.set(key, { count: 1, resetTime: now + windowMs })
      res.setHeader('X-RateLimit-Limit', max)
      res.setHeader('X-RateLimit-Remaining', max - 1)
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000))
      return next()
    }

    if (record.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000))
      res.setHeader('Retry-After', retryAfterSec)
      res.setHeader('X-RateLimit-Limit', max)
      res.setHeader('X-RateLimit-Remaining', 0)
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000))
      throw new ApiError(429, 'too_many_requests', message)
    }

    record.count += 1
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', max - record.count)
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000))
    next()
  }

  limiter.reset = () => {
    hits.clear()
  }

  return limiter
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 300,
  message: 'Too many authentication attempts. Please try again later.',
})
