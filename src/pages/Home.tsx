import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity } from '../components/Activity'
import { Icon, type IconName } from '../components/Icon'
import { Season } from '../components/Season'
import { WorkshopNow } from '../components/WorkshopNow'
import { YourTasks } from '../components/YourTasks'
import { PushCard } from '../components/PushCard'
import { useAuth } from '../lib/auth'
import { parseQuery, queryIsEmpty, sizeLabel, type Piece } from '../lib/stock'
import { looksLikeThread } from '../lib/threads'
import { useOpenPalette } from '../lib/palette'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { PartRow } from '../components/mfg'
import { queueSort, type Part } from '../lib/mfg'

/** `tabbar`: the phone tab bar already has it, so phones hide the tile. */
const QUICK: { to: string; label: string; hint: string; icon: IconName; tabbar?: boolean }[] = [
  { to: '/stock', label: 'Find stock', hint: 'By size and length', icon: 'search', tabbar: true },
  { to: '/stock/add', label: 'Add stock', hint: 'From your phone', icon: 'plus', tabbar: true },
  { to: '/manufacturing', label: 'Manufacturing', hint: 'What to make, drawings', icon: 'gear', tabbar: true },
  { to: '/calendar', label: 'Calendar', hint: 'Tasks, Gantt, daily updates', icon: 'calendar', tabbar: true },
  { to: '/prototypes/record', label: 'Record a test', hint: 'Prototype video and parameters', icon: 'video' },
  { to: '/tools', label: 'Tools', hint: 'Calculators, tap drills, links', icon: 'wrench' },
  { to: '/handbook', label: 'Handbook', hint: 'המדריך ומקורות מידע', icon: 'book' },
]

/**
 * Your parts, fresh each time Home opens: the ones handed to you, in the lead's order, plus any
 * you're making that nobody handed out.
 */
function useMyParts(userId: string | null) {
  const [parts, setParts] = useState<Part[]>([])
  useEffect(() => {
    if (!userId) return
    supabase
      .from('parts')
      .select('*')
      .or(`assignee_id.eq.${userId},and(maker_id.eq.${userId},status.eq.doing)`)
      .in('status', ['todo', 'doing'])
      .neq('machine', 'Bought')
      .not('released_at', 'is', null)
      .then(({ data }) => setParts(((data as Part[]) ?? []).sort(queueSort)))
  }, [userId])
  return parts
}

interface OpenAsk {
  id: string
  note: string
  by_name: string
  part: { id: string; part_no: number; released_by: string | null; subsystem: { lead_id: string | null } | null } | null
}

/** "Ask first" questions this person should answer: as lead, as releaser or as subsystem lead. */
function useAsksForMe(userId: string | null, canAssign: boolean) {
  const [asks, setAsks] = useState<OpenAsk[]>([])
  useEffect(() => {
    if (!userId) return
    supabase
      .from('part_requests')
      .select('id, note, by_name, part:parts(id, part_no, released_by, subsystem:subsystems(lead_id))')
      .eq('status', 'open')
      .order('created_at')
      .then(({ data }) =>
        setAsks(((data ?? []) as unknown as OpenAsk[]).filter((a) => a.part && (canAssign || a.part.released_by === userId || a.part.subsystem?.lead_id === userId))),
      )
  }, [userId, canAssign])
  return asks
}

/**
 * The title flips up letter by letter, the TTM letters pattern. It plays once per visit to the
 * site, not on every trip back to Home, so it stays a greeting and never becomes a wait.
 */
const firstVisit = (() => {
  try {
    const first = !sessionStorage.getItem('hero-played')
    sessionStorage.setItem('hero-played', '1')
    return first
  } catch {
    return true
  }
})()
let played = false

function Letters({ text }: { text: string }) {
  const [play] = useState(() => firstVisit && !played)
  useEffect(() => {
    played = true
  }, [])
  return (
    <h1 className="hero__title letters" data-play={play || undefined} aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} className="letters__ch" style={{ '--i': i } as CSSProperties} aria-hidden="true">
          {ch}
        </span>
      ))}
    </h1>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const openPalette = useOpenPalette()
  const { pieces } = useStore()
  const { userId, name, canAssign } = useAuth()
  const asks = useAsksForMe(userId, canAssign)
  const [text, setText] = useState('')

  const mine = useMemo(() => pieces.filter((p) => p.status === 'reserved' && p.reserved_by === userId), [pieces, userId])
  const available = pieces.filter((p) => p.status === 'available').length
  const myParts = useMyParts(userId)

  return (
    <div className="page home">
      <section className="hero">
        <Letters text="Steamhub" />
        <p className="hero__sub soft">{name ? `Hi ${name.split(' ')[0]}. ` : ''}What do you need?</p>
        <form
          className="hero__search"
          onSubmit={(e) => {
            e.preventDefault()
            const t = text.trim()
            // One search for everything, like Ctrl K. A stock size goes straight to the stock it
            // fits; a part number (3004), a thread (M5) or a word opens the full search with it.
            const q = parseQuery(t)
            if (!t) navigate('/stock')
            else if (/^\d{2,5}$/.test(t) || looksLikeThread(t) || queryIsEmpty(q)) openPalette(t)
            else navigate(`/stock?q=${encodeURIComponent(t)}`)
          }}
        >
          <input
            className="field field--big num"
            type="search"
            enterKeyHint="search"
            placeholder="20x40x1 700 · part 3004 · M5"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Search stock, parts, threads and pages"
          />
          <button type="submit" className="q-btn q-btn--main q-btn--big">
            Find
          </button>
        </form>
        <p className="soft small">
          {available} pieces in stock.<span className="desk-only"> Press <kbd>Ctrl K</kbd> anywhere to search.</span>
        </p>
      </section>

      {/* Always there, even empty, so the grid never leaves its row free for another card. */}
      <div className="home__cal">
        <PushCard home />
        <YourTasks />
      </div>

      <Activity />

      <Season />

      <WorkshopNow />

      <div className="quick">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to === '/manufacturing' ? '/manufacturing/start' : q.to} className="quick__item" data-tabbar={q.tabbar || undefined}>
            <Icon name={q.icon} size={22} />
            <span className="quick__label">{q.label}</span>
            <span className="soft small" dir="auto">
              {q.to === '/manufacturing' && myParts.length ? `${myParts.length} ${myParts.length === 1 ? 'part' : 'parts'} for you` : q.hint}
            </span>
          </Link>
        ))}
      </div>

      {asks.length > 0 && (
        <section className="section">
          <h2 className="section__title">Waiting for your answer</h2>
          <ul className="rows">
            {asks.map((a) => (
              <li key={a.id}>
                <Link to={`/manufacturing/p/${a.part!.id}`} className="row">
                  <span className="mfg-row__no num">{a.part!.part_no}</span>
                  <span className="row__main">
                    <span className="strong">{a.by_name} asks</span>
                    <span className="soft small" dir="auto">
                      {a.note}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(myParts.length > 0 || mine.length > 0) && (
        <div className="home__mine">
          {myParts.length > 0 && (
            <section className="section">
              <div className="mfg-group__head">
                <h2 className="section__title">Your parts</h2>
                {myParts.length > 5 && (
                  <Link to="/manufacturing/mine" className="soft small">
                    All {myParts.length}
                  </Link>
                )}
              </div>
              <ul className="rows">
                {myParts.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <PartRow part={p} showMaker={false} showStatus={p.status === 'doing'} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {mine.length > 0 && <Reservations mine={mine} />}
        </div>
      )}
    </div>
  )
}

function Reservations({ mine }: { mine: Piece[] }) {
  return (
    <section className="section">
      <h2 className="section__title">Your reservations</h2>
      <ul className="rows">
        {mine.map((p) => (
          <li key={p.id}>
            <Link to={`/stock/${p.id}`} className="row">
              <span className="num strong">{p.id}</span>
              <span className="num soft">
                {sizeLabel(p)} · {p.length} mm
              </span>
              <span className="row__end soft">{p.reserved_for}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
