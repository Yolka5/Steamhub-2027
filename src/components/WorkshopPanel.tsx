import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { partName, type Machine, type Part } from '../lib/mfg'
import { countedMs, firstName, lastUsedBy, loadRuns, machineView, MAP_MACHINES, span, startedAt, STATE_WORD, weekStart, type Run } from '../lib/workshopMap'
import { CNC_ROOM } from '../lib/cncRoom'
import { ROOM } from '../lib/workshopRoom'
import { WorkshopMap } from './WorkshopMap'

// The map slides in over the Workshop list (WORKSHOP_MAP.md, phase 3). It always opens closed.
// Ways out: Close, Escape, a click on the dimmed list, or dragging the grabber or header right.

// The 3D printers' room isn't drawn: it stays a card.
const OTHER_ROOM: Machine[] = ['3D print']

interface Props {
  open: boolean
  onClose: () => void
  parts: Part[]
  onDone: (p: Part) => void
  onShow: (p: Part) => void
}

export function WorkshopPanel({ open, onClose, parts, onDone, onShow }: Props) {
  const [tab, setTab] = useState<'now' | 'history'>('now')
  const [entering, setEntering] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [runsErr, setRunsErr] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const panel = useRef<HTMLElement>(null)
  const dragFrom = useRef<{ x: number; moved: boolean; grab: boolean } | null>(null)

  // Fresh numbers every time it opens, and when a part on a machine starts or finishes.
  const stamp = parts
    .filter((p) => p.status === 'doing' || p.status === 'done')
    .map((p) => p.id + p.status)
    .join()
  useEffect(() => {
    if (!open) return
    let live = true
    loadRuns().then((r) => {
      if (!live) return
      setRuns(r.runs)
      setRunsErr(r.error ?? null)
    })
    return () => {
      live = false
    }
  }, [open, stamp])

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    setTab('now')
    setEntering(true)
    const t = window.setTimeout(() => setEntering(false), 1300)
    const tick = window.setInterval(() => setNow(Date.now()), 30000)
    panel.current?.focus({ preventScroll: true })
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose()
    }
    document.addEventListener('keydown', esc)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(tick)
      document.removeEventListener('keydown', esc)
    }
  }, [open, onClose])

  // A start with no finish only counts while its part really is still In progress; older gaps in
  // the log (a status changed some other way) would otherwise run on to the 3 h cap.
  const doing = useMemo(() => new Set(parts.filter((p) => p.status === 'doing').map((p) => p.id)), [parts])
  const clean = useMemo(() => runs && runs.filter((r) => r.end !== null || doing.has(r.partId)), [runs, doing])
  const lastUsed = useMemo(() => lastUsedBy(clean ?? []), [clean])

  const down = (e: React.PointerEvent, grab: boolean) => {
    if (!grab && (e.target as Element).closest('button, .picks')) return
    dragFrom.current = { x: e.clientX, moved: false, grab }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // No live pointer (a synthetic event): dragging just won't follow outside the element.
    }
  }
  const move = (e: React.PointerEvent) => {
    const d = dragFrom.current
    if (!d) return
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 4) d.moved = true
    if (d.moved) setDrag(Math.max(0, dx))
  }
  const up = (e: React.PointerEvent) => {
    const d = dragFrom.current
    if (!d) return
    dragFrom.current = null
    const dx = e.clientX - d.x
    setDrag(null)
    if ((d.moved && dx > 90) || (!d.moved && d.grab)) onClose()
  }
  const dragProps = (grab: boolean) => ({ onPointerDown: (e: React.PointerEvent) => down(e, grab), onPointerMove: move, onPointerUp: up, onPointerCancel: up })

  const width = panel.current?.offsetWidth ?? 1
  // On body, so the page's own transforms can't pin it inside the content column.
  return createPortal(
    <>
      <div className={`wpanel-scrim${open ? ' is-on' : ''}`} style={drag !== null ? { opacity: Math.max(0, 1 - drag / width) } : undefined} onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        className={`wpanel${open ? ' is-open' : ''}${entering ? ' is-entering' : ''}${drag !== null ? ' is-dragging' : ''}`}
        style={drag !== null ? { transform: `translateX(${drag}px)` } : undefined}
        aria-label="Workshop map"
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
      >
        <button type="button" className="wpanel__grab" aria-label="Close the map" {...dragProps(true)} />
        <div className="wpanel__head" {...dragProps(false)}>
          <h2 className="wpanel__title">Workshop</h2>
          <div className="picks picks--seg" role="tablist" aria-label="View">
            {(['now', 'history'] as const).map((t) => (
              <button key={t} type="button" role="tab" className="pick" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === 'now' ? 'Now' : 'History'}
              </button>
            ))}
          </div>
          <button type="button" className="q-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="wpanel__body">
          {open && tab === 'now' && (
            <section className="wpanel__now">
              {/* Both rooms at the same scale: each takes width in proportion to its drawing. */}
              <div className="wpanel__maps">
                <div className="wpanel__room-map wpanel__room-map--workshop">
                  <h3 className="wpanel__label">Workshop</h3>
                  <div className="wpanel__scroll">
                    <WorkshopMap room={ROOM} parts={parts} lastUsed={lastUsed} now={now} onDone={onDone} onShow={onShow} />
                  </div>
                </div>
                <div className="wpanel__room-map wpanel__room-map--cnc">
                  <h3 className="wpanel__label">CNC room</h3>
                  <WorkshopMap room={CNC_ROOM} parts={parts} lastUsed={lastUsed} now={now} onDone={onDone} onShow={onShow} />
                </div>
              </div>
              <div className="wpanel__rooms">
                {OTHER_ROOM.map((m) => (
                  <RoomCard key={m} machine={m} parts={parts} now={now} lastUsed={lastUsed[m] ?? null} onShow={onShow} />
                ))}
                <p className="soft small">Point at a machine for details, or tap it on a phone.</p>
              </div>
            </section>
          )}
          {open && tab === 'history' && <History runs={clean} error={runsErr} now={now} />}
        </div>
      </aside>
    </>,
    document.body,
  )
}

function RoomCard({ machine, parts, now, lastUsed, onShow }: { machine: Machine; parts: Part[]; now: number; lastUsed: number | null; onShow: (p: Part) => void }) {
  const v = machineView(machine, parts, now, lastUsed)
  const tag = v.state === 'run' ? 'tag--ok' : v.state === 'idle' ? '' : 'tag--warn'
  const target = v.cur ?? v.urgent[0] ?? v.waiting[0]
  return (
    <button type="button" className="wpanel__room" onClick={() => target && onShow(target)}>
      <b>{machine}</b>
      <span className="soft small num">
        {v.cur ? (
          <>
            {v.cur.part_no} · {partName(v.cur)}
            <br />
            {firstName(v.cur.maker_name)} · {span(now - startedAt(v.cur))}
          </>
        ) : v.urgent.length ? (
          `Urgent ${v.urgent[0].part_no} waiting`
        ) : (
          `${v.waiting.length} part${v.waiting.length === 1 ? '' : 's'} waiting`
        )}
      </span>
      <span className={`tag ${tag}`}>{STATE_WORD[v.state]}</span>
    </button>
  )
}

function History({ runs, error, now }: { runs: Run[] | null; error: string | null; now: number }) {
  if (error && !runs?.length) return <p className="soft">Couldn't load the history: {error}</p>
  if (!runs) return <p className="soft">Loading</p>
  const week = weekStart(now)
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const dayStart = day.getTime()
  const today = runs.filter((r) => Math.min(r.end ?? now, r.start + 3 * 3600000) >= dayStart)
  // The axis runs over the team's usual hours and stretches to cover anything earlier or later.
  const at = (h: number) => dayStart + h * 3600000
  const from = Math.min(at(13), ...today.map((r) => Math.max(r.start, dayStart)))
  const to = Math.max(at(20), now + 30 * 60000)
  const pct = (t: number) => `${(((Math.min(Math.max(t, from), to) - from) / (to - from)) * 100).toFixed(2)}%`
  const hh = (t: number) => new Date(t).toTimeString().slice(0, 5)
  const ticks: number[] = []
  for (let h = Math.ceil((from - dayStart) / 3600000); dayStart + h * 3600000 <= to; h++) ticks.push(dayStart + h * 3600000)

  const thisWeek = runs.filter((r) => (r.end ?? now) >= week)
  const doneThisWeek = (r: Run) => r.done && r.end !== null && r.end >= week
  const stats = MAP_MACHINES.map((m) => {
    const mine = thisWeek.filter((r) => r.machine === m)
    // The counted part of a run is its first 3 h at most, and only what falls inside this week.
    const ms = mine.reduce((a, r) => a + Math.max(0, r.start + countedMs(r, now) - Math.max(r.start, week)), 0)
    return { m, hours: ms / 3600000, done: mine.filter(doneThisWeek).length }
  })
  const maxH = Math.max(0.5, ...stats.map((s) => s.hours))

  return (
    <section className="wpanel__history">
      <h3 className="section__title">Today</h3>
      <div className="whist-tl">
        {MAP_MACHINES.map((m) => (
          <div key={m} className="whist-tl__row">
            <span className="whist-tl__label">{m}</span>
            <div className="whist-tl__track">
              {today
                .filter((r) => r.machine === m)
                .map((r, i) => {
                  const end = Math.min(r.end ?? now, r.start + 3 * 3600000)
                  return (
                    <i
                      key={i}
                      className={`whist-tl__bar${r.end ? '' : ' is-live'}`}
                      style={{ left: pct(r.start), width: `calc(${pct(end)} - ${pct(r.start)})` }}
                      title={`${r.partNo} · ${firstName(r.who)} · ${hh(r.start)}–${r.end ? hh(r.end) : 'now'}`}
                    />
                  )
                })}
            </div>
          </div>
        ))}
        <div className="whist-tl__ticks num" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ left: pct(t) }}>
              {hh(t)}
            </span>
          ))}
        </div>
      </div>
      {!today.length && <p className="soft small">No machine time yet today.</p>}

      <h3 className="section__title">Hours this week</h3>
      <div className="whist-hours num">
        {stats.map((s) => (
          <div key={s.m} className="whist-hours__row">
            <span>{s.m}</span>
            <i style={{ width: `${(s.hours / maxH) * 100}%` }} />
            <span className="whist-hours__v">{s.hours.toFixed(1)} h</span>
          </div>
        ))}
      </div>

      <h3 className="section__title">Parts done this week</h3>
      <div className="whist-done">
        {stats.map((s) => (
          <div key={s.m} className="whist-done__stat">
            <b className="num">{s.done}</b>
            <span className="soft small">{s.m}</span>
          </div>
        ))}
      </div>
      <p className="soft small">Weeks start Sunday. A part left running counts at most 3 h.</p>
    </section>
  )
}
