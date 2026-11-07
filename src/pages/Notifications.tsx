import { useNavigate } from 'react-router-dom'
import { ago } from '../lib/mfg'
import { useNotifications } from '../lib/notifications'

export default function Notifications() {
  const { notes, unread, markRead } = useNotifications()
  const navigate = useNavigate()

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Notifications</h1>
        {unread > 0 && (
          <button type="button" className="q-btn" onClick={() => markRead()}>
            Mark all read
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="soft">Nothing yet. You'll hear here when a part you lead or make changes in CAD.</p>
      ) : (
        <ul className="rows">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="row note-row"
                data-unread={!n.read_at || undefined}
                onClick={() => {
                  markRead([n.id])
                  if (n.link) navigate(n.link)
                }}
              >
                <span className="note-row__dot" aria-hidden="true" />
                <span className="row__main">{n.text}</span>
                <span className="soft small num row__end">{ago(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
