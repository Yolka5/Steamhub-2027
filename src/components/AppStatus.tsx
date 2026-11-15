import { applyUpdate, useOnline, useShowingSaved, useUpdateReady } from '../lib/pwa'

/** One quiet bar at the top: no connection, a slow one showing saved data, or a new version ready. */
export function AppStatus() {
  const update = useUpdateReady()
  const online = useOnline()
  const saved = useShowingSaved()
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
