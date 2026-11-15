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
    // Tags stay inside what's on screen, not just inside the map: on a phone the map is wider than
    // the panel that crops it, and the Mill's open tag ended up half off the right edge.
    let lo = Math.max(0, -r.left)
    let hi = Math.min(w.clientWidth, window.innerWidth - r.left)
    let top = -r.top
    for (let a = w.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const c = a.getBoundingClientRect()
      if (cs.overflowX !== 'visible') {
        lo = Math.max(lo, c.left - r.left)
        hi = Math.min(hi, c.right - r.left)
      }
      if (cs.overflowY !== 'visible') top = Math.max(top, c.top - r.top)
    }
    const fit = (x: number, width: number) => Math.min(Math.max(lo + 4, x), hi - width - 4)
    const at = (spot: Spot) => {
      const p = s.createSVGPoint()
      ;[p.x, p.y] = room.anchors[spot] ?? [0, 0]
      const q = p.matrixTransform(m)
      return [q.x - r.left, q.y - r.top] as const
    }
    // Tags first, so each lead line knows whether its tag flipped below the machine.
    const below = new Set<string>()
    const els = [...w.querySelectorAll<HTMLElement>('[data-anchor]')]
    els.sort((a, b) => Number(a.classList.contains('wmap-lead')) - Number(b.classList.contains('wmap-lead')))
    els.forEach((el) => {
      const spot = el.dataset.anchor as Spot
      const [x, y] = at(spot)
      if (el.classList.contains('wmap-lead')) {
        el.style.left = `${x - 0.75}px`
        el.style.top = `${below.has(spot) ? y : y - 52}px`
        return
      }
      if (el.classList.contains('wmap-stock')) {
        el.style.left = `${fit(x - el.offsetWidth / 2, el.offsetWidth) + el.offsetWidth / 2}px`
        el.style.top = `${y - 10}px`
        return
      }
      const left = fit(x - 28, el.offsetWidth)
      el.style.left = `${left}px`
      // Its full height once open, not mid-animation: the details unfold over 160 ms.
      const body = el.querySelector<HTMLElement>('.wmap-tag__body')
      const inner = body?.firstElementChild as HTMLElement | null
      const height = el.offsetHeight - (body?.offsetHeight ?? 0) + (el.classList.contains('is-open') ? (inner?.scrollHeight ?? 0) : 0)
      // No room above the machine (it's near the top of what's on screen): open below it instead.
      const flip = y - 52 - height < top + 4
      el.classList.toggle('is-below', flip)
      if (flip) below.add(spot)
      el.style.top = `${flip ? y + 52 : y - 52}px`
      const ptr = el.querySelector<HTMLElement>('.wmap-tag__ptr')
      // The pointer still points at the machine, but never past the tag's rounded corners.
      if (ptr) ptr.style.left = `${Math.min(Math.max(6, x - left - 7), el.offsetWidth - 20)}px`
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
    // Phones swipe the map sideways; the tags follow what's on screen while it scrolls.
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => placeRef.current())
    }
    const scrollers: HTMLElement[] = []
    for (let a = w.parentElement; a; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) {
        a.addEventListener('scroll', onScroll, { passive: true })
        scrollers.push(a)
      }
    }
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
      scrollers.forEach((a) => a.removeEventListener('scroll', onScroll))
    }
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
