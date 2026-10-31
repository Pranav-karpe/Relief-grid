/**
 * Admin provisioning script — run once to create the initial administrator.
 *
 * Usage (from backend/ directory):
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<strong-password> \
 *     npx tsx scripts/seed-admin.ts
 *
 * Requirements:
 *   - MONGODB_URI and JWT_SECRET must be set in backend/.env (or environment).
 *   - ADMIN_EMAIL must be a valid email address.
 *   - ADMIN_PASSWORD must be at least 12 characters.
 *
 * Safety guarantees:
 *   - Never overwrites an existing account.
 *   - Never elevates an existing non-admin user.
 *   - Idempotent: safe to run again if an admin already exists.
 *   - Never prints the password, hash, or JWT secret.
 *   - Not exposed through any HTTP route.
 */

import '../src/config/env.js' // loads .env
import mongoose from 'mongoose'
import { UserModel } from '../src/models/user.js'
import { hashPassword } from '../src/auth/password.js'
import { normalizeEmail } from '../src/auth/service.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function main(): Promise<void> {
  const rawEmail = process.env.ADMIN_EMAIL ?? ''
  const password = process.env.ADMIN_PASSWORD ?? ''
  const email = normalizeEmail(rawEmail)

  if (!emailPattern.test(email)) {
    console.error('ERROR: ADMIN_EMAIL must be a valid email address.')
    process.exit(1)
  }
  if (password.length < 12) {
    console.error('ERROR: ADMIN_PASSWORD must be at least 12 characters.')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('ERROR: MONGODB_URI is not set.')
    process.exit(1)
  }

  await mongoose.connect(uri)

  try {
    const existing = await UserModel.findOne({ email }).select('role').lean()

    if (existing) {
      if (existing.role === 'admin') {
        console.log('INFO: An administrator account with this email already exists. No changes made.')
      } else {
        console.error(`ERROR: An account with this email already exists with role "${existing.role}". Refusing to elevate.`)
        process.exit(1)
      }
      return
    }

    const passwordHash = await hashPassword(password)
    await UserModel.create({
      displayName: 'Administrator',
      email,
      role: 'admin',
      accountStatus: 'active',
      emailVerified: true,
      auth: { passwordHash },
    })

    console.log(`INFO: Administrator account created for ${email}.`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('ERROR: Unexpected failure during admin provisioning.')
  if (err instanceof Error) console.error(err.message)
  process.exit(1)
})
