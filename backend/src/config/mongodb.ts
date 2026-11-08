import mongoose from 'mongoose'

let connectionPromise: Promise<void> | null = null

export async function connectMongoDB(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return
  }

  if (connectionPromise) {
    return connectionPromise
  }

  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      })
    } finally {
      connectionPromise = null
    }
  })()

  return connectionPromise
}

export async function ensureMongoDBConnected(uri?: string): Promise<boolean> {
  if (isMongoDBConnected()) {
    return true
  }

  const targetUri = uri || process.env.MONGODB_URI
  if (!targetUri) {
    return false
  }

  try {
    await connectMongoDB(targetUri)
    return isMongoDBConnected()
  } catch {
    return false
  }
}

export function getMongoDBErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const name = error instanceof Error ? error.name.toLowerCase() : ''

  if (message.includes('querysrv') || message.includes('enotfound')) {
    return 'dns_lookup_failed'
  }

  if (message.includes('bad auth') || message.includes('authentication failed') || message.includes('authentication')) {
    return 'authentication_failed'
  }

  if (message.includes('ip') || message.includes('whitelist') || message.includes('not allowed')) {
    return 'ip_not_whitelisted'
  }

  if (message.includes('timeout') || message.includes('timed out') || name.includes('serverselection')) {
    return 'connection_timeout_or_server_selection_failed'
  }

  if (message.includes('econnrefused')) {
    return 'connection_refused'
  }

  if (name.includes('parse')) {
    return 'invalid_connection_string'
  }

  return 'mongodb_connection_error'
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}

export async function disconnectMongoDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
