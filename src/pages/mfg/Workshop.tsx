import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { MfgTabs, PartRow } from '../../components/mfg'
import { PrintSheet } from '../../components/PrintSheet'
import { LoadError, useToast } from '../../components/ui'
import { usePhone } from '../../lib/usePhone'
import { useWho } from '../../lib/auth'
import { claimPart, MADE, partName, setStatus, type Machine, type Part, type Robot, type Subsystem } from '../../lib/mfg'
import { useParts, useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'
import { useClaimAs } from '../../components/WhoPicker'
import { WorkshopPanel } from '../../components/WorkshopPanel'
import { machineView } from '../../lib/workshopMap'

// What the workshop makes: every released part of every active robot, one list for everyone.
// Grouped by subsystem, urgent first. Filters live in the URL so a link shows the same view.

interface Group {
  sub: Subsystem
  robot: Robot
  parts: Part[]
  open: number
  urgent: number
}

const rank = (p: Part) => (p.urgent && p.status !== 'done' ? 0 : 1) * 10 + (p.status === 'doing' ? 0 : p.status === 'todo' ? 1 : 2)

export default function Workshop() {
  const [params, setParams] = useSearchParams()
  const machine = (params.get('m') as Machine | null) ?? null
  const subId = params.get('s')
  const showDone = params.get('done') === '1'
  const { parts, loading, error, reload, put } = useParts({ released: true })
  const who = useWho()
  const toast = useToast()
  const phone = usePhone()
  const { pick: pickMaker, picker } = useClaimAs()
  // Rows that are saving, or that just started and are still settling (see `cool`).
  const [held, setHeld] = useState<Set<string>>(new Set())
  const running = useRef(new Set<string>())
  const hold = (id: string, on: boolean) =>
    setHeld((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  /** Start and Done right on the row, like the Monday board: one tap, no page to open. */
  const quick = (p: Part) => {
    if (!who || p.status === 'done') return undefined
    // Done on a part with reserved stock also cuts the piece, which the part page shows.
    if (p.status === 'doing' && p.piece_id) {
      return (
        <Link to={`/manufacturing/p/${p.id}`} className="q-btn q-btn--small mfg-row__act">
          Done
        </Link>
      )
    }
    const start = p.status === 'todo'
    const run = async () => {
      if (running.current.has(p.id)) return
      running.current.add(p.id)
      // On the shared workshop PC, Start first asks who's making it.
      const maker = start ? await pickMaker(p) : undefined
      if (maker === null) {
        running.current.delete(p.id)
        return
      }
      hold(p.id, true)
      const res = start ? await claimPart(p, who, maker) : await setStatus(p, 'done', who)
      running.current.delete(p.id)
      if (res.error) {
        hold(p.id, false)
        return toast(res.error)
      }
      if (res.data) put(res.data)
      if (start) {
        toast(maker ? `${p.part_no} started by ${maker.name.split(' ')[0]}` : `${p.part_no} is yours`)
        // Start turns into Done in the same spot, so the button rests a moment first: a double
        // tap on Start used to finish the part and drop it off the list.
        window.setTimeout(() => hold(p.id, false), 1200)
      } else {
        hold(p.id, false)
        toast(`${p.part_no} ${partName(p)} done`, {
          undo: async () => {
            const back = await setStatus(res.data!, 'doing', who)
            if (back.error) return toast(back.error)
            if (back.data) put(back.data)
          },
        })
      }
    }
    return (
      <button type="button" className="q-btn q-btn--small mfg-row__act" disabled={held.has(p.id)} onClick={run}>
        {start ? 'Start' : 'Done'}
      </button>
    )
  }
  const { robots, subs, loading: loadingR } = useRobots()
  const [printing, setPrinting] = useState<Group | null>(null)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const groups = useMemo<Group[]>(() => {
    const robotById = new Map(robots.filter((r) => !r.archived).map((r) => [r.id, r]))
    const subById = new Map(subs.filter((s) => robotById.has(s.robot_id)).map((s) => [s.id, s]))
    const by = new Map<string, Part[]>()
    for (const p of parts) {
      if (p.machine === 'Bought' || p.status === 'cancelled') continue
      if (!subById.has(p.subsystem_id)) continue
      if (machine && p.machine !== machine) continue
      if (subId && p.subsystem_id !== subId) continue
      if (!showDone && p.status === 'done') continue
      by.set(p.subsystem_id, [...(by.get(p.subsystem_id) ?? []), p])
    }
    return [...by.entries()]
      .map(([id, list]) => {
        const sub = subById.get(id)!
        return {
          sub,
          robot: robotById.get(sub.robot_id)!,
          parts: list.sort((a, b) => rank(a) - rank(b) || a.part_no - b.part_no),
          open: list.filter((p) => p.status !== 'done').length,
          urgent: list.filter((p) => p.urgent && p.status !== 'done').length,
        }
      })
      .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.robot.name.localeCompare(b.robot.name) || a.sub.number - b.sub.number)
  }, [parts, robots, subs, machine, subId, showDone])

  // What the map shows: every released, made-in-house part of the active robots, whatever the
  // list's filters are.
  const mapParts = useMemo(() => {
    const live = new Set(subs.filter((s) => robots.some((r) => r.id === s.robot_id && !r.archived)).map((s) => s.id))
    return parts.filter((p) => p.machine !== 'Bought' && p.status !== 'cancelled' && live.has(p.subsystem_id))
  }, [parts, robots, subs])

  // The map always starts closed; Home's card links here with ?map=1 to open it once.
  const [mapOpen, setMapOpen] = useState(false)
  const handleRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (params.get('map') !== '1') return
    setMapOpen(true)
    const next = new URLSearchParams(params)
    next.delete('map')
    setParams(next, { replace: true })
  }, [params, setParams])
  const closeMap = useCallback(() => {
    setMapOpen(false)
    handleRef.current?.focus({ preventScroll: true })
  }, [])
  const navigate = useNavigate()

  /** Mark done from the map's "Forgot Done?" tag: the same Done as the row, with Undo. */
  const doneFromMap = async (p: Part) => {
    if (!who) return
    // Done with stock reserved also cuts the piece, which the part page does.
    if (p.piece_id) return navigate(`/manufacturing/p/${p.id}`)
    const res = await setStatus(p, 'done', who)
    if (res.error) return toast(res.error)
    if (res.data) put(res.data)
    toast(`${p.part_no} ${partName(p)} done`, {
      undo: async () => {
        const back = await setStatus(res.data!, 'doing', who)
        if (back.error) return toast(back.error)
        if (back.data) put(back.data)
      },
    })
  }

  /** "Show in list": close the map, clear the filters that would hide it, flash its row. */
  const showInList = (p: Part) => {
    setMapOpen(false)
    const next = new URLSearchParams(params)
    next.delete('m')
    next.delete('s')
    if (p.status === 'done') next.set('done', '1')
    setParams(next, { replace: true })
    window.setTimeout(() => {
      const row = document.getElementById(`part-${p.id}`)
      if (!row) return
      row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      row.classList.add('is-flash')
      window.setTimeout(() => row.classList.remove('is-flash'), 1300)
    }, 320)
  }

  // The edge tab: a click opens the map, and so does pulling it left.
  const pull = useRef<{ x: number } | null>(null)
  const dots = MADE.filter((m) => m === 'Lathe' || m === 'Mill').map((m) => ({ m, state: machineView(m, mapParts, Date.now(), null).state }))

  const activeSubs = subs.filter((s) => robots.some((r) => r.id === s.robot_id && !r.archived))
  const multiRobot = new Set(activeSubs.map((s) => s.robot_id)).size > 1
  const robotName = (s: Subsystem) => robots.find((r) => r.id === s.robot_id)?.name ?? ''
  const total = groups.reduce((n, g) => n + g.open, 0)

  const filters = (
    <div className="mfg-filters">
      <div className="picks picks--seg" role="radiogroup" aria-label="Machine">
        {[null, ...MADE].map((m) => (
          <button key={m ?? 'all'} type="button" role="radio" className="pick" aria-checked={machine === m} onClick={() => set('m', m)}>
            {m ?? 'All'}
          </button>
        ))}
      </div>
      <div className="mfg-filters__sub">
        <Select
          className="field--inline"
          label="Subsystem"
          value={subId ?? ''}
          onChange={(v) => set('s', v || null)}
          options={[{ value: '', label: 'All subsystems' }, ...activeSubs.map((s) => ({ value: s.id, label: `${s.number} ${s.name}${multiRobot ? ` (${robotName(s)})` : ''}` }))]}
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={showDone} onChange={(e) => set('done', e.target.checked ? '1' : null)} />
        Show done
      </label>
    </div>
  )

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Manufacturing</h1>
        <div className="mfg-head-end">
          {phone && (
            <button type="button" className="q-btn" onClick={() => setMapOpen(true)}>
              Map
            </button>
          )}
          <MfgTabs />
        </div>
      </div>

      {phone ? (
        // Phones fold the filters into one line, so the first parts show on the first screen.
        <details className="finder__more mfg-filters-fold">
          <summary>
            Filters{' '}
            <span className="soft">
              {[machine ?? 'All machines', subId ? (activeSubs.find((s) => s.id === subId)?.name ?? 'One subsystem') : 'All subsystems', showDone ? 'with done' : ''].filter(Boolean).join(' · ')}
            </span>
          </summary>
          {filters}
        </details>
      ) : (
        filters
      )}

      {error && !parts.length ? (
        <LoadError onRetry={reload} />
      ) : loading || loadingR ? (
        <p className="soft">Loading</p>
      ) : groups.length === 0 ? (
        <div className="mfg-empty">
          <p className="empty">{parts.length ? 'Nothing open for this filter.' : 'Nothing to make yet.'}</p>
          <p className="soft">Parts show up here once someone releases them from their subsystem page.</p>
          <Link to="/manufacturing/robots" className="q-btn">
            Robots and subsystems
          </Link>
        </div>
      ) : (
        <>
          <p className="soft small num">
            {total} open {total === 1 ? 'part' : 'parts'}
            {machine ? ` on ${machine}` : ''}
          </p>
          {groups.map((g) => (
            <section key={g.sub.id} className="mfg-group">
              <div className="mfg-group__head">
                <Link to={`/manufacturing/s/${g.sub.id}`} className="mfg-group__title">
                  <h2 className="section__title">
                    <span className="num">{g.sub.number}</span> {g.sub.name}
                  </h2>
                </Link>
                <span className="soft small">
                  {multiRobot ? `${g.robot.name} · ` : ''}
                  {g.open} open
                </span>
                <button type="button" className="q-btn q-btn--small mfg-group__print" onClick={() => setPrinting(g)}>
                  <Icon name="print" size={18} /> Drawings
                </button>
              </div>
              <ul className="rows">
                {g.parts.map((p) => {
                  // The button says the status (Start: to do, Done: in progress), so the tag isn't repeated.
                  const action = quick(p)
                  return (
                    <li key={p.id} id={`part-${p.id}`} className="mfg-row-wrap">
                      <PartRow part={p} action={action} showStatus={!action} />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <PrintSheet
        open={!!printing}
        parts={printing ? parts.filter((p) => p.subsystem_id === printing.sub.id && p.machine !== 'Bought' && p.status !== 'cancelled') : []}
        ctx={printing ? { robot: printing.robot, sub: printing.sub } : null}
        onClose={() => setPrinting(null)}
      />
      {picker}

      {!phone &&
        createPortal(
        <button
          ref={handleRef}
          type="button"
          className="wmap-handle"
          aria-label="Open the workshop map"
          onPointerDown={(e) => {
            pull.current = { x: e.clientX }
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // No live pointer: a plain click still opens it.
            }
          }}
          onPointerUp={(e) => {
            const from = pull.current
            pull.current = null
            // A tap, or a pull of any length to the left, opens it.
            if (from && from.x - e.clientX > -10) setMapOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setMapOpen(true)
            }
          }}
        >
          <span className="wmap-handle__dots" aria-hidden="true">
            {dots.map((d) => (
              <i key={d.m} className={`wmap-chip ${d.state}`} title={d.m} />
            ))}
          </span>
          <span className="wmap-handle__word">Map</span>
        </button>,
        document.body,
      )}
      <WorkshopPanel open={mapOpen} onClose={closeMap} parts={mapParts} onDone={doneFromMap} onShow={showInList} />
    </div>
  )
}
