import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useOpenTask } from '../../components/cal'
import { Sheet } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { addDays, daysBetween, dayLabel, eventStatus, groupColor, isoDay, longDay, occurrences, secStyle, STATUS_WORD, statusTone, timeLabel, toDate, todayIso, type CalGroup, type StatusTone, type Task } from '../../lib/cal'
import type { Cal } from '../../lib/useCal'
import type { Profile } from '../../lib/mfg'
import { usePhone } from '../../lib/usePhone'
import { inSections, type BoardFilter } from './Board'

// Tasks, phases and events on the calendar. Computers: a month grid with bars across their days;
// anything longer than a week is a thin bar in the "periods" strip at the top of the week, so long
// blocks don't bury the days. Phones: an agenda, today first, only the days with something on them.
// Every item carries its section's colour as a stripe; status keeps the fill.

interface Item {
  key: string
  kind: 'task' | 'phase' | 'event'
  title: string
  start: string
  end: string
  /** Time for events, group for tasks. */
  note?: string
  state?: 'done' | 'late' | 'high'
  /** Phases: their status colour. */
  tone?: StatusTone
  open: () => void
  href?: string
  /** Its group's colour (or the section's); null for the whole team. */
  color: string | null
}

const LANES = 5
const PERIOD_LANES = 3
/** Longer than a week: a period. */
const isPeriod = (i: Pick<Item, 'start' | 'end'>) => daysBetween(i.start, i.end) >= 7

/** `phases`: the agenda lists phases starting and ending; the month grid leaves them to the Gantt. */
function useItems(cal: Cal, filter: BoardFilter, from: string, to: string, phases = false) {
  const who = useWho()
  const open = useOpenTask()
  const [params, setParams] = useSearchParams()
  return useMemo(() => {
    const today = todayIso()
    const groups = new Map<string, CalGroup>(cal.groups.map((g) => [g.id, g]))
    // Whole-team things show under every filter.
    const inTeam = (gid: string | null) => !gid || inSections(filter, groups.get(gid)?.team)
    const colorOf = (gid: string | null) => (gid && groups.get(gid) ? groupColor(groups.get(gid)) : null)
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
        color: colorOf(t.group_id),
      })
    }
    if (phases && !filter.mine)
      for (const p of cal.phases) {
        if (!inTeam(p.group_id)) continue
        const start = p.starts_on ?? p.ends_on
        const end = p.ends_on ?? p.starts_on
        if (!start || !end || end < from || start > to) continue
        const g = groups.get(p.group_id)
        items.push({ key: `p${p.id}`, kind: 'phase', title: `${g?.name}: ${p.name}`, start, end, state: p.status === 'done' ? 'done' : undefined, tone: statusTone(p.status, p.starts_on), open: () => {}, href: `/calendar/g/${p.group_id}`, color: colorOf(p.group_id) })
      }
    for (const e of cal.events) {
      if (!inTeam(e.group_id)) continue
      // An event with a status (its own, or its task's) takes the status colours; one without stays plain.
      const status = eventStatus(e, cal.tasks)
      const evStart = isoDay(new Date(e.starts_at))
      const evEnd = e.ends_at ? isoDay(new Date(e.ends_at)) : null
      const tone = status ? statusTone(status, evStart, evEnd, today) : undefined
      for (const o of occurrences(e, from, to)) {
        items.push({
          key: `e${e.id}${o.day}`,
          kind: 'event',
          title: e.title,
          start: o.day,
          end: e.repeat_days?.length ? o.day : isoDay(o.end),
          tone,
          note: e.all_day ? undefined : timeLabel(o.start),
          color: colorOf(e.group_id),
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
        const col = (day: string) => Math.round((toDate(day).getTime() - toDate(ws).getTime()) / 86_400_000)
        // Lanes: each item takes the first row free for all its days this week. Periods get their own.
        const pack = (list: Item[], max: number) => {
          const lanes: string[][] = []
          const placed: { item: Item; lane: number; c0: number; c1: number }[] = []
          const hidden = new Map<number, number>()
          for (const item of list) {
            const c0 = Math.max(0, col(item.start))
            const c1 = Math.min(6, col(item.end))
            let lane = lanes.findIndex((l) => l.slice(c0, c1 + 1).every((x) => !x))
            if (lane === -1) {
              lanes.push(Array(7).fill(''))
              lane = lanes.length - 1
            }
            if (lane >= max) {
              for (let c = c0; c <= c1; c++) hidden.set(c, (hidden.get(c) ?? 0) + 1)
              continue
            }
            for (let c = c0; c <= c1; c++) lanes[lane][c] = item.key
            placed.push({ item, lane, c0, c1 })
          }
          return { placed, hidden, used: Math.min(max, lanes.length) }
        }
        const per = pack(inWeek.filter(isPeriod), PERIOD_LANES)
        const day = pack(inWeek.filter((i) => !isPeriod(i)), LANES)
        const hidden = new Map(day.hidden)
        for (const [c, n] of per.hidden) hidden.set(c, (hidden.get(c) ?? 0) + n)
        const placed = [
          ...per.placed.map((x) => ({ ...x, row: x.lane + 2, period: true })),
          ...day.placed.map((x) => ({ ...x, row: per.used + x.lane + 2, period: false })),
        ]
        const rows = day.used + (hidden.size ? 1 : 0)
        const moreRow = per.used + day.used + 2
        return (
          <div key={ws} className="cal-week" style={{ '--rows': rows, '--prows': per.used } as CSSProperties}>
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
            {placed.map(({ item, row, c0, c1, period }) => {
              const style = { gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: row, ...(item.color ? secStyle(item.color) : {}) }
              const cls = `cal-bar-item cal-bar-item--${item.kind}${period ? ' cal-bar-item--period' : ''}${item.color ? ' sec' : ''}`
              // Bars that started before this week say so with an arrow.
              const label = (
                <>
                  {period && item.start < ws && <span aria-hidden="true">← </span>}
                  {item.note && item.kind === 'event' && <span className="num">{item.note} </span>}
                  <bdi dir="auto">{item.title}</bdi>
                </>
              )
              return item.href ? (
                <Link key={item.key} to={item.href} className={cls} style={style} data-state={item.state} data-tone={item.tone} title={item.title}>
                  {label}
                </Link>
              ) : (
                <button key={item.key} type="button" className={cls} style={style} data-state={item.state} data-tone={item.tone} title={item.note && item.kind === 'task' ? `${item.title} · ${item.note}` : item.title} onClick={item.open}>
                  {label}
                </button>
              )
            })}
            {[...hidden].map(([c, n]) => (
              <button key={`m${c}`} type="button" className="cal-more" style={{ gridColumn: c + 1, gridRow: moreRow }} onClick={() => setMore(addDays(ws, c))}>
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
            <span className={`cal-dot cal-dot--${i.kind}${i.color ? ' sec' : ''}`} style={i.color ? secStyle(i.color) : undefined} data-state={i.state} data-tone={i.tone} aria-hidden="true" />
            <span className="row__main">
              <span className="cal-agenda__title" data-state={i.state}>
                <bdi dir="auto">{i.title}</bdi>
              </span>
              {(i.note || i.start !== i.end) && (
                <span className="soft small num">
                  {[i.kind === 'event' ? i.note : null, i.start !== i.end ? `${dayLabel(i.start)} → ${dayLabel(i.end)}` : null, i.kind === 'task' ? i.note : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {i.kind === 'event' && i.tone && (
              <span className="cal-st cal-agenda__st" data-tone={i.tone}>
                {STATUS_WORD[i.tone === 'wait' || i.tone === 'late' ? 'todo' : i.tone]}
              </span>
            )}
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
    .filter((t) => inSections(filter, cal.groups.find((g) => g.id === t.group_id)?.team))
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
  // Long blocks running today, once at the top instead of on their first day only.
  const running = items.filter((i) => isPeriod(i) && i.start <= today && i.end >= today)

  return (
    <div className="cal-agenda">
      <div className="cal-month__bar">
        <button type="button" className="q-btn q-btn--small" onClick={() => newEvent(today)}>
          <Icon name="plus" size={16} /> Event
        </button>
      </div>
      {running.length > 0 && (
        <section className="cal-agenda__day cal-agenda__periods">
          <h2 className="cal-agenda__date">Running now</h2>
          <DayList items={running} />
        </section>
      )}
      {late.length > 0 && (
        <section className="cal-agenda__day">
          <h2 className="cal-agenda__date cal-agenda__date--late">Late</h2>
          <ul className="rows cal-agenda__list">
            {late.map((t) => (
              <li key={t.id}>
                <button type="button" className="row cal-agenda__btn" onClick={() => open(t.id)}>
                  <span className="cal-dot cal-dot--task" data-state="late" aria-hidden="true" />
                  <span className="row__main">
                    <span className="cal-agenda__title">
                      <bdi dir="auto">{t.title}</bdi>
                    </span>
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
