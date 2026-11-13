import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useCalSeason } from '../components/cal'
import { Icon } from '../components/Icon'
import { useToast } from '../components/ui'
import { WorkshopMap } from '../components/WorkshopMap'
import { useAuth } from '../lib/auth'
import { addDays, daysBetween, todayIso, toDate } from '../lib/cal'
import { CNC_ROOM } from '../lib/cncRoom'
import { MADE, type Machine, type Part } from '../lib/mfg'
import type { Room } from '../lib/roomKit'
import { dayBounds, first, loadDay, loadRecaps, recapText, scheduleOf, statusWord, subOfGroup, useSteamlabAccess, type DayData, type FeedItem, type Recap, type Schedule } from '../lib/steamlab'
import { useCal } from '../lib/useCal'
import { useParts, usePeople, useRobots } from '../lib/useMfg'
import { usePhone } from '../lib/usePhone'
import { STALE_MS } from '../lib/workshopMap'
import { ROOM } from '../lib/workshopRoom'

// SteamLab (STEAMLAB.md): a bird's-eye view for mentors and leads. Are we on schedule, where is
// everyone, what happened, and Claude's recap of each day. Any day can be replayed on the
// timeline under the rooms; today's live end is now.

const MIN = 60_000
const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5)
const dur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN))
  const h = Math.floor(m / 60)
  const r = m % 60
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`
}
const initials = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

function dayWords(day: string, today: string) {
  const d = toDate(day)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const gap = daysBetween(day, today)
  return { title: gap === 0 ? 'Today' : gap === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long' }), date }
}

export default function SteamLab() {
  const { userId } = useAuth()
  const access = useSteamlabAccess(userId)
  if (access === false) return <Navigate to="/" replace />
  if (access === null) return <div className="page page--wide steamlab" aria-busy="true" />
  return <Lab />
}

function Lab() {
  const { userId } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const day = params.get('day') && params.get('day')! <= today ? params.get('day')! : today
  const isToday = day === today

  const { robots, subs } = useRobots()
  const { parts } = useParts({})
  const season = useCalSeason()
  const cal = useCal(season)
  const { nameOf } = usePeople()

  const active = useMemo(() => robots.filter((r) => !r.archived), [robots])
  const activeSubs = useMemo(
    () =>
      subs
        .filter((s) => active.some((r) => r.id === s.robot_id))
        .sort((a, b) => a.robot_id.localeCompare(b.robot_id) || a.number - b.number),
    [subs, active],
  )
  const nameOfSub = useCallback((id: string | null) => subs.find((s) => s.id === id)?.name ?? '', [subs])
  const manyRobots = new Set(activeSubs.map((s) => s.robot_id)).size > 1

  // ----- the day -----
  const [data, setData] = useState<DayData | null>(null)
  const [recaps, setRecaps] = useState<Recap[]>([])
  const ctxReady = robots.length > 0 && !cal.loading
  useEffect(() => {
    if (!ctxReady) return
    let live = true
    const load = () =>
      loadDay(day, { subs, robots, groups: cal.groups, nameOfSub }).then((d) => {
        if (live) setData(d)
      })
    load()
    loadRecaps(day).then((r) => live && setRecaps(r))
    // Today keeps coming in.
    const t = isToday ? window.setInterval(load, 60_000) : 0
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [day, isToday, ctxReady, subs, robots, cal.groups, nameOfSub])

  // ----- the clock and the playhead -----
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const [from, to] = dayBounds(day)
  const liveEnd = isToday ? now : to - 1
  const [playing, setPlaying] = useState(false)
  const [ph, setPh] = useState<number>(liveEnd)
  const phRef = useRef(ph)
  phRef.current = ph
  const [following, setFollowing] = useState(true) // on today, the playhead stays on now
  useEffect(() => {
    setPh(isToday ? Date.now() : to - 1)
    setFollowing(true)
    setPlaying(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])
  useEffect(() => {
    if (following && isToday) setPh(now)
  }, [now, following, isToday])
  const T = Math.min(ph, liveEnd)
  const live = isToday && following

  const runs = useMemo(() => data?.runs ?? [], [data])
  const [range0, range1] = useMemo(() => {
    let a = from + 13 * 60 * MIN
    let b = from + 21 * 60 * MIN
    for (const r of runs) {
      a = Math.min(a, Math.max(from, Math.floor(r.start / (60 * MIN)) * 60 * MIN))
      b = Math.max(b, Math.min(to, Math.ceil((r.end ?? liveEnd) / (60 * MIN)) * 60 * MIN))
    }
    return [a, b]
  }, [runs, from, to, liveEnd])
  const [pops, setPops] = useState<Pop[]>([])
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      const p = phRef.current
      const start = p >= liveEnd - 2 * MIN ? range0 + 20 * MIN : p
      const next = Math.min(liveEnd, start + 3 * MIN)
      phRef.current = next
      setPh(next)
      // One pop per machine per step: "✓ 3021", or "✓ 4 parts" when several finish together.
      const done = runs.filter((r) => r.done && r.end && r.end > start && r.end <= next)
      const byMachine = new Map<Machine, number[]>()
      for (const r of done) byMachine.set(r.machine, [...(byMachine.get(r.machine) ?? []), r.partNo])
      if (byMachine.size) {
        const born = Date.now()
        setPops((x) => [...x.filter((o) => !byMachine.has(o.m)), ...[...byMachine].map(([m, nos]) => ({ id: `${m}-${next}`, m, text: nos.length > 1 ? `${nos.length} parts` : String(nos[0]), born }))])
      }
      if (next >= liveEnd) {
        setPlaying(false)
        if (isToday) setFollowing(true)
      }
    }, 70)
    return () => window.clearInterval(t)
  }, [playing, liveEnd, range0, runs, isToday])
  useEffect(() => {
    if (!pops.length) return
    const t = window.setTimeout(() => setPops((x) => x.filter((p) => Date.now() - p.born < 1400)), 250)
    return () => window.clearTimeout(t)
  }, [pops])
  const play = () => {
    setFollowing(false)
    if (!playing && ph >= liveEnd - 2 * MIN) setPh(range0 + 20 * MIN)
    setPlaying((p) => !p)
  }
  const seek = (t: number) => {
    setPlaying(false)
    const v = Math.min(liveEnd, Math.max(range0, t))
    setPh(v)
    setFollowing(isToday && v >= liveEnd - MIN)
  }

  // ----- what the rooms show at T -----
  const [hotSub, setHotSub] = useState<string | null>(null)
  const partsById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const liveParts = useMemo(() => parts.filter((p) => p.released_at && p.machine !== 'Bought' && p.status !== 'cancelled' && activeSubs.some((s) => s.id === p.subsystem_id)), [parts, activeSubs])
  const mapParts = useMemo<Part[]>(() => {
    if (live) return hotSub ? liveParts.filter((p) => p.subsystem_id === hotSub) : liveParts
    const out: Part[] = []
    for (const r of runs) {
      if (r.start > T || (r.end ?? Infinity) <= T || (hotSub && r.subsystemId !== hotSub)) continue
      const p = partsById.get(r.partId)
      if (p) out.push({ ...p, status: 'doing', started_at: new Date(r.start).toISOString(), maker_name: r.who })
    }
    return out
  }, [live, hotSub, liveParts, runs, T, partsById])
  const lastUsed = useMemo(() => {
    const out: Partial<Record<Machine, number>> = {}
    for (const r of runs) if (r.end && r.end <= T && r.end > (out[r.machine] ?? 0)) out[r.machine] = r.end
    return out
  }, [runs, T])
  const onMachine = useMemo(() => {
    const out: Partial<Record<Machine, Part>> = {}
    for (const p of mapParts) if (p.status === 'doing' && (!out[p.machine] || (p.started_at ?? '') > (out[p.machine]!.started_at ?? ''))) out[p.machine] = p
    return out
  }, [mapParts])
  const openPart = (p: Part) => navigate(`/manufacturing/p/${p.id}`)

  // ----- schedule -----
  const schedule = useMemo<Schedule[]>(
    () =>
      activeSubs.map((s) => scheduleOf(s, active.find((r) => r.id === s.robot_id)!, parts, cal.groups, cal.phases, robots, subs, day)),
    [activeSubs, active, parts, cal.groups, cal.phases, robots, subs, day],
  )
  const myLead = activeSubs.find((s) => s.lead_id === userId)?.id ?? null

  // ----- feed and numbers -----
  const feed = useMemo(() => (data?.feed ?? []).filter((f) => f.t <= T && (!hotSub || f.sub === hotSub)), [data, T, hotSub])
  const updateGroups = cal.groups.filter((g) => subOfGroup(g, subs, robots))
  const stats = useMemo(() => {
    const doneN = runs.filter((r) => r.done && r.end && r.end >= from && r.end <= T).length
    const ms = runs.reduce((a, r) => a + Math.max(0, Math.min(Math.min(r.end ?? T, T), r.start + STALE_MS) - Math.max(r.start, from)), 0)
    const tests = (data?.feed ?? []).filter((f) => f.kind === 'test' && f.t <= T).length
    const sent = (data?.feed ?? []).filter((f) => f.kind === 'update' && f.t <= T).length
    return { doneN, hours: ms / 3_600_000, tests, sent }
  }, [runs, data, T, from])

  // ----- recap tab -----
  const scopeParam = params.get('scope')
  const [tab, setTab] = useState<string>('team')
  useEffect(() => {
    const has = (s: string | null) => !!s && recaps.some((r) => r.scope === s)
    setTab(has(scopeParam) ? scopeParam! : has(myLead) ? myLead! : 'team')
  }, [recaps, scopeParam, myLead])
  const recapRef = useRef<HTMLElement>(null)

  const setDay = (d: string) => {
    const next = new URLSearchParams(params)
    if (d === today) next.delete('day')
    else next.set('day', d)
    next.delete('scope')
    setParams(next, { replace: true })
  }
  const words = dayWords(day, today)
  const robotNames = [...new Set(active.filter((r) => !r.offseason).map((r) => r.name))].join(' · ')

  const [room, setRoom] = useState<'w' | 'c'>('w')
  const pickSub = (id: string) => {
    if (recaps.some((r) => r.scope === id)) setTab(id)
    if (phone) recapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page page--wide steamlab">
      <div className="sl-head">
        <div>
          <h1 className="page__title">SteamLab</h1>
          {robotNames && <p className="soft sl-head__sub">{robotNames}</p>}
        </div>
        <div className="sl-day">
          <button type="button" className="q-btn sl-day__btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
            <Icon name="back" />
          </button>
          <div className="sl-day__label">
            <b>{words.title}</b>
            <span className="soft small">
              {isToday && <i className="sl-dot" aria-hidden="true" />}
              {words.date}
              {isToday ? ' · live' : ''}
            </span>
          </div>
          <button type="button" className="q-btn sl-day__btn" aria-label="Next day" onClick={() => (isToday ? toast('Today is the latest day') : setDay(addDays(day, 1)))}>
            <Icon name="next" />
          </button>
        </div>
      </div>

      <div className="sl-grid">
        <section className="sl-sched" aria-label="Schedule per subsystem">
          {schedule.map((s) => (
            <button
              key={s.sub.id}
              type="button"
              className={`sl-tile${hotSub === s.sub.id ? ' is-hot' : ''}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHotSub(s.sub.id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHotSub(null)}
              onClick={() => pickSub(s.sub.id)}
            >
              <span className="sl-tile__top">
                <b>{s.sub.name}</b>
                <span className={`tag${s.status === 'behind' ? ' tag--warn' : ''}`}>{statusWord(s)}</span>
              </span>
              <span className="sl-bar" title={s.plan != null ? `${s.pct}% made · plan ${s.plan}%` : `${s.pct}% made`}>
                <i style={{ width: `${s.pct}%` }} />
                {s.plan != null && <em style={{ left: `${s.plan}%` }} />}
              </span>
              <span className="soft small num">
                {s.made}/{s.total} parts{s.plan != null ? ` · plan ${s.plan}%` : ''} · {s.sub.id === myLead ? 'your subsystem' : first(nameOf(s.sub.lead_id) ?? 'No lead')}
                {manyRobots ? ` · ${s.robot.name}` : ''}
              </span>
            </button>
          ))}
          {!schedule.length && <p className="soft">No active robot yet. Its subsystems show here once it's set up in Manufacturing.</p>}
        </section>

        <section className="sl-card sl-scene">
          <div className="sl-scene__head">
            <h2 className="section__title">Where everyone is</h2>
            {phone && (
              <div className="picks picks--seg" role="radiogroup" aria-label="Room">
                <button type="button" role="radio" className="pick" aria-checked={room === 'w'} onClick={() => setRoom('w')}>
                  Workshop
                </button>
                <button type="button" role="radio" className="pick" aria-checked={room === 'c'} onClick={() => setRoom('c')}>
                  CNC room
                </button>
              </div>
            )}
            <span className={`sl-mode${live ? '' : ' is-replay'}`}>
              {live && <i className="sl-dot" aria-hidden="true" />}
              {live ? `Live · ${hhmm(now)}` : `Replay · ${isToday ? 'today' : words.date} ${hhmm(T)}`}
            </span>
            {!live && (
              <button type="button" className="q-btn q-btn--small" onClick={() => (isToday ? seek(now) : setDay(today))}>
                Back to live
              </button>
            )}
          </div>
          <div className="sl-rooms">
            {(!phone || room === 'w') && (
              <figure className="sl-room">
                {!phone && <figcaption className="soft small">Workshop</figcaption>}
                <MapAt room={ROOM} parts={mapParts} lastUsed={lastUsed} now={T} onMachine={onMachine} pops={pops} onOpen={openPart} />
              </figure>
            )}
            {(!phone || room === 'c') && (
              <figure className="sl-room">
                {!phone && <figcaption className="soft small">CNC room</figcaption>}
                <MapAt room={CNC_ROOM} parts={mapParts} lastUsed={lastUsed} now={T} onMachine={onMachine} pops={pops} onOpen={openPart} />
                <PrinterLine part={onMachine['3D print']} last={lastUsed['3D print']} at={T} />
              </figure>
            )}
          </div>
          <Timeline runs={runs} from={range0} to={range1} liveEnd={liveEnd} isToday={isToday} at={T} playing={playing} hotSub={hotSub} phone={phone} onPlay={play} onSeek={seek} live={live} />
        </section>

        <aside className="sl-rail">
          <section className="sl-card sl-recap" ref={recapRef}>
            <RecapCard
              day={day}
              isToday={isToday}
              recaps={recaps}
              tab={tab}
              setTab={setTab}
              nameOfSub={nameOfSub}
              subsInOrder={activeSubs.map((s) => s.id)}
              soFar={{ parts: stats.doneN, hours: stats.hours }}
              onYesterday={() => setDay(addDays(today, -1))}
              onCopy={(r) => {
                const title = `${dayWords(day, today).date}${r.scope === 'team' ? '' : `, ${nameOfSub(r.scope)}`}`
                navigator.clipboard?.writeText(recapText(r, title)).then(
                  () => toast('Recap copied'),
                  () => toast("Couldn't copy. Select the text instead."),
                )
              }}
            />
          </section>
          <section className="sl-card sl-feed">
            <h2 className="section__title">{live ? 'What happened today' : `What happened by ${hhmm(T)}`}</h2>
            <div className="sl-stats">
              <div>
                <b className="num">{stats.doneN}</b>
                <span>parts done</span>
              </div>
              <div>
                <b className="num">{stats.hours.toFixed(1)} h</b>
                <span>on machines</span>
              </div>
              <div>
                <b className="num">{stats.tests}</b>
                <span>tests</span>
              </div>
              <div>
                <b className="num">
                  {stats.sent}/{updateGroups.length}
                </b>
                <span>updates</span>
              </div>
            </div>
            <Feed items={feed} isToday={isToday} error={data?.error} loading={!data} />
          </section>
        </aside>
      </div>
    </div>
  )
}

// ---------- Rooms ----------

interface Pop {
  id: string
  m: Machine
  text: string
  born: number
}

function MapAt(props: { room: Room; parts: Part[]; lastUsed: Partial<Record<Machine, number>>; now: number; onMachine: Partial<Record<Machine, Part>>; pops: Pop[]; onOpen: (p: Part) => void }) {
  const { room } = props
  const [vx, vy, vw, vh] = room.viewBox.split(/\s+/).map(Number)
  const at = (m: Machine): CSSProperties | null => {
    const spot = room.machines.find((x) => x.machine === m)?.spot
    const a = spot && room.anchors[spot]
    return a ? { left: `${((a[0] - vx) / vw) * 100}%`, top: `${((a[1] - vy) / vh) * 100}%` } : null
  }
  return (
    <div className="sl-map">
      <WorkshopMap room={room} parts={props.parts} lastUsed={props.lastUsed} now={props.now} onShow={props.onOpen} onDone={props.onOpen} />
      {room.machines.map(({ machine }) => {
        const p = props.onMachine[machine]
        const pos = at(machine)
        return p && pos ? (
          <span key={machine} className="sl-ava" style={pos} title={p.maker_name ?? ''}>
            {initials(p.maker_name ?? '?')}
          </span>
        ) : null
      })}
      {props.pops.map((x) => {
        const pos = at(x.m)
        return pos ? (
          <span key={x.id} className="sl-pop num" style={pos}>
            ✓ {x.text}
          </span>
        ) : null
      })}
    </div>
  )
}

/** 3D printers aren't on either map, so they get one line under the CNC room. */
function PrinterLine({ part, last, at }: { part?: Part; last?: number; at: number }) {
  return (
    <p className="sl-printer">
      <b>3D print</b>
      <span className="soft small">
        <i className={`wmap-chip${part ? ' run' : ''}`} aria-hidden="true" />{' '}
        {part ? `${first(part.maker_name ?? 'Someone')}, ${part.part_no} · ${dur(at - +new Date(part.started_at ?? at))}` : last ? `Idle ${dur(at - last)}` : 'Not used yet'}
      </span>
    </p>
  )
}

// ---------- Timeline ----------

function Timeline(props: {
  runs: DayData['runs']
  from: number
  to: number
  liveEnd: number
  isToday: boolean
  live: boolean
  at: number
  playing: boolean
  hotSub: string | null
  phone: boolean
  onPlay: () => void
  onSeek: (t: number) => void
}) {
  const { from, to, at } = props
  const span = to - from
  const pct = (t: number) => ((Math.min(Math.max(t, from), to) - from) / span) * 100
  const strip = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const seekFrom = (x: number) => {
    const r = strip.current?.getBoundingClientRect()
    if (!r) return
    props.onSeek(from + Math.min(1, Math.max(0, (x - r.left) / r.width)) * span)
  }
  // Labels every 2 hours, or 4 when the strip is narrow or the day is long.
  const step = (props.phone || span > 12 * 60 * MIN ? 4 : 2) * 60 * MIN
  const hours: number[] = []
  for (let t = from; t <= to; t += step) hours.push(t)
  return (
    <div className="sl-tl">
      <div className="sl-tl__top">
        <button type="button" className="sl-play" aria-label={props.playing ? 'Pause' : 'Replay the day'} onClick={props.onPlay}>
          <Icon name="play" size={14} />
        </button>
        <b className="num">{hhmm(at)}</b>
        <span className="soft small">{props.runs.length ? 'Drag the timeline to replay the day' : 'No machine time on this day'}</span>
      </div>
      <div className="sl-tl__area">
        <div className={`sl-tl__rows${props.hotSub ? ' is-filtered' : ''}`}>
          {MADE.map((m) => (
            <div key={m} className="sl-tl__row">
              <span className="soft small">{m}</span>
              <div className="sl-track">
                {props.isToday && <i className="sl-track__future" style={{ left: `${pct(props.liveEnd)}%` }} />}
                {props.runs
                  .filter((r) => r.machine === m)
                  .map((r) => {
                    const end = r.end ?? props.liveEnd
                    const cls = ['sl-seg', end <= at ? 'is-past' : '', !r.end && props.live ? 'is-live' : '', props.hotSub === r.subsystemId ? 'is-hot' : ''].join(' ')
                    return <i key={`${r.partId}-${r.start}`} className={cls} style={{ left: `${pct(r.start)}%`, width: `${Math.max(0.4, pct(end) - pct(r.start))}%` }} title={`${r.partNo} · ${first(r.who)} · ${hhmm(r.start)}–${r.end ? hhmm(r.end) : 'now'}`} />
                  })}
              </div>
            </div>
          ))}
          <div className="sl-tl__hours soft small num">
            {hours.map((h, i) => (
              <span key={h} style={{ left: `${pct(h)}%`, transform: i === 0 ? 'none' : i === hours.length - 1 && h >= to ? 'translateX(-100%)' : undefined }}>
                {hhmm(h)}
              </span>
            ))}
          </div>
        </div>
        <div
          ref={strip}
          className="sl-scrub"
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            seekFrom(e.clientX)
          }}
          onPointerMove={(e) => dragging.current && seekFrom(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          role="slider"
          aria-label="Time of day"
          aria-valuemin={from}
          aria-valuemax={to}
          aria-valuenow={at}
          aria-valuetext={hhmm(at)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') props.onSeek(at - 10 * MIN)
            if (e.key === 'ArrowRight') props.onSeek(at + 10 * MIN)
          }}
        >
          <i className="sl-head-line" style={{ left: `${pct(at)}%` }} />
        </div>
      </div>
    </div>
  )
}

// ---------- Recap ----------

function RecapCard(props: {
  day: string
  isToday: boolean
  recaps: Recap[]
  tab: string
  setTab: (s: string) => void
  nameOfSub: (id: string | null) => string
  subsInOrder: string[]
  soFar: { parts: number; hours: number }
  onYesterday: () => void
  onCopy: (r: Recap) => void
}) {
  if (props.isToday)
    return (
      <>
        <div className="sl-recap__head">
          <h2 className="section__title">Today's recap</h2>
          <span className="soft small">written at 02:00</span>
        </div>
        <p className="sl-recap__headline">Claude writes today's recap tonight at 02:00.</p>
        <p className="soft">Mentors get it as a push, and each lead gets a recap of their own subsystem. So far today:</p>
        <div className="sl-sofar">
          <div>
            <b className="num">{props.soFar.parts}</b>
            <span>parts finished</span>
          </div>
          <div>
            <b className="num">{props.soFar.hours.toFixed(1)} h</b>
            <span>machine time</span>
          </div>
        </div>
        <button type="button" className="q-btn" onClick={props.onYesterday}>
          Read last night's recap
        </button>
      </>
    )
  const scopes = ['team', ...props.subsInOrder.filter((id) => props.recaps.some((r) => r.scope === id)), ...props.recaps.map((r) => r.scope).filter((s) => s !== 'team' && !props.subsInOrder.includes(s))]
  const shown = scopes.filter((s) => props.recaps.some((r) => r.scope === s))
  const r = props.recaps.find((x) => x.scope === props.tab) ?? props.recaps.find((x) => x.scope === 'team') ?? props.recaps[0]
  const next = toDate(addDays(props.day, 1)).toLocaleDateString('en-GB', { weekday: 'short' })
  return (
    <>
      <div className="sl-recap__head">
        <h2 className="section__title">Recap</h2>
        {r && <span className="soft small">by Claude, 02:00 {next}</span>}
      </div>
      {!r ? (
        <p className="soft">No recap for this day. Claude writes one for every day with workshop activity, from the night after SteamLab went live.</p>
      ) : (
        <>
          {shown.length > 1 && (
            <div className="picks picks--seg sl-recap__tabs" role="radiogroup" aria-label="Recap for">
              {shown.map((s) => (
                <button key={s} type="button" role="radio" className="pick" aria-checked={r.scope === s} onClick={() => props.setTab(s)}>
                  {s === 'team' ? 'Team' : props.nameOfSub(s) || 'Subsystem'}
                </button>
              ))}
            </div>
          )}
          <div className="sl-recap__body" key={r.scope}>
            <p className="sl-recap__headline">{r.headline}</p>
            {r.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {r.look.length > 0 && (
              <div className="sl-look">
                <b>Worth a look</b>
                <ul>
                  {r.look.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="sl-recap__foot soft small">
            <span className="num">From {r.events} events</span>
            <button type="button" className="q-btn q-btn--small" onClick={() => props.onCopy(r)}>
              Copy
            </button>
          </div>
        </>
      )}
    </>
  )
}

// ---------- Feed ----------

const FEED_ICON: Record<FeedItem['kind'], string> = { done: '✓', test: '▶', pick: '★', update: '✎', phase: '◆' }

function Feed({ items, isToday, error, loading }: { items: FeedItem[]; isToday: boolean; error?: string; loading: boolean }) {
  const navigate = useNavigate()
  if (error) return <p className="soft">Couldn't load this day. Check the connection and open it again.</p>
  if (loading) return <p className="soft">Loading the day…</p>
  if (!items.length) return <p className="soft sl-feed__empty">{isToday ? 'Nothing yet today. Finished parts, filmed tests and daily updates show here as they happen.' : 'Nothing happened by this time.'}</p>
  return (
    <ol className="sl-feed__list">
      {items.slice(0, 40).map((i) => (
        <li key={`${i.kind}-${i.t}-${i.text}`}>
          {i.link ? (
            <button type="button" className="sl-feed__item" onClick={() => navigate(i.link!)}>
              <FeedBody i={i} />
            </button>
          ) : (
            <div className="sl-feed__item">
              <FeedBody i={i} />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

function FeedBody({ i }: { i: FeedItem }) {
  return (
    <>
      <span className="soft small num">{hhmm(i.t)}</span>
      <span className={`sl-feed__ic sl-feed__ic--${i.kind}`} aria-hidden="true">
        {FEED_ICON[i.kind]}
      </span>
      <span>
        {i.text}
        {i.meta && <span className="soft small sl-feed__meta">{i.meta}</span>}
      </span>
    </>
  )
}
