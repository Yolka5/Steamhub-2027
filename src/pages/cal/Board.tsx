import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ProgressBar, TaskRow } from '../../components/cal'
import { useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { createTask, currentPhase, dayLabel, firstName, groupOrder, parseQuick, PRIORITY_WORD, taskOrder, TEAM_WORD, type CalGroup, type Team } from '../../lib/cal'
import type { Progress } from '../../lib/calLinked'
import { putRows, type Cal } from '../../lib/useCal'
import type { Profile } from '../../lib/mfg'

// Every group's tasks, grouped by team. Groups fold (remembered on this device). A group with
// phases shows the one it's in and its progress. Each group adds tasks with one typed line.

const FOLD_KEY = 'cal-folded'
const readFolded = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]')
  } catch {
    return []
  }
}

export interface BoardFilter {
  team: Team | null
  mine: boolean
  done: boolean
}

export function Board({ cal, linked, filter, people }: { cal: Cal; linked: Map<string, Progress>; filter: BoardFilter; people: Profile[] }) {
  const who = useWho()
  const [folded, setFolded] = useState<Set<string>>(() => new Set(readFolded()))
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null
  const fold = (id: string) =>
    setFolded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify([...n]))
      } catch {
        /* private mode: folds last this visit */
      }
      return n
    })

  const mineIds = useMemo(() => new Set(cal.owners.filter((o) => o.user_id === who?.userId).map((o) => o.task_id)), [cal.owners, who])

  const groups = useMemo(() => {
    return [...cal.groups]
      .filter((g) => !filter.team || g.team === filter.team)
      .sort(groupOrder)
      .map((g) => {
        const all = cal.tasks.filter((t) => t.group_id === g.id && !t.parent_id)
        const shown = all
          .filter((t) => filter.done || t.status !== 'done')
          // Mine: tasks I own, or with a subtask I own.
          .filter((t) => !filter.mine || mineIds.has(t.id) || cal.tasks.some((s) => s.parent_id === t.id && mineIds.has(s.id)))
          .sort(taskOrder)
        return { g, shown, open: all.filter((t) => t.status !== 'done').length, done: all.length - all.filter((t) => t.status !== 'done').length }
      })
      .filter((x) => !filter.mine || x.shown.length > 0)
  }, [cal.groups, cal.tasks, filter, mineIds])

  if (!groups.length)
    return (
      <div className="mfg-empty">
        <p className="empty">{filter.mine ? 'Nothing of yours open.' : 'No groups for this filter.'}</p>
        <p className="soft">{filter.mine ? 'Tasks you own show up here. Show everyone’s to pick one up.' : 'Groups are made from the teams and V1’s subsystems.'}</p>
      </div>
    )

  let lastTeam: Team | null = null
  return (
    <div className="cal-board">
      {groups.map(({ g, shown, open, done }) => {
        const head = g.team !== lastTeam && !filter.team
        lastTeam = g.team
        const phase = currentPhase(cal.phases, g.id)
        const isFolded = folded.has(g.id)
        return (
          <div key={g.id}>
            {head && <h2 className="cal-team">{TEAM_WORD[g.team]}</h2>}
            <section className="cal-group" data-kind={g.kind}>
              <div className="cal-group__head">
                <button type="button" className="icon-btn cal-group__fold" aria-expanded={!isFolded} aria-label={`${isFolded ? 'Show' : 'Hide'} ${g.name}`} onClick={() => fold(g.id)}>
                  <Icon name={isFolded ? 'down' : 'up'} size={18} />
                </button>
                <Link to={`/calendar/g/${g.id}`} className="cal-group__name">
                  {g.kind === 'subsystem' && <span className="num soft">{g.subsystem_number} </span>}
                  {g.name}
                </Link>
                <span className="soft small cal-group__lead">{g.lead_id ? firstName(nameOf(g.lead_id)) : 'No lead'}</span>
                {phase && (
                  <Link to={`/calendar/g/${g.id}`} className="cal-group__phase" title={linked.get(phase.id)?.line}>
                    <span className="small">{phase.name}</span>
                    <ProgressBar p={linked.get(phase.id)} />
                  </Link>
                )}
                <span className="soft small num cal-group__count">
                  {open} open{filter.done && done ? ` · ${done} done` : ''}
                </span>
              </div>
              {!isFolded && (
                <>
                  {shown.length > 0 && (
                    <ul className="rows cal-rows">
                      {shown.map((t) => (
                        <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
                      ))}
                    </ul>
                  )}
                  <QuickAdd group={g} cal={cal} people={people} />
                </>
              )}
            </section>
          </div>
        )
      })}
    </div>
  )
}

/**
 * One line makes a task: "Roller test thu high @noa". The day, priority and owners come out of
 * the words at the end, and show as chips while typing so it's clear what will be saved.
 */
export function QuickAdd({
  group,
  cal,
  people,
  phaseId,
  compact = true,
  autoFocus,
  onAdded,
}: {
  group: CalGroup
  cal: Cal
  people: Profile[]
  phaseId?: string | null
  compact?: boolean
  autoFocus?: boolean
  onAdded?: (title: string) => void
}) {
  const who = useWho()
  const toast = useToast()
  const [open, setOpen] = useState(!compact)
  const [text, setText] = useState('')
  const [busy, run] = useBusy()
  const active = people.filter((p) => !p.banned && !p.shared)
  const q = parseQuick(text, active)

  const add = () =>
    run(async () => {
      if (!who) return
      if (!q.title.trim()) return toast('Type what needs doing first')
      const phase = phaseId !== undefined ? phaseId : (currentPhase(cal.phases, group.id)?.id ?? null)
      const res = await createTask({ group_id: group.id, phase_id: phase, title: q.title.trim(), starts_on: q.starts_on, due_on: q.due_on, priority: q.priority }, q.owners, who)
      if (res.error) return toast(res.error)
      putRows('tasks', [res.data!])
      for (const user_id of q.owners) putRows('task_owners', [{ task_id: res.data!.id, user_id }])
      setText('')
      onAdded?.(res.data!.title)
    })

  if (!open)
    return (
      <button type="button" className="q-btn q-btn--small cal-add-btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Task
      </button>
    )

  const chips = [
    q.starts_on && q.due_on ? `${dayLabel(q.starts_on)} → ${dayLabel(q.due_on)}` : q.due_on ? `Due ${dayLabel(q.due_on)}` : null,
    q.priority !== 'normal' ? PRIORITY_WORD[q.priority] : null,
    ...q.owners.map((id) => active.find((p) => p.id === id)?.name ?? ''),
  ].filter(Boolean)

  return (
    <form
      className="cal-quick"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <div className="cal-quick__row">
        <input
          className="field"
          autoFocus={autoFocus ?? compact}
          // Inside a sheet, the sheet hands focus to this field (not its close button).
          data-autofocus={autoFocus || undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && compact) {
              setText('')
              setOpen(false)
            }
          }}
          placeholder="Roller test thu high @noa"
          aria-label={`New task in ${group.name}`}
          enterKeyHint="done"
        />
        <button type="submit" className="q-btn">
          {busy ? 'Adding' : 'Add'}
        </button>
      </div>
      <p className="soft small cal-quick__hint">
        {chips.length ? (
          chips.map((c) => (
            <span key={c} className="tag">
              {c}
            </span>
          ))
        ) : (
          <>End with a day (thu, 14/11, mon-thu), high or low, and @name for who.</>
        )}
      </p>
    </form>
  )
}
