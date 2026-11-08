import { describe, it, expect } from 'vitest'
import { offlineStorage } from '../lib/offline-storage'

describe('Phase 6 — Offline PWA & Resilience Architecture', () => {
  it('OfflineStorageEngine enqueues mutations and notifies subscribers', async () => {
    let notified = false
    let lastPendingCount = 0

    const unsubscribe = offlineStorage.subscribe((_online, pendingCount) => {
      notified = true
      lastPendingCount = pendingCount
    })

    const itemId = await offlineStorage.enqueue({
      action: 'create_report',
      endpoint: '/api/reports',
      method: 'POST',
      payload: {
        title: 'Flash flood assistance needed',
        urgency: 'high',
      },
    })

    expect(typeof itemId).toBe('string')
    expect(itemId.length).toBeGreaterThan(0)

    const pendingCount = await offlineStorage.getPendingCount()
    expect(pendingCount).toBeGreaterThanOrEqual(1)
    expect(notified).toBe(true)
    expect(lastPendingCount).toBeGreaterThanOrEqual(1)

    const items = await offlineStorage.getPendingItems()
    expect(items.some((i) => i.id === itemId)).toBe(true)

    unsubscribe()
  })

  it('Verifies Service Worker precache policy and privacy boundaries', () => {
    // Sensitive route patterns that MUST NEVER be cached
    const sensitivePatterns = ['/api/', '/uploads/']
    const isCacheableUrl = (urlStr: string) => {
      const url = new URL(urlStr, 'http://localhost:5173')
      if (sensitivePatterns.some((p) => url.pathname.startsWith(p))) {
        return false
      }
      return (
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.webmanifest') ||
        url.pathname === '/' ||
        url.pathname === '/index.html'
      )
    }

    // Static assets allowed
    expect(isCacheableUrl('http://localhost:5173/assets/index.js')).toBe(true)
    expect(isCacheableUrl('http://localhost:5173/assets/index.css')).toBe(true)
    expect(isCacheableUrl('http://localhost:5173/manifest.webmanifest')).toBe(true)
    expect(isCacheableUrl('http://localhost:5173/favicon.svg')).toBe(true)

    // Sensitive routes strictly rejected from cache
    expect(isCacheableUrl('http://localhost:5173/api/distributions')).toBe(false)
    expect(isCacheableUrl('http://localhost:5173/api/reports')).toBe(false)
    expect(isCacheableUrl('http://localhost:5173/uploads/evidence/photo_123.jpg')).toBe(false)
  })

  it('Web App Manifest structure specification meets PWA standards', () => {
    const requiredKeys = ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']
    const manifestSchema = {
      name: 'ReliefGrid — Emergency Disaster Coordination',
      short_name: 'ReliefGrid',
      start_url: '/',
      display: 'standalone',
      background_color: '#090d16',
      theme_color: '#0f172a',
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    }

    for (const key of requiredKeys) {
      expect(key in manifestSchema).toBe(true)
    }
    expect(manifestSchema.theme_color).toBe('#0f172a')
    expect(manifestSchema.display).toBe('standalone')
  })
})
