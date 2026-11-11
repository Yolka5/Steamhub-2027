import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { partName } from '../lib/mfg'
import { useParts, useRobots } from '../lib/useMfg'
import { machineView, MAP_MACHINES, span, startedAt, STATE_WORD } from '../lib/workshopMap'
import { WorkshopMap } from './WorkshopMap'

// Home's "Workshop now" card (WORKSHOP_MAP.md, phase 5): the back of the room where the machines
// are, live, and one line per machine. Tapping it opens the full map on the Workshop page.

export function WorkshopNow() {
  const { parts } = useParts({ released: true })
  const { robots, subs } = useRobots()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [])

  const live = useMemo(() => {
    const active = new Set(subs.filter((s) => robots.some((r) => r.id === s.robot_id && !r.archived)).map((s) => s.id))
    return parts.filter((p) => p.machine !== 'Bought' && p.status !== 'cancelled' && active.has(p.subsystem_id))
  }, [parts, robots, subs])

  // Nothing released yet (between seasons): no card.
  if (!live.length) return null

  return (
    <Link to="/manufacturing?map=1" className="wnow" aria-label="Workshop now. Open the workshop map">
      <WorkshopMap parts={live} lastUsed={{}} now={now} compact />
      <div>
        <h2 className="wnow__title">Workshop now</h2>
        <ul className="wnow__list">
          {MAP_MACHINES.map((m) => {
            const v = machineView(m, live, now, null)
            const text = v.cur
              ? `${v.cur.part_no} ${partName(v.cur)} · ${span(now - startedAt(v.cur))}`
              : v.urgent.length
                ? `Idle, urgent ${v.urgent[0].part_no} waiting`
                : v.waiting.length
                  ? `Idle · ${v.waiting.length} waiting`
                  : 'Idle'
            return (
              <li key={m}>
                <i className={`wmap-chip ${v.state}`} aria-hidden="true" />
                <b>{m}</b>
                <span className="soft num">{v.state === 'stale' ? `${STATE_WORD.stale} ${text}` : text}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </Link>
  )
}
