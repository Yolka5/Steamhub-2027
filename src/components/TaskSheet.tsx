import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { Select } from './Select'
import { HighTag, StatusIcon, useOpenTask } from './cal'
import { Sheet, useBusy, useToast } from './ui'
import { useWho } from '../lib/auth'
import {
  addDays,
  addOwner,
  addWait,
  createTask,
  daysBetween,
  deleteTask,
  dayLabel,
  firstName,
  groupOrder,
  moveTasks,
  PRIORITIES,
  PRIORITY_WORD,
  pushWaiting,
  removeOwner,
  removeWait,
  setTaskStatus,
  STATUSES,
  STATUS_WORD,
  TEAM_WORD,
  updateTask,
  type DateMove,
  type Task,
} from '../lib/cal'
import { partName, type Part } from '../lib/mfg'
import { usePrototypes } from '../lib/proto'
import { supabase } from '../lib/supabase'
import { applyRow, putRows, type Cal } from '../lib/useCal'
import { usePeople } from '../lib/useMfg'

// The task, on one screen with no tabs: name, group, status, priority, dates, owners, waits for,
// link, subtasks, notes. Every field saves on its own. A sheet from the bottom on phones.

export function TaskSheetHost({ cal }: { cal: Cal }) {
  const [params] = useSearchParams()
  const open = useOpenTask()
  const id = params.get('task')
  const task = id ? cal.tasks.find((t) => t.id === id) : undefined
  // A link to a task that was deleted, or of another season.
  const missing = !!id && !cal.loading && !task
  return (
    <Sheet open={!!id} onClose={() => open(null)} title={missing ? 'Task not found' : 'Task'}>
      {task ? (
        <TaskBody key={task.id} task={task} cal={cal} />
      ) : missing ? (
        <p className="soft">This task was deleted, or it belongs to another season.</p>
      ) : (
        <p className="soft">Loading</p>
      )}
    </Sheet>
  )
}

function TaskBody({ task, cal }: { task: Task; cal: Cal }) {
  const who = useWho()
  const toast = useToast()
  const open = useOpenTask()
  const { people, nameOf } = usePeople()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [sub, setSub] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, run] = useBusy()
  useEffect(() => setTitle(task.title), [task.title])
  useEffect(() => setNotes(task.notes), [task.notes])

  const group = cal.groups.find((g) => g.id === task.group_id)
  const parent = task.parent_id ? cal.tasks.find((t) => t.id === task.parent_id) : null
  const subs = cal.tasks.filter((t) => t.parent_id === task.id).sort((a, b) => a.sort - b.sort)
  const owners = cal.owners.filter((o) => o.task_id === task.id).map((o) => o.user_id)
  const waitsFor = cal.waits.filter((w) => w.task_id === task.id).map((w) => cal.tasks.find((t) => t.id === w.waits_for_id)).filter((t): t is Task => !!t)
  const waitedBy = cal.waits.filter((w) => w.waits_for_id === task.id).map((w) => cal.tasks.find((t) => t.id === w.task_id)).filter((t): t is Task => !!t)
  const groupPhases = cal.phases.filter((p) => p.group_id === task.group_id).sort((a, b) => a.sort - b.sort)

  const save = async (patch: Partial<Task>) => {
    const before = task
    putRows('tasks', [{ ...task, ...patch }])
    const res = await updateTask(task.id, patch)
    if (res.error) {
      putRows('tasks', [before])
      toast(res.error)
      return false
    }
    putRows('tasks', [res.data!])
    return true
  }

  /** New dates, and everything waiting for this task moved later if it has to be. */
  const setDates = async (starts_on: string | null, due_on: string | null) => {
    if (starts_on && due_on && due_on < starts_on) {
      // Moving the start past the due day carries the due day along, keeping the length.
      if (starts_on !== task.starts_on && task.starts_on && task.due_on) due_on = addDays(starts_on, daysBetween(task.starts_on, task.due_on))
      else return toast('The due day has to be on or after the start.')
    }
    await applyMoves(pushWaiting({ id: task.id, starts_on, due_on }, cal.tasks, cal.waits))
  }

  const applyMoves = async (moves: DateMove[]) => {
    const before = moves.map((m) => {
      const t = cal.tasks.find((x) => x.id === m.id)!
      return { id: t.id, starts_on: t.starts_on, due_on: t.due_on }
    })
    putRows('tasks', moves.map((m) => ({ ...cal.tasks.find((x) => x.id === m.id)!, ...m })))
    const res = await moveTasks(moves)
    if (res.error) {
      putRows('tasks', before.map((m) => ({ ...cal.tasks.find((x) => x.id === m.id)!, ...m })))
      return toast(res.error)
    }
    const others = moves.length - 1
    if (others > 0)
      toast(`${others} waiting ${others === 1 ? 'task' : 'tasks'} moved later`, {
        undo: async () => {
          putRows('tasks', before.map((m) => ({ ...cal.tasks.find((x) => x.id === m.id)!, ...m })))
          const r = await moveTasks(before)
          if (r.error) toast(r.error)
        },
      })
  }

  const setStatus = async (status: Task['status']) => {
    if (!who || status === task.status) return
    putRows('tasks', [{ ...task, status }])
    const res = await setTaskStatus(task, status, who, cal)
    if (res.error) {
      putRows('tasks', [task])
      return toast(res.error)
    }
    putRows('tasks', [res.data!])
  }

  const moveGroup = async (groupId: string) => {
    const g = cal.groups.find((x) => x.id === groupId)
    if (!g) return
    // The task joins the new group's current phase, and its subtasks come along.
    const phase = cal.phases.filter((p) => p.group_id === groupId).sort((a, b) => a.sort - b.sort).find((p) => !p.done_at)
    if (await save({ group_id: groupId, phase_id: phase?.id ?? null }))
      for (const s of subs) {
        const r = await updateTask(s.id, { group_id: groupId, phase_id: phase?.id ?? null })
        if (r.data) putRows('tasks', [r.data])
      }
  }

  const addOwnerTo = async (userId: string) => {
    if (!who || !userId || owners.includes(userId)) return
    applyRow('task_owners', 'upsert', { task_id: task.id, user_id: userId })
    const res = await addOwner(task, userId, who)
    if (res.error) {
      applyRow('task_owners', 'delete', { task_id: task.id, user_id: userId })
      toast(res.error)
    }
  }

  const dropOwner = async (userId: string) => {
    applyRow('task_owners', 'delete', { task_id: task.id, user_id: userId })
    const res = await removeOwner(task.id, userId)
    if (res.error) {
      applyRow('task_owners', 'upsert', { task_id: task.id, user_id: userId })
      toast(res.error)
    }
  }

  const addWaitFor = async (forId: string) => {
    if (!forId) return
    const res = await addWait(task.id, forId)
    if (res.error) return toast(res.error)
    const waits = [...cal.waits, { task_id: task.id, waits_for_id: forId }]
    applyRow('task_waits', 'upsert', { task_id: task.id, waits_for_id: forId })
    // If this task starts before the other ends, it moves after it.
    const pred = cal.tasks.find((t) => t.id === forId)
    if (pred) {
      const moves = pushWaiting({ id: pred.id, starts_on: pred.starts_on, due_on: pred.due_on }, cal.tasks, waits).slice(1)
      if (moves.length) await applyMoves([{ id: pred.id, starts_on: pred.starts_on, due_on: pred.due_on }, ...moves])
    }
  }

  const dropWait = async (forId: string) => {
    applyRow('task_waits', 'delete', { task_id: task.id, waits_for_id: forId })
    const res = await removeWait(task.id, forId)
    if (res.error) toast(res.error)
  }

  const addSub = () =>
    run(async () => {
      const t = sub.trim()
      if (!who || !t) return
      const res = await createTask({ group_id: task.group_id, phase_id: task.phase_id, parent_id: task.id, title: t }, [], who)
      if (res.error) return toast(res.error)
      putRows('tasks', [res.data!])
      setSub('')
    })

  const toggleSub = async (s: Task) => {
    if (!who) return
    const status = s.status === 'done' ? 'todo' : 'done'
    putRows('tasks', [{ ...s, status }])
    const res = await setTaskStatus(s, status, who, cal)
    if (res.error) {
      putRows('tasks', [s])
      toast(res.error)
    }
  }

  const remove = () =>
    run(async () => {
      const res = await deleteTask(task.id)
      if (res.error) return toast(res.error)
      applyRow('tasks', 'delete', task)
      for (const s of subs) applyRow('tasks', 'delete', s)
      toast(`${task.title} deleted`)
      open(null)
    })

  // Tasks it could wait for: the season's other open, top-level tasks, not ones that wait for it.
  const waitOptions = useMemo(() => {
    const after = new Set<string>([task.id])
    let grew = true
    while (grew) {
      grew = false
      for (const w of cal.waits)
        if (after.has(w.waits_for_id) && !after.has(w.task_id)) {
          after.add(w.task_id)
          grew = true
        }
    }
    const groupName = new Map(cal.groups.map((g) => [g.id, g.name]))
    return cal.tasks
      .filter((t) => !t.parent_id && !after.has(t.id) && !waitsFor.some((x) => x.id === t.id) && t.status !== 'done')
      .sort((a, b) => (a.group_id === task.group_id ? -1 : 0) - (b.group_id === task.group_id ? -1 : 0) || a.title.localeCompare(b.title))
      .map((t) => ({ value: t.id, label: t.title, group: groupName.get(t.group_id) }))
  }, [cal.tasks, cal.waits, cal.groups, task.id, task.group_id, waitsFor])

  const groupOptions = [...cal.groups].sort(groupOrder).map((g) => ({ value: g.id, label: g.name, group: TEAM_WORD[g.team] }))

  return (
    <div className="task">
      {parent && (
        <button type="button" className="task__parent soft small" onClick={() => open(parent.id)}>
          <Icon name="back" size={16} /> Part of {parent.title}
        </button>
      )}
      <textarea
        className="field task__title"
        rows={1}
        aria-label="Task name"
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          const t = title.trim()
          if (!t) return setTitle(task.title)
          if (t !== task.title) save({ title: t })
        }}
      />

      <div className="task__grid">
        <span className="task__label">Group</span>
        <div className="task__pair">
          <Select label="Group" value={task.group_id} onChange={moveGroup} options={groupOptions} />
          {groupPhases.length > 0 && (
            <Select
              label="Phase"
              value={task.phase_id ?? ''}
              onChange={(v) => save({ phase_id: v || null })}
              options={[{ value: '', label: 'No phase' }, ...groupPhases.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
        </div>

        <span className="task__label">Status</span>
        <div className="picks picks--seg" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s} type="button" role="radio" className="pick" aria-checked={task.status === s} onClick={() => setStatus(s)} data-status={s}>
              <StatusIcon status={s} /> {STATUS_WORD[s]}
            </button>
          ))}
        </div>

        <span className="task__label">Priority</span>
        <div className="picks picks--seg" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button key={p} type="button" role="radio" className="pick" aria-checked={task.priority === p} onClick={() => save({ priority: p })}>
              {PRIORITY_WORD[p]}
            </button>
          ))}
        </div>

        <span className="task__label">Dates</span>
        <div className="task__pair task__dates">
          <label className="task__date">
            <span className="soft small">Start</span>
            <input type="date" className="field num" value={task.starts_on ?? ''} onChange={(e) => setDates(e.target.value || null, task.due_on)} />
          </label>
          <span className="soft" aria-hidden="true">
            →
          </span>
          <label className="task__date">
            <span className="soft small">Due</span>
            <input type="date" className="field num" value={task.due_on ?? ''} onChange={(e) => setDates(task.starts_on, e.target.value || null)} />
          </label>
        </div>

        <span className="task__label">Owners</span>
        <div className="task__owners">
          {owners.map((id) => (
            <span key={id} className="chip-x">
              {nameOf(id) ?? 'Someone'}
              <button type="button" aria-label={`Remove ${nameOf(id) ?? 'owner'}`} onClick={() => dropOwner(id)}>
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
          <Select
            label="Add owner"
            className="field--inline task__add-owner"
            value=""
            placeholder={owners.length ? 'Add' : 'Add an owner'}
            onChange={addOwnerTo}
            options={people.filter((p) => !p.banned && !p.shared && !owners.includes(p.id)).map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      <section className="task__block">
        <h3 className="task__head">Waits for</h3>
        {waitsFor.length > 0 && (
          <ul className="rows">
            {waitsFor.map((t) => (
              <li key={t.id} className="row task__mini">
                <span className="cal-mini-status" data-status={t.status}>
                  <StatusIcon status={t.status} />
                </span>
                <button type="button" className="row__main task__link" onClick={() => open(t.id)}>
                  {t.title}
                  <span className="soft small">{t.due_on ? `Due ${dayLabel(t.due_on)}` : STATUS_WORD[t.status]}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Stop waiting for ${t.title}`} onClick={() => dropWait(t.id)}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Select label="Add a task this waits for" className="field--inline" value="" placeholder={waitsFor.length ? 'Add another' : 'Pick a task it waits for'} onChange={addWaitFor} options={waitOptions} />
        {waitedBy.length > 0 && (
          <p className="soft small">
            Waiting for this:{' '}
            {waitedBy.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ', '}
                <button type="button" className="link-btn" onClick={() => open(t.id)}>
                  {t.title}
                </button>
              </span>
            ))}
          </p>
        )}
      </section>

      {!task.parent_id && (
        <section className="task__block">
          <h3 className="task__head">
            Subtasks {subs.length > 0 && <span className="soft num">{subs.filter((s) => s.status === 'done').length}/{subs.length}</span>}
          </h3>
          {subs.length > 0 && (
            <ul className="task__subs">
              {subs.map((s) => (
                <li key={s.id}>
                  <label className="check">
                    <input type="checkbox" checked={s.status === 'done'} onChange={() => toggleSub(s)} />
                    <span data-done={s.status === 'done' || undefined}>{s.title}</span>
                  </label>
                  <button type="button" className="icon-btn" aria-label={`Open ${s.title}`} onClick={() => open(s.id)}>
                    <Icon name="more" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="task__add"
            onSubmit={(e) => {
              e.preventDefault()
              addSub()
            }}
          >
            <input className="field" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a step" aria-label="New subtask" enterKeyHint="done" />
            <button type="submit" className="q-btn">
              {busy ? 'Adding' : 'Add'}
            </button>
          </form>
        </section>
      )}

      <TaskLink task={task} cal={cal} save={save} />

      <section className="task__block">
        <h3 className="task__head">Notes</h3>
        <textarea
          className="field"
          rows={2}
          value={notes}
          placeholder="Anything the next person needs to know."
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== task.notes && save({ notes })}
        />
      </section>

      <div className="task__foot">
        <span className="soft small">
          {group ? `${group.name} · ` : ''}
          {task.created_by ? `Added by ${firstName(nameOf(task.created_by))}` : ''}
          {task.priority === 'high' && task.status !== 'done' ? ' ' : ''}
        </span>
        {task.priority === 'high' && task.status !== 'done' && <HighTag />}
        {confirm ? (
          <span className="task__confirm">
            <button type="button" className="q-btn" onClick={() => setConfirm(false)}>
              Keep it
            </button>
            <button type="button" className="q-btn q-btn--danger" onClick={remove}>
              {subs.length ? `Delete with ${subs.length} ${subs.length === 1 ? 'subtask' : 'subtasks'}` : 'Delete task'}
            </button>
          </span>
        ) : (
          <button type="button" className="q-btn task__delete" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

/** A task can point at a prototype or a part; the part number is typed, like everywhere else. */
function TaskLink({ task, cal, save }: { task: Task; cal: Cal; save: (p: Partial<Task>) => Promise<boolean> }) {
  const toast = useToast()
  const group = cal.groups.find((g) => g.id === task.group_id)
  const { prototypes } = usePrototypes(cal.season)
  const [part, setPart] = useState<Pick<Part, 'id' | 'part_no' | 'name' | 'cls' | 'size'> | null>(null)
  const [no, setNo] = useState('')

  useEffect(() => {
    if (!task.part_id) return setPart(null)
    supabase
      .from('parts')
      .select('id, part_no, name, cls, size')
      .eq('id', task.part_id)
      .maybeSingle()
      .then(({ data }) => setPart(data))
  }, [task.part_id])

  const proto = prototypes.find((p) => p.id === task.prototype_id)
  const protoOptions = prototypes
    .filter((p) => p.status !== 'dropped')
    .sort((a, b) => Number(b.subsystem_number === group?.subsystem_number) - Number(a.subsystem_number === group?.subsystem_number) || a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name }))

  const linkPart = async () => {
    const n = Number(no.trim())
    if (!n) return toast('Type a part number, like 3004')
    const { data } = await supabase.from('parts').select('id, part_no, name, cls, size').eq('part_no', n).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1)
    if (!data?.length) return toast(`No part ${n}`)
    if (await save({ part_id: data[0].id })) setNo('')
  }

  return (
    <section className="task__block">
      <h3 className="task__head">Linked to</h3>
      {(proto || part) && (
        <ul className="rows">
          {proto && (
            <li className="row task__mini">
              <Icon name="flask" size={18} />
              <Link to={`/prototypes/${proto.id}`} className="row__main task__link">
                {proto.name}
                <span className="soft small">Prototype</span>
              </Link>
              <button type="button" className="icon-btn" aria-label="Unlink the prototype" onClick={() => save({ prototype_id: null })}>
                <Icon name="close" size={16} />
              </button>
            </li>
          )}
          {part && (
            <li className="row task__mini">
              <Icon name="gear" size={18} />
              <Link to={`/manufacturing/p/${part.id}`} className="row__main task__link">
                <span>
                  <span className="num">{part.part_no}</span> {partName(part)}
                </span>
                <span className="soft small">Part</span>
              </Link>
              <button type="button" className="icon-btn" aria-label="Unlink the part" onClick={() => save({ part_id: null })}>
                <Icon name="close" size={16} />
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="task__pair">
        {!proto && protoOptions.length > 0 && (
          <Select label="Link a prototype" className="field--inline" value="" placeholder="A prototype" onChange={(v) => v && save({ prototype_id: v })} options={protoOptions} />
        )}
        {!part && (
          <form
            className="task__add task__part"
            onSubmit={(e) => {
              e.preventDefault()
              linkPart()
            }}
          >
            <input className="field num" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ''))} placeholder="Part 3004" aria-label="Part number" />
            <button type="submit" className="q-btn">
              Link
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
