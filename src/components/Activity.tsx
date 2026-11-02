import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Live feed of what the team just did with stock. New rows arrive over realtime.

interface Event {
  id: number
  piece_id: string
  action: string
  by_name: string | null
  at: string
  details: Record<string, unknown> | null
}

const LIMIT = 6

function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

/** "reserved TB-014 for Intake", "added a photo to TB-045", and so on. */
function describe(e: Event) {
  const d = e.details ?? {}
  const piece = (
    <Link to={`/stock/${e.piece_id}`} className="num">
      {e.piece_id}
    </Link>
  )
  switch (e.action) {
    case 'reserved':
      return (
        <>
          reserved {piece}
          {d.for ? ` for ${d.for}` : ''}
        </>
      )
    case 'released':
      return <>released {piece}</>
    case 'used':
      return <>used {piece}</>
    case 'added':
      return <>added {piece}</>
    case 'edited':
      if ('photo_url' in d) return <>shot a photo of {piece}</>
      if ('length' in d) return <>changed the length of {piece}</>
      if ('location' in d) return d.location ? <>moved {piece} to {String(d.location)}</> : <>cleared the location of {piece}</>
      return <>edited {piece}</>
    default:
      return (
        <>
          {e.action} {piece}
        </>
      )
  }
}

export function Activity() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    supabase
      .from('piece_events')
      .select('id, piece_id, action, by_name, at, details')
      .order('at', { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => setEvents((data as Event[]) ?? []))

    const channel = supabase
      .channel('activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'piece_events' }, (msg) => {
        setEvents((list) => [msg.new as Event, ...(list ?? [])].slice(0, LIMIT))
        setNow(Date.now())
      })
      .subscribe()
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(t)
    }
  }, [])

  return (
    <section className="activity" aria-label="Team activity">
      <h2 className="activity__title">Team activity</h2>
      {events && events.length === 0 && (
        <p className="soft small">Nothing yet. When someone reserves, adds or photographs a piece, it shows up here.</p>
      )}
      <ul className="activity__list">
        {events?.map((e) => {
          const who = e.by_name?.split(' ')[0] ?? 'Someone'
          return (
            <li key={e.id} className="activity__item">
              <span className="avatar avatar--soft">{who[0]?.toUpperCase()}</span>
              <span className="activity__text">
                <strong>{who}</strong> {describe(e)}
              </span>
              <span className="activity__when soft num">{ago(e.at, now)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
