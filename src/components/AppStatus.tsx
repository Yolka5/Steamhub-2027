import { useState } from 'react'
import { applyUpdate, useOnline, useShowingSaved, useUpdateReady } from '../lib/pwa'

// Sent here by the old address's worker (sw/sw.js): the app installed from steamhub2027.vercel.app
// now opens this site in a bar, so say how to get the full-screen app back. Shown once.
const movedHere = new URL(location.href).searchParams.has('moved')
if (movedHere) {
  const url = new URL(location.href)
  url.searchParams.delete('moved')
  history.replaceState(history.state, '', url)
}

/** One quiet bar at the top: no connection, a slow one showing saved data, or a new version ready. */
export function AppStatus() {
  const update = useUpdateReady()
  const online = useOnline()
  const saved = useShowingSaved()
  const [moved, setMoved] = useState(movedHere)
  if (!online)
    return (
      <div className="app-status" role="status">
        <span>No connection. Showing what was saved; changes need a connection.</span>
      </div>
    )
  if (saved)
    return (
      <div className="app-status" role="status">
        <span>Slow connection. Showing what was saved; it updates when the network answers.</span>
      </div>
    )
  if (moved)
    return (
      <div className="app-status" role="status">
        <span>Steamhub moved to steamhub1577.com. For the full-screen app, delete the old one, then open steamhub1577.com in Chrome and install it again.</span>
        <button type="button" className="q-btn q-btn--small" onClick={() => setMoved(false)}>
          OK
        </button>
      </div>
    )
  if (!update) return null
  return (
    <div className="app-status" role="status">
      <span>New version of Steamhub.</span>
      <button type="button" className="q-btn q-btn--main q-btn--small" onClick={applyUpdate}>
        Refresh
      </button>
    </div>
  )
}
