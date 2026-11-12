import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { partName, type Machine, type Part } from '../lib/mfg'
import { ROOM, type Spot } from '../lib/workshopRoom'
import { firstName, machineView, span, startedAt, STATE_WORD, type MachineView } from '../lib/workshopMap'

// The clay workshop with live machine states (WORKSHOP_MAP.md). Tags are HTML laid over the SVG
// so their text stays sharp and they can hold buttons. Hover opens a tag on a mouse, a tap pins
// it open anywhere.

const SPOT_MACHINE: Partial<Record<Spot, Machine>> = { lathe: 'Lathe', mill: 'Mill' }
const MACHINE_SPOTS = (['lathe', 'mill'] as const).map((spot) => ({ spot, machine: SPOT_MACHINE[spot]! }))
const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

interface Props {
  parts: Part[]
  lastUsed: Partial<Record<Machine, number>>
  now: number
  onDone?: (p: Part) => void
  onShow?: (p: Part) => void
  onStock?: () => void
  /** The saw opens the cut list. */
  onSaw?: () => void
  /** Home's mini map: the back half of the room, live colours, no tags, not interactive. */
  compact?: boolean
}

export function WorkshopMap({ parts, lastUsed, now, onDone, onShow, onStock, onSaw, compact }: Props) {
  // Spots that are links rather than machines.
  const links: { spot: 'stock' | 'saw'; label: string; go?: () => void }[] = [
    { spot: 'stock', label: 'Stock →', go: onStock },
    { spot: 'saw', label: 'Cut list →', go: onSaw },
  ]
  const views = Object.fromEntries(MACHINE_SPOTS.map(({ spot, machine }) => [spot, machineView(machine, parts, now, lastUsed[machine] ?? null)])) as Record<
    'lathe' | 'mill',
    MachineView
  >
  const [hover, setHover] = useState<Spot | null>(null)
  const [pinned, setPinned] = useState<Spot | null>(null)
  const hideT = useRef(0)
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const fid = `wmap-soft-${useId().replace(/:/g, '')}`
  const hot = pinned ?? hover

  const enter = (s: Spot) => {
    if (!fine()) return
    window.clearTimeout(hideT.current)
    setHover(s)
  }
  const leave = () => {
    if (!fine()) return
    window.clearTimeout(hideT.current)
    hideT.current = window.setTimeout(() => setHover(null), 140)
  }
  useEffect(() => () => window.clearTimeout(hideT.current), [])

  // A pinned tag closes on a tap anywhere else.
  useEffect(() => {
    if (!pinned) return
    const off = (e: PointerEvent) => {
      const t = e.target as Element
      if (!t.closest?.('.wmap-tag') && !t.closest?.('.wmap__spot')) setPinned(null)
    }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [pinned])

  // Tags sit on the anchors, which move with the SVG's size.
  const place = () => {
    const w = wrap.current
    const s = svg.current
    if (!w || !s) return
    const m = s.getScreenCTM()
    if (!m) return
    const r = w.getBoundingClientRect()
    const at = (spot: Spot) => {
      const p = s.createSVGPoint()
      ;[p.x, p.y] = ROOM.anchors[spot]
      const q = p.matrixTransform(m)
      return [q.x - r.left, q.y - r.top] as const
    }
    w.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
      const [x, y] = at(el.dataset.anchor as Spot)
      if (el.classList.contains('wmap-lead')) {
        el.style.left = `${x - 0.75}px`
        el.style.top = `${y - 52}px`
        return
      }
      if (el.classList.contains('wmap-stock')) {
        el.style.left = `${Math.min(x, w.clientWidth - el.offsetWidth / 2 - 4)}px`
        el.style.top = `${y - 10}px`
        return
      }
      const left = Math.min(Math.max(4, x - 28), w.clientWidth - el.offsetWidth - 4)
      el.style.left = `${left}px`
      el.style.top = `${y - 52}px`
      const ptr = el.querySelector<HTMLElement>('.wmap-tag__ptr')
      if (ptr) ptr.style.left = `${x - left - 7}px`
    })
  }
  useLayoutEffect(place)
  useEffect(() => {
    const w = wrap.current
    if (!w) return
    const ro = new ResizeObserver(() => place())
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  const spotClass = (spot: Spot) => {
    const st = spot === 'lathe' || spot === 'mill' ? views[spot].state : ''
    return `wmap__spot wmap__${spot} ${st}${hot === spot ? ' is-hot' : ''}`
  }

  const map = (
    <svg ref={svg} onAnimationEnd={compact ? undefined : place} className={`wmap__svg${hot ? ` hot-${hot}` : ''}`} viewBox={compact ? '40 185 780 320' : ROOM.viewBox} aria-hidden={compact || undefined} role={compact ? undefined : 'img'} aria-label={compact ? undefined : 'Workshop map, seen from the entry'}>
      <defs>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <polygon className="floor" points={ROOM.floor} />
      <g filter={`url(#${fid})`}>
        {ROOM.shadows.map((s, i) =>
          s.ellipse ? (
            <ellipse key={i} className="sh" cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[2]} />
          ) : (
            <polygon key={i} className={`sh${s.spot ? ` sh-${s.spot}` : ''}`} points={s.points} />
          ),
        )}
      </g>
      {ROOM.layers.map((layer, i) => {
        const polys = layer.polys.map((p, j) => <polygon key={j} className={`${p.face} ${p.tone}`} points={p.points} />)
        if (!layer.spot || compact) return layer.spot ? <g key={i} className={spotClass(layer.spot)}>{polys}</g> : <g key={i}>{polys}</g>
        const spot = layer.spot
        return (
          <g
            key={i}
            className={spotClass(spot)}
            onPointerEnter={() => enter(spot)}
            onPointerLeave={leave}
            onClick={() => (spot === 'lathe' || spot === 'mill' ? setPinned((p) => (p === spot ? null : spot)) : links.find((l) => l.spot === spot)?.go?.())}
          >
            {polys}
          </g>
        )
      })}
      {!compact && (
        <text className="wmap__entry" x={ROOM.entry[0]} y={ROOM.entry[1]} textAnchor="middle">
          Entry
        </text>
      )}
    </svg>
  )

  if (compact) return <div className="wmap wmap--mini">{map}</div>

  return (
    <div className="wmap" ref={wrap}>
      {map}
      {MACHINE_SPOTS.map(({ spot, machine }) => {
        const v = views[spot]
        const open = hot === spot
        return (
          <MachineTag key={spot} spot={spot} machine={machine} view={v} open={open} now={now} onEnter={() => enter(spot)} onLeave={leave} onToggle={() => setPinned((p) => (p === spot ? null : spot))} onDone={onDone} onShow={onShow} />
        )
      })}
      {MACHINE_SPOTS.map(({ spot }) => (
        <i key={spot} className="wmap-lead" data-anchor={spot} aria-hidden="true" />
      ))}
      {links.map((l) => (
        <button key={l.spot} type="button" className={`wmap-stock${hot === l.spot ? ' is-hot' : ''}`} data-anchor={l.spot} onClick={l.go} onPointerEnter={() => enter(l.spot)} onPointerLeave={leave}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

function MachineTag(props: {
  spot: Spot
  machine: Machine
  view: MachineView
  open: boolean
  now: number
  onEnter: () => void
  onLeave: () => void
  onToggle: () => void
  onDone?: (p: Part) => void
  onShow?: (p: Part) => void
}) {
  const { spot, machine, view: v, open, now } = props
  const lines: ReactNode[] = []
  const acts: ReactNode[] = []
  if (v.cur) {
    const c = v.cur
    lines.push(
      <p key="part" className="wmap-tag__strong num">
        {c.part_no} · {partName(c)}
      </p>,
      <p key="who" className="num">
        {firstName(c.maker_name)} · started {span(now - startedAt(c))} ago
      </p>,
    )
    if (v.state === 'stale') {
      lines.push(<p key="stale">Still running, or did someone forget Done?</p>)
      acts.push(
        <button key="done" type="button" className="q-btn q-btn--small q-btn--main" onClick={() => props.onDone?.(c)}>
          Mark done
        </button>,
      )
    }
    if (v.urgent.length)
      lines.push(
        <p key="urg">
          <i className="wmap-chip urg" /> Urgent {v.urgent[0].part_no} waiting next
        </p>,
      )
    acts.push(
      <button key="show" type="button" className="q-btn q-btn--small" onClick={() => props.onShow?.(c)}>
        Show in list
      </button>,
    )
  } else {
    if (v.urgent.length)
      lines.push(
        <p key="urg" className="wmap-tag__strong num">
          {v.urgent[0].part_no} · {partName(v.urgent[0])} · urgent
        </p>,
      )
    const n = v.waiting.length
    lines.push(
      <p key="wait" className="num">
        {n ? `${n} ${machine} part${n === 1 ? '' : 's'} waiting` : 'Nothing waiting'} · {v.lastUsed ? `last used ${span(now - v.lastUsed)} ago` : 'not used this week'}
      </p>,
    )
    const next = v.urgent[0] ?? v.waiting[0]
    if (next)
      acts.push(
        <button key="show" type="button" className="q-btn q-btn--small" onClick={() => props.onShow?.(next)}>
          Show in list
        </button>,
      )
  }
  return (
    <div className={`wmap-tag${open ? ' is-open' : ''}`} data-anchor={spot} onPointerEnter={props.onEnter} onPointerLeave={props.onLeave}>
      <button type="button" className="wmap-tag__head" aria-expanded={open} onClick={props.onToggle}>
        <b>{machine}</b>
        <span className="wmap-tag__st">
          <i className={`wmap-chip ${v.state}`} />
          {STATE_WORD[v.state]}
          {v.cur && v.urgent.length > 0 && <i className="wmap-chip urg" title="Urgent part waiting" />}
        </span>
      </button>
      <div className="wmap-tag__body">
        <div>
          <div className="wmap-tag__in">
            {lines}
            {acts.length > 0 && <div className="wmap-tag__acts">{acts}</div>}
          </div>
        </div>
      </div>
      <i className="wmap-tag__ptr" />
    </div>
  )
}
