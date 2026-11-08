import app from './app.js'
import { config } from './config/env.js'
import { connectMongoDB, disconnectMongoDB, getMongoDBErrorCategory, isMongoDBConnected } from './config/mongodb.js'
import { recoverStalePendingAllocations } from './services/allocation.service.js'
import { startSafetyMonitoring, stopSafetyMonitoring } from './services/volunteer-safety.service.js'
import { verifyEmailTransport } from './services/email.service.js'

let server: ReturnType<typeof app.listen> | undefined
let recoveryInterval: NodeJS.Timeout | undefined
let reconnectTimeout: NodeJS.Timeout | undefined

async function shutDown(signal: string) {
  console.log(`${signal} received. Shutting down server.`)

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
  if (recoveryInterval) {
    clearInterval(recoveryInterval)
  }
  stopSafetyMonitoring()

  await new Promise<void>((resolve) => {
    if (server === undefined) {
      resolve()
      return
    }

    server.close(() => resolve())
  })

  await disconnectMongoDB()
  process.exit(0)
}

const categoryAdvice: Record<string, string> = {
  authentication_failed:
    'Check that the username and password in MONGODB_URI are correct in backend/.env.',
  ip_not_whitelisted:
    'Your current IP address is not in the Atlas Network Access allowlist. Add it at cloud.mongodb.com → Network Access.',
  connection_timeout_or_server_selection_failed:
    'Atlas could not be reached within 10 s. Check your internet connection and Atlas Network Access allowlist.',
  dns_lookup_failed:
    'The Atlas hostname could not be resolved. Check your internet connection and that MONGODB_URI is correct.',
  connection_refused:
    'Connection was refused. Verify the cluster is running and the URI is correct.',
  invalid_connection_string:
    'MONGODB_URI could not be parsed. Check the format in backend/.env.',
  mongodb_connection_error:
    'An unexpected MongoDB error occurred. See the diagnostic line above for details.',
}

function initializePostConnectionTasks() {
  // Recover stale pending allocations on startup
  recoverStalePendingAllocations()
    .then((count) => {
      if (count > 0) console.log(`[Startup] Recovered ${count} stale pending allocation(s).`)
    })
    .catch((err) => {
      console.error('[Startup] Failed to recover stale allocations:', err)
    })

  // Periodic recovery every 5 minutes
  if (!recoveryInterval) {
    recoveryInterval = setInterval(() => {
      recoverStalePendingAllocations().catch((err) => {
        console.error('[Periodic] Stale allocation recovery error:', err)
      })
    }, 5 * 60 * 1000)
  }

  // Start volunteer safety monitoring (scans every 60 seconds)
  startSafetyMonitoring(60 * 1000)

  // Verify Brevo SMTP transactional email transport
  verifyEmailTransport()
    .then((status) => {
      console.log(`[Startup] ${status.message}`)
    })
    .catch((err) => {
      console.error('[Startup] Email transport diagnostic error:', err)
    })
}

async function attemptConnectWithRetry(retryDelayMs = 4000) {
  if (isMongoDBConnected()) return

  try {
    await connectMongoDB(config.mongodbUri)
    console.log('MongoDB connection established. Backend is ready.')
    initializePostConnectionTasks()
  } catch (error) {
    const category = getMongoDBErrorCategory(error)
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`MongoDB connection failed (${category}).`)
    console.error(`Diagnostic: ${errorName}: ${errorMessage}`)
    console.error(`Action: ${categoryAdvice[category] ?? categoryAdvice.mongodb_connection_error}`)
    console.error(`Will retry connection in ${Math.round(retryDelayMs / 1000)}s...`)

    reconnectTimeout = setTimeout(() => {
      void attemptConnectWithRetry(retryDelayMs)
    }, retryDelayMs)
  }
}

async function startServer() {
  server = app.listen(config.port, () => {
    console.log(`ReliefGrid API listening on http://localhost:${config.port}`)
  })

  await attemptConnectWithRetry()
}

process.on('SIGINT', () => void shutDown('SIGINT'))
process.on('SIGTERM', () => void shutDown('SIGTERM'))

void startServer()
