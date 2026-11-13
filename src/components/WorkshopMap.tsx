import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { partName, type Machine, type Part } from '../lib/mfg'
import type { Room, Spot } from '../lib/roomKit'
import { ROOM } from '../lib/workshopRoom'
import { firstName, machineView, span, startedAt, STATE_WORD, type MachineView } from '../lib/workshopMap'

// A clay room with live machine states (WORKSHOP_MAP.md): the workshop, the CNC room, and any
// room drawn with roomKit. Tags are HTML laid over the SVG so their text stays sharp and they can
// hold buttons. Hover opens a tag on a mouse, a tap pins it open anywhere.

const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

// The soft light-to-shadow shading on every face. One set of gradients for the whole page, so
// every map (panel, Home, CNC Home) shares it; the colours come from CSS variables per theme.
const FAMILIES = ['clay', 'run', 'stale', 'urg', 'warm'] as const
function useShading() {
  useEffect(() => {
    if (document.getElementById('wmap-shading')) return
    const stop = (o: number, v: string) => `<stop offset="${o}" style="stop-color:var(${v})"/>`
    const g = (id: string, a: string, b: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stop(0, a)}${stop(1, b)}</linearGradient>`
    const defs = FAMILIES.map((f) => g(`wm-${f}-t`, `--${f}-t-back`, `--${f}-t`) + g(`wm-${f}-s`, `--${f}-s`, `--${f}-s-low`) + g(`wm-${f}-w`, `--${f}-w`, `--${f}-w-low`)).join('')
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    el.id = 'wmap-shading'
    el.setAttribute('aria-hidden', 'true')
    el.setAttribute('width', '0')
    el.setAttribute('height', '0')
    el.style.position = 'absolute'
    el.innerHTML = `<defs>${defs}</defs>`
    document.body.appendChild(el)
  }, [])
}

interface Props {
  room?: Room
  parts: Part[]
  lastUsed: Partial<Record<Machine, number>>
  now: number
  onDone?: (p: Part) => void
  onShow?: (p: Part) => void
  /** Home's mini map: where the machines are, live colours, no tags, not interactive. */
  compact?: boolean
}

export function WorkshopMap({ room = ROOM, parts, lastUsed, now, onDone, onShow, compact }: Props) {
  useShading()
  const navigate = useNavigate()
  const links = room.links.map((l) => ({ ...l, go: () => navigate(l.to) }))
  const views = Object.fromEntries(room.machines.map(({ spot, machine }) => [spot, machineView(machine, parts, now, lastUsed[machine] ?? null)])) as Partial<Record<Spot, MachineView>>
  const isMachine = (s: Spot) => !!views[s]
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
      ;[p.x, p.y] = room.anchors[spot] ?? [0, 0]
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
  // The observer always calls the latest place(), so it never works from an old room or size.
  const placeRef = useRef(place)
  useLayoutEffect(() => {
    placeRef.current = place
  })
  useEffect(() => {
    const w = wrap.current
    if (!w) return
    const ro = new ResizeObserver(() => placeRef.current())
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  const spotClass = (spot: Spot) => {
    const st = views[spot]?.state ?? 'link'
    return `wmap__spot wmap__${spot} ${st}${hot === spot ? ' is-hot' : ''}`
  }

  const map = (
    <svg ref={svg} onAnimationEnd={compact ? undefined : place} className={`wmap__svg${hot ? ` hot-${hot}` : ''}`} viewBox={compact ? room.miniViewBox : room.viewBox} aria-hidden={compact || undefined} role={compact ? undefined : 'img'} aria-label={compact ? undefined : `${room.name} map, seen from the ${room.entryLabel.toLowerCase()}`}>
      <defs>
        <filter id={fid} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <polygon className="floor" points={room.floor} />
      <g filter={`url(#${fid})`}>
        {room.shadows.map((s, i) =>
          s.ellipse ? (
            <ellipse key={i} className="sh" cx={s.ellipse[0]} cy={s.ellipse[1]} rx={s.ellipse[2]} ry={s.ellipse[3]} />
          ) : (
            <polygon key={i} className={`sh${s.spot ? ` sh-${s.spot}` : ''}`} points={s.points} />
          ),
        )}
      </g>
      {room.layers.map((layer, i) => {
        const polys = layer.polys.map((p, j) => <polygon key={j} className={`${p.face} ${p.tone}`} points={p.points} />)
        if (!layer.spot || compact) return layer.spot ? <g key={i} className={spotClass(layer.spot)}>{polys}</g> : <g key={i}>{polys}</g>
        const spot = layer.spot
        return (
          <g
            key={i}
            className={spotClass(spot)}
            onPointerEnter={() => enter(spot)}
            onPointerLeave={leave}
            onClick={() => (isMachine(spot) ? setPinned((p) => (p === spot ? null : spot)) : links.find((l) => l.spot === spot)?.go())}
          >
            {polys}
          </g>
        )
      })}
      {!compact && (
        <text className="wmap__entry" x={room.entry[0]} y={room.entry[1]} textAnchor="middle">
          {room.entryLabel}
        </text>
      )}
    </svg>
  )

  if (compact) return <div className="wmap wmap--mini">{map}</div>

  return (
    <div className="wmap" ref={wrap}>
      {map}
      {room.machines.map(({ spot, machine }) => {
        const v = views[spot]!
        const open = hot === spot
        return (
          <MachineTag key={spot} spot={spot} machine={machine} view={v} open={open} now={now} onEnter={() => enter(spot)} onLeave={leave} onToggle={() => setPinned((p) => (p === spot ? null : spot))} onDone={onDone} onShow={onShow} />
        )
      })}
      {room.machines.map(({ spot }) => (
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
