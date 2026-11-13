import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CNC_ROOM } from '../lib/cncRoom'
import { useTall } from '../lib/usePhone'
import { ROOM } from '../lib/workshopRoom'
import { partName, type Machine, type Part } from '../lib/mfg'
import { useParts, useRobots } from '../lib/useMfg'
import { machineView, MAP_MACHINES, span, startedAt, STATE_WORD } from '../lib/workshopMap'
import { WorkshopMap } from './WorkshopMap'

// Home's "Workshop now" card (WORKSHOP_MAP.md, phase 5): the back of the room where the machines
// are, live, and one line per machine. Tapping it opens the full map on the Workshop page.

/** One line per machine: what it's making and for how long, or how many parts wait for it. */
function MachineList({ machines, live, now }: { machines: Machine[]; live: Part[]; now: number }) {
  return (
    <ul className="wnow__list">
      {machines.map((m) => {
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
  )
}

export function WorkshopNow() {
  const tall = useTall()
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

  // The TV has room for both rooms, side by side, each with its own machines.
  if (tall)
    return (
      <Link to="/manufacturing?map=1" className="wnow wnow--rooms" aria-label="Workshop now. Open the workshop map">
        <h2 className="wnow__title">Workshop now</h2>
        {[ROOM, CNC_ROOM].map((room) => (
          <div key={room.name} className="wnow__room">
            <div className="wnow__map">
              <WorkshopMap room={room} parts={live} lastUsed={{}} now={now} compact />
              <span className="wnow__name">{room.name}</span>
            </div>
            <MachineList machines={room.machines.map((m) => m.machine)} live={live} now={now} />
          </div>
        ))}
      </Link>
    )

  return (
    <Link to="/manufacturing?map=1" className="wnow" aria-label="Workshop now. Open the workshop map">
      <WorkshopMap parts={live} lastUsed={{}} now={now} compact />
      <div>
        <h2 className="wnow__title">Workshop now</h2>
        <MachineList machines={MAP_MACHINES} live={live} now={now} />
      </div>
    </Link>
  )
}

/** The CNC room, live, for the CNC PC's own Home. Its tags open the part page (Done is there). */
export function CncRoomNow({ parts }: { parts: Part[] }) {
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(t)
  }, [])
  const open = (p: Part) => navigate(`/manufacturing/p/${p.id}`)
  return (
    <section className="cnc__section cnc-room">
      <h2 className="section__title">The room</h2>
      <WorkshopMap room={CNC_ROOM} parts={parts} lastUsed={{}} now={now} onShow={open} onDone={open} />
      <Link to="/manufacturing?map=1" className="soft small">
        Both rooms and history →
      </Link>
    </section>
  )
}
