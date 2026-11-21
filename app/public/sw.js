// Luda service worker (v1.17.0): shows phone notifications sent by the Luda server, even when the app is closed.
// It does NOT cache pages or data (Luda always loads fresh from the server).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let m = {}
  try { m = e.data ? e.data.json() : {} } catch { m = { title: e.data ? e.data.text() : '' } }
  const title = m.title || 'Luda'
  // Tell an open Luda to refresh its 🔔 inbox.
  self.clients.matchAll({ type: 'window' }).then((ws) => ws.forEach((w) => w.postMessage({ type: 'luda:push' }))).catch(() => {})
  e.waitUntil(self.registration.showNotification(title, {
    body: m.body || '',
    tag: m.tag || undefined,
    renotify: !!m.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: typeof m.url === 'string' && m.url.startsWith('/') ? m.url : '/' },
  }))
})

// Tapping a notification opens Luda on the right page (reuses an open Luda tab when there is one).
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        w.postMessage({ type: 'luda:open', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})

// The browser replaced the subscription: tell the open app (it re-registers with the server on next open).
self.addEventListener('pushsubscriptionchange', () => {})
