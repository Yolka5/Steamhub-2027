import { useEffect, useRef } from 'react'
import { FRESH_EVENT } from './pwa'

// Realtime keeps lists current while the app is open, but a phone drops that connection in the
// background, and wifi blips drop it on the workshop PC. Changes made in between never arrive.
// So a list loads again when the connection comes back, and when the app returns after a while.

/** Calls `reload` when the connection comes back, or the app returns after `awayMs` hidden. */
export function useReloadOnReturn(reload: () => unknown, awayMs = 60_000) {
  const fn = useRef(reload)
  fn.current = reload
  useEffect(() => {
    let hiddenAt = 0
    const onOnline = () => fn.current()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > awayMs) fn.current()
    }
    window.addEventListener('online', onOnline)
    // The network answered again after a slow spell showed saved data (see pwa.ts).
    window.addEventListener(FRESH_EVENT, onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener(FRESH_EVENT, onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [awayMs])
}
