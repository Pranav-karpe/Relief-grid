/**
 * ReliefGrid Service Worker
 * Provides offline application shell resilience for field workers.
 *
 * Privacy & Security Policy:
 * - NEVER caches sensitive beneficiary records or evidence photos (/api/* or /uploads/*).
 * - Caches only application code bundles (HTML, CSS, JS, static icons).
 * - Navigation fallback ensures the SPA boots even when network is completely offline.
 */

const CACHE_NAME = 'reliefgrid-app-shell-v1'
const STATIC_PRECACHE = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest']

// Install event — precache critical app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

// Activate event — cleanup stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key)
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Fetch event — intelligent caching with strict privacy boundaries
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 1. Strict Privacy Guard: NEVER cache API mutations or sensitive uploads
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    // Network-only; offline mutations are safely buffered in client IndexedDB
    return
  }

  // 2. HTML SPA navigation fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedIndex = await caches.match('/index.html')
        if (cachedIndex) return cachedIndex
        const cachedRoot = await caches.match('/')
        if (cachedRoot) return cachedRoot
        return new Response('ReliefGrid is offline. Please reconnect to sync.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      }),
    )
    return
  }

  // 3. Static assets: Cache-first with network background update
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Background revalidation
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse))
              }
            })
            .catch(() => {})
          return cachedResponse
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse
          }
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache))
          return networkResponse
        })
      }),
    )
  }
})

