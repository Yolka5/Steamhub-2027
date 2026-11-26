import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import { PieceCard } from '../components/PieceCard'
import { PieceTable } from '../components/PieceTable'
import { Working } from '../components/Working'
import { stockSearchWorking } from '../lib/workings'
import { ReserveSheet } from '../components/ReserveSheet'
import { KERF, KINDS, findMatches, nearMatches, parseQuery, type Kind, type Piece, type Query } from '../lib/stock'
import { useStore } from '../lib/store'
import { usePhone } from '../lib/usePhone'
import { count } from '../lib/words'

const KIND_PICKS: { value: string; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'round', label: 'Round' },
  { value: 'rect_tube', label: 'Profile' },
  { value: 'angle', label: 'Angle' },
  { value: 'flat', label: 'Flat' },
  { value: 'hex', label: 'Hex' },
]

const TOLS = ['0.2', '0.5', '1']

// Cards or table: in the link when picked, otherwise this device's last choice.
const VIEW_KEY = 'stock-view'
function savedView(): 'cards' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'
  } catch {
    return 'cards'
  }
}

type Dim = 'a' | 'b' | 'wall' | 'inner' | 'length'
type Shape = '' | 'round' | 'rect_tube' | 'angle' | 'flat' | 'hex'

// One box per size. A blank box means any value. The words follow the shape picked.
const FIELDS: Record<Shape, { key: Dim; label: string }[]> = {
  '': [{ key: 'a', label: 'OD' }, { key: 'inner', label: 'ID' }, { key: 'length', label: 'Length' }],
  round: [{ key: 'a', label: 'OD' }, { key: 'inner', label: 'ID' }, { key: 'length', label: 'Length' }],
  hex: [{ key: 'a', label: 'Across flats' }, { key: 'inner', label: 'Bore' }, { key: 'length', label: 'Length' }],
  rect_tube: [
    { key: 'a', label: 'Width' },
    { key: 'b', label: 'Height' },
    { key: 'wall', label: 'Wall' },
    { key: 'length', label: 'Length' },
  ],
  angle: [
    { key: 'a', label: 'Leg A' },
    { key: 'b', label: 'Leg B' },
    { key: 'wall', label: 'Thickness' },
    { key: 'length', label: 'Length' },
  ],
  flat: [{ key: 'a', label: 'Width' }, { key: 'wall', label: 'Thickness' }, { key: 'length', label: 'Length' }],
}
const DIMS: Dim[] = ['a', 'b', 'wall', 'inner', 'length']

const toNum = (v: string | null) => {
  if (v == null || v.trim() === '') return undefined
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** What the search understood, in words, so a typo is obvious. */
function describe(q: Query, shape: Shape): string[] {
  const out: string[] = []
  if (shape) out.push(shape === 'round' ? 'Round' : KINDS[shape as Kind].label)
  for (const f of FIELDS[shape]) {
    const v = q[f.key]
    if (v != null && f.key !== 'length') out.push(`${f.label} ${v}`)
  }
  if (q.length != null) out.push(`at least ${q.length} mm`)
  return out
}

/** Old one-line searches (from Home, Ctrl K or a saved link) turned into the boxes. */
function shapeOf(q: Query): Shape {
  if (q.kind === 'round' || q.kind === 'round_tube' || q.kind === 'round_rod') return 'round'
  if (q.kind === 'rect_tube' || q.kind === 'angle' || q.kind === 'flat' || q.kind === 'hex') return q.kind
  if (q.b != null || q.wall != null) return 'rect_tube'
  return ''
}

export default function Stock() {
  const [params, setParams] = useSearchParams()
  const { pieces, loading, error } = useStore()
  const phone = usePhone()
  const [reserving, setReserving] = useState<Piece | null>(null)

  const navigate = useNavigate()
  const legacy = params.get('q')
  const shape = (FIELDS[(params.get('k') ?? '') as Shape] ? params.get('k') ?? '' : '') as Shape
  const tol = Number(params.get('tol') ?? '0.5')
  const showAll = params.get('all') === '1'
  const viewParam = params.get('view')
  const view: 'cards' | 'table' = viewParam === 'table' || viewParam === 'cards' ? viewParam : savedView()

  // Always from the latest link: the router updates it a moment late, and fast typing would
  // otherwise write over a box with an old copy.
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const setView = (v: 'cards' | 'table') => {
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
    set('view', v)
  }

  // A one-line search in the link becomes the boxes. A piece or plate number opens that page.
  useEffect(() => {
    if (legacy == null) return
    const parsed = parseQuery(legacy)
    if (parsed.id) {
      const plate = /^(AL|PC|WD)-/.test(parsed.id) ? parsed.id.replace(/-0*(\d+)$/, (_, n: string) => n.padStart(2, '0')) : null
      navigate(plate ? `/stock/plates?q=${plate}` : `/stock/${parsed.id}`, { replace: true })
      return
    }
    const k = shapeOf(parsed)
    const got = Object.fromEntries(
      DIMS.map((d) => [d, parsed[d] != null && FIELDS[k].some((f) => f.key === d) ? String(parsed[d]) : '']),
    ) as Record<Dim, string>
    setValues(got)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('q')
        if (k) next.set('k', k)
        for (const d of DIMS) if (got[d]) next.set(d, got[d])
        return next
      },
      { replace: true },
    )
  }, [legacy, navigate, setParams])

  // The boxes keep their own text, so typing never waits on the link.
  const [values, setValues] = useState(() => Object.fromEntries(DIMS.map((d) => [d, params.get(d) ?? ''])) as Record<Dim, string>)
  const setValue = (d: Dim, v: string) => {
    setValues((x) => ({ ...x, [d]: v }))
    set(d, v.trim())
  }
  const q = useMemo(() => {
    const out: Query = {}
    for (const f of FIELDS[shape]) {
      const v = toNum(values[f.key])
      if (v != null) out[f.key] = v
    }
    if (shape) out.kind = shape
    // OD and ID with no shape picked: round tubes, rods and hex, never a profile.
    else if (out.a != null || out.inner != null) out.kind = 'od'
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, values.a, values.b, values.wall, values.inner, values.length])

  // A new shape keeps the boxes it shares with the old one.
  const pickShape = (k: Shape) => {
    const keep = (d: Dim) => FIELDS[k].some((f) => f.key === d)
    setValues((x) => Object.fromEntries(DIMS.map((d) => [d, keep(d) ? x[d] : ''])) as Record<Dim, string>)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (k) next.set('k', k)
        else next.delete('k')
        for (const d of DIMS) if (!keep(d)) next.delete(d)
        return next
      },
      { replace: true },
    )
  }
  const clear = () => {
    setValues(Object.fromEntries(DIMS.map((d) => [d, ''])) as Record<Dim, string>)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const d of DIMS) next.delete(d)
        next.delete('k')
        return next
      },
      { replace: true },
    )
  }
  const matches = useMemo(() => findMatches(pieces, q, tol, showAll), [pieces, q, tol, showAll])
  const near = useMemo(
    () => (matches.length < 3 ? nearMatches(pieces, q, tol, new Set(matches.map((m) => m.piece.id))) : []),
    [pieces, q, tol, matches],
  )
  // Tolerance, view and "show reserved" are rarely changed: one row on desktop, folded on phones.
  const options = (
    <>
            <div className="picks picks--seg" role="radiogroup" aria-label="Size tolerance">
              <Indicator />
              {TOLS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  className="pick num"
                  aria-checked={tol === Number(t)}
                  onClick={() => set('tol', t === '0.5' ? '' : t)}
                >
                  ±{t}
                </button>
              ))}
            </div>
            <div className="picks picks--seg" role="radiogroup" aria-label="View">
              <Indicator />
              {(['cards', 'table'] as const).map((v) => (
                <button key={v} type="button" role="radio" className="pick" aria-checked={view === v} onClick={() => setView(v)}>
                  {v === 'cards' ? 'Cards' : 'Table'}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={showAll} onChange={(e) => set('all', e.target.checked ? '1' : '')} />
              Show reserved and used
            </label>
    </>
  )
  const words = describe(q, shape)
  const available = pieces.filter((p) => p.status === 'available').length

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Stock</h1>
        <div className="page__actions">
          <Link to="/stock/plates" className="q-btn">
            Plates
          </Link>
          <Link to="/stock/cut" className="q-btn">
            Cut list
          </Link>
          <Link to="/stock/mechanisms" className="q-btn">
            Mechanisms
          </Link>
          {/* Phones have Add in the tab bar. */}
          {!phone && (
            <Link to="/stock/add" className="q-btn q-btn--main">
              Add stock
            </Link>
          )}
        </div>
      </div>

      <div className="finder">
        <div className="finder__row">
          <div className={`picks picks--seg${phone ? ' picks--wrap' : ''}`} role="radiogroup" aria-label="Shape">
            <Indicator />
            {KIND_PICKS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                className="pick"
                aria-checked={shape === k.value}
                onClick={() => pickShape(k.value as Shape)}
              >
                {k.label}
              </button>
            ))}
          </div>
          {phone ? (
            <details className="finder__more">
              <summary>
                Options <span className="soft num">±{tol} · {view === 'cards' ? 'Cards' : 'Table'}{showAll ? ' · all' : ''}</span>
              </summary>
              <div className="finder__row">{options}</div>
            </details>
          ) : (
            options
          )}
        </div>
        <div className="finder__dims" style={{ '--n': FIELDS[shape].length } as CSSProperties}>
          {FIELDS[shape].map((f, i) => (
            <label key={f.key} className="ctl">
              <span className="ctl__name">{f.label}</span>
              <input
                className="field field--big num"
                type="text"
                inputMode="decimal"
                enterKeyHint="search"
                autoComplete="off"
                autoFocus={i === 0 && window.matchMedia('(pointer: fine)').matches}
                placeholder="Any"
                value={values[f.key]}
                onChange={(e) => setValue(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="finder__said soft">
          {words.length ? (
            <>
              Looking for <strong>{words.join(', ')}</strong>
              {q.length != null && ` (+${KERF} mm for the cut)`}.{' '}
            </>
          ) : (
            `${count(available, 'piece')} available. `
          )}
          {matches.length > 0 && (words.length ? `${matches.length} fit, ${q.length != null ? 'least waste' : 'smallest'} first. ` : '')}
          {words.length > 0 && (
            <button type="button" className="text-btn" onClick={clear}>
              Clear
            </button>
          )}
        </p>
        {words.length > 0 && <Working id="stock-search" title="How the search works" lines={stockSearchWorking(q, tol, matches[0])} />}
      </div>

      {error && <p className="error">Couldn't load stock: {error}</p>}
      {loading && <p className="soft">Loading stock</p>}

      {!loading && matches.length === 0 && words.length > 0 && (
        <p className="empty">Nothing in stock fits exactly.{near.length ? ' Close sizes below.' : ''}</p>
      )}

      {view === 'table' ? (
        matches.length > 0 && <PieceTable matches={matches} showLeft={q.length != null} best={words.length > 0} onReserve={setReserving} />
      ) : (
        <div className="cards">
          {matches.map((m, i) => (
            <PieceCard
              key={m.piece.id}
              piece={m.piece}
              leftover={m.leftover}
              main={i === 0 && words.length > 0}
              onReserve={setReserving}
            />
          ))}
        </div>
      )}

      {near.length > 0 && (
        <section className="section">
          <h2 className="section__title">Close sizes</h2>
          {view === 'table' ? (
            <PieceTable matches={near} showLeft={q.length != null} onReserve={setReserving} />
          ) : (
            <div className="cards">
              {near.map((m) => (
                <PieceCard key={m.piece.id} piece={m.piece} leftover={m.leftover} onReserve={setReserving} />
              ))}
            </div>
          )}
        </section>
      )}

      <ReserveSheet
        key={reserving?.id ?? 'none'}
        piece={reserving}
        plannedLength={q.length ?? null}
        onClose={() => setReserving(null)}
      />
    </div>
  )
}
