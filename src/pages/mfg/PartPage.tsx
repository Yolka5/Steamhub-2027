import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { PartStatusTag, UrgentTag } from '../../components/mfg'
import { PartStock } from '../../components/PartStock'
import { cutPiece } from '../../lib/actions'
import { useStore } from '../../lib/store'
import { Copy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { canDraw, partDrawing, saveDxf, savePdf, saveStep, type Ctx } from '../../lib/drawing'
import {
  ago,
  claimPart,
  logPart,
  MACHINES,
  MATERIALS,
  partNo,
  releaseParts,
  setStatus,
  sizeText,
  stockLength,
  updatePart,
  type Machine,
  type Part,
  type PartStatus,
  type Robot,
  type Subsystem,
} from '../../lib/mfg'
import { supabase } from '../../lib/supabase'
import { Combo, Select } from '../../components/Select'

// One part: its drawing, one main action for where it stands, the files, and its history.

interface Event {
  id: number
  action: string
  by_name: string | null
  at: string
  details: Record<string, unknown> | null
}

const WORDS: Record<string, string> = {
  added: 'Added from STEP',
  changed: 'Changed in CAD',
  cancelled: 'Cancelled',
  released: 'Released to the workshop',
  claimed: 'Started making it',
  status_todo: 'Back to to do',
  status_doing: 'In progress',
  status_done: 'Done',
  status_missing: 'Marked missing',
  urgent: 'Marked urgent',
  not_urgent: 'No longer urgent',
  remake: 'Remake after a CAD change',
  keep: 'Kept after a CAD change',
  edited: 'Edited',
}

export default function PartPage() {
  const { id = '' } = useParams()
  const who = useWho()
  const toast = useToast()
  const [part, setPart] = useState<Part | null>(null)
  const [ctx, setCtx] = useState<(Ctx & { robot: Robot; sub: Subsystem }) | null>(null)
  const [missing, setMissing] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [svg, setSvg] = useState<string | null>(null)
  const [drawErr, setDrawErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [cut, setCut] = useState<{ id: string; leftover: number } | null>(null)
  const { byId, upsertLocal } = useStore()

  useEffect(() => {
    supabase
      .from('parts')
      .select('*, sub:subsystems(*, robot:robots(*))')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setMissing(true)
        const { sub, ...p } = data as Part & { sub: Subsystem & { robot: Robot } }
        const { robot, ...s } = sub
        setPart(p)
        setCtx({ robot, sub: s })
      })
    const channel = supabase
      .channel(`part-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parts', filter: `id=eq.${id}` }, (msg) => setPart((cur) => (cur ? { ...cur, ...(msg.new as Part) } : cur)))
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  useEffect(() => {
    supabase
      .from('part_events')
      .select('id, action, by_name, at, details')
      .eq('part_id', id)
      .order('at', { ascending: false })
      .limit(30)
      .then(({ data }) => setEvents((data as Event[]) ?? []))
  }, [id, part?.updated_at])

  // The drawing redraws when anything on its title block changes.
  const drawKey = part && ctx ? [part.geometry_path, part.name, part.material, part.qty, part.maker_name, part.machine, part.drawn_by].join('|') : ''
  useEffect(() => {
    if (!part || !ctx || !canDraw(part)) return
    let stop = false
    setDrawErr(null)
    partDrawing(part, ctx)
      .then((d) => !stop && setSvg(d.svg))
      .catch((e) => !stop && setDrawErr(e instanceof Error ? e.message : String(e)))
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])

  if (!part || !ctx) return <div className="page page--narrow">{missing ? <p className="soft">This part doesn't exist anymore.</p> : <p className="soft">Loading</p>}</div>

  const save = async (patch: Partial<Part>, action?: string, details?: Record<string, unknown>) => {
    const res = await updatePart(part.id, patch)
    if (res.error) {
      toast(res.error)
      return false
    }
    setPart(res.data!)
    if (action && who) await logPart(part.id, action, who, details)
    return true
  }

  const act = async (fn: () => Promise<{ data?: Part | Part[]; error?: string }>, msg: string) => {
    if (busy) return
    setBusy('saving')
    const res = await fn()
    setBusy(null)
    if (res.error) return toast(res.error)
    const row = Array.isArray(res.data) ? res.data[0] : res.data
    if (row) setPart(row)
    toast(msg)
  }

  const file = async (what: 'pdf' | 'dxf' | 'step') => {
    if (busy) return
    setBusy(what)
    try {
      if (what === 'pdf') await savePdf([part], ctx)
      if (what === 'dxf') await saveDxf([part], ctx)
      if (what === 'step') await saveStep(part)
    } catch (e) {
      toast(`Couldn't make the file: ${e instanceof Error ? e.message : e}`)
    }
    setBusy(null)
  }

  const bought = part.machine === 'Bought'
  const status = async (s: PartStatus, msg: string) => {
    if (!who) return
    await act(() => setStatus(part, s, who), msg)
    // Done with stock reserved for it: cut the piece, leftover goes back to stock under the same ID.
    const piece = s === 'done' && part.piece_id ? byId(part.piece_id) : undefined
    if (piece && piece.status === 'reserved') {
      const res = await cutPiece(piece, stockLength(part), who)
      if (res.error) return toast(res.error)
      upsertLocal(res.piece!)
      setCut({ id: piece.id, leftover: res.leftover! })
    }
  }

  let main: { label: string; run: () => void } | null = null
  const others: { label: string; run: () => void }[] = []
  if (part.status === 'cancelled') main = null
  else if (bought) {
    if (part.status !== 'done') main = { label: 'Got it', run: () => status('done', 'Marked as collected') }
    if (part.status !== 'missing') others.push({ label: 'Missing', run: () => status('missing', 'Marked missing') })
    if (part.status !== 'todo') others.push({ label: 'Still needed', run: () => status('todo', 'Back to needed') })
  } else if (!part.released_at) {
    main = { label: 'Release to the workshop', run: () => who && act(() => releaseParts([part], who), 'Released') }
  } else if (part.status === 'todo') {
    main = { label: "I'll make it", run: () => who && act(() => claimPart(part, who), 'It’s yours') }
    others.push({ label: 'Done', run: () => status('done', 'Done') })
  } else if (part.status === 'doing') {
    main = { label: 'Done', run: () => status('done', 'Done') }
    if (who && part.maker_id !== who.userId) others.push({ label: "I'll make it instead", run: () => act(() => claimPart(part, who), 'It’s yours') })
    others.push({ label: 'Back to to do', run: () => save({ status: 'todo', maker_id: null, maker_name: null }, 'status_todo') })
  } else if (part.status === 'done') {
    others.push({ label: 'Not done yet', run: () => status('doing', 'Back in progress') })
  }

  return (
    <div className="page part">
      <div className="part__head">
        <div className="part__title">
          <h1 className="piece__id num">
            <Copy value={partNo(part)} />
          </h1>
          <p className="part__name">{part.name}</p>
          <p className="part__tags">
            <PartStatusTag part={part} />
            {part.urgent && part.status !== 'done' && <UrgentTag />}
            <span className="tag">{part.machine}</span>
            <span className="soft num">×{part.qty}</span>
          </p>
        </div>
        <div className="piece__actions part__actions">
          {main && (
            <button type="button" className="q-btn q-btn--main q-btn--big" onClick={main.run}>
              {main.label}
            </button>
          )}
          {others.map((o) => (
            <button key={o.label} type="button" className="q-btn" onClick={o.run}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {cut && (
        <div className="written">
          <span className="soft">
            {cut.leftover > 0 ? `${cut.id} is back in stock. Write on the piece:` : `${cut.id} is used up.`}
          </span>
          {cut.leftover > 0 && (
            <span className="written__id num">
              {cut.id} · {cut.leftover} mm
            </span>
          )}
        </div>
      )}

      {part.status === 'cancelled' && <p className="mfg-note mfg-note--bad">Cancelled: this part is no longer in the CAD. If it comes back in a new STEP, it returns here with the same number.</p>}

      {part.changed && (
        <div className="mfg-note mfg-note--warn">
          <p>
            <strong>Changed in CAD after it was released.</strong> Check the drawing before making it. The subsystem lead decides whether made ones need remaking.
          </p>
          <div className="page__actions">
            <button type="button" className="q-btn" onClick={() => save({ changed: false, status: part.status === 'done' ? 'todo' : part.status }, 'remake')}>
              Remake
            </button>
            <button type="button" className="q-btn" onClick={() => save({ changed: false }, 'keep')}>
              Keep as is
            </button>
          </div>
        </div>
      )}

      <div className="part__grid">
        <div className="part__drawing">
          {canDraw(part) ? (
            svg ? (
              <div className="paper" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="paper paper--empty soft">{drawErr ? `Couldn't draw this part: ${drawErr}` : 'Drawing'}</div>
            )
          ) : (
            <div className="paper paper--empty soft">
              {bought ? 'Bought part, no drawing.' : part.bad ? 'The geometry of this part could not be read from the STEP.' : 'No geometry saved for this part. Drop the STEP again on the subsystem page.'}
            </div>
          )}
          <div className="page__actions">
            {canDraw(part) && (
              <button type="button" className="q-btn" onClick={() => file('pdf')}>
                <Icon name="download" size={18} /> {busy === 'pdf' ? 'Drawing' : 'Drawing PDF'}
              </button>
            )}
            {canDraw(part) && part.machine === 'CNC' && (
              <button type="button" className="q-btn" onClick={() => file('dxf')}>
                <Icon name="download" size={18} /> DXF
              </button>
            )}
            {part.step_path && (
              <button type="button" className="q-btn" onClick={() => file('step')}>
                <Icon name="download" size={18} /> STEP for printing
              </button>
            )}
          </div>
        </div>

        <div className="part__side">
          <PartStock part={part} sub={ctx.sub} onPart={setPart} />
          <dl className="facts num">
            <dt>Subsystem</dt>
            <dd>
              <Link to={`/manufacturing/s/${ctx.sub.id}`}>
                {ctx.sub.number} {ctx.sub.name}
              </Link>
              <span className="soft"> · {ctx.robot.name}</span>
            </dd>
            <dt>Machine</dt>
            <dd>
              <Select className="field--inline" label="Machine" value={part.machine} onChange={(v) => save({ machine: v as Machine }, 'edited', { machine: v })} options={MACHINES.map((m) => ({ value: m, label: m }))} />
            </dd>
            {!bought && (
              <>
                <dt>Material</dt>
                <dd>
                  <Combo className="field--inline" label="Material" value={part.material} options={MATERIALS} onCommit={(v) => save({ material: v }, 'edited', { material: v })} />
                </dd>
              </>
            )}
            <dt>Size</dt>
            <dd>{sizeText(part.size)} mm</dd>
            <dt>Quantity</dt>
            <dd>{part.qty}</dd>
            {part.maker_name && (
              <>
                <dt>{bought ? 'Collected by' : 'Made by'}</dt>
                <dd>{part.maker_name}</dd>
              </>
            )}
            {part.drawn_by && (
              <>
                <dt>Uploaded by</dt>
                <dd>{part.drawn_by}</dd>
              </>
            )}
            {part.released_at && (
              <>
                <dt>Released</dt>
                <dd>{ago(part.released_at)}</dd>
              </>
            )}
            {part.status !== 'cancelled' && !bought && (
              <>
                <dt>Urgent</dt>
                <dd>
                  <label className="check">
                    <input type="checkbox" checked={part.urgent} onChange={(e) => save({ urgent: e.target.checked }, e.target.checked ? 'urgent' : 'not_urgent')} />
                    {part.urgent ? 'Yes, make it first' : 'No'}
                  </label>
                </dd>
              </>
            )}
          </dl>

          <label className="ctl">
            <span className="ctl__name">Notes</span>
            <textarea
              className="field part__notes"
              rows={3}
              defaultValue={part.notes}
              key={part.notes}
              placeholder={bought ? 'Where it is, what to order' : 'Taps, pockets, anything the drawing misses'}
              onBlur={(e) => e.target.value !== part.notes && save({ notes: e.target.value })}
            />
          </label>
        </div>
      </div>

      {events.length > 0 && (
        <section className="section">
          <h2 className="section__title">History</h2>
          <ul className="rows">
            {events.map((e) => (
              <li key={e.id} className="row">
                <span>{WORDS[e.action] ?? e.action}</span>
                <span className="soft">{e.by_name}</span>
                <span className="soft num row__end">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
