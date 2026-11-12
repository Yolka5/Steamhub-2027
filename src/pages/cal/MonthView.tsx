import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useOpenTask } from '../../components/cal'
import { Sheet } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { addDays, dayLabel, isoDay, longDay, occurrences, timeLabel, toDate, todayIso, type CalGroup, type Task } from '../../lib/cal'
import type { Cal } from '../../lib/useCal'
import type { Profile } from '../../lib/mfg'
import { usePhone } from '../../lib/usePhone'
import type { BoardFilter } from './Board'

// Tasks, phases and events on the calendar. Computers: a month grid with bars across their days.
// Phones: an agenda, today first, only the days with something on them.

interface Item {
  key: string
  kind: 'task' | 'phase' | 'event'
  title: string
  start: string
  end: string
  /** Time for events, group for tasks. */
  note?: string
  state?: 'done' | 'late' | 'high'
  open: () => void
  href?: string
}

const LANES = 5

/** `phases`: the agenda lists phases starting and ending; the month grid leaves them to the Gantt. */
function useItems(cal: Cal, filter: BoardFilter, from: string, to: string, phases = false) {
  const who = useWho()
  const open = useOpenTask()
  const [params, setParams] = useSearchParams()
  return useMemo(() => {
    const today = todayIso()
    const groups = new Map<string, CalGroup>(cal.groups.map((g) => [g.id, g]))
    const inTeam = (gid: string | null) => !gid || !filter.team || groups.get(gid)?.team === filter.team
    const mine = new Set(cal.owners.filter((o) => o.user_id === who?.userId).map((o) => o.task_id))
    const items: Item[] = []
    for (const t of cal.tasks) {
      if (t.parent_id || !inTeam(t.group_id)) continue
      if (filter.mine && !mine.has(t.id)) continue
      const start = t.starts_on ?? t.due_on
      const end = t.due_on ?? t.starts_on
      if (!start || !end || end < from || start > to) continue
      items.push({
        key: `t${t.id}`,
        kind: 'task',
        title: t.title,
        start,
        end,
        note: groups.get(t.group_id)?.name,
        state: t.status === 'done' ? 'done' : t.due_on && t.due_on < today ? 'late' : t.priority === 'high' ? 'high' : undefined,
        open: () => open(t.id),
      })
    }
    if (phases && !filter.mine)
      for (const p of cal.phases) {
        if (!inTeam(p.group_id)) continue
        const start = p.starts_on ?? p.ends_on
        const end = p.ends_on ?? p.starts_on
        if (!start || !end || end < from || start > to) continue
        const g = groups.get(p.group_id)
        items.push({ key: `p${p.id}`, kind: 'phase', title: `${g?.name}: ${p.name}`, start, end, state: p.done_at ? 'done' : undefined, open: () => {}, href: `/calendar/g/${p.group_id}` })
      }
    for (const e of cal.events) {
      if (!inTeam(e.group_id)) continue
      for (const o of occurrences(e, from, to)) {
        items.push({
          key: `e${e.id}${o.day}`,
          kind: 'event',
          title: e.title,
          start: o.day,
          end: e.repeat_days?.length ? o.day : isoDay(o.end),
          note: e.all_day ? undefined : timeLabel(o.start),
          open: () => {
            const next = new URLSearchParams(params)
            next.set('event', e.id)
            next.set('on', o.day)
            setParams(next)
          },
        })
      }
    }
    // Events first on a day, then longer bars, so the grid packs well.
    return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || (a.kind === 'event' ? -1 : 0) - (b.kind === 'event' ? -1 : 0) || (b.end > a.end ? 1 : -1))
  }, [cal, filter, from, to, phases, who, open, params, setParams])
}

export function MonthView({ cal, filter }: { cal: Cal; filter: BoardFilter; people: Profile[] }) {
  const phone = usePhone()
  return phone ? <Agenda cal={cal} filter={filter} /> : <Month cal={cal} filter={filter} />
}

function useNewEvent() {
  const [params, setParams] = useSearchParams()
  return (day: string) => {
    const next = new URLSearchParams(params)
    next.set('event', 'new')
    next.set('on', day)
    setParams(next)
  }
}

function Month({ cal, filter }: { cal: Cal; filter: BoardFilter }) {
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const anchor = params.get('d') ?? today
  const first = toDate(anchor)
  first.setDate(1)
  const monthStart = isoDay(first)
  // Weeks start on Sunday, as the team's week does.
  const gridStart = addDays(monthStart, -first.getDay())
  const nextMonth = new Date(first.getFullYear(), first.getMonth() + 1, 1)
  const weeks = Math.ceil((first.getDay() + (new Date(nextMonth.getTime() - 86_400_000).getDate())) / 7)
  const gridEnd = addDays(gridStart, weeks * 7 - 1)
  const items = useItems(cal, filter, gridStart, gridEnd)
  const newEvent = useNewEvent()
  const [more, setMore] = useState<string | null>(null)

  const go = (d: string | null) => {
    const next = new URLSearchParams(params)
    if (d) next.set('d', d)
    else next.delete('d')
    setParams(next, { replace: true })
  }

  return (
    <div className="cal-month">
      <div className="cal-month__bar">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => go(isoDay(new Date(first.getFullYear(), first.getMonth() - 1, 1)))}>
          <Icon name="back" />
        </button>
        <h2 className="cal-month__title">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="icon-btn cal-flip" aria-label="Next month" onClick={() => go(isoDay(nextMonth))}>
          <Icon name="back" />
        </button>
        <button type="button" className="q-btn q-btn--small" onClick={() => go(null)}>
          Today
        </button>
        <button type="button" className="q-btn q-btn--small cal-month__add" onClick={() => newEvent(anchor >= monthStart && anchor <= gridEnd ? anchor : monthStart)}>
          <Icon name="plus" size={16} /> Event
        </button>
      </div>
      <div className="cal-month__days" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, w) => {
        const ws = addDays(gridStart, w * 7)
        const we = addDays(ws, 6)
        const inWeek = items.filter((i) => i.end >= ws && i.start <= we)
        // Lanes: each item takes the first row free for all its days this week.
        const lanes: string[][] = []
        const placed: { item: Item; lane: number; c0: number; c1: number }[] = []
        const hidden = new Map<number, number>()
        for (const item of inWeek) {
          const c0 = Math.max(0, Math.round((toDate(item.start).getTime() - toDate(ws).getTime()) / 86_400_000))
          const c1 = Math.min(6, Math.round((toDate(item.end).getTime() - toDate(ws).getTime()) / 86_400_000))
          let lane = lanes.findIndex((l) => l.slice(c0, c1 + 1).every((x) => !x))
          if (lane === -1) {
            lanes.push(Array(7).fill(''))
            lane = lanes.length - 1
          }
          if (lane >= LANES) {
            for (let c = c0; c <= c1; c++) hidden.set(c, (hidden.get(c) ?? 0) + 1)
            continue
          }
          for (let c = c0; c <= c1; c++) lanes[lane][c] = item.key
          placed.push({ item, lane, c0, c1 })
        }
        const rows = Math.min(LANES, lanes.length) + (hidden.size ? 1 : 0)
        return (
          <div key={ws} className="cal-week" style={{ '--rows': rows } as CSSProperties}>
            {Array.from({ length: 7 }, (_, c) => {
              const d = addDays(ws, c)
              const out = toDate(d).getMonth() !== first.getMonth()
              return (
                <button
                  key={d}
                  type="button"
                  className="cal-cell"
                  style={{ gridColumn: c + 1 }}
                  data-out={out || undefined}
                  data-today={d === today || undefined}
                  aria-label={`Add an event on ${longDay(d)}`}
                  onClick={() => newEvent(d)}
                >
                  <span className="cal-cell__no num">{toDate(d).getDate()}</span>
                </button>
              )
            })}
            {placed.map(({ item, lane, c0, c1 }) => {
              const style = { gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: lane + 2 }
              const cls = `cal-bar-item cal-bar-item--${item.kind}`
              const label = (
                <>
                  {item.note && item.kind === 'event' && <span className="num">{item.note} </span>}
                  {item.title}
                </>
              )
              return item.href ? (
                <Link key={item.key} to={item.href} className={cls} style={style} data-state={item.state} title={item.title}>
                  {label}
                </Link>
              ) : (
                <button key={item.key} type="button" className={cls} style={style} data-state={item.state} title={item.note && item.kind === 'task' ? `${item.title} · ${item.note}` : item.title} onClick={item.open}>
                  {label}
                </button>
              )
            })}
            {[...hidden].map(([c, n]) => (
              <button key={`m${c}`} type="button" className="cal-more" style={{ gridColumn: c + 1, gridRow: LANES + 2 }} onClick={() => setMore(addDays(ws, c))}>
                {n} more
              </button>
            ))}
          </div>
        )
      })}
      <Sheet open={!!more} onClose={() => setMore(null)} title={more ? longDay(more) : ''}>
        {more && <DayList items={items.filter((i) => i.start <= more && i.end >= more)} onPick={() => setMore(null)} />}
      </Sheet>
    </div>
  )
}

function DayList({ items, onPick }: { items: Item[]; onPick?: () => void }) {
  return (
    <ul className="rows cal-agenda__list">
      {items.map((i) => {
        const body = (
          <>
            <span className={`cal-dot cal-dot--${i.kind}`} data-state={i.state} aria-hidden="true" />
            <span className="row__main">
              <span className="cal-agenda__title" data-state={i.state}>
                {i.title}
              </span>
              {(i.note || i.start !== i.end) && (
                <span className="soft small num">
                  {[i.kind === 'event' ? i.note : null, i.start !== i.end ? `${dayLabel(i.start)} → ${dayLabel(i.end)}` : null, i.kind === 'task' ? i.note : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {i.state === 'late' && <span className="tag tag--bad">Late</span>}
            {i.state === 'high' && <span className="tag tag--bad">High</span>}
          </>
        )
        return (
          <li key={i.key}>
            {i.href ? (
              <Link to={i.href} className="row" onClick={onPick}>
                {body}
              </Link>
            ) : (
              <button
                type="button"
                className="row cal-agenda__btn"
                onClick={() => {
                  onPick?.()
                  i.open()
                }}
              >
                {body}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const WEEKS_STEP = 6

function Agenda({ cal, filter }: { cal: Cal; filter: BoardFilter }) {
  const today = todayIso()
  const [weeks, setWeeks] = useState(WEEKS_STEP)
  const to = addDays(today, weeks * 7)
  const items = useItems(cal, filter, today, to, true)
  const newEvent = useNewEvent()
  const who = useWho()
  const open = useOpenTask()

  // Late tasks first: what should already be done.
  const late = cal.tasks
    .filter((t: Task) => !t.parent_id && t.status !== 'done' && t.due_on && t.due_on < today)
    .filter((t) => !filter.team || cal.groups.find((g) => g.id === t.group_id)?.team === filter.team)
    .filter((t) => !filter.mine || cal.owners.some((o) => o.task_id === t.id && o.user_id === who?.userId))
    .sort((a, b) => (a.due_on! < b.due_on! ? -1 : 1))

  // A day lists what happens on it: tasks due, phases starting or ending, events. Long tasks
  // aren't repeated on every day they run.
  const days = new Map<string, Item[]>()
  for (const i of items) {
    const marks =
      i.kind === 'task' ? [i.end] : i.kind === 'phase' ? [...new Set([i.start, i.end])] : i.start === i.end ? [i.start] : [i.start]
    for (const d of marks) {
      if (d < today || d > to) continue
      const label = i.kind === 'phase' && i.start !== i.end ? { ...i, title: `${i.title} ${d === i.start ? 'starts' : 'ends'}` } : i
      days.set(d, [...(days.get(d) ?? []), label])
    }
  }
  const sorted = [...days].sort(([a], [b]) => (a < b ? -1 : 1))

  return (
    <div className="cal-agenda">
      <div className="cal-month__bar">
        <button type="button" className="q-btn q-btn--small" onClick={() => newEvent(today)}>
          <Icon name="plus" size={16} /> Event
        </button>
      </div>
      {late.length > 0 && (
        <section className="cal-agenda__day">
          <h2 className="cal-agenda__date cal-agenda__date--late">Late</h2>
          <ul className="rows cal-agenda__list">
            {late.map((t) => (
              <li key={t.id}>
                <button type="button" className="row cal-agenda__btn" onClick={() => open(t.id)}>
                  <span className="cal-dot cal-dot--task" data-state="late" aria-hidden="true" />
                  <span className="row__main">
                    <span className="cal-agenda__title">{t.title}</span>
                    <span className="soft small">
                      {cal.groups.find((g) => g.id === t.group_id)?.name} · was due {dayLabel(t.due_on!)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sorted.length === 0 && late.length === 0 ? (
        <div className="mfg-empty">
          <p className="empty">Nothing on the calendar yet.</p>
          <p className="soft">Tasks with a due day, phases with dates and events show up here.</p>
        </div>
      ) : (
        sorted.map(([d, list]) => (
          <section key={d} className="cal-agenda__day">
            <h2 className="cal-agenda__date" data-today={d === today || undefined}>
              {d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : longDay(d)}
            </h2>
            <DayList items={list} />
          </section>
        ))
      )}
      <button type="button" className="q-btn cal-agenda__more" onClick={() => setWeeks((w) => w + WEEKS_STEP)}>
        Show the {WEEKS_STEP} weeks after {longDay(to)}
      </button>
    </div>
  )
}
