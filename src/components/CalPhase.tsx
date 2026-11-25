import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { Sheet, useBusy, useToast } from './ui'
import { useOpenTask } from './cal'
import { DateRange } from './DateRange'
import { useWho } from '../lib/auth'
import { CommentChip } from './Comments'
import {
  createList,
  dayLabel,
  deleteList,
  deletePhase,
  isoDay,
  movePhases,
  pushPhases,
  setPhaseStatus,
  setTaskStatus,
  statusTone,
  STATUSES,
  STATUS_WORD,
  taskOrder,
  timePill,
  updateList,
  updatePhase,
  type CalList,
  type Phase,
  type Task,
  type TaskStatus,
  isClosed,
} from '../lib/cal'
import { showSuggest, type Progress } from '../lib/calLinked'
import type { Profile } from '../lib/mfg'
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
    .filter((t): t is Task => !!t && !isClosed(t.status))
  const group = showGroup ? cal.groups.find((g) => g.id === task.group_id)?.name : null
  return (
    <li className="cal-line cal-line--task" data-status={task.status}>
      <div className="cal-line__name">
        <button type="button" className="cal-line__title" dir="auto" onClick={() => open(task.id)}>
          {task.title}
        </button>
        {task.gh_number != null && <span className="soft small num cal-gh">#{task.gh_number}</span>}
        {task.priority === 'high' && !isClosed(task.status) && <span className="tag tag--bad cal-hi">High</span>}
        {subs.length > 0 && (
          <span className="soft small num">
            {subs.filter((s) => s.status === 'done').length}/{subs.filter((s) => s.status !== 'cancelled').length}
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
      <CommentChip cal={cal} kind="task" id={task.id} label={task.title} />
      <StatusPill status={task.status} startsOn={task.starts_on} dueOn={task.due_on} label={task.title} onPick={task.source === 'github' ? undefined : (s) => setStatus(task, s)} />
      <DatePill start={task.starts_on} end={task.due_on} status={task.status} doneDay={doneDayOf(task.done_at)} label={task.title} onClick={() => open(task.id)} />
    </li>
  )
}

/**
 * A group's tasks split by list ("To-Do December"): tasks in no list first, then each list in
 * its order, with its name, comments and a menu to rename, move or delete it. The add line at the end.
 */
export function SectionedTasks(props: Parameters<typeof TaskList>[0] & { groupId?: string }) {
  const { tasks, addTo, groupId, ...rest } = props
  const gid = groupId ?? addTo?.group.id
  const lists = props.cal.lists.filter((l) => l.group_id === gid).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const [adding, setAdding] = useState(false)
  const inList = new Set(lists.map((l) => l.id))
  const plain = tasks.filter((t) => !t.list_id || !inList.has(t.list_id))
  const { cal, people, openAdd } = rest
  return (
    <div className="cal-sections">
      {(plain.length > 0 || !lists.length) && <TaskList tasks={plain} {...rest} />}
      {lists.map((l, i) => (
        <section key={l.id} className="cal-section">
          <ListHead list={l} cal={cal} first={i === 0} last={i === lists.length - 1} lists={lists} />
          <TaskList tasks={tasks.filter((t) => t.list_id === l.id)} {...rest} addTo={addTo ? { ...addTo, listId: l.id } : undefined} />
        </section>
      ))}
      {adding && gid && <NewList groupId={gid} cal={cal} onDone={() => setAdding(false)} />}
      {/* One line at the end: a task in no list, or a new list. */}
      {addTo && (
        <div className="cal-sections__end">
          <QuickAdd group={addTo.group} cal={cal} people={people} phaseId={addTo.phaseId} compact={!openAdd} autoFocus={openAdd ? false : undefined} />
          {!adding && <AddListButton onClick={() => setAdding(true)} />}
        </div>
      )}
          </div>
  )
}

function AddListButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="text-btn small cal-add-list" onClick={onClick}>
      <Icon name="plus" size={14} /> List
    </button>
  )
}

function NewList({ groupId, cal, onDone }: { groupId: string; cal: Cal; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  return (
    <form
      className="cal-quick cal-newlist"
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          const res = await createList(groupId, name, cal.lists)
          if (res.error) return toast(res.error)
          putRows('cal_lists', [res.data!])
          onDone()
        })
      }}
    >
      <div className="cal-quick__row">
        <input
          className="field"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          placeholder="To-Do January"
          aria-label="New list name"
          dir="auto"
        />
        <button type="button" className="q-btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="q-btn">
          {busy ? 'Adding' : 'Add list'}
        </button>
      </div>
    </form>
  )
}

/** A list's title line: name (tap to rename), comments, and earlier / later / delete. */
function ListHead({ list, cal, first, last, lists }: { list: CalList; cal: Cal; first: boolean; last: boolean; lists: CalList[] }) {
  const toast = useToast()
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState(list.name)
  const [confirm, setConfirm] = useState(false)
  const n = cal.tasks.filter((t) => t.list_id === list.id && !t.parent_id).length
  const save = async (patch: Partial<CalList>) => {
    putRows('cal_lists', [{ ...list, ...patch }])
    const res = await updateList(list.id, patch)
    if (res.error) {
      putRows('cal_lists', [list])
      toast(res.error)
    }
  }
  const move = async (dir: -1 | 1) => {
    const i = lists.findIndex((l) => l.id === list.id)
    const other = lists[i + dir]
    if (!other) return
    // Sorts can repeat after the import; give both distinct places.
    const a = other.sort === list.sort ? list.sort + dir : other.sort
    putRows('cal_lists', [
      { ...list, sort: a },
      { ...other, sort: list.sort },
    ])
    const r1 = await updateList(list.id, { sort: a })
    const r2 = await updateList(other.id, { sort: list.sort })
    if (r1.error || r2.error) toast(r1.error ?? r2.error!)
  }
  const remove = async () => {
    const res = await deleteList(list.id)
    if (res.error) return toast(res.error)
    applyRow('cal_lists', 'delete', list)
    for (const t of cal.tasks.filter((x) => x.list_id === list.id)) putRows('tasks', [{ ...t, list_id: null }])
    toast(`${list.name} deleted${n ? `. Its ${n} ${n === 1 ? 'task stays' : 'tasks stay'} in the group.` : ''}`)
  }
  if (edit)
    return (
      <form
        className="cal-list-head cal-list-head--edit"
        onSubmit={(e) => {
          e.preventDefault()
          const v = name.trim()
          setEdit(false)
          if (v && v !== list.name) save({ name: v })
          else setName(list.name)
        }}
      >
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="List name" dir="auto" onKeyDown={(e) => e.key === 'Escape' && (setEdit(false), setName(list.name))} />
        <button type="submit" className="q-btn q-btn--small">
          Save
        </button>
        {!first && (
          <button type="button" className="icon-btn" aria-label="Move list earlier" onClick={() => move(-1)}>
            <Icon name="up" size={16} />
          </button>
        )}
        {!last && (
          <button type="button" className="icon-btn" aria-label="Move list later" onClick={() => move(1)}>
            <Icon name="down" size={16} />
          </button>
        )}
        {confirm ? (
          <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={remove}>
            Delete list
          </button>
        ) : (
          <button type="button" className="icon-btn" aria-label="Delete list" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </form>
    )
  return (
    <div className="cal-list-head">
      <h3 className="cal-loose__head">
        <bdi dir="auto">{list.name}</bdi>
      </h3>
      <button type="button" className="icon-btn cal-line__edit" aria-label={`Edit ${list.name}`} onClick={() => setEdit(true)}>
        <Icon name="edit" size={14} />
      </button>
      <CommentChip cal={cal} kind="list" id={list.id} label={list.name} />
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
  addTo?: { group: Cal['groups'][number]; phaseId: string | null; listId?: string | null }
  showDone?: boolean
  /** The add box already open (inside an opened phase); otherwise a small + Task button. */
  openAdd?: boolean
}) {
  const [doneOpen, setDoneOpen] = useState(false)
  const sorted = [...tasks].sort(taskOrder)
  const open = sorted.filter((t) => !isClosed(t.status))
  const done = sorted.filter((t) => isClosed(t.status))
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
      {addTo && <QuickAdd group={addTo.group} cal={cal} people={people} phaseId={addTo.phaseId} listId={addTo.listId} compact={!openAdd} autoFocus={openAdd ? false : undefined} />}
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
  const setStatus = usePhaseStatus()
  const save = usePhaseSave()
  const group = cal.groups.find((g) => g.id === p.group_id)
  const listed = cal.tasks.filter((t) => t.phase_id === p.id && !t.parent_id)
  const tasks = filterTasks ? listed.filter(filterTasks) : listed
  const all = listed.filter((t) => t.status !== 'cancelled')
  const doneCount = all.filter((t) => t.status === 'done').length
  const line = prog?.line ?? (all.length ? `${doneCount} of ${count(all.length, 'task')} done` : 'No tasks yet')
  const share = prog ? prog.share : all.length ? doneCount / all.length : null
  const doingShare = prog ? (prog.doing ?? 0) : all.length ? all.filter((t) => t.status === 'doing').length / all.length : 0
  const suggest = !big && showSuggest(p, prog)

  const name = (
    <span className="cal-line__title">
      {p.status === 'done' && <Icon name="check" size={15} />}
      <bdi dir="auto">{p.name}</bdi>
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
          {share != null && !isClosed(p.status) && (
            <span className="cal-bar" role="img" aria-label={`${Math.round(share * 100)}% done${doingShare ? `, ${Math.round(doingShare * 100)}% in progress` : ''}`}>
              {doingShare > 0 && <span className="cal-bar__doing" style={{ left: `${share * 100}%`, width: `${doingShare * 100}%` }} />}
              <span className="cal-bar__fill" style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
          )}
          <span className="soft small cal-line__meta">{line}</span>
        </div>
        {big ? (
          <span className="cal-line__chip" />
        ) : (
          <CommentChip cal={cal} kind="phase" id={p.id} label={p.name} />
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

