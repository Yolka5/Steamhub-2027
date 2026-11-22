import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { Sheet, useBusy, useToast } from './ui'
import { useOpenTask } from './cal'
import { DateRange } from './DateRange'
import { useWho } from '../lib/auth'
import { shrink } from '../lib/actions'
import {
  addNote,
  dayLabel,
  deleteNote,
  deletePhase,
  editNote,
  firstName,
  isoDay,
  mentionsIn,
  movePhases,
  pushPhases,
  setPhaseStatus,
  setTaskStatus,
  statusTone,
  STATUSES,
  STATUS_WORD,
  taskOrder,
  timePill,
  updatePhase,
  uploadNotePhoto,
  type Phase,
  type PhaseNote,
  type Task,
  type TaskStatus,
} from '../lib/cal'
import { showSuggest, type Progress } from '../lib/calLinked'
import type { Profile } from '../lib/mfg'
import { useSigned } from '../lib/proto'
import { applyRow, putRows, type Cal } from '../lib/useCal'
import { QuickAdd } from '../pages/cal/Board'
import { count } from '../lib/words'

// The Calendar's rows, shared by the Board and the group page so they read the same everywhere:
//   name · progress · notes · status · dates
// Status and dates are fixed-width pills that line up down the page (CALENDAR.md, Readability pass).

// ---------- Opening things through the URL, so a link (or a notification) lands on them ----------

function useParamOpener(key: string) {
  const [params, setParams] = useSearchParams()
  return useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params)
      if (id) next.set(key, id)
      else next.delete(key)
      setParams(next, { replace: !id })
    },
    [params, setParams, key],
  )
}
export const useOpenPhase = () => useParamOpener('phase')
export const useOpenNotes = () => useParamOpener('notes')

// ---------- Status pill and its menu ----------

export function StatusPill({
  status,
  startsOn,
  dueOn,
  onPick,
  label,
}: {
  status: TaskStatus
  startsOn: string | null
  dueOn?: string | null
  /** Without it the pill only shows. */
  onPick?: (s: TaskStatus) => void
  label?: string
}) {
  const tone = statusTone(status, startsOn, dueOn ?? null)
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const inner = (
    <>
      {status === 'done' && <Icon name="check" size={14} />}
      {STATUS_WORD[status]}
    </>
  )
  if (!onPick)
    return (
      <span className="cal-st" data-tone={tone}>
        {inner}
      </span>
    )
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="cal-st"
        data-tone={tone}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label ? `${label}: ` : ''}${STATUS_WORD[status]}. Change status`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {inner}
      </button>
      {open && (
        <StatusMenu
          anchor={btn.current!}
          current={status}
          startsOn={startsOn}
          onClose={() => setOpen(false)}
          onPick={(s) => {
            setOpen(false)
            btn.current?.focus()
            if (s !== status) onPick(s)
          }}
        />
      )}
    </>
  )
}

function StatusMenu({ anchor, current, startsOn, onPick, onClose }: { anchor: HTMLElement; current: TaskStatus; startsOn: string | null; onPick: (s: TaskStatus) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight ?? 140
    const w = ref.current?.offsetWidth ?? 180
    const below = r.bottom + 6 + h < window.innerHeight
    setPos({ left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8), top: below ? r.bottom + 6 : r.top - 6 - h })
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }, [anchor])
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const scroll = () => onClose()
    document.addEventListener('pointerdown', away)
    window.addEventListener('scroll', scroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('scroll', scroll, { capture: true })
    }
  }, [anchor, onClose])
  // Inside an open <dialog> the menu has to live in it, or the dialog makes it unclickable.
  const host = (anchor.closest('dialog') as HTMLElement | null) ?? document.body
  return createPortal(
    <div
      ref={ref}
      className="cal-st-menu"
      role="menu"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          items[(i + 1) % items.length]?.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          items[(i + items.length - 1) % items.length]?.focus()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
          anchor.focus()
        }
      }}
    >
      {STATUSES.map((s) => (
        <button key={s} type="button" role="menuitemradio" aria-checked={s === current} className="cal-st" data-tone={statusTone(s, startsOn)} onClick={() => onPick(s)}>
          {s === 'done' && <Icon name="check" size={14} />}
          {STATUS_WORD[s]}
        </button>
      ))}
    </div>,
    host,
  )
}

// ---------- Date pill ----------

export function DatePill({
  start,
  end,
  status,
  doneDay,
  onClick,
  label,
}: {
  start: string | null
  end: string | null
  status: TaskStatus
  doneDay?: string | null
  onClick?: () => void
  label?: string
}) {
  const t = timePill({ start, end, status, doneDay })
  const inner = (
    <>
      <span className="cal-dp__fill" style={{ width: `${Math.round(t.fill * 100)}%` }} aria-hidden="true" />
      <span className="cal-dp__txt">
        {t.label}
        {t.extra && <em>{t.extra}</em>}
      </span>
    </>
  )
  if (!onClick)
    return (
      <span className="cal-dp num" data-tone={t.tone}>
        {inner}
      </span>
    )
  return (
    <button type="button" className="cal-dp num" data-tone={t.tone} onClick={onClick} aria-label={`${label ? `${label}: ` : ''}${t.label}${t.extra ? `, ${t.extra}` : ''}. Edit`}>
      {inner}
    </button>
  )
}

const doneDayOf = (at: string | null) => (at ? isoDay(new Date(at)) : null)

// ---------- Owners as initials ----------

const initials = (name: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

export function Initials({ ids, nameOf }: { ids: string[]; nameOf: (id: string | null) => string | null }) {
  if (!ids.length) return null
  return (
    <span className="cal-avs">
      {ids.map((id) => (
        <span key={id} className="avatar avatar--soft cal-av" title={nameOf(id) ?? 'Someone'}>
          {initials(nameOf(id))}
        </span>
      ))}
    </span>
  )
}

// ---------- Saving a phase, shown at once ----------

function usePhaseSave() {
  const toast = useToast()
  return async (p: Phase, patch: Partial<Phase>) => {
    putRows('cal_phases', [{ ...p, ...patch }])
    const res = await updatePhase(p.id, patch)
    if (res.error) {
      putRows('cal_phases', [p])
      toast(res.error)
      return false
    }
    putRows('cal_phases', [res.data!])
    return true
  }
}

function usePhaseStatus() {
  const who = useWho()
  const toast = useToast()
  return async (p: Phase, status: TaskStatus, doneAt?: string | null, message?: string) => {
    if (!who) return
    const optimistic = status === 'done' ? { status, done_at: doneAt ?? new Date().toISOString() } : { status, done_at: null }
    putRows('cal_phases', [{ ...p, ...optimistic }])
    const res = await setPhaseStatus(p, status, who, doneAt)
    if (res.error) {
      putRows('cal_phases', [p])
      return toast(res.error)
    }
    putRows('cal_phases', [res.data!])
    if (status === 'done')
      toast(message ?? `${p.name} done`, {
        undo: async () => {
          putRows('cal_phases', [p])
          const r = await setPhaseStatus(p, p.status, who, p.done_at)
          if (r.data) putRows('cal_phases', [r.data])
        },
      })
  }
}

function useTaskStatus(cal: Cal) {
  const who = useWho()
  const toast = useToast()
  const go = async (t: Task, to: TaskStatus) => {
    if (!who) return
    putRows('tasks', [{ ...t, status: to }])
    const res = await setTaskStatus(t, to, who, cal)
    if (res.error) {
      putRows('tasks', [t])
      return toast(res.error)
    }
    if (res.data) putRows('tasks', [res.data])
    if (to === 'done') toast(`${t.title} done`, { undo: () => go({ ...t, status: 'done' }, t.status) })
  }
  return go
}

// ---------- One task, in the same columns as its phase ----------

export function CalTaskRow({ task, cal, nameOf, showGroup }: { task: Task; cal: Cal; nameOf: (id: string | null) => string | null; showGroup?: boolean }) {
  const open = useOpenTask()
  const setStatus = useTaskStatus(cal)
  const owners = cal.owners.filter((o) => o.task_id === task.id).map((o) => o.user_id)
  const subs = cal.tasks.filter((t) => t.parent_id === task.id)
  const waitsFor = cal.waits
    .filter((w) => w.task_id === task.id)
    .map((w) => cal.tasks.find((t) => t.id === w.waits_for_id))
    .filter((t): t is Task => !!t && t.status !== 'done')
  const group = showGroup ? cal.groups.find((g) => g.id === task.group_id)?.name : null
  return (
    <li className="cal-line cal-line--task" data-status={task.status}>
      <div className="cal-line__name">
        <button type="button" className="cal-line__title" onClick={() => open(task.id)}>
          {task.title}
        </button>
        {task.priority === 'high' && task.status !== 'done' && <span className="tag tag--bad cal-hi">High</span>}
        {subs.length > 0 && (
          <span className="soft small num">
            {subs.filter((s) => s.status === 'done').length}/{subs.length}
          </span>
        )}
      </div>
      <div className="cal-line__mid">
        <Initials ids={owners} nameOf={nameOf} />
        {(group || waitsFor.length > 0) && (
          <span className="soft small cal-line__meta">
            {[group, waitsFor.length ? `waits for ${waitsFor.map((t) => t.title).join(', ')}` : ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <span className="cal-line__chip" />
      <StatusPill status={task.status} startsOn={task.starts_on} dueOn={task.due_on} label={task.title} onPick={(s) => setStatus(task, s)} />
      <DatePill start={task.starts_on} end={task.due_on} status={task.status} doneDay={doneDayOf(task.done_at)} label={task.title} onClick={() => open(task.id)} />
    </li>
  )
}

/**
 * A group's tasks split by section ("To-Do December", from the Monday group they came from):
 * tasks with no section first, then each section under its name, the add line at the end.
 */
export function SectionedTasks(props: Parameters<typeof TaskList>[0]) {
  const { tasks, addTo, ...rest } = props
  const names = [...new Set(tasks.map((t) => t.section?.trim()).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b))
  if (!names.length) return <TaskList {...props} />
  const plain = tasks.filter((t) => !t.section?.trim())
  return (
    <div className="cal-sections">
      {plain.length > 0 && <TaskList tasks={plain} {...rest} />}
      {names.map((name) => (
        <section key={name} className="cal-section">
          <h3 className="cal-loose__head">{name}</h3>
          <TaskList tasks={tasks.filter((t) => t.section?.trim() === name)} {...rest} />
        </section>
      ))}
      {addTo && <TaskList tasks={[]} addTo={addTo} {...rest} />}
    </div>
  )
}

/** Open tasks, then "4 done" folded, then a line to add one. */
export function TaskList({
  tasks,
  cal,
  nameOf,
  people,
  addTo,
  showDone,
  openAdd,
}: {
  tasks: Task[]
  cal: Cal
  nameOf: (id: string | null) => string | null
  people: Profile[]
  addTo?: { group: Cal['groups'][number]; phaseId: string | null }
  showDone?: boolean
  /** The add box already open (inside an opened phase); otherwise a small + Task button. */
  openAdd?: boolean
}) {
  const [doneOpen, setDoneOpen] = useState(false)
  const sorted = [...tasks].sort(taskOrder)
  const open = sorted.filter((t) => t.status !== 'done')
  const done = sorted.filter((t) => t.status === 'done')
  return (
    <div className="cal-tasks">
      {open.length > 0 && (
        <ul className="cal-lines">
          {open.map((t) => (
            <CalTaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          {(doneOpen || showDone) && (
            <ul className="cal-lines">
              {done.map((t) => (
                <CalTaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
              ))}
            </ul>
          )}
          {!showDone && (
            <button type="button" className="cal-done-fold" aria-expanded={doneOpen} onClick={() => setDoneOpen((o) => !o)}>
              {doneOpen ? 'Hide done' : `${done.length} done`}
            </button>
          )}
        </>
      )}
      {addTo && <QuickAdd group={addTo.group} cal={cal} people={people} phaseId={addTo.phaseId} compact={!openAdd} autoFocus={openAdd ? false : undefined} />}
    </div>
  )
}

// ---------- One phase ----------

export function PhaseRow({
  p,
  cal,
  prog,
  bar,
  nameOf,
  people,
  open,
  onFold,
  nameLink,
  big,
  filterTasks,
}: {
  p: Phase
  cal: Cal
  prog: Progress | undefined
  bar?: 'doing' | 'next'
  nameOf: (id: string | null) => string | null
  people: Profile[]
  /** Its tasks are showing. */
  open: boolean
  onFold: () => void
  /** The name goes to the group page (on the Board). */
  nameLink?: string
  /** Read-only big view for meetings. */
  big?: boolean
  filterTasks?: (t: Task) => boolean
}) {
  const openPhase = useOpenPhase()
  const openNotes = useOpenNotes()
  const setStatus = usePhaseStatus()
  const save = usePhaseSave()
  const group = cal.groups.find((g) => g.id === p.group_id)
  const all = cal.tasks.filter((t) => t.phase_id === p.id && !t.parent_id)
  const tasks = filterTasks ? all.filter(filterTasks) : all
  const doneCount = all.filter((t) => t.status === 'done').length
  const line = prog?.line ?? (all.length ? `${doneCount} of ${count(all.length, 'task')} done` : 'No tasks yet')
  const share = prog ? prog.share : all.length ? doneCount / all.length : null
  const notes = cal.notes.filter((n) => n.phase_id === p.id && !n.parent_id).length
  const suggest = !big && showSuggest(p, prog)

  const name = (
    <span className="cal-line__title">
      {p.status === 'done' && <Icon name="check" size={15} />}
      {p.name}
    </span>
  )

  return (
    <li className="cal-phase-item">
      <div className="cal-line cal-line--phase" data-status={p.status} data-bar={bar}>
        <div className="cal-line__name">
          {!big && (
            <button type="button" className="icon-btn cal-line__fold" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${p.name} tasks`} onClick={onFold}>
              <Icon name={open ? 'down' : 'next'} size={16} />
            </button>
          )}
          {nameLink && !big ? (
            <Link to={nameLink} className="cal-line__link">
              {name}
            </Link>
          ) : (
            name
          )}
          {!big && (
            <button type="button" className="icon-btn cal-line__edit" aria-label={`Edit ${p.name}`} onClick={() => openPhase(p.id)}>
              <Icon name="edit" size={15} />
            </button>
          )}
        </div>
        <div className="cal-line__mid">
          {share != null && p.status !== 'done' && (
            <span className="cal-bar" role="img" aria-label={`${Math.round(share * 100)}%`}>
              <span className="cal-bar__fill" style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
          )}
          <span className="soft small cal-line__meta">{line}</span>
        </div>
        {big ? (
          <span className="cal-line__chip" />
        ) : (
          <button type="button" className="cal-note-chip" data-has={notes ? true : undefined} aria-label={`${notes} ${notes === 1 ? 'note' : 'notes'} on ${p.name}`} onClick={() => openNotes(p.id)}>
            <Icon name="note" size={16} />
            {notes > 0 && <span className="num">{notes}</span>}
          </button>
        )}
        <StatusPill status={p.status} startsOn={p.starts_on} label={p.name} onPick={big ? undefined : (s) => setStatus(p, s)} />
        <DatePill start={p.starts_on} end={p.ends_on} status={p.status} doneDay={doneDayOf(p.done_at)} label={p.name} onClick={big ? undefined : () => openPhase(p.id)} />
      </div>

      {suggest && (
        <div className="cal-suggest" role="status">
          <span>{prog!.suggest}</span>
          <span className="cal-suggest__acts">
            <button type="button" className="q-btn q-btn--small" onClick={() => save(p, { dismissed_for: prog!.key, suggested_at: null })}>
              Not yet
            </button>
            <button
              type="button"
              className="q-btn q-btn--small q-btn--main"
              onClick={() => {
                const at = prog!.doneAt ?? null
                const day = doneDayOf(at)
                setStatus(p, 'done', at, day && day !== isoDay(new Date()) ? `${p.name} finished ${dayLabel(day)}, when the work was done` : `${p.name} finished`)
              }}
            >
              Finish
            </button>
          </span>
        </div>
      )}

      {open && !big && group && <TaskList tasks={tasks} cal={cal} nameOf={nameOf} people={people} addTo={{ group, phaseId: p.id }} openAdd />}
    </li>
  )
}

/** Column titles over a group's phases, computers only. */
export function LineHead({ first = 'Phase' }: { first?: string }) {
  return (
    <div className="cal-line-head" aria-hidden="true">
      <span>{first}</span>
      <span>Progress</span>
      <span />
      <span>Status</span>
      <span>Dates</span>
    </div>
  )
}

/** Which phases show their tasks: remembered on this device. */
const OPEN_KEY = 'cal-open-phases'
export function useOpenPhases() {
  const [openSet, setOpenSet] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const toggle = (id: string) =>
    setOpenSet((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...n]))
      } catch {
        /* private mode: lasts this visit */
      }
      return n
    })
  return [openSet, toggle] as const
}

// ---------- Phase editor: name, dates, order, delete ----------

export function PhaseEditorHost({ cal }: { cal: Cal }) {
  const [params] = useSearchParams()
  const openPhase = useOpenPhase()
  const id = params.get('phase')
  const p = id ? cal.phases.find((x) => x.id === id) : undefined
  return (
    <Sheet open={!!id && !cal.loading} onClose={() => openPhase(null)} title={p ? 'Phase' : 'Phase not found'}>
      {p ? <PhaseEditor key={p.id} p={p} cal={cal} onDone={() => openPhase(null)} /> : <p className="soft">This phase was deleted.</p>}
    </Sheet>
  )
}

function PhaseEditor({ p, cal, onDone }: { p: Phase; cal: Cal; onDone: () => void }) {
  const toast = useToast()
  const save = usePhaseSave()
  const setStatus = usePhaseStatus()
  const [name, setName] = useState(p.name)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setName(p.name), [p.name])
  const phases = cal.phases.filter((x) => x.group_id === p.group_id).sort((a, b) => a.sort - b.sort)
  const i = phases.findIndex((x) => x.id === p.id)
  const prev = phases[i - 1]
  const tasks = cal.tasks.filter((t) => t.phase_id === p.id && !t.parent_id).length
  const group = cal.groups.find((g) => g.id === p.group_id)

  const setDates = async (starts_on: string | null, ends_on: string | null) => {
    if (starts_on && ends_on && ends_on < starts_on) return toast('The end has to be on or after the start.')
    const moves = pushPhases({ id: p.id, starts_on, ends_on }, cal.phases)
    const before = moves.map((m) => {
      const o = cal.phases.find((x) => x.id === m.id)!
      return { id: o.id, starts_on: o.starts_on, ends_on: o.ends_on }
    })
    putRows('cal_phases', moves.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
    const res = await movePhases(moves)
    if (res.error) {
      putRows('cal_phases', before.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
      return toast(res.error)
    }
    if (moves.length > 1)
      toast(`The ${moves.length - 1 === 1 ? 'next phase' : `next ${moves.length - 1} phases`} moved later`, {
        undo: async () => {
          putRows('cal_phases', before.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
          await movePhases(before)
        },
      })
  }

  const swap = async (dir: -1 | 1) => {
    const other = phases[i + dir]
    if (!other) return
    putRows('cal_phases', [
      { ...p, sort: other.sort },
      { ...other, sort: p.sort },
    ])
    const a = await updatePhase(p.id, { sort: other.sort })
    const b = await updatePhase(other.id, { sort: p.sort })
    if (a.error || b.error) toast(a.error ?? b.error!)
  }

  const remove = async () => {
    const res = await deletePhase(p.id)
    if (res.error) return toast(res.error)
    applyRow('cal_phases', 'delete', p)
    onDone()
    toast(`${p.name} deleted${tasks ? `. Its ${tasks} ${tasks === 1 ? 'task stays' : 'tasks stay'} in the group.` : ''}`)
  }

  return (
    <div className="cal-ph-edit">
      <input
        className="field cal-ph-edit__name"
        aria-label="Phase name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={() => {
          const n = name.trim()
          if (!n) return setName(p.name)
          if (n !== p.name) save(p, { name: n })
        }}
      />
      {group && <p className="soft small cal-ph-edit__group">{group.name}</p>}
      <div className="tsheet__grid">
        <span className="tsheet__label">Status</span>
        <div className="cal-st-picks" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={p.status === s} className="cal-st" data-tone={statusTone(s, p.starts_on)} onClick={() => s !== p.status && setStatus(p, s)}>
              {s === 'done' && <Icon name="check" size={14} />}
              {STATUS_WORD[s]}
            </button>
          ))}
        </div>
        <span className="tsheet__label">Dates</span>
        <DateRange start={p.starts_on} end={p.ends_on} onChange={setDates} />
        <span className="tsheet__label">Time</span>
        <div>
          <DatePill start={p.starts_on} end={p.ends_on} status={p.status} doneDay={doneDayOf(p.done_at)} />
        </div>
        {prev && (
          <>
            <span className="tsheet__label" />
            <label className="check small">
              <input type="checkbox" checked={p.follows_previous} onChange={(e) => save(p, { follows_previous: e.target.checked })} />
              Starts after {prev.name}
            </label>
          </>
        )}
        {phases.length > 1 && (
          <>
            <span className="tsheet__label">Order</span>
            <div className="cal-ph-edit__row">
              {i > 0 && (
                <button type="button" className="q-btn q-btn--small" onClick={() => swap(-1)}>
                  <Icon name="up" size={16} /> Earlier
                </button>
              )}
              {i < phases.length - 1 && (
                <button type="button" className="q-btn q-btn--small" onClick={() => swap(1)}>
                  <Icon name="down" size={16} /> Later
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="tsheet__foot">
        {confirm ? (
          <span className="tsheet__confirm">
            <button type="button" className="q-btn" onClick={() => setConfirm(false)}>
              Keep it
            </button>
            <button type="button" className="q-btn q-btn--danger" onClick={remove}>
              Delete phase
            </button>
          </span>
        ) : (
          <button type="button" className="q-btn" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
        <button type="button" className="q-btn cal-ph-edit__done" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

// ---------- Phase notes: a side panel on computers, a sheet on phones ----------

export function NotesHost({ cal, people }: { cal: Cal; people: Profile[] }) {
  const [params] = useSearchParams()
  const openNotes = useOpenNotes()
  const id = params.get('notes')
  const p = id ? cal.phases.find((x) => x.id === id) : undefined
  const ref = useRef<HTMLDialogElement>(null)
  const show = !!id && !cal.loading
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (show && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!show && d.open) d.close()
  }, [show])
  return (
    <dialog
      ref={ref}
      className="cal-notes"
      aria-label={p ? `${p.name} notes` : 'Notes'}
      onClose={() => openNotes(null)}
      onClick={(e) => {
        if (e.target === ref.current) openNotes(null)
      }}
    >
      {show && (p ? <NotesBody key={p.id} p={p} cal={cal} people={people} onClose={() => openNotes(null)} /> : <NotesMissing onClose={() => openNotes(null)} />)}
    </dialog>
  )
}

function NotesMissing({ onClose }: { onClose: () => void }) {
  return (
    <div className="cal-notes__head">
      <h2 className="cal-notes__title">Not found</h2>
      <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
        <Icon name="close" />
      </button>
      <p className="soft">This phase was deleted, or it belongs to another season.</p>
    </div>
  )
}

const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso)
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 12) return `${h} h ago`
  return dayLabel(isoDay(new Date(iso)))
}

/** "@Noa" in orange; the rest as typed. */
function NoteText({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}][\p{L}\d_-]*)/u)
  return (
    <p className="cal-note__text" dir="auto">
      {parts.map((s, i) =>
        s.startsWith('@') ? (
          <span key={i} className="cal-note__at">
            {s}
          </span>
        ) : (
          s
        ),
      )}
    </p>
  )
}

function Photos({ paths }: { paths: string[] }) {
  const url = useSigned(paths)
  if (!paths.length) return null
  return (
    <div className="cal-note__photos">
      {paths.map((p) => {
        const u = url(p)
        return u ? (
          <a key={p} href={u} target="_blank" rel="noreferrer" className="cal-note__photo">
            <img src={u} alt="Photo on the note" loading="lazy" />
          </a>
        ) : (
          <span key={p} className="cal-note__photo cal-note__photo--wait" />
        )
      })}
    </div>
  )
}

/** A text box that suggests people after @, and can take photos. */
function Writer({
  phaseId,
  people,
  placeholder,
  send,
  autoFocus,
  initial = '',
  photosAllowed = true,
  hint,
  onCancel,
  cta = 'Send',
}: {
  phaseId: string
  people: Profile[]
  placeholder: string
  send: (text: string, photos: string[], mentions: string[]) => Promise<boolean>
  autoFocus?: boolean
  initial?: string
  photosAllowed?: boolean
  hint?: ReactNode
  onCancel?: () => void
  cta?: string
}) {
  const toast = useToast()
  const [text, setText] = useState(initial)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(0)
  const [busy, run] = useBusy()
  const [caret, setCaret] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const active = useMemo(() => people.filter((p) => !p.banned && !p.shared), [people])
  const typing = /@([\p{L}][\p{L}\d_-]*)?$/u.exec(text.slice(0, caret))
  const hits = typing ? active.filter((p) => p.name.toLowerCase().includes((typing[1] ?? '').toLowerCase())).slice(0, 5) : []
  const mentioned = mentionsIn(text, active)
  const url = useSigned(photos)

  const pick = (p: Profile) => {
    const before = text.slice(0, caret).replace(/@([\p{L}][\p{L}\d_-]*)?$/u, `@${firstName(p.name)} `)
    const next = before + text.slice(caret)
    setText(next)
    setCaret(before.length)
    window.setTimeout(() => {
      ta.current?.focus()
      ta.current?.setSelectionRange(before.length, before.length)
    }, 0)
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    for (const f of [...files]) {
      setUploading((n) => n + 1)
      try {
        const res = await uploadNotePhoto(phaseId, await shrink(f, 1600))
        if (res.error) toast(res.error)
        else setPhotos((ps) => [...ps, res.path!])
      } catch {
        toast("That photo couldn't be read")
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const go = () =>
    run(async () => {
      const t = text.trim()
      if (!t && !photos.length) return ta.current?.focus()
      if (uploading) return toast('Wait for the photo to finish uploading')
      if (await send(t, photos, mentioned)) {
        setText('')
        setPhotos([])
      }
    })

  return (
    <div className="cal-write">
      <textarea
        ref={ta}
        className="cal-write__text"
        rows={2}
        value={text}
        placeholder={placeholder}
        data-autofocus={autoFocus || undefined}
        autoFocus={autoFocus}
        dir="auto"
        aria-label={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            go()
          }
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      {hits.length > 0 && (
        <div className="cal-write__people" role="listbox" aria-label="Mention someone">
          {hits.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span className="avatar avatar--soft cal-av">{initials(p.name)}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {(photos.length > 0 || uploading > 0) && (
        <div className="cal-note__photos">
          {photos.map((p) => (
            <span key={p} className="cal-note__photo">
              {url(p) && <img src={url(p)!} alt="" />}
              <button type="button" className="cal-note__unphoto" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}>
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <span key={`u${i}`} className="cal-note__photo cal-note__photo--wait" />
          ))}
        </div>
      )}
      <div className="cal-write__bar">
        {photosAllowed && (
          <label className="icon-btn cal-write__cam" aria-label="Add a photo">
            <Icon name="camera" size={18} />
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files).then(() => (e.target.value = ''))} />
          </label>
        )}
        <span className="soft small cal-write__hint">
          {mentioned.length ? `${mentioned.map((id) => firstName(active.find((p) => p.id === id)?.name)).join(', ')} will get a notification.` : hint}
        </span>
        {onCancel && (
          <button type="button" className="q-btn q-btn--small" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="q-btn q-btn--small q-btn--main" onClick={go}>
          {busy ? 'Sending' : cta}
        </button>
      </div>
    </div>
  )
}

function NotesBody({ p, cal, people, onClose }: { p: Phase; cal: Cal; people: Profile[]; onClose: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const nameOf = (id: string | null) => people.find((x) => x.id === id)?.name ?? null
  const group = cal.groups.find((g) => g.id === p.group_id)
  const notes = cal.notes.filter((n) => n.phase_id === p.id)
  const top = notes.filter((n) => !n.parent_id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const repliesOf = (id: string) => notes.filter((n) => n.parent_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))

  const send = async (text: string, photos: string[], mentions: string[], parent: string | null = null) => {
    if (!who) return false
    const res = await addNote({ phase_id: p.id, parent_id: parent, text, photos, mentions }, who)
    if (res.error) {
      toast(res.error)
      return false
    }
    putRows('phase_notes', [res.data!])
    return true
  }

  const remove = async (n: PhaseNote) => {
    applyRow('phase_notes', 'delete', n)
    const res = await deleteNote(n)
    if (res.error) {
      putRows('phase_notes', [n])
      toast(res.error)
    } else toast('Note deleted')
  }

  const one = (n: PhaseNote, reply: boolean) => {
    const mine = n.author_id === who?.userId
    return (
      <li key={n.id} className="cal-note" data-reply={reply || undefined}>
        <span className="avatar avatar--soft cal-av" aria-hidden="true">
          {initials(nameOf(n.author_id))}
        </span>
        <div className="cal-note__body">
          <div className="cal-note__who small">
            <span className="strong">{firstName(nameOf(n.author_id)) || 'Someone'}</span>
            <span className="soft">
              {' '}
              · {ago(n.created_at)}
              {n.updated_at > n.created_at && Date.parse(n.updated_at) - Date.parse(n.created_at) > 60_000 ? ' · edited' : ''}
            </span>
          </div>
          {editing === n.id ? (
            <Writer
              phaseId={p.id}
              people={people}
              placeholder="Edit the note"
              initial={n.text}
              photosAllowed={false}
              autoFocus
              cta="Save"
              onCancel={() => setEditing(null)}
              send={async (text, _ph, mentions) => {
                if (!text && !n.photos.length) return false
                const res = await editNote(n.id, { text, mentions })
                if (res.error) {
                  toast(res.error)
                  return false
                }
                putRows('phase_notes', [res.data!])
                setEditing(null)
                return true
              }}
            />
          ) : (
            <>
              {n.text && <NoteText text={n.text} />}
              <Photos paths={n.photos} />
            </>
          )}
          {editing !== n.id && (
            <div className="cal-note__acts">
              {!reply && (
                <button type="button" className="text-btn small" onClick={() => setReplyTo(replyTo === n.id ? null : n.id)}>
                  Reply
                </button>
              )}
              {mine && (
                <>
                  <button type="button" className="text-btn small" onClick={() => setEditing(n.id)}>
                    Edit
                  </button>
                  <button type="button" className="text-btn small" onClick={() => remove(n)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
          {!reply && (repliesOf(n.id).length > 0 || replyTo === n.id) && (
            <ol className="cal-note__replies">
              {repliesOf(n.id).map((r) => one(r, true))}
              {replyTo === n.id && (
                <li>
                  <Writer
                    phaseId={p.id}
                    people={people}
                    placeholder={`Reply to ${firstName(nameOf(n.author_id)) || 'this'}`}
                    autoFocus
                    cta="Reply"
                    onCancel={() => setReplyTo(null)}
                    send={async (text, photos, mentions) => {
                      const ok = await send(text, photos, mentions, n.id)
                      if (ok) setReplyTo(null)
                      return ok
                    }}
                  />
                </li>
              )}
            </ol>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      <div className="cal-notes__head">
        <h2 className="cal-notes__title">
          {p.name}
          {group && <span className="soft"> · {group.name}</span>}
        </h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="cal-notes__pills">
        <StatusPill status={p.status} startsOn={p.starts_on} />
        <DatePill start={p.starts_on} end={p.ends_on} status={p.status} doneDay={doneDayOf(p.done_at)} />
      </div>
      <Writer
        phaseId={p.id}
        people={people}
        placeholder="Small update: what works, what broke"
        autoFocus
        hint="Leads, Tom, mentors and admins get it. Type @ to mention someone."
        send={(t, ph, m) => send(t, ph, m)}
      />
      {top.length ? (
        <ol className="cal-notes__list">{top.map((n) => one(n, false))}</ol>
      ) : (
        <p className="soft cal-notes__empty">No notes yet. Small updates go here; the detailed one is the daily update.</p>
      )}
    </>
  )
}
