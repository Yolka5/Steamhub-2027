import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { PartStatusTag, UrgentTag } from '../../components/mfg'
import { PartStock } from '../../components/PartStock'
import { PartSteps } from '../../components/PartSteps'
import { cutPiece } from '../../lib/actions'
import { useStore } from '../../lib/store'
import { Copy, LoadError, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { useClaimAs, usePickPerson } from '../../components/WhoPicker'
import { usePlateAsk } from '../../components/PlateAsk'
import { NOTE, useNames, useTaskRules } from '../../lib/useTasks'
import { useNote } from '../../components/NoteSheet'
import { canDraw, partDrawing, saveDxf, savePdf, saveStep, type Ctx } from '../../lib/drawing'
import {
  ago,
  answerAsk,
  askFirst,
  assignParts,
  claimPart,
  doneWithNote,
  partRequests,
  rejectPart,
  giveBack,
  unassignParts,
  logPart,
  MACHINES,
  MATERIALS,
  partName,
  partNo,
  releaseParts,
  setStatus,
  sizeText,
  stockLength,
  updatePart,
  type Machine,
  type Part,
  type PartRequest,
  type PartStatus,
  type Robot,
  type Subsystem,
} from '../../lib/mfg'
import { massText } from '../../lib/onshape'
import { supabase } from '../../lib/supabase'
import { Combo, Select } from '../../components/Select'

// One part: its drawing, one main action for where it stands, the files, and its history.

/**
 * Saves a second after typing stops, and when the field is left, so a note survives swiping back.
 * Someone else's saved note replaces it only while this person isn't typing.
 */
function NotesField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => Promise<unknown> }) {
  const [text, setText] = useState(value)
  const typing = useRef(false)
  const timer = useRef(0)
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
    if (!typing.current) setText(value)
  }, [value])
  const pending = useRef(value)
  const save = useRef(onSave)
  save.current = onSave
  const flush = (v: string) => {
    window.clearTimeout(timer.current)
    typing.current = false
    if (v !== latest.current) {
      latest.current = v
      save.current(v)
    }
  }
  // Leaving the page mid-sentence still saves.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (typing.current && pending.current !== latest.current) save.current(pending.current)
    },
    [],
  )
  return (
    <label className="ctl">
      <span className="ctl__name">Notes</span>
      <textarea
        className="field part__notes"
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          pending.current = v
          typing.current = true
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => flush(v), 1000)
        }}
        onBlur={(e) => flush(e.target.value)}
      />
    </label>
  )
}

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
  rejected: 'Rejected by the workshop',
  asked: 'Asked before starting',
  ask_approved: 'Go ahead',
  ask_denied: 'Make it as drawn',
  keep: 'Kept after a CAD change',
  edited: 'Edited',
  assigned: 'Handed out',
  unassigned: 'Unassigned',
  gave_back: 'Given back',
  moved_top: 'Moved to the top of the list',
}

const REQUEST_WORD: Record<PartRequest['kind'], string> = { ask: 'Asked first', done_note: 'Made differently', reject: 'Rejected' }

export default function PartPage() {
  const { id = '' } = useParams()
  const who = useWho()
  const toast = useToast()
  const [part, setPart] = useState<Part | null>(null)
  const [ctx, setCtx] = useState<(Ctx & { robot: Robot; sub: Subsystem }) | null>(null)
  const [missing, setMissing] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [svg, setSvg] = useState<string | null>(null)
  const [drawErr, setDrawErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const busyRef = useRef(false)
  const [cut, setCut] = useState<{ id: string; leftover: number } | null>(null)
  const { byId, upsertLocal } = useStore()
  const { pick: pickMaker, picker } = useClaimAs()
  const plateAsk = usePlateAsk()
  const { ask, sheet: personSheet } = usePickPerson()
  const rules = useTaskRules()
  const nameOf = useNames()
  const shared = !!useAuth().profile?.shared

  useEffect(() => {
    supabase
      .from('parts')
      .select('*, sub:subsystems(*, robot:robots(*))')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return setLoadErr(error.message)
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

  // Questions and notes. Every pushback action also changes the part, so updated_at reloads them.
  const [requests, setRequests] = useState<PartRequest[]>([])
  useEffect(() => {
    partRequests(id).then(setRequests)
  }, [id, part?.updated_at])
  const { write, sheet: noteSheet } = useNote()
  const [answer, setAnswer] = useState('')

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

  if (!part || !ctx)
    return (
      <div className="page page--narrow">
        {loadErr ? <LoadError /> : missing ? <p className="soft">This part doesn't exist anymore.</p> : <p className="soft">Loading</p>}
      </div>
    )

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

  /** Runs one action at a time; a second tap while saving does nothing. The saved part (or true) when it saved. */
  const act = async (fn: () => Promise<{ data?: Part | Part[]; error?: string }>, msg: string): Promise<Part | boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy('saving')
    try {
      const res = await fn()
      if (res.error) {
        toast(res.error)
        return false
      }
      const row = Array.isArray(res.data) ? res.data[0] : res.data
      if (row) setPart(row)
      toast(msg)
      return row ?? true
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const file = async (what: 'pdf' | 'dxf' | 'step') => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(what)
    try {
      if (what === 'pdf') await savePdf([part], ctx)
      if (what === 'dxf') await saveDxf([part], ctx)
      if (what === 'step') await saveStep(part)
    } catch (e) {
      toast(`Couldn't make the file: ${e instanceof Error ? e.message : e}`)
    }
    busyRef.current = false
    setBusy(null)
  }

  const bought = part.machine === 'Bought'
  const status = async (s: PartStatus, msg: string) => {
    if (!who) return
    const ok = await act(() => setStatus(part, s, who), msg)
    if (!ok) return
    if (typeof ok === 'object') plateAsk.after(ok, setPart)
    // Done with stock reserved for it: cut the piece, leftover goes back to stock under the same ID.
    // Only after the part really saved as done, so a failed or repeated tap never cuts the stock.
    const piece = s === 'done' && part.piece_id ? byId(part.piece_id) : undefined
    if (piece && piece.status === 'reserved') {
      const res = await cutPiece(piece, stockLength(part), who)
      if (res.error) return toast(res.error)
      upsertLocal(res.piece!)
      setCut({ id: piece.id, leftover: res.leftover! })
    }
  }

  // On the shared workshop PC this first asks who's making it.
  const claim = async () => {
    if (!who) return
    // A lead starting someone else's part starts it for them.
    const maker = part.assignee_id && part.assignee_id !== who.userId && !shared ? { id: part.assignee_id, name: nameOf(part.assignee_id) } : await pickMaker(part)
    if (maker === null) return
    act(() => claimPart(part, who, maker), maker ? `Started by ${maker.name.split(' ')[0]}` : 'It’s yours')
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
  } else if (!rules.canWork(part)) {
    // Someone else's part: it's theirs to start and finish (WORKSHOP_TASKS.md).
    main = null
  } else if (part.status === 'todo') {
    main = { label: part.assignee_id && part.assignee_id !== who?.userId && !shared ? `Start for ${nameOf(part.assignee_id).split(' ')[0]}` : "I'll make it", run: claim }
    others.push({ label: 'Done', run: () => status('done', 'Done') })
  } else if (part.status === 'doing') {
    main = { label: 'Done', run: () => status('done', 'Done') }
    if (who && !part.assignee_id && (part.maker_id !== who.userId || shared)) others.push({ label: "I'll make it instead", run: claim })
    others.push({ label: 'Back to to do', run: () => save({ status: 'todo', maker_id: null, maker_name: null }, 'status_todo') })
  } else if (part.status === 'done') {
    others.push({ label: 'Not done yet', run: () => status('doing', 'Back in progress') })
  }
  // Pushback: ask before starting, finish with a note, or (the lead) send it back to design.
  const pushback = async (kind: 'ask' | 'doneNote' | 'reject') => {
    if (!who) return
    const by = kind === 'ask' ? await pickMaker(part) : undefined
    if (by === null) return
    const note = await write(NOTE[kind](part))
    if (!note) return
    if (kind === 'ask') act(() => askFirst(part, note, who, by), 'Question sent. You get a notification with the answer.')
    if (kind === 'doneNote') {
      const ok = await act(() => doneWithNote(part, note, who), 'Done, note sent')
      if (typeof ok === 'object') plateAsk.after(ok, setPart)
    }
    if (kind === 'reject') act(() => rejectPart(part, note, who), 'Sent back to design')
  }
  if (part.released_at && !bought && rules.canWork(part) && part.status === 'todo') others.push({ label: 'Ask first…', run: () => pushback('ask') })
  if (part.released_at && !bought && rules.canWork(part) && part.status === 'doing') others.push({ label: 'Done, with a note…', run: () => pushback('doneNote') })
  if (part.released_at && !bought && rules.canAssign && part.status === 'todo') others.push({ label: 'Reject…', run: () => pushback('reject') })
  // Who answers a question: leads, whoever released it, the subsystem lead.
  const canAnswer = rules.canAssign || (!!who && (who.userId === part.released_by || who.userId === ctx.sub.lead_id))
  const open = requests.filter((r) => r.status === 'open')
  const reply = (r: PartRequest, ok: boolean) =>
    who &&
    act(async () => {
      const res = await answerAsk(part, r, ok, answer.trim(), who)
      if (!res.error) setAnswer('')
      return res
    }, ok ? 'Told them to go ahead' : 'Told them to make it as drawn')

  // Handing out: the lead gives, takes away; the person it's assigned to can give it back.
  const handable = !bought && !!part.released_at && (part.status === 'todo' || part.status === 'doing')
  if (handable && rules.canAssign) {
    others.push({
      label: part.assignee_id ? 'Give to someone else' : 'Give to someone',
      run: async () => {
        if (!who) return
        const person = await ask(`Who makes ${part.part_no}?`)
        if (person) act(() => assignParts([part], person, who), `${part.part_no} is ${person.name.split(' ')[0]}'s`)
      },
    })
    if (part.assignee_id) others.push({ label: 'Unassign', run: () => who && act(() => unassignParts([part], who), 'Unassigned') })
  } else if (handable && rules.canGiveBack(part)) {
    others.push({ label: 'Give back', run: () => who && act(() => giveBack(part, who), 'Given back to the workshop lead') })
  }

  return (
    <div className="page part">
      <PartSteps partId={part.id} subId={part.subsystem_id} />
      <div className="part__head">
        <div className="part__title">
          <h1 className="piece__id num">
            <Copy value={partNo(part)} />
          </h1>
          <p className="part__name">{partName(part)}</p>
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

      {part.rejected_note && !part.released_at && (
        <div className="mfg-note mfg-note--bad">
          <p>
            <strong>Rejected by {nameOf(part.rejected_by) || 'the workshop'}</strong>
            {part.rejected_at ? `, ${ago(part.rejected_at)}` : ''}: {part.rejected_note}
          </p>
          <p className="small">Fix it, then release it again. That clears this note.</p>
        </div>
      )}

      {part.made_differently && part.status === 'done' && (
        <p className="mfg-note mfg-note--warn">
          <strong>Made differently:</strong> {part.made_differently}
        </p>
      )}

      {open.map((r) => (
        <div key={r.id} className="preq">
          <p className="preq__head">
            <span className="tag tag--warn">Waiting for an answer</span>
            <strong>{r.by_name}</strong>
            <span className="soft small">asked {ago(r.created_at)}</span>
          </p>
          <p dir="auto">{r.note}</p>
          {canAnswer ? (
            <div className="preq__form">
              <input className="field" dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Add a note (optional)" aria-label="Your answer" />
              <div className="preq__acts">
                <button type="button" className="q-btn q-btn--main" onClick={() => reply(r, true)}>
                  Go ahead
                </button>
                <button type="button" className="q-btn" onClick={() => reply(r, false)}>
                  No, make it as drawn
                </button>
              </div>
            </div>
          ) : (
            <p className="soft small">Whoever released it, the subsystem lead or the workshop lead answers. You get a notification.</p>
          )}
        </div>
      ))}

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
                  <Combo className="field--inline" label="Material" value={part.material} options={MATERIALS} onCommit={(v) => v !== part.material && save({ material: v, material_by: 'person' }, 'edited', { material: v })} />
                  {part.material_by === 'onshape' && <span className="soft small"> from Onshape</span>}
                </dd>
              </>
            )}
            {part.os_mass_g != null && part.machine !== '3D print' && (
              <>
                <dt>CAD weight</dt>
                <dd>
                  {massText(part.os_mass_g)}
                  {part.qty > 1 && <span className="soft"> each</span>}
                </dd>
              </>
            )}
            {part.os_href && (
              <>
                <dt>Onshape</dt>
                <dd>
                  <a href={part.os_href} target="_blank" rel="noreferrer">
                    Open in Onshape
                  </a>
                </dd>
              </>
            )}
            <dt>Size</dt>
            <dd>{sizeText(part.size)} mm</dd>
            <dt>Quantity</dt>
            <dd>{part.qty}</dd>
            {!bought && part.released_at && part.status !== 'cancelled' && (
              <>
                <dt>Assigned to</dt>
                <dd>{part.assignee_id ? nameOf(part.assignee_id) : <span className="soft">Nobody yet</span>}</dd>
              </>
            )}
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
                  <button
                    type="button"
                    className="q-btn q-btn--small part-urgent"
                    aria-pressed={part.urgent}
                    onClick={() => save({ urgent: !part.urgent }, part.urgent ? 'not_urgent' : 'urgent')}
                  >
                    <Icon name="flag" size={16} /> {part.urgent ? 'Urgent, made first' : 'Make it urgent'}
                  </button>
                </dd>
              </>
            )}
          </dl>

          <NotesField value={part.notes} placeholder={bought ? 'Where it is, what to order' : 'Taps, pockets, anything the drawing misses'} onSave={(notes) => save({ notes })} />
        </div>
      </div>

      {requests.some((r) => r.status !== 'open') && (
        <section className="section">
          <h2 className="section__title">Questions and notes</h2>
          <ul className="preqs">
            {requests
              .filter((r) => r.status !== 'open')
              .map((r) => (
                <li key={r.id} className="preq">
                  <p className="preq__head">
                    <span className={r.kind === 'reject' ? 'tag tag--bad' : 'tag'}>{REQUEST_WORD[r.kind]}</span>
                    <strong>{r.by_name}</strong>
                    <span className="soft small">{ago(r.created_at)}</span>
                  </p>
                  <p dir="auto">{r.note}</p>
                  {r.answered_at && (
                    <p className="preq__answer" dir="auto">
                      <strong>{r.status === 'approved' ? 'Go ahead' : 'Make it as drawn'}</strong>, {r.answered_by_name}
                      {r.answer ? `: ${r.answer}` : ''}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="section">
          <h2 className="section__title">History</h2>
          <ul className="rows">
            {events.map((e) => (
              <li key={e.id} className="row">
                <span>
                  {WORDS[e.action] ?? e.action}
                  {typeof e.details?.to === 'string' ? ` to ${e.details.to}` : ''}
                </span>
                <span className="soft">{typeof e.details?.for === 'string' ? `${e.details.for}, on ${e.by_name}` : e.by_name}</span>
                <span className="soft num row__end">{ago(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {picker}
      {plateAsk.sheet}
      {personSheet}
      {noteSheet}
    </div>
  )
}
