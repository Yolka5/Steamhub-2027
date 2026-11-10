import { applyUpdate, useOnline, useUpdateReady } from '../lib/pwa'

/** One quiet bar at the bottom: no connection, or a new version ready. */
export function AppStatus() {
  const update = useUpdateReady()
  const online = useOnline()
  if (!online)
    return (
      <div className="app-status" role="status">
        <span>No connection. Showing what was saved; changes need a connection.</span>
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
