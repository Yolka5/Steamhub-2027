import { useSyncExternalStore } from 'react'

// Offline app: registers the service worker (sw/sw.js) and tracks two things the app shows.
// - A new version waiting: shown as "New version", switched only when someone taps Refresh.
// - No connection: shown so people know they're looking at saved data.

let waiting: ServiceWorker | null = null
let refreshing = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

window.addEventListener('online', emit)
window.addEventListener('offline', emit)

export function registerServiceWorker() {
  // Dev servers change files constantly; the worker would only get in the way there.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // Reload only when the user asked for the new version, never on a first install.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) location.reload()
  })

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    const found = (w: ServiceWorker) => {
      if (navigator.serviceWorker.controller) {
        waiting = w
        emit()
      }
    }
    if (reg.waiting) found(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const w = reg.installing
      w?.addEventListener('statechange', () => w.state === 'installed' && found(w))
    })
    // Phones keep the app open for days, so check for a new deploy whenever it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  })
}

/** Switch to the new version now. The page reloads once the new worker takes over. */
export function applyUpdate() {
  if (!waiting) return location.reload()
  refreshing = true
  waiting.postMessage('SKIP_WAITING')
}

/** Remove the saved team data from this phone (on sign-out). */
export function clearSavedData() {
  navigator.serviceWorker?.controller?.postMessage('CLEAR_DATA')
}

export const useUpdateReady = () => useSyncExternalStore(subscribe, () => waiting !== null)
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine)
