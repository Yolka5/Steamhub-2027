import { useEffect, useMemo, useState } from 'react'
import { Working } from './Working'
import { plateFitWorking } from '../lib/workings'
import { Link } from 'react-router-dom'
import { reservePiece } from '../lib/actions'
import { useWho } from '../lib/auth'
import { loadGeometry } from '../lib/drawing'
import { barDims, hexDims, stockLength, updatePart, type Part, type Subsystem } from '../lib/mfg'
import { plateArea, platesFor, setPlateState, STATE_WORD, tText, usePlates, type Plate, type PlateState } from '../lib/plates'
import { tubeWall } from '../lib/step/engine'
import { findMatches, sizeLabel, type Query } from '../lib/stock'
import { useStore } from '../lib/store'
import { useBusy, useToast } from './ui'

// Where a part's material comes from: plates that fit for CNC parts, tube, rod or hex stock for
// the rest. Reserving a stock piece ties it to the part; Done on the part cuts it (see PartPage).

/** What to look for in stock, from the part's shape. Null when it isn't cut from bar stock. */
async function stockQuery(p: Part): Promise<Query | null> {
  if (p.machine === 'CNC' || p.machine === 'Bought' || p.machine === '3D print') return null
  const {
    section: [y, z],
  } = barDims(p.size)
  const length = stockLength(p)
  if (p.cls === 'tube') {
    let wall: number | undefined
    if (p.geometry_path) {
      try {
        wall = tubeWall(await loadGeometry(p.geometry_path)) ?? undefined
      } catch {
        wall = undefined
      }
    }
    return { kind: 'rect_tube', a: y, b: z, wall: wall ? Math.round(wall * 100) / 100 : undefined, length }
  }
  const hex = hexDims(p.size)
  if (hex) return { kind: 'hex', a: hex.flats, length }
  // Round when the section is a circle and it's turned; a milled square bar isn't round stock.
  if (Math.abs(y - z) < 0.05 && (p.cls === 'round' || p.machine === 'Lathe')) return { kind: 'round', a: y, length }
  return null
}

export function PartStock({ part, sub, onPart }: { part: Part; sub: Subsystem; onPart: (p: Part) => void }) {
  if (part.status === 'cancelled' || part.machine === 'Bought' || part.machine === '3D print') return null
  return part.machine === 'CNC' ? <PlatePick part={part} onPart={onPart} /> : <BarPick part={part} sub={sub} onPart={onPart} />
}

function PlatePick({ part, onPart }: { part: Part; onPart: (p: Part) => void }) {
  const { plates, setPlates } = usePlates()
  const who = useWho()
  const toast = useToast()
  // Identical plates in the same state show once, with a count.
  const fits = useMemo(() => {
    const groups = new Map<string, { plate: Plate; n: number }>()
    for (const pl of platesFor(plates, part.size.map(Number))) {
      const k = `${pl.length}|${pl.width}|${pl.state}`
      const g = groups.get(k)
      if (g) g.n++
      else groups.set(k, { plate: pl, n: 1 })
    }
    return [...groups.values()].slice(0, 4)
  }, [plates, part.size])
  const used = plates.find((p) => p.id === part.plate_id)
  const thick = Math.round(Math.min(...part.size.map(Number)) * 100) / 100
  const [busy, run] = useBusy()

  const cutFrom = (plateId: string, state: PlateState) =>
    run(async () => {
      if (!who) return
      const before = plates.find((x) => x.id === plateId)?.state
      const res = await setPlateState(plateId, state, who)
      if (res.error) return toast(res.error)
      setPlates((cur) => cur.map((x) => (x.id === plateId ? { ...x, state } : x)))
      const r2 = await updatePart(part.id, { plate_id: plateId })
      if (r2.error) return toast(r2.error)
      onPart(r2.data!)
      toast(state === 'gone' ? 'Plate marked gone' : 'Plate marked partly used', {
        undo: before
          ? async () => {
              await setPlateState(plateId, before, who)
              setPlates((cur) => cur.map((x) => (x.id === plateId ? { ...x, state: before } : x)))
              const r3 = await updatePart(part.id, { plate_id: part.plate_id })
              if (r3.data) onPart(r3.data)
            }
          : undefined,
      })
    })

  return (
    <section className="stock-pick">
      <h3>Plate</h3>
      {used ? (
        <div className="stock-pick__row">
          <span className="num">
            <strong>
              {used.length} × {used.width}
            </strong>{' '}
            <span className="soft">
              {tText(used.thickness)} mm, {STATE_WORD[used.state].toLowerCase()}
            </span>
          </span>
          {used.state !== 'gone' && (
            <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={() => cutFrom(used.id, 'gone')}>
              Used it up
            </button>
          )}
        </div>
      ) : fits.length === 0 ? (
        <p className="soft small num">
          No {tText(thick)} mm plate that fits. <Link to="/stock/plates">See plates</Link>
        </p>
      ) : (
        <>
          <p className="soft small num">{tText(thick)} mm plates that fit, partly used first. Tap what's left after you cut.</p>
          {fits.map(({ plate: pl, n }) => (
            <div key={pl.id} className="stock-pick__row">
              <span className="num">
                <strong>
                  {pl.length} × {pl.width}
                </strong>{' '}
                <span className="soft">
                  {pl.state === 'partly_used' ? 'partly used, may have enough' : `${plateArea(pl).toFixed(2)} m²`}
                  {n > 1 ? ` · ${n} like it` : ''}
                </span>
              </span>
              <span className="stock-pick__btns">
                <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={() => cutFrom(pl.id, 'partly_used')}>
                  Some left
                </button>
                <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={() => cutFrom(pl.id, 'gone')}>
                  Used up
                </button>
              </span>
            </div>
          ))}
        </>
      )}
      {!used && <Working id="plate-fit" title="How plates are picked" lines={plateFitWorking(part.size.map(Number))} />}
    </section>
  )
}

function BarPick({ part, sub, onPart }: { part: Part; sub: Subsystem; onPart: (p: Part) => void }) {
  const { pieces, byId, upsertLocal } = useStore()
  const who = useWho()
  const toast = useToast()
  const [q, setQ] = useState<Query | null | undefined>(undefined)
  useEffect(() => {
    let stop = false
    stockQuery(part).then((r) => !stop && setQ(r))
    return () => {
      stop = true
    }
  }, [part])

  const held = part.piece_id ? byId(part.piece_id) : undefined
  // Round and hex bar has to be the size; a profile can be off a little.
  const matches = useMemo(() => (q ? findMatches(pieces, q, q.kind === 'rect_tube' ? 0.5 : 0.2).slice(0, 4) : []), [pieces, q])
  const [busy, run] = useBusy()
  if (q === undefined || (q === null && !held)) return null
  const need = stockLength(part)

  const reserve = (id: string) =>
    run(async () => {
      if (!who) return
      const res = await reservePiece(id, who, `${sub.number} ${sub.name}`, need, sub.id)
      if (res.error) return toast(res.error)
      upsertLocal(res.piece!)
      const r2 = await updatePart(part.id, { piece_id: id })
      if (r2.error) return toast(r2.error)
      onPart(r2.data!)
      toast(`${id} reserved. It gets cut when the part is done.`)
    })

  return (
    <section className="stock-pick">
      <h3>Stock</h3>
      {held ? (
        <div className="stock-pick__row">
          <span className="num">
            <Link to={`/stock/${held.id}`}>
              <strong>{held.id}</strong>
            </Link>{' '}
            <span className="soft">
              {sizeLabel(held)}, {held.length} mm{held.location ? `, ${held.location}` : ''}
            </span>
          </span>
          <span className="soft small">
            {held.status === 'reserved' ? `Cut ${need} mm when done` : held.status === 'used' ? 'Used' : 'Back in stock'}
          </span>
        </div>
      ) : matches.length === 0 ? (
        <p className="soft small num">
          No stock this size, {need} mm or longer. <Link to="/stock">Search stock</Link>
        </p>
      ) : (
        <>
          <p className="soft small num">
            Needs {need} mm{part.qty > 1 ? ` for all ${part.qty}` : ''}. Least waste first.
          </p>
          {matches.map((m) => (
            <div key={m.piece.id} className="stock-pick__row">
              <span className="num">
                <Link to={`/stock/${m.piece.id}`}>
                  <strong>{m.piece.id}</strong>
                </Link>{' '}
                <span className="soft">
                  {sizeLabel(m.piece)}, {m.piece.length} mm{m.piece.location ? `, ${m.piece.location}` : ''}
                </span>
              </span>
              <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={() => reserve(m.piece.id)}>
                Reserve
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
