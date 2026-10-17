/* SeMa service worker: push delivery and authenticated-page renewal. */

self.addEventListener('install', () => {
  // Activate the new SW immediately without waiting for existing clients to close.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Take control of all existing clients without requiring a page reload.
  event.waitUntil(self.clients.claim())
})

// Remove identity left by older worker versions; it is never authorization.
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_USER') indexedDB.deleteDatabase('sema-sw-identity')
})

self.addEventListener('push', event => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { payload = { title: 'SeMa', body: event.data.text() } }

  const { title = 'SeMa 💕', body = '', url = '/', tag = 'sema' } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     '/icons/icon-192.png',
      badge:    '/icons/icon-192.png',
      tag,
      renotify: false,   // do not re-alert if same tag already on screen
      data:     { url },
    })
  )
})

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus()
        }
        return clients.openWindow(url)
      })
  )
})


self.addEventListener('pushsubscriptionchange', event => {
  // Only a signed-in page can renew registration with a fresh access token.
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(windows => { for (const client of windows) client.postMessage({ type: 'PUSH_RECONNECT_REQUIRED' }) }))
})
