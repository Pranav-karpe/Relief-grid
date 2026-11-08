/**
 * Client-Side Offline Storage & Synchronization Engine
 * Uses IndexedDB to store draft distress reports, cached delivery proofs,
 * and a persistent queue that automatically synchronizes when connectivity resumes.
 */

export interface SyncQueueItem {
  id: string
  action: 'create_report' | 'update_task_progress' | 'safety_checkin'
  endpoint: string
  method: 'POST' | 'PATCH'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

class OfflineStorageEngine {
  private dbName = 'reliefgrid_offline_v1'
  private db: IDBDatabase | null = null
  private memoryQueue: Map<string, SyncQueueItem> = new Map()
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  private listeners: Array<(online: boolean, pendingCount: number) => void> = []

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true
        this.notify()
        this.flushQueue()
      })
      window.addEventListener('offline', () => {
        this.isOnline = false
        this.notify()
      })
    }
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('reportDrafts')) {
          db.createObjectStore('reportDrafts', { keyPath: 'id' })
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onerror = () => reject(request.error)
    })
  }

  public subscribe(cb: (online: boolean, pendingCount: number) => void): () => void {
    this.listeners.push(cb)
    this.getPendingCount().then((count) => cb(this.isOnline, count))
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb)
    }
  }

  private async notify() {
    const count = await this.getPendingCount()
    for (const listener of this.listeners) {
      listener(this.isOnline, count)
    }
  }

  public async enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts' | 'status'>): Promise<string> {
    const id = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const queueItem: SyncQueueItem = {
      ...item,
      id,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    }

    if (typeof indexedDB === 'undefined') {
      this.memoryQueue.set(id, queueItem)
      this.notify()
      return id
    }

    const db = await this.getDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('syncQueue', 'readwrite')
      const store = tx.objectStore('syncQueue')
      const req = store.add(queueItem)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })

    this.notify()

    // If online, try to flush immediately
    if (this.isOnline) {
      setTimeout(() => this.flushQueue(), 100)
    }

    return id
  }

  public async getPendingCount(): Promise<number> {
    if (typeof indexedDB === 'undefined') {
      return this.memoryQueue.size
    }
    try {
      const db = await this.getDB()
      return new Promise<number>((resolve) => {
        const tx = db.transaction('syncQueue', 'readonly')
        const store = tx.objectStore('syncQueue')
        const req = store.count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(0)
      })
    } catch {
      return 0
    }
  }

  public async getPendingItems(): Promise<SyncQueueItem[]> {
    if (typeof indexedDB === 'undefined') {
      return Array.from(this.memoryQueue.values())
    }
    try {
      const db = await this.getDB()
      return new Promise<SyncQueueItem[]>((resolve) => {
        const tx = db.transaction('syncQueue', 'readonly')
        const store = tx.objectStore('syncQueue')
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result as SyncQueueItem[])
        req.onerror = () => resolve([])
      })
    } catch {
      return []
    }
  }

  public async flushQueue(): Promise<void> {
    if (!this.isOnline) return

    const items = await this.getPendingItems()
    if (items.length === 0) return

    const token = sessionStorage.getItem('rg_token') || localStorage.getItem('reliefgrid_token') || ''
    const db = await this.getDB()

    for (const item of items) {
      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Idempotency-Key': item.id,
          },
          body: JSON.stringify(item.payload),
        })

        if (res.ok) {
          // Success: remove from queue
          await new Promise<void>((resolve) => {
            const tx = db.transaction('syncQueue', 'readwrite')
            tx.objectStore('syncQueue').delete(item.id)
            tx.oncomplete = () => resolve()
          })
        } else {
          // Update attempts
          await new Promise<void>((resolve) => {
            const tx = db.transaction('syncQueue', 'readwrite')
            item.attempts++
            item.status = item.attempts >= 5 ? 'failed' : 'pending'
            tx.objectStore('syncQueue').put(item)
            tx.oncomplete = () => resolve()
          })
        }
      } catch (err) {
        // Network broke again
        break
      }
    }

    this.notify()
  }
}

export const offlineStorage = new OfflineStorageEngine()

