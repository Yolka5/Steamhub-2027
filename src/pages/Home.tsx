import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity } from '../components/Activity'
import { Icon, type IconName } from '../components/Icon'
import { Season } from '../components/Season'
import { useAuth } from '../lib/auth'
import { parseQuery, queryIsEmpty, sizeLabel, type Piece } from '../lib/stock'
import { looksLikeThread } from '../lib/threads'
import { useOpenPalette } from '../lib/palette'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { PartRow } from '../components/mfg'
import type { Part } from '../lib/mfg'

/** `tabbar`: the phone tab bar already has it, so phones hide the tile. */
const QUICK: { to: string; label: string; hint: string; icon: IconName; tabbar?: boolean }[] = [
  { to: '/stock', label: 'Find stock', hint: 'By size and length', icon: 'search', tabbar: true },
  { to: '/stock/add', label: 'Add stock', hint: 'From your phone', icon: 'plus', tabbar: true },
  { to: '/manufacturing', label: 'Manufacturing', hint: 'What to make, drawings', icon: 'gear', tabbar: true },
  { to: '/prototypes/record', label: 'Record a test', hint: 'Prototype video and parameters', icon: 'video' },
  { to: '/tools', label: 'Tools', hint: 'Calculators, tap drills, links', icon: 'wrench', tabbar: true },
  { to: '/handbook', label: 'Handbook', hint: 'המדריך ומקורות מידע', icon: 'book' },
]

/** Parts you're making right now, fresh each time Home opens. */
function useMyParts(userId: string | null) {
  const [parts, setParts] = useState<Part[]>([])
  useEffect(() => {
    if (!userId) return
    supabase
      .from('parts')
      .select('*')
      .eq('maker_id', userId)
      .eq('status', 'doing')
      .order('part_no')
      .then(({ data }) => setParts((data as Part[]) ?? []))
  }, [userId])
  return parts
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
  const { userId, name } = useAuth()
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

      <Activity />

      <Season />

      <div className="quick">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="quick__item" data-tabbar={q.tabbar || undefined}>
            <Icon name={q.icon} size={22} />
            <span className="quick__label">{q.label}</span>
            <span className="soft small" dir="auto">
              {q.hint}
            </span>
          </Link>
        ))}
      </div>

      {(myParts.length > 0 || mine.length > 0) && (
        <div className="home__mine">
          {myParts.length > 0 && (
            <section className="section">
              <h2 className="section__title">You're making</h2>
              <ul className="rows">
                {myParts.map((p) => (
                  <li key={p.id}>
                    <PartRow part={p} showMaker={false} showStatus={false} />
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
