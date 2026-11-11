import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MfgTabs, PartRow } from '../../components/mfg'
import { PrintSheet } from '../../components/PrintSheet'
import { useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { claimPart, MADE, partName, setStatus, type Machine, type Part, type Robot, type Subsystem } from '../../lib/mfg'
import { useParts, useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'

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
  const { parts, loading, put } = useParts({ released: true })
  const who = useWho()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

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
      setBusy(p.id)
      const res = start ? await claimPart(p, who) : await setStatus(p, 'done', who)
      setBusy(null)
      if (res.error) return toast(res.error)
      if (res.data) put(res.data)
      toast(start ? `${p.part_no} is yours` : `${p.part_no} ${partName(p)} done`)
    }
    return (
      <button type="button" className="q-btn q-btn--small mfg-row__act" disabled={busy === p.id} onClick={run}>
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

  const activeSubs = subs.filter((s) => robots.some((r) => r.id === s.robot_id && !r.archived))
  const multiRobot = new Set(activeSubs.map((s) => s.robot_id)).size > 1
  const robotName = (s: Subsystem) => robots.find((r) => r.id === s.robot_id)?.name ?? ''
  const total = groups.reduce((n, g) => n + g.open, 0)

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Manufacturing</h1>
        <MfgTabs />
      </div>

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

      {loading || loadingR ? (
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
                    <li key={p.id}>
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
    </div>
  )
}
