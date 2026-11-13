import { useCallback } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useWho } from '../lib/auth'
import { addDays, dayLabel, firstName, NEXT_STATUS, setTaskStatus, STATUS_WORD, todayIso, type Task, type TaskStatus } from '../lib/cal'
import type { Progress } from '../lib/calLinked'
import { useSeasons } from '../lib/proto'
import { usePhone } from '../lib/usePhone'
import { putRows, type Cal } from '../lib/useCal'
import { useToast } from './ui'

// Small shared parts of the Calendar pages.

/** The season the Calendar shows: null until the robots are in, so it loads once. */
export function useCalSeason() {
  const { current, loading } = useSeasons()
  return loading ? null : current
}

/** Board | Calendar | Gantt, plus Summary. The view lives in the URL. */
export function CalTabs() {
  const phone = usePhone()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const view = pathname === '/calendar' ? (params.get('view') ?? 'board') : pathname === '/calendar/summary' ? 'summary' : ''
  const keep = (v: string) => {
    const next = new URLSearchParams()
    for (const k of ['team', 'mine', 'done']) if (params.get(k)) next.set(k, params.get(k)!)
    if (v !== 'board') next.set('view', v)
    const q = next.toString()
    return `/calendar${q ? `?${q}` : ''}`
  }
  return (
    <nav className="picks picks--seg cal-tabs" aria-label="Calendar views">
      <Link to={keep('board')} className="pick" aria-current={view === 'board' ? 'page' : undefined}>
        Board
      </Link>
      <Link to={keep('calendar')} className="pick" aria-current={view === 'calendar' ? 'page' : undefined}>
        Calendar
      </Link>
      <Link to={keep('gantt')} className="pick" aria-current={view === 'gantt' ? 'page' : undefined}>
        {/* Phones get the plan as a list; the drag-and-drop Gantt is for computers. */}
        {phone ? 'Plan' : 'Gantt'}
      </Link>
      <Link to="/calendar/summary" className="pick" aria-current={view === 'summary' ? 'page' : undefined}>
        Updates
      </Link>
    </nav>
  )
}

/** Opens a task in the sheet, on whatever Calendar page is showing. */
export function useOpenTask() {
  const [params, setParams] = useSearchParams()
  return useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params)
      if (id) next.set('task', id)
      else next.delete('task')
      setParams(next, { replace: !id })
    },
    [params, setParams],
  )
}

export function StatusIcon({ status }: { status: TaskStatus }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="cal-status__icon">
      <circle cx="11" cy="11" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {status === 'doing' && <path d="M11 4.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />}
      {status === 'done' && (
        <>
          <circle cx="11" cy="11" r="8.5" fill="currentColor" />
          <path d="M7 11.3l2.7 2.7L15 8.6" fill="none" stroke="var(--on-meaning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

/** Tap moves the task on: Not started → In progress → Done (with Undo) → Not started. */
export function StatusButton({ task, cal }: { task: Task; cal: Pick<Cal, 'tasks' | 'waits' | 'owners'> }) {
  const who = useWho()
  const toast = useToast()
  const next = NEXT_STATUS[task.status]
  const go = async (to: TaskStatus, from: Task) => {
    if (!who) return
    // Shown at once; the save follows.
    putRows('tasks', [{ ...from, status: to }])
    const res = await setTaskStatus(from, to, who, cal)
    if (res.error) {
      putRows('tasks', [from])
      return toast(res.error)
    }
    if (res.data) putRows('tasks', [res.data])
    if (to === 'done')
      toast(`${task.title} done`, {
        undo: () => go(from.status, { ...from, status: 'done' }),
      })
  }
  return (
    <button
      type="button"
      className="cal-status"
      data-status={task.status}
      aria-label={`${STATUS_WORD[task.status]}. Mark ${STATUS_WORD[next].toLowerCase()}`}
      title={`${STATUS_WORD[task.status]}. Tap for ${STATUS_WORD[next].toLowerCase()}`}
      onClick={(e) => {
        e.stopPropagation()
        go(next, task)
      }}
    >
      <StatusIcon status={task.status} />
    </button>
  )
}

export function DueLabel({ task }: { task: Pick<Task, 'due_on' | 'starts_on' | 'status'> }) {
  if (!task.due_on) return null
  const today = todayIso()
  const late = task.status !== 'done' && task.due_on < today
  // Due in the next three days: check this.
  const soon = task.status !== 'done' && !late && task.due_on <= addDays(today, 3)
  return (
    <span className="cal-due num" data-late={late || undefined} data-soon={soon || undefined}>
      {dayLabel(task.due_on)}
    </span>
  )
}

export function HighTag() {
  return <span className="tag tag--bad">High</span>
}

/** One task: status button, name and who, due day. The row opens the task. */
export function TaskRow({ task, cal, nameOf, showGroup }: { task: Task; cal: Cal; nameOf: (id: string | null) => string | null; showGroup?: boolean }) {
  const open = useOpenTask()
  const owners = cal.owners.filter((o) => o.task_id === task.id).map((o) => firstName(nameOf(o.user_id)))
  const subs = cal.tasks.filter((t) => t.parent_id === task.id)
  const waitsFor = cal.waits
    .filter((w) => w.task_id === task.id)
    .map((w) => cal.tasks.find((t) => t.id === w.waits_for_id))
    .filter((t): t is Task => !!t && t.status !== 'done')
  const group = showGroup ? cal.groups.find((g) => g.id === task.group_id)?.name : null
  const meta = [
    group,
    owners.filter(Boolean).join(', '),
    subs.length ? `${subs.filter((s) => s.status === 'done').length}/${subs.length}` : '',
    task.status === 'doing' ? 'In progress' : '',
  ].filter(Boolean)
  return (
    <li className="cal-row" data-status={task.status}>
      <StatusButton task={task} cal={cal} />
      <button type="button" className="cal-row__main" onClick={() => open(task.id)}>
        <span className="cal-row__title">{task.title}</span>
        {(meta.length > 0 || waitsFor.length > 0) && (
          <span className="soft small cal-row__meta">
            {meta.join(' · ')}
            {waitsFor.length > 0 && (
              <span className="cal-row__waits">
                {meta.length ? ' · ' : ''}waits for {waitsFor.map((t) => t.title).join(', ')}
              </span>
            )}
          </span>
        )}
      </button>
      <span className="cal-row__end">
        {task.priority === 'high' && task.status !== 'done' && <HighTag />}
        <DueLabel task={task} />
      </span>
    </li>
  )
}

export function ProgressBar({ p }: { p: Progress | undefined }) {
  if (!p || p.share == null) return null
  return (
    <span className="cal-bar" role="img" aria-label={`${Math.round(p.share * 100)}%`}>
      <span className="cal-bar__fill" style={{ width: `${Math.round(p.share * 100)}%` }} />
    </span>
  )
}
