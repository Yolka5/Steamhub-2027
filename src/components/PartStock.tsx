import { useMemo, useState } from 'react'
import { Working } from './Working'
import { plateFitWorking } from '../lib/workings'
import { Link } from 'react-router-dom'
import { useWho } from '../lib/auth'
import { partNo, stockLength, updatePart, type Part, type Subsystem } from '../lib/mfg'
import { plateArea, platesFor, setPlateState, STATE_WORD, tText, usePlates, type Plate, type PlateState } from '../lib/plates'
import { sizeLabel } from '../lib/stock'
import { isOpen } from '../lib/stockLinks'
import { useStore } from '../lib/store'
import { useParts } from '../lib/useMfg'
import { useStockQuery } from '../lib/useStockQuery'
import { StockChoices, StockSheet } from './StockLinks'
import { useBusy, useToast } from './ui'

// Where a part's material comes from: plates that fit for CNC parts, tube, rod or hex stock for
// the rest. Bar stock links are in StockLinks: a piece can feed several parts, Done cuts each one's length.

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
  const { byId } = useStore()
  const { parts: subParts } = useParts({ subsystemId: sub.id })
  const q = useStockQuery(part)
  const [changing, setChanging] = useState(false)
  const held = part.piece_id ? byId(part.piece_id) : undefined
  // Done parts had their stock cut already; the history says from which piece.
  if (!isOpen(part) || q === undefined || (q === null && !held)) return null
  const need = stockLength(part)
  const shared = subParts.filter((p) => p.id !== part.id && isOpen(p) && p.piece_id && p.piece_id === part.piece_id)
  const ok = held && held.status === 'reserved' && (!held.subsystem_id || held.subsystem_id === sub.id) && held.length >= need - 0.05

  return (
    <section className="stock-pick">
      <h3>Stock</h3>
      {part.piece_id ? (
        <>
          <div className="stock-pick__row">
            <span className="num">
              <Link to={`/stock/${part.piece_id}`}>
                <strong>{part.piece_id}</strong>
              </Link>{' '}
              {held && (
                <span className="soft">
                  {sizeLabel(held)}, {held.length} mm{held.location ? `, ${held.location}` : ''}
                </span>
              )}
            </span>
            <button type="button" className="q-btn q-btn--small" onClick={() => setChanging(true)}>
              Change
            </button>
          </div>
          {ok ? (
            <p className="soft small num">
              Cuts {need} mm when it's done{shared.length ? `. Also cut from it: ${shared.map(partNo).join(', ')}` : ''}.
            </p>
          ) : (
            <p className="mfg-note mfg-note--warn small">
              {!held || held.status !== 'reserved' ? `${part.piece_id} isn't reserved anymore` : held.length < need - 0.05 ? `${part.piece_id} is ${held.length} mm and this needs ${need} mm` : `${part.piece_id} is reserved for another subsystem now`}. Nothing gets cut from it. Pick another piece.
            </p>
          )}
        </>
      ) : (
        <StockChoices part={part} sub={sub} subParts={subParts} onPart={onPart} />
      )}
      <StockSheet part={changing ? part : null} sub={sub} subParts={subParts} onPart={onPart} onClose={() => setChanging(false)} />
    </section>
  )
}
