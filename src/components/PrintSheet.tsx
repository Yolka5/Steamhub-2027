import { useState } from 'react'
import { canDraw, saveDxf, savePdf, type Ctx } from '../lib/drawing'
import { partName, partNo, type Part } from '../lib/mfg'
import { Sheet, useToast } from './ui'

// Pick a subsystem's parts and get one PDF of their drawings for the USB stick, or the DXFs for
// the CNC. One subsystem at a time, since the workshop never mixes them.

export function PrintSheet({ open, parts, ctx, onClose }: { open: boolean; parts: Part[]; ctx: Ctx | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Drawings">
      {ctx && <PrintBody parts={parts} ctx={ctx} onClose={onClose} />}
    </Sheet>
  )
}

function PrintBody({ parts, ctx, onClose }: { parts: Part[]; ctx: Ctx; onClose: () => void }) {
  const toast = useToast()
  const drawable = parts.filter(canDraw)
  const [picked, setPicked] = useState(() => new Set(drawable.filter((p) => p.status === 'todo' || p.status === 'doing').map((p) => p.id)))
  const [busy, setBusy] = useState<string | null>(null)
  const chosen = drawable.filter((p) => picked.has(p.id))
  const cnc = chosen.filter((p) => p.machine === 'CNC')

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const run = async (what: 'pdf' | 'dxf') => {
    if (busy) return
    if (!chosen.length) return toast('Pick at least one part first')
    if (what === 'dxf' && !cnc.length) return toast('None of the picked parts are CNC')
    try {
      if (what === 'pdf') {
        setBusy('Drawing 0 of ' + chosen.length)
        await savePdf(chosen, ctx, (d, t) => setBusy(`Drawing ${d} of ${t}`))
      } else {
        setBusy('Writing DXFs')
        await saveDxf(cnc, ctx)
      }
      onClose()
    } catch (e) {
      toast(`Couldn't make the file: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  if (!drawable.length) return <p className="soft">No drawings here yet. Drop the subsystem's STEP file on its page first.</p>

  return (
    <div className="form">
      <p className="soft small">
        {ctx.sub.number} {ctx.sub.name}, {ctx.robot.name}. Open parts are picked. One PDF, a page per part, ready to copy to the USB stick.
      </p>
      <div className="print-pick">
        <label className="check">
          <input
            type="checkbox"
            checked={chosen.length === drawable.length}
            onChange={(e) => setPicked(new Set(e.target.checked ? drawable.map((p) => p.id) : []))}
          />
          All {drawable.length}
        </label>
        {drawable.map((p) => (
          <label key={p.id} className="check print-pick__row">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="num strong">{partNo(p)}</span>
            <span className="print-pick__name">{partName(p)}</span>
            <span className="soft small num">
              {p.machine} ×{p.qty}
            </span>
          </label>
        ))}
      </div>
      {busy && <p className="soft num">{busy}</p>}
      <div className="page__actions">
        <button type="button" className="q-btn q-btn--main" onClick={() => run('pdf')}>
          Download PDF ({chosen.length})
        </button>
        {cnc.length > 0 && (
          <button type="button" className="q-btn" onClick={() => run('dxf')}>
            DXF for CNC ({cnc.length})
          </button>
        )}
      </div>
    </div>
  )
}
