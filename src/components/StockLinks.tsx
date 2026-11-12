import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWho } from '../lib/auth'
import { partName, partNo, stockLength, type Part, type Subsystem } from '../lib/mfg'
import { sizeLabel } from '../lib/stock'
import { barQuery, choicesFor, freeAfter, isOpen, linkPart, linksByPiece, reservedFor, unlinkPart, type Choice } from '../lib/stockLinks'
import { useStockQuery } from '../lib/useStockQuery'
import { useStore } from '../lib/store'
import { Sheet, useBusy, useToast } from './ui'

// Picking and checking which stock piece each bar part is cut from. Steamhub links them on upload;
// these let people see what it did and change it.

const otherParts = (c: Choice) => c.shared.map((p) => partNo(p)).join(', ')

function ChoiceRow({ c, label, busy, onPick }: { c: Choice; label: string; busy: boolean; onPick: () => void }) {
  const p = c.piece
  return (
    <div className="stock-pick__row">
      <span className="num">
        <Link to={`/stock/${p.id}`}>
          <strong>{p.id}</strong>
        </Link>{' '}
        <span className="soft">
          {sizeLabel(p)}, {p.length} mm{p.location ? `, ${p.location}` : ''}
          {p.status === 'reserved' && p.reserved_by_name ? ` · ${p.reserved_by_name}` : ''}
          {c.shared.length ? ` · with ${otherParts(c)}` : ''}
          {` · ${c.left} mm left after`}
        </span>
      </span>
      <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={onPick}>
        {label}
      </button>
    </div>
  )
}

/** The pieces a part could come from, reserved for the subsystem first. */
export function StockChoices({ part, sub, subParts, onPart, onDone }: { part: Part; sub: Subsystem; subParts: Part[]; onPart: (p: Part) => void; onDone?: () => void }) {
  const { pieces, upsertLocal } = useStore()
  const who = useWho()
  const toast = useToast()
  const q = useStockQuery(part)
  const [busy, run] = useBusy()
  const lists = useMemo(() => (q ? choicesFor(part, q, pieces, subParts, sub, who?.userId) : null), [q, part, pieces, subParts, sub, who?.userId])
  if (q === undefined) return <p className="soft small">Looking for stock</p>
  if (!q || !lists) return <p className="soft small">This part isn't cut from bar stock.</p>
  const need = stockLength(part)

  const pick = (c: Choice) =>
    run(async () => {
      if (!who) return
      const res = await linkPart(part, c.piece, sub, who)
      if (res.error) return toast(res.error)
      res.pieces?.forEach(upsertLocal)
      onPart(res.part!)
      toast(c.piece.status === 'available' ? `${c.piece.id} reserved for ${partNo(part)}` : `${partNo(part)} comes from ${c.piece.id} now`)
      onDone?.()
    })

  return (
    <>
      <p className="soft small num">
        Needs {need} mm{part.qty > 1 ? ` for all ${part.qty}` : ''}. Least waste first.
      </p>
      {lists.reserved.length > 0 && (
        <>
          <p className="small strong">Reserved for {sub.number} {sub.name}</p>
          {lists.reserved.map((c) => (
            <ChoiceRow key={c.piece.id} c={c} label="Use this" busy={busy} onPick={() => pick(c)} />
          ))}
        </>
      )}
      {lists.available.length > 0 ? (
        <>
          <p className="small strong">In stock</p>
          {lists.available.map((c) => (
            <ChoiceRow key={c.piece.id} c={c} label="Reserve" busy={busy} onPick={() => pick(c)} />
          ))}
        </>
      ) : (
        !lists.reserved.length && (
          <p className="soft small num">
            No stock this size, {need} mm or longer. <Link to="/stock">Search stock</Link>
          </p>
        )
      )}
    </>
  )
}

/** Change or remove a part's stock. */
export function StockSheet({ part, sub, subParts, onPart, onClose }: { part: Part | null; sub: Subsystem; subParts: Part[]; onPart: (p: Part) => void; onClose: () => void }) {
  const { byId, upsertLocal } = useStore()
  const who = useWho()
  const toast = useToast()
  const [busy, run] = useBusy()
  const held = part?.piece_id ? byId(part.piece_id) : undefined
  const unlink = () =>
    run(async () => {
      if (!who || !part) return
      const res = await unlinkPart(part, who, 'changed by hand')
      if (res.error) return toast(res.error)
      res.pieces?.forEach(upsertLocal)
      onPart(res.part!)
      toast(`${partNo(part)} has no stock now. ${held ? `${held.id} stays reserved.` : ''}`)
      onClose()
    })
  return (
    <Sheet open={!!part} onClose={onClose} title={part ? `Stock for ${partNo(part)}` : ''}>
      {part && (
        <div className="form stock-pick stock-pick--sheet">
          <p className="soft">{partName(part)}</p>
          {held && (
            <div className="stock-pick__row">
              <span className="num">
                Now from <strong>{held.id}</strong> <span className="soft">{sizeLabel(held)}, {held.length} mm</span>
              </span>
              <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={unlink}>
                Remove
              </button>
            </div>
          )}
          <StockChoices part={part} sub={sub} subParts={subParts} onPart={onPart} onDone={onClose} />
        </div>
      )}
    </Sheet>
  )
}

/**
 * The subsystem's stock at a glance: each reserved piece with the parts cut from it and what's
 * left, then parts that still need stock. Every link can be changed.
 */
export function SubsystemStock({ sub, parts, put }: { sub: Subsystem; parts: Part[]; put: (p: Part) => void }) {
  const { pieces } = useStore()
  const [editing, setEditing] = useState<string | null>(null)
  const reserved = useMemo(() => pieces.filter((p) => reservedFor(p, sub)), [pieces, sub])
  const links = useMemo(() => linksByPiece(parts), [parts])
  // Shape alone is enough to list them; the sheet checks the tube wall when picking.
  const bar = parts.filter((p) => isOpen(p) && barQuery(p))
  const needing = bar.filter((p) => !p.piece_id)
  const used = reserved.filter((p) => links.has(p.id))
  const idle = reserved.filter((p) => !links.has(p.id))
  if (!bar.length && !reserved.length) return null
  const editPart = parts.find((p) => p.id === editing) ?? null

  return (
    <section className="section">
      <h2 className="section__title">
        Stock <span className="soft num">{reserved.length}</span>
      </h2>
      <p className="soft small sp-hint">Linked on every upload from stock reserved for this subsystem. Check it and change what's wrong.</p>
      <div className="stock-links">
        {used.map((piece) => {
          const on = links.get(piece.id)!
          const left = freeAfter(piece.length, on.map(stockLength))
          return (
            <div key={piece.id} className="stock-pick">
              <p className="num">
                <Link to={`/stock/${piece.id}`}>
                  <strong>{piece.id}</strong>
                </Link>{' '}
                <span className="soft">
                  {sizeLabel(piece)}, {piece.length} mm{piece.reserved_by_name ? ` · ${piece.reserved_by_name}` : ''}
                </span>
              </p>
              {on.map((p) => (
                <div key={p.id} className="stock-pick__row">
                  <Link to={`/manufacturing/p/${p.id}`} className="num">
                    <strong>{partNo(p)}</strong> <span className="soft">{partName(p)}</span>
                  </Link>
                  <span className="stock-pick__btns">
                    <span className="soft small num">Cut {stockLength(p)} mm</span>
                    <button type="button" className="q-btn q-btn--small" onClick={() => setEditing(p.id)}>
                      Change
                    </button>
                  </span>
                </div>
              ))}
              <p className={`small num ${left < -0.05 ? 'error' : 'soft'}`}>{left < -0.05 ? `${-left} mm short. Move a part to another piece.` : `${Math.max(0, left)} mm left after cutting`}</p>
            </div>
          )
        })}
        {needing.length > 0 && (
          <div className="stock-pick">
            <p className="strong">Needs stock</p>
            {needing.map((p) => (
              <div key={p.id} className="stock-pick__row">
                <Link to={`/manufacturing/p/${p.id}`} className="num">
                  <strong>{partNo(p)}</strong> <span className="soft">{partName(p)}</span>
                </Link>
                <span className="stock-pick__btns">
                  <span className="soft small num">{stockLength(p)} mm</span>
                  <button type="button" className="q-btn q-btn--small" onClick={() => setEditing(p.id)}>
                    Pick stock
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        {idle.length > 0 && (
          <p className="soft small num">
            Reserved, no part yet:{' '}
            {idle.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <Link to={`/stock/${p.id}`}>{p.id}</Link> {sizeLabel(p)}, {p.length} mm
              </span>
            ))}
          </p>
        )}
      </div>
      <StockSheet part={editPart} sub={sub} subParts={parts} onPart={put} onClose={() => setEditing(null)} />
    </section>
  )
}
