import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { KICKOFF } from '../../components/Season'
import { StatusIcon, useOpenTask } from '../../components/cal'
import { useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import {
  addDays,
  addWait,
  daysBetween,
  firstName,
  groupOrder,
  isoDay,
  maxDay,
  minDay,
  movePhases,
  moveTasks,
  occurrences,
  pushPhases,
  pushWaiting,
  taskOrder,
  TEAM_WORD,
  toDate,
  todayIso,
  updatePhase,
  updateTask,
  type DateMove,
  type Phase,
  type Task,
} from '../../lib/cal'
import type { Progress } from '../../lib/calLinked'
import { useRobots } from '../../lib/useMfg'
import { putRows, type Cal } from '../../lib/useCal'
import type { Profile } from '../../lib/mfg'
import { usePhone, useTall } from '../../lib/usePhone'
import type { BoardFilter } from './Board'

// Phases and tasks on a timeline. Each group's row holds its phase bars with the progress inside;
// its tasks fold out under it. On computers and the workshop screen: drag a bar to move it, drag
// an end to change its length, drag the dot at a task's end onto another task to make that one
// wait for it. Phones can look and scroll. Keyboard: arrows move a focused bar a day, Shift with
// arrows changes its end.

type Zoom = 'week' | 'month' | 'season'
const DAY_PX: Record<Zoom, number> = { week: 44, month: 18, season: 6 }
const ROW = 40
const LABEL = 232

type Row =
  | { kind: 'group'; id: string; groupId: string }
  | { kind: 'task'; id: string; task: Task; depth: number }

interface Drag {
  id: string
  what: 'task' | 'phase'
  mode: 'move' | 'start' | 'end'
  x0: number
  dx: number
}

interface Linking {
  from: Task
  x0: number
  y0: number
  x: number
  y: number
}

const FOLD_KEY = 'gantt-open'

export function Gantt({ cal, linked, filter, people }: { cal: Cal; linked: Map<string, Progress>; filter: BoardFilter; people: Profile[] }) {
  const phone = usePhone()
  // The TV in the CAD room shows the Gantt but doesn't drag it: on a wall screen anyone walking by
  // touches it, and a stray swipe would move a real task. Dates change from the group page.
  const tall = useTall()
  const edit = !phone && !tall
  const who = useWho()
  const toast = useToast()
  const navigate = useNavigate()
  const openTask = useOpenTask()
  const { robots } = useRobots()
  const [zoom, setZoom] = useState<Zoom>('month')
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [link, setLink] = useState<Linking | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const day = DAY_PX[zoom]
  const today = todayIso()
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null

  const remember = (s: Set<string>) => {
    setOpenGroups(s)
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify([...s]))
    } catch {
      /* private mode */
    }
  }

  const mine = useMemo(() => new Set(cal.owners.filter((o) => o.user_id === who?.userId).map((o) => o.task_id)), [cal.owners, who])
  const groups = useMemo(() => [...cal.groups].filter((g) => !filter.team || g.team === filter.team).sort(groupOrder), [cal.groups, filter.team])

  const tasksOf = (gid: string) =>
    cal.tasks
      .filter((t) => t.group_id === gid && !t.parent_id && (filter.done || t.status !== 'done') && (!filter.mine || mine.has(t.id)))
      .sort((a, b) => ((a.starts_on ?? a.due_on ?? '9999') < (b.starts_on ?? b.due_on ?? '9999') ? -1 : 1) || taskOrder(a, b))

  const rows: Row[] = []
  for (const g of groups) {
    const list = tasksOf(g.id)
    if (filter.mine && !list.length) continue
    rows.push({ kind: 'group', id: `g${g.id}`, groupId: g.id })
    if (openGroups.has(g.id) || filter.mine) for (const t of list) rows.push({ kind: 'task', id: t.id, task: t, depth: 0 })
  }

  // The range: everything dated, today, and some room either side.
  const range = useMemo(() => {
    let lo = addDays(today, -14)
    let hi = addDays(today, 56)
    for (const p of cal.phases) {
      if (p.starts_on) lo = minDay(lo, p.starts_on)
      if (p.ends_on) hi = maxDay(hi, p.ends_on)
    }
    for (const t of cal.tasks) {
      if (t.starts_on) lo = minDay(lo, t.starts_on)
      if (t.due_on) hi = maxDay(hi, t.due_on)
    }
    lo = addDays(lo, -7)
    hi = addDays(hi, 21)
    // Start on a Sunday, so weeks line up.
    lo = addDays(lo, -toDate(lo).getDay())
    return { lo, hi, days: daysBetween(lo, hi) + 1 }
  }, [cal.phases, cal.tasks, today])

  const x = (d: string) => daysBetween(range.lo, d) * day
  const width = range.days * day

  // Opens with today a little in from the left.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, x(today) - day * 7)
    // Only on open and when zooming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, range.lo])

  // Milestones: kickoff, each robot version's start, competitions and deadlines.
  const milestones = useMemo(() => {
    const out: { key: string; day: string; label: string }[] = []
    const k = isoDay(KICKOFF)
    if (k >= range.lo && k <= range.hi) out.push({ key: 'kickoff', day: k, label: 'Kickoff' })
    for (const r of robots)
      if (r.season === cal.season && r.version != null) {
        const d = isoDay(new Date(r.created_at))
        if (d >= range.lo && d <= range.hi) out.push({ key: r.id, day: d, label: `V${r.version} start` })
      }
    for (const e of cal.events)
      if (e.kind === 'competition' || e.kind === 'deadline')
        for (const o of occurrences(e, range.lo, range.hi)) out.push({ key: `${e.id}${o.day}`, day: o.day, label: e.title })
    return out
  }, [robots, cal.events, cal.season, range])

  // ---------- Saving ----------

  const saveTaskDates = async (t: Task, starts_on: string | null, due_on: string | null) => {
    const moves = pushWaiting({ id: t.id, starts_on, due_on }, cal.tasks, cal.waits)
    const before: DateMove[] = moves.map((m) => {
      const o = cal.tasks.find((x) => x.id === m.id)!
      return { id: o.id, starts_on: o.starts_on, due_on: o.due_on }
    })
    const show = (list: DateMove[]) => putRows('tasks', list.map((m) => ({ ...cal.tasks.find((x) => x.id === m.id)!, ...m })))
    show(moves)
    const res = await moveTasks(moves)
    if (res.error) {
      show(before)
      return toast(res.error)
    }
    const others = moves.length - 1
    toast(others ? `${t.title} moved, and ${others} waiting ${others === 1 ? 'task' : 'tasks'} after it` : `${t.title} moved`, {
      undo: async () => {
        show(before)
        const r = await moveTasks(before)
        if (r.error) toast(r.error)
      },
    })
  }

  const savePhaseDates = async (p: Phase, starts_on: string | null, ends_on: string | null) => {
    const moves = pushPhases({ id: p.id, starts_on, ends_on }, cal.phases)
    const before = moves.map((m) => {
      const o = cal.phases.find((x) => x.id === m.id)!
      return { id: o.id, starts_on: o.starts_on, ends_on: o.ends_on }
    })
    const show = (list: typeof moves) => putRows('cal_phases', list.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
    show(moves)
    const res = await movePhases(moves)
    if (res.error) {
      show(before)
      return toast(res.error)
    }
    const others = moves.length - 1
    toast(others ? `${p.name} moved, and the ${others === 1 ? 'phase' : `${others} phases`} after it` : `${p.name} moved`, {
      undo: async () => {
        show(before)
        const r = await movePhases(before)
        if (r.error) toast(r.error)
      },
    })
  }

  /** New dates from a drag or a key press. A task with only a due day is one day long. */
  const shifted = (start: string | null, end: string | null, mode: Drag['mode'], n: number): [string | null, string | null] => {
    const s = start ?? end!
    const e = end ?? start!
    if (mode === 'move') return [start && addDays(start, n), end && addDays(end, n)]
    if (mode === 'start') {
      const ns = minDay(addDays(s, n), e)
      return [ns, e]
    }
    const ne = maxDay(addDays(e, n), s)
    return [start, ne]
  }

  const commit = (what: Drag['what'], id: string, mode: Drag['mode'], n: number) => {
    if (!n) return
    if (what === 'task') {
      const t = cal.tasks.find((x) => x.id === id)
      if (!t) return
      const [s, e] = shifted(t.starts_on, t.due_on, mode, n)
      // Stretching a one-day task gives it a start.
      const start = mode === 'start' && !t.starts_on ? s : s
      saveTaskDates(t, start, mode === 'end' && !t.due_on ? e : e)
    } else {
      const p = cal.phases.find((x) => x.id === id)
      if (!p) return
      const [s, e] = shifted(p.starts_on, p.ends_on, mode, n)
      savePhaseDates(p, s, e)
    }
  }

  // ---------- Dragging ----------

  const startDrag = (e: RPointerEvent, what: Drag['what'], id: string, mode: Drag['mode']) => {
    if (!edit || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({ id, what, mode, x0: e.clientX, dx: 0 })
  }
  const moveDrag = (e: RPointerEvent) => {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.x0 })
  }
  const endDrag = (open: () => void) => {
    if (!drag) return
    const n = Math.round(drag.dx / day)
    const moved = Math.abs(drag.dx) > 4
    setDrag(null)
    if (!moved) open()
    else commit(drag.what, drag.id, drag.mode, n)
  }

  const live = (what: Drag['what'], id: string, start: string | null, end: string | null): [string | null, string | null] =>
    drag && drag.id === id && drag.what === what ? shifted(start, end, drag.mode, Math.round(drag.dx / day)) : [start, end]

  // Linking: drag from a task's end dot onto another task.
  useEffect(() => {
    if (!link) return
    const onMove = (e: PointerEvent) => setLink((l) => (l ? { ...l, x: e.clientX, y: e.clientY } : l))
    const onUp = async (e: PointerEvent) => {
      const from = link.from
      setLink(null)
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-task-id]')
      const toId = hit?.dataset.taskId
      if (!toId || toId === from.id) return
      const to = cal.tasks.find((t) => t.id === toId)
      if (!to) return
      const res = await addWait(to.id, from.id)
      if (res.error) return toast(res.error)
      putRows('task_waits', [{ task_id: to.id, waits_for_id: from.id }])
      toast(`${to.title} now waits for ${from.title}`)
      const waits = [...cal.waits, { task_id: to.id, waits_for_id: from.id }]
      const moves = pushWaiting({ id: from.id, starts_on: from.starts_on, due_on: from.due_on }, cal.tasks, waits)
      if (moves.length > 1) {
        putRows('tasks', moves.map((m) => ({ ...cal.tasks.find((x) => x.id === m.id)!, ...m })))
        const r = await moveTasks(moves.slice(1))
        if (r.error) toast(r.error)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [link, cal.tasks, cal.waits, toast])

  const keyMove = (e: KeyboardEvent, what: Drag['what'], id: string) => {
    if (!edit || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    commit(what, id, e.shiftKey ? 'end' : 'move', e.key === 'ArrowRight' ? 1 : -1)
  }

  /** An undated phase or task: click a day on its row to place it. */
  const place = async (e: RPointerEvent<HTMLDivElement>, what: Drag['what'], id: string) => {
    if (!edit) return
    const rect = e.currentTarget.getBoundingClientRect()
    const d = addDays(range.lo, Math.floor((e.clientX - rect.left) / day))
    if (what === 'phase') {
      const p = cal.phases.find((x) => x.id === id)!
      const res = await updatePhase(id, { starts_on: d, ends_on: addDays(d, 13) })
      if (res.error) return toast(res.error)
      putRows('cal_phases', [res.data!])
      toast(`${p.name}: two weeks from ${d}. Drag its end to change it.`)
    } else {
      const res = await updateTask(id, { due_on: d })
      if (res.error) return toast(res.error)
      putRows('tasks', [res.data!])
    }
  }

  // ---------- Drawing ----------

  const rowIndex = new Map(rows.map((r, i) => [r.id, i]))
  const arrows = cal.waits
    .map((w) => {
      const a = cal.tasks.find((t) => t.id === w.waits_for_id)
      const b = cal.tasks.find((t) => t.id === w.task_id)
      if (!a || !b || !rowIndex.has(a.id) || !rowIndex.has(b.id)) return null
      const [as, ae] = live('task', a.id, a.starts_on, a.due_on)
      const [bs, be] = live('task', b.id, b.starts_on, b.due_on)
      const aEnd = ae ?? as
      const bStart = bs ?? be
      if (!aEnd || !bStart) return null
      const x1 = x(aEnd) + day
      const y1 = rowIndex.get(a.id)! * ROW + ROW / 2
      const x2 = x(bStart)
      const y2 = rowIndex.get(b.id)! * ROW + ROW / 2
      const bad = bStart <= aEnd && b.status !== 'done'
      const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12))
      const d = x2 >= x1 + 12 ? `M${x1},${y1} H${mid} V${y2} H${x2 - 2}` : `M${x1},${y1} h8 V${(y1 + y2) / 2} H${x2 - 10} V${y2} H${x2 - 2}`
      return { key: `${a.id}-${b.id}`, d, bad }
    })
    .filter((a): a is { key: string; d: string; bad: boolean } => !!a)

  const months: { key: string; left: number; label: string }[] = []
  for (let d = range.lo; d <= range.hi; d = addDays(d, 1)) {
    const dt = toDate(d)
    if (dt.getDate() === 1 || d === range.lo) months.push({ key: d, left: x(d), label: dt.toLocaleDateString('en-GB', { month: 'short', year: dt.getMonth() === 0 || d === range.lo ? 'numeric' : undefined }) })
  }
  const ticks: { key: string; left: number; label: string; weekend: boolean }[] = []
  if (zoom !== 'season')
    for (let d = range.lo; d <= range.hi; d = addDays(d, 1)) {
      const dt = toDate(d)
      if (zoom === 'week' || dt.getDay() === 0) ticks.push({ key: d, left: x(d), label: zoom === 'week' ? `${'SMTWTFS'[dt.getDay()]} ${dt.getDate()}` : String(dt.getDate()), weekend: dt.getDay() === 5 || dt.getDay() === 6 })
    }

  const allOpen = groups.every((g) => openGroups.has(g.id))

  return (
    <div className="gantt" style={{ '--day': `${day}px`, '--row': `${ROW}px`, '--label': `${LABEL}px` } as CSSProperties}>
      <div className="gantt__bar">
        <div className="picks picks--seg" role="radiogroup" aria-label="Zoom">
          {(['week', 'month', 'season'] as Zoom[]).map((z) => (
            <button key={z} type="button" role="radio" className="pick" aria-checked={zoom === z} onClick={() => setZoom(z)}>
              {z === 'week' ? 'Days' : z === 'month' ? 'Weeks' : 'Season'}
            </button>
          ))}
        </div>
        <button type="button" className="q-btn q-btn--small" onClick={() => remember(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}>
          {allOpen ? 'Hide tasks' : 'Show all tasks'}
        </button>
        <button
          type="button"
          className="q-btn q-btn--small"
          onClick={() => scroller.current?.scrollTo({ left: Math.max(0, x(today) - day * 7), behavior: 'smooth' })}
        >
          Today
        </button>
        <span className="soft small gantt__hint">{edit ? 'Drag a bar to move it, its end to stretch it, the dot onto another task to make it wait.' : tall ? 'Tap a group to change its dates.' : 'Open on a computer to drag bars.'}</span>
      </div>

      <div className="gantt__scroll" ref={scroller}>
        <div className="gantt__inner" style={{ width: LABEL + width }}>
          <div className="gantt__head">
            <div className="gantt__corner" />
            <div className="gantt__scale" style={{ width }}>
              {months.map((m) => (
                <span key={m.key} className="gantt__month" style={{ left: m.left }}>
                  {m.label}
                </span>
              ))}
              {ticks.map((t) => (
                <span key={t.key} className="gantt__tick num" data-weekend={t.weekend || undefined} style={{ left: t.left }}>
                  {t.label}
                </span>
              ))}
              {milestones.map((m) => (
                <span key={m.key} className="gantt__milestone" style={{ left: x(m.day) + day / 2 }} title={`${m.label}, ${m.day}`}>
                  <i aria-hidden="true" />
                  <span>{m.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="gantt__body" ref={body} onPointerMove={moveDrag}>
            <div className="gantt__today" style={{ left: LABEL + x(today) + day / 2 }} aria-hidden="true" />
            {milestones.map((m) => (
              <div key={m.key} className="gantt__mline" style={{ left: LABEL + x(m.day) + day / 2 }} aria-hidden="true" />
            ))}

            {rows.map((r) => {
              if (r.kind === 'group') {
                const g = cal.groups.find((x) => x.id === r.groupId)!
                const phases = cal.phases.filter((p) => p.group_id === g.id).sort((a, b) => a.sort - b.sort)
                const count = tasksOf(g.id).length
                const isOpen = openGroups.has(g.id) || filter.mine
                const undated = phases.filter((p) => !p.starts_on && !p.ends_on)
                return (
                  <div key={r.id} className="gantt__row gantt__row--group" data-team={g.team}>
                    <div className="gantt__label">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.name} tasks`}
                        onClick={() => {
                          const n = new Set(openGroups)
                          if (n.has(g.id)) n.delete(g.id)
                          else n.add(g.id)
                          remember(n)
                        }}
                      >
                        <Icon name={isOpen ? 'up' : 'down'} size={16} />
                      </button>
                      <button type="button" className="gantt__name" onClick={() => navigate(`/calendar/g/${g.id}`)}>
                        <span className="strong">{g.name}</span>
                        <span className="soft small">
                          {filter.team ? '' : `${TEAM_WORD[g.team]} · `}
                          {g.lead_id ? firstName(nameOf(g.lead_id)) : 'no lead'}
                          {count ? ` · ${count}` : ''}
                        </span>
                      </button>
                    </div>
                    <div className="gantt__track" style={{ width }} onPointerUp={(e) => undated.length === 1 && !drag && e.target === e.currentTarget && place(e, 'phase', undated[0].id)}>
                      {phases.map((p) => {
                        const [s0, e0] = live('phase', p.id, p.starts_on, p.ends_on)
                        const s = s0 ?? e0
                        const en = e0 ?? s0
                        if (!s || !en) return null
                        const prog = linked.get(p.id)
                        return (
                          <div
                            key={p.id}
                            className="gantt__phase"
                            data-done={p.done_at ? true : undefined}
                            data-kind={p.kind}
                            role="button"
                            tabIndex={0}
                            aria-label={`${p.name}, ${s} to ${en}${prog ? `. ${prog.line}` : ''}`}
                            title={`${p.name}${prog ? `: ${prog.line}` : ''}`}
                            style={{ left: x(s), width: (daysBetween(s, en) + 1) * day }}
                            onPointerDown={(e) => startDrag(e, 'phase', p.id, 'move')}
                            onPointerUp={() => endDrag(() => navigate(`/calendar/g/${g.id}`))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') navigate(`/calendar/g/${g.id}`)
                              keyMove(e, 'phase', p.id)
                            }}
                          >
                            {prog?.share != null && <span className="gantt__fill" style={{ width: `${Math.round(prog.share * 100)}%` }} />}
                            <span className="gantt__text">{p.name}</span>
                            {edit && (
                              <>
                                <span className="gantt__grip gantt__grip--start" onPointerDown={(e) => startDrag(e, 'phase', p.id, 'start')} />
                                <span className="gantt__grip gantt__grip--end" onPointerDown={(e) => startDrag(e, 'phase', p.id, 'end')} />
                              </>
                            )}
                          </div>
                        )
                      })}
                      {undated.length > 0 && edit && (
                        <span className="gantt__ghost soft small" style={{ left: Math.max(4, x(today) + day, ...phases.filter((p) => p.ends_on ?? p.starts_on).map((p) => x((p.ends_on ?? p.starts_on)!) + day + 8)) }}>
                          {undated.length === 1 ? `${undated[0].name}: click a day on this row to place it` : `${undated.length} phases have no dates. Set them on the group page.`}
                        </span>
                      )}
                    </div>
                  </div>
                )
              }
              const t = r.task
              const [s0, e0] = live('task', t.id, t.starts_on, t.due_on)
              const s = s0 ?? e0
              const en = e0 ?? s0
              const late = t.status !== 'done' && !!t.due_on && t.due_on < today
              return (
                <div key={r.id} className="gantt__row gantt__row--task">
                  <div className="gantt__label gantt__label--task">
                    <span className="cal-mini-status" data-status={t.status}>
                      <StatusIcon status={t.status} />
                    </span>
                    <button type="button" className="gantt__name" onClick={() => openTask(t.id)}>
                      <span className="gantt__title">{t.title}</span>
                    </button>
                  </div>
                  <div className="gantt__track" style={{ width }} onPointerUp={(e) => !s && !drag && e.target === e.currentTarget && place(e, 'task', t.id)}>
                    {s && en ? (
                      <div
                        className="gantt__task"
                        data-task-id={t.id}
                        data-status={t.status}
                        data-late={late || undefined}
                        data-high={(t.priority === 'high' && t.status !== 'done') || undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.title}, ${s === en ? en : `${s} to ${en}`}`}
                        title={t.title}
                        style={{ left: x(s), width: Math.max(day, (daysBetween(s, en) + 1) * day) }}
                        onPointerDown={(e) => startDrag(e, 'task', t.id, 'move')}
                        onPointerUp={() => endDrag(() => openTask(t.id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') openTask(t.id)
                          keyMove(e, 'task', t.id)
                        }}
                      >
                        <span className="gantt__text">{zoom === 'season' ? '' : t.title}</span>
                        {edit && (
                          <>
                            <span className="gantt__grip gantt__grip--start" onPointerDown={(e) => startDrag(e, 'task', t.id, 'start')} />
                            <span className="gantt__grip gantt__grip--end" onPointerDown={(e) => startDrag(e, 'task', t.id, 'end')} />
                            <span
                              className="gantt__link"
                              title="Drag onto a task that waits for this one"
                              onPointerDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setLink({ from: t, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY })
                              }}
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      edit && (
                        <span className="gantt__ghost soft small" style={{ left: Math.max(4, x(today) + day) }}>
                          No dates. Click a day to set its due day.
                        </span>
                      )
                    )}
                  </div>
                </div>
              )
            })}

            <svg className="gantt__arrows" width={width} height={rows.length * ROW} style={{ left: LABEL }} aria-hidden="true">
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-soft)" />
                </marker>
                <marker id="gantt-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--meaning-c)" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path key={a.key} d={a.d} className="gantt__arrow" data-bad={a.bad || undefined} markerEnd={`url(#${a.bad ? 'gantt-arrow-bad' : 'gantt-arrow'})`} />
              ))}
            </svg>
          </div>
        </div>
      </div>

      {link && (
        <svg className="gantt__linking" aria-hidden="true">
          <line x1={link.x0} y1={link.y0} x2={link.x} y2={link.y} />
        </svg>
      )}

      {rows.length === 0 && (
        <div className="mfg-empty">
          <p className="empty">Nothing to draw.</p>
          <p className="soft">Groups and their phases show here once V1 is set up.</p>
        </div>
      )}
    </div>
  )
}
