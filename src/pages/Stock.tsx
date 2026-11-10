import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import { PieceCard } from '../components/PieceCard'
import { PieceTable } from '../components/PieceTable'
import { ReserveSheet } from '../components/ReserveSheet'
import { KERF, KINDS, findMatches, nearMatches, needsPhoto, parseQuery, type Kind, type Piece, type Query } from '../lib/stock'
import { useStore } from '../lib/store'

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

/** What the search understood, in words, so a typo is obvious. */
function describe(q: Query): string[] {
  const out: string[] = []
  if (q.id) return [q.id]
  if (q.kind) out.push(q.kind === 'round' ? 'Round' : KINDS[q.kind as Kind].label)
  if (q.a != null) {
    if (q.inner != null) out.push(`Ø${q.a} / ${q.inner}`)
    else if (q.b != null) out.push(`${q.a} × ${q.b}`)
    else out.push(q.kind === 'flat' ? `${q.a} wide` : `${q.a}`)
  }
  if (q.wall != null) out.push(`wall ${q.wall}`)
  if (q.material) out.push(q.material)
  if (q.length != null) out.push(`at least ${q.length} mm`)
  return out
}

export default function Stock() {
  const [params, setParams] = useSearchParams()
  const { pieces, loading, error } = useStore()
  const [reserving, setReserving] = useState<Piece | null>(null)
  // Cards stagger in when the page opens. After that, new results just appear.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 700)
    return () => window.clearTimeout(t)
  }, [])

  const text = params.get('q') ?? ''
  const kindPick = params.get('k') ?? ''
  const tol = Number(params.get('tol') ?? '0.5')
  const showAll = params.get('all') === '1'
  const viewParam = params.get('view')
  const view: 'cards' | 'table' = viewParam === 'table' || viewParam === 'cards' ? viewParam : savedView()

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const setView = (v: 'cards' | 'table') => {
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
    set('view', v)
  }

  const q = useMemo(() => {
    const parsed = parseQuery(text)
    if (kindPick && !parsed.id) parsed.kind = kindPick as Query['kind']
    return parsed
  }, [text, kindPick])

  const matches = useMemo(() => findMatches(pieces, q, tol, showAll), [pieces, q, tol, showAll])
  const near = useMemo(
    () => (matches.length < 3 ? nearMatches(pieces, q, tol, new Set(matches.map((m) => m.piece.id))) : []),
    [pieces, q, tol, matches],
  )
  const photoCount = useMemo(() => pieces.filter((p) => p.status !== 'used' && needsPhoto(p)).length, [pieces])
  const words = describe(q)
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
          <Link to="/stock/photos" className="q-btn">
            Needs photo <span className="badge num">{photoCount}</span>
          </Link>
          <Link to="/stock/add" className="q-btn q-btn--main">
            Add stock
          </Link>
        </div>
      </div>

      <div className="finder">
        <input
          className="field field--big num"
          type="search"
          inputMode="text"
          enterKeyHint="search"
          autoFocus={window.matchMedia('(pointer: fine)').matches}
          placeholder="20x40x1 700 · round 20/16 500 · TB-014"
          value={text}
          onChange={(e) => set('q', e.target.value)}
          aria-label="What do you need"
        />
        <div className="finder__row">
          <div className="picks picks--seg" role="radiogroup" aria-label="Shape">
            <Indicator />
            {KIND_PICKS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                className="pick"
                aria-checked={kindPick === k.value}
                onClick={() => set('k', k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>
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
        </div>
        <p className="finder__said soft">
          {words.length ? (
            <>
              Looking for <strong>{words.join(', ')}</strong>
              {q.length != null && ` (+${KERF} mm for the cut)`}.{' '}
            </>
          ) : (
            `${available} pieces available. `
          )}
          {matches.length > 0 && (words.length ? `${matches.length} fit, least waste first.` : '')}
        </p>
      </div>

      {error && <p className="error">Couldn't load stock: {error}</p>}
      {loading && <p className="soft">Loading stock</p>}

      {!loading && matches.length === 0 && words.length > 0 && (
        <p className="empty">Nothing in stock fits exactly.{near.length ? ' Close sizes below.' : ''}</p>
      )}

      {view === 'table' ? (
        matches.length > 0 && <PieceTable matches={matches} showLeft={q.length != null} best={words.length > 0} onReserve={setReserving} />
      ) : (
        <div className="cards" data-settled={settled || undefined}>
          {matches.map((m, i) => (
            <PieceCard
              key={m.piece.id}
              index={i}
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
