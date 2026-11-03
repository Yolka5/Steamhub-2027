import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Copy } from '../components/ui'
import { area, sizeLabel, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'

// Weight per mechanism from what's reserved for it. Uses the planned length when there is one,
// otherwise the whole piece, so the number is an upper bound until people add planned lengths.

interface Line {
  piece: Piece
  length: number
  planned: boolean
  grams: number | null
}

interface Group {
  name: string
  lines: Line[]
  grams: number
  unknown: number
  unplanned: number
}

/** Same mechanism typed slightly differently ("Arm", "arm ") lands in one group. */
const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function groupByMechanism(pieces: Piece[], densities: Map<string, number>): Group[] {
  const groups = new Map<string, { names: Map<string, number>; lines: Line[] }>()
  for (const p of pieces) {
    if (p.status === 'available' || !p.reserved_for?.trim()) continue
    const k = keyOf(p.reserved_for)
    const g = groups.get(k) ?? { names: new Map<string, number>(), lines: [] as Line[] }
    const shown = p.reserved_for.trim()
    g.names.set(shown, (g.names.get(shown) ?? 0) + 1)
    const planned = p.planned_length != null && p.planned_length > 0 && p.planned_length <= p.length
    const length = planned ? p.planned_length! : p.length
    const ar = area(p)
    const d = p.material ? densities.get(p.material) : undefined
    g.lines.push({ piece: p, length, planned, grams: ar != null && d ? (ar * d * length) / 1000 : null })
    groups.set(k, g)
  }
  return [...groups.values()]
    .map((g) => {
      // Show the spelling most people used.
      const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const lines = g.lines.sort((a, b) => (b.grams ?? 0) - (a.grams ?? 0))
      return {
        name,
        lines,
        grams: lines.reduce((s, l) => s + (l.grams ?? 0), 0),
        unknown: lines.filter((l) => l.grams == null).length,
        unplanned: lines.filter((l) => !l.planned).length,
      }
    })
    .sort((a, b) => b.grams - a.grams)
}

const kg = (g: number) => (g / 1000).toFixed(2)

export default function Mechanisms() {
  const { pieces, densities, loading } = useStore()
  const groups = useMemo(() => groupByMechanism(pieces, densities), [pieces, densities])
  const total = groups.reduce((s, g) => s + g.grams, 0)
  const max = Math.max(1, ...groups.map((g) => g.grams))

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Mechanisms</h1>
        <Link to="/stock" className="q-btn">
          Stock
        </Link>
      </div>

      {loading ? (
        <p className="soft">Loading</p>
      ) : groups.length === 0 ? (
        <p className="soft">Nothing is reserved for a mechanism yet. Reserve a piece from Stock and name the mechanism, and its weight shows up here.</p>
      ) : (
        <>
          <p className="soft">
            Stock reserved for {groups.length} {groups.length === 1 ? 'mechanism' : 'mechanisms'}, about <Copy value={kg(total)} /> kg of raw material in all. Pieces
            without a planned length count at full length.
          </p>

          {groups.map((g) => (
            <section key={g.name} className="mw">
              <div className="mw__head">
                <h2 className="section__title">{g.name}</h2>
                <span className="mw__kg num">
                  <Copy value={kg(g.grams)} /> kg
                </span>
              </div>
              <div className="mw__bar" aria-hidden="true">
                <span style={{ width: `${(g.grams / max) * 100}%` }} />
              </div>
              {(g.unplanned > 0 || g.unknown > 0) && (
                <p className="soft small">
                  {[
                    g.unplanned > 0 && `${g.unplanned} at full length (no planned cut)`,
                    g.unknown > 0 && `${g.unknown} with unknown material, not counted`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              <ul className="rows">
                {g.lines.map((l) => (
                  <li key={l.piece.id}>
                    <Link to={`/stock/${l.piece.id}`} className="row">
                      <span className="num strong">{l.piece.id}</span>
                      <span className="num soft">
                        {sizeLabel(l.piece)} · {l.length} mm{l.planned ? '' : ' (full)'}
                        {l.piece.status === 'used' ? ' · used' : ''}
                      </span>
                      <span className="row__end num soft">{l.grams == null ? '?' : `${Math.round(l.grams)} g`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
