import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { partName, type Part } from '../lib/mfg'
import { supabase } from '../lib/supabase'

// Live feed of what the team just did with stock and in the workshop. New rows arrive over realtime.

interface Event {
  id: number
  piece_id: string
  action: string
  by_name: string | null
  at: string
  details: Record<string, unknown> | null
}

/** A workshop moment: someone started, finished, flagged or couldn't find a part. */
interface PartEvent {
  id: number
  part_id: string
  action: string
  by_name: string | null
  at: string
  part: Pick<Part, 'part_no' | 'name' | 'cls' | 'size' | 'machine'> | null
}

/** Only the moments people care about; a release of 50 parts would flood the feed. */
const PART_ACTIONS = ['claimed', 'status_done', 'urgent', 'status_missing']

type Item = { key: string; at: string; by_name: string | null; text: ReactNode }

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

/** "started 3004 Plate 5 mm", "finished 3012", "marked 3001 urgent". */
function describePart(e: PartEvent) {
  const part = (
    <Link to={`/manufacturing/p/${e.part_id}`}>
      <span className="num">{e.part?.part_no}</span>
      {e.part ? ` ${partName(e.part)}` : ''}
    </Link>
  )
  switch (e.action) {
    case 'claimed':
      return <>started making {part}</>
    case 'status_done':
      return e.part?.machine === 'Bought' ? <>collected {part}</> : <>finished {part}</>
    case 'urgent':
      return <>marked {part} urgent</>
    case 'status_missing':
      return <>couldn't find {part}</>
    default:
      return part
  }
}

const fromPiece = (e: Event): Item => ({ key: `s${e.id}`, at: e.at, by_name: e.by_name, text: describe(e) })
const fromPart = (e: PartEvent): Item => ({ key: `p${e.id}`, at: e.at, by_name: e.by_name, text: describePart(e) })
const newest = (list: Item[]) => list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT)
const PART_SELECT = 'id, part_id, action, by_name, at, part:parts(part_no, name, cls, size, machine)'

export function Activity() {
  const [events, setEvents] = useState<Item[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    Promise.all([
      supabase.from('piece_events').select('id, piece_id, action, by_name, at, details').order('at', { ascending: false }).limit(LIMIT),
      supabase.from('part_events').select(PART_SELECT).in('action', PART_ACTIONS).order('at', { ascending: false }).limit(LIMIT),
    ]).then(([s, p]) =>
      setEvents(newest([...((s.data as Event[]) ?? []).map(fromPiece), ...((p.data as unknown as PartEvent[]) ?? []).map(fromPart)])),
    )

    const add = (item: Item) => {
      setEvents((list) => newest([item, ...(list ?? [])]))
      setNow(Date.now())
    }
    const channel = supabase
      .channel('activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'piece_events' }, (msg) => add(fromPiece(msg.new as Event)))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'part_events' }, async (msg) => {
        const row = msg.new as PartEvent
        if (!PART_ACTIONS.includes(row.action)) return
        // Realtime sends the bare row; the part's number and name come with one small read.
        const { data } = await supabase.from('part_events').select(PART_SELECT).eq('id', row.id).maybeSingle()
        if (data) add(fromPart(data as unknown as PartEvent))
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
        <p className="soft small">Nothing yet. Reserving stock and starting or finishing parts shows up here.</p>
      )}
      <ul className="activity__list">
        {events?.map((e) => {
          const who = e.by_name?.split(' ')[0] ?? 'Someone'
          return (
            <li key={e.key} className="activity__item">
              <span className="avatar avatar--soft">{who[0]?.toUpperCase()}</span>
              <span className="activity__text">
                <strong>{who}</strong> {e.text}
              </span>
              <span className="activity__when soft num">{ago(e.at, now)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
