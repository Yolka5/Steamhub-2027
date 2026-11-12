/* Steamhub service worker. Built by the `serviceWorker` plugin in vite.config.ts, which fills in
   VERSION and PRECACHE for each build. Not linted or type-checked: it runs in the worker scope.

   - The app (HTML, code, styles, main fonts, logo) is saved on install, so Steamhub opens
     instantly and works with no signal.
   - Team data from Supabase is fetched fresh when online. If the network is slow (over 4 s) or
     gone, the last saved copy is used, so pages still show what they showed last time, and the
     app is told (SAVED_DATA) so it can say so. FRESH_DATA follows once the network answers.
   - A new deploy installs in the background and waits. The app shows "New version" and only
     switches when someone taps Refresh, so nobody loses what they're typing.
   - Writes (reserve, add stock, uploads) are never cached: they need a connection. */

const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const SHELL = `shell-${VERSION}`
const RUNTIME = 'runtime-v1'
const DATA = 'data-v1'
const DATA_TIMEOUT = 4000
/** Big downloads (STEP files, videos) aren't kept offline. */
const MAX_DATA_BYTES = 2 * 1024 * 1024

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
  // Signing out wipes the saved team data from this phone.
  if (event.data === 'CLEAR_DATA') event.waitUntil(caches.delete(DATA))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === self.location.origin) {
    // Every page is the same app, so any navigation gets the saved index.html.
    if (req.mode === 'navigate') {
      event.respondWith(caches.match('/index.html', { cacheName: SHELL, ignoreVary: true }).then((hit) => hit || fetch(req)))
      return
    }
    if (url.pathname === '/sw.js') return
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') || /\.(webp|png|woff2|svg)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req))
    }
    return
  }

  // Supabase reads: database rows and stored files. Login, realtime and writes go straight through.
  // Not signed links (/object/sign/): their token changes every hour, so a saved copy is never
  // asked for again and would only fill the phone.
  if (url.hostname.endsWith('.supabase.co') && (url.pathname.startsWith('/rest/v1/') || (url.pathname.startsWith('/storage/v1/object/') && !url.pathname.startsWith('/storage/v1/object/sign/')))) {
    event.respondWith(networkFirst(req))
  }
})

/** Tells the open pages whether what they show is the saved copy (slow or no network) or fresh again. */
let showingSaved = false
async function tell(saved) {
  if (saved === showingSaved) return
  showingSaved = saved
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage(saved ? 'SAVED_DATA' : 'FRESH_DATA')
}

/** Saved team data stays small: the oldest answers go once there are more than this. */
const MAX_DATA_ENTRIES = 400
let putsSinceTrim = 0
async function trim(cache) {
  if (++putsSinceTrim < 50) return
  putsSinceTrim = 0
  const keys = await cache.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA_ENTRIES))) await cache.delete(k)
}

async function cacheFirst(req) {
  // ignoreVary: file names are unique per version, and the page's requests carry headers (Origin)
  // the install step's didn't, which would otherwise miss on servers that send Vary.
  const hit = await caches.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) {
    const copy = res.clone()
    caches.open(RUNTIME).then((c) => c.put(req, copy))
  }
  return res
}

async function networkFirst(req) {
  const cache = await caches.open(DATA)
  const network = fetch(req).then((res) => {
    const size = Number(res.headers.get('content-length') || 0)
    if (res.ok && size <= MAX_DATA_BYTES) cache.put(req, res.clone()).then(() => trim(cache))
    if (res.ok) tell(false)
    return res
  })
  network.catch(() => {}) // handled below; this only silences the background rejection
  const saved = cache.match(req, { ignoreVary: true })
  // Online and quick: fresh data. Slow or offline: the saved copy, while the fetch finishes in the background.
  const slow = new Promise((resolve) => setTimeout(resolve, DATA_TIMEOUT)).then(async () => ({ saved: await saved }))
  try {
    const first = await Promise.race([network, slow])
    if (first instanceof Response) return first
    if (first.saved) {
      // The page now shows the saved copy; it hears FRESH_DATA once the network answers.
      tell(true)
      return first.saved
    }
    return await network
  } catch {
    const hit = await saved
    if (hit) {
      tell(true)
      return hit
    }
    throw new Error('offline')
  }
}

/* Phone notifications (send-push edge function). Each one shows with Steamhub's icon; a tap
   opens its link in the open Steamhub window, or a new one. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const show = self.registration.showNotification(data.title || 'Steamhub', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-64.png',
    tag: data.tag,
    data: { url: data.url || '/notifications' },
  })
  // The app icon's number, where the phone supports it.
  const badge = 'setAppBadge' in self.navigator && data.badge ? self.navigator.setAppBadge(data.badge).catch(() => {}) : Promise.resolve()
  event.waitUntil(Promise.all([show, badge]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) return win.focus().then(() => win.navigate(url)).catch(() => self.clients.openWindow(url))
      return self.clients.openWindow(url)
    }),
  )
})
