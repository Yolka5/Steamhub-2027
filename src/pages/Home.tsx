import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'

const QUICK: { to: string; label: string; hint: string; icon: IconName }[] = [
  { to: '/stock', label: 'Find stock', hint: 'By size and length', icon: 'search' },
  { to: '/stock/add', label: 'Add stock', hint: 'From your phone', icon: 'plus' },
  { to: '/calculators', label: 'Motor calculator', hint: 'Ratios and current', icon: 'calc' },
  { to: '/handbook', label: 'Handbook', hint: 'המדריך למתכנן המכני', icon: 'book' },
]

export default function Home() {
  const navigate = useNavigate()
  const { pieces } = useStore()
  const { userId, name } = useAuth()
  const [text, setText] = useState('')

  const mine = useMemo(() => pieces.filter((p) => p.status === 'reserved' && p.reserved_by === userId), [pieces, userId])
  const available = pieces.filter((p) => p.status === 'available').length

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero__title">Steamhub</h1>
        <p className="hero__sub soft">{name ? `Hi ${name.split(' ')[0]}. ` : ''}What do you need?</p>
        <form
          className="hero__search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(text.trim() ? `/stock?q=${encodeURIComponent(text.trim())}` : '/stock')
          }}
        >
          <input
            className="field field--big num"
            type="search"
            enterKeyHint="search"
            placeholder="20x40x1 700 · round 20/16 500 · TB-014"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Search stock"
          />
          <button type="submit" className="q-btn q-btn--main q-btn--big">
            Find
          </button>
        </form>
        <p className="soft small">
          {available} pieces in stock. Press <kbd>Ctrl K</kbd> anywhere to search.
        </p>
      </section>

      <div className="quick">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="quick__item">
            <Icon name={q.icon} size={22} />
            <span className="quick__label">{q.label}</span>
            <span className="soft small" dir="auto">
              {q.hint}
            </span>
          </Link>
        ))}
      </div>

      {mine.length > 0 && (
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
      )}
    </div>
  )
}
