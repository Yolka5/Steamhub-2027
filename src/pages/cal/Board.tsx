import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ProgressBar, TaskRow } from '../../components/cal'
import { useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { addDays, createTask, currentPhase, dayLabel, firstName, groupOrder, parseQuick, PRIORITY_WORD, rangeLabel, taskOrder, TEAM_WORD, todayIso, type CalGroup, type Team } from '../../lib/cal'
import { CNC_MACHINES, openParts, WORKSHOP_MACHINES } from '../../lib/calParts'
import { useTasks } from '../../lib/useTasks'
import type { Progress } from '../../lib/calLinked'
import { putRows, type Cal } from '../../lib/useCal'
import type { Profile } from '../../lib/mfg'

// Every group, inside its team's card: Mechanics holds CNC, Workshop, the subsystems and the
// off-season projects. Subsystems and projects show their phases with progress; CNC and Workshop the
// parts waiting on their machines, then their tasks. A row of chips on top jumps to any group, and
// groups fold (remembered on this device).

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

  const foldAll = (close: boolean, ids: string[]) =>
    setFolded(() => {
      const n = new Set(close ? ids : [])
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify([...n]))
      } catch {
        /* private mode: folds last this visit */
      }
      return n
    })

  // Released parts, for CNC and Workshop.
  const { tasks: boardParts } = useTasks()

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

  type Item = (typeof groups)[number]
  const today = todayIso()
  const week = addDays(today, 7)
  const anchor = (id: string) => `cal-g-${id}`
  const lateOf = (groupId: string) => cal.tasks.filter((t) => t.group_id === groupId && !t.parent_id && t.status !== 'done' && t.due_on && t.due_on < today).length

  /** Open, due this week and late, said only when there is something to say. */
  const countLine = (ids: string[]) => {
    const open = cal.tasks.filter((t) => ids.includes(t.group_id) && !t.parent_id && t.status !== 'done')
    const late = open.filter((t) => t.due_on && t.due_on < today).length
    const soon = open.filter((t) => t.due_on && t.due_on >= today && t.due_on <= week).length
    if (!open.length) return null
    return (
      <span className="small num cal-count" data-late={late ? true : undefined}>
        {[`${open.length} open`, soon && `${soon} due this week`, late && `${late} late`].filter(Boolean).join(' · ')}
      </span>
    )
  }

  /** Each phase on its own line: the one it's in is marked, with its progress and dates. */
  const phases = (groupId: string) => {
    const list = cal.phases.filter((p) => p.group_id === groupId).sort((a, b) => a.sort - b.sort)
    const cur = currentPhase(cal.phases, groupId)
    if (!list.length) return <p className="soft small cal-group__none">No phases yet.</p>
    return (
      <ol className="cal-phases">
        {list.map((p) => {
          const pr = linked.get(p.id)
          const state = p.done_at ? 'done' : p.id === cur?.id ? 'now' : 'next'
          return (
            <li key={p.id} data-state={state}>
              <Link to={`/calendar/g/${groupId}`} className="cal-phases__name">
                {state === 'done' && <Icon name="check" size={14} />}
                {p.name}
              </Link>
              <span className="cal-phases__mid">
                {pr?.share != null && state !== 'done' && <ProgressBar p={pr} />}
                {state !== 'next' && pr?.line && <span className="soft small">{pr.line}</span>}
              </span>
              <span className="small num cal-phases__when">{p.done_at ? 'Done' : p.starts_on || p.ends_on ? rangeLabel(p.starts_on, p.ends_on) : <span className="soft">No dates</span>}</span>
            </li>
          )
        })}
      </ol>
    )
  }

  const tasks = ({ shown }: Item) =>
    shown.length > 0 && (
      <ul className="rows cal-rows">
        {shown.map((t) => (
          <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
        ))}
      </ul>
    )

  /** CNC and Workshop: how many parts wait on their machines, linked to the manufacturing board. */
  const partsLine = (machines: typeof CNC_MACHINES) => {
    const list = openParts(boardParts, machines)
    const cnc = machines === CNC_MACHINES
    const doing = list.filter((p) => p.status === 'doing').length
    const urgent = list.filter((p) => p.urgent).length
    return (
      <Link to={cnc ? '/manufacturing/board?m=CNC' : '/manufacturing/board'} className="cal-parts-line">
        <span className="cal-parts-line__n num">{list.length - doing}</span>
        <span>{cnc ? 'parts to cut' : 'parts to make'}</span>
        {(doing > 0 || urgent > 0) && <span className="soft small num">{[doing && `${doing} in progress`, urgent && `${urgent} urgent`].filter(Boolean).join(' · ')}</span>}
        <Icon name="next" size={16} />
      </Link>
    )
  }

  const head = (g: CalGroup, host: boolean, extra?: ReactNode) => {
    const isFolded = folded.has(g.id)
    const lead = g.lead_id ? nameOf(g.lead_id) : null
    return (
      <div className="cal-group__head">
        <button type="button" className="icon-btn cal-group__fold" aria-expanded={!isFolded} aria-label={`${isFolded ? 'Show' : 'Hide'} ${g.name}`} onClick={() => fold(g.id)}>
          <Icon name={isFolded ? 'down' : 'up'} size={18} />
        </button>
        <Link to={`/calendar/g/${g.id}`} className="cal-group__name">
          {g.kind === 'subsystem' && <span className="num soft">{g.subsystem_number} </span>}
          {g.name}
          {!host && <Icon name="next" size={14} />}
        </Link>
        {/* A team holds its groups; the leads are on them. */}
        {!host && (
          <span className="cal-group__lead small" title={lead ?? 'No lead yet'}>
            <span className="avatar avatar--soft" aria-hidden="true">
              {lead ? lead[0].toUpperCase() : '?'}
            </span>
            {lead ? firstName(lead) : 'No lead'}
          </span>
        )}
        {extra}
      </div>
    )
  }

  const card = (item: Item) => {
    const { g } = item
    const isFolded = folded.has(g.id)
    const machines = g.kind === 'cnc' ? CNC_MACHINES : g.kind === 'workshop' ? WORKSHOP_MACHINES : null
    const phased = g.kind === 'subsystem' || g.kind === 'project'
    return (
      <section key={g.id} id={anchor(g.id)} className="cal-group" data-kind={g.kind} data-late={lateOf(g.id) ? true : undefined}>
        {head(g, false, <span className="cal-group__end">{countLine([g.id])}</span>)}
        {!isFolded && (
          <div className="cal-group__body">
            {machines && partsLine(machines)}
            {phased ? (
              phases(g.id)
            ) : (
              <>
                {tasks(item)}
                <QuickAdd group={g} cal={cal} people={people} />
              </>
            )}
          </div>
        )}
      </section>
    )
  }

  const teams = [...new Set(groups.map((x) => x.g.team))]
  const jumpable = groups.filter((x) => x.g.kind !== 'team')
  const allFolded = groups.every((x) => folded.has(x.g.id))
  const jump = (id: string) => {
    if (folded.has(id)) fold(id)
    const host = groups.find((x) => x.g.id === id)
    const teamHost = groups.find((x) => x.g.kind === 'team' && x.g.team === host?.g.team)
    if (teamHost && folded.has(teamHost.g.id)) fold(teamHost.g.id)
    window.setTimeout(() => document.getElementById(anchor(id))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30)
  }

  return (
    <div className="cal-board">
      {/* Straight to a group, or everything folded to its title line. */}
      <nav className="cal-jump" aria-label="Go to a group">
        {jumpable.map(({ g }) => (
          <button key={g.id} type="button" className="chip" onClick={() => jump(g.id)}>
            {g.kind === 'subsystem' ? `${g.subsystem_number} ${g.name}` : g.name}
          </button>
        ))}
        <button type="button" className="text-btn cal-jump__fold" onClick={() => foldAll(!allFolded, groups.map((x) => x.g.id))}>
          {allFolded ? 'Open all' : 'Fold all'}
        </button>
      </nav>

      {teams.map((team) => {
        const mine = groups.filter((x) => x.g.team === team)
        const host = mine.find((x) => x.g.kind === 'team')
        const kids = mine.filter((x) => x !== host)
        const season = kids.filter((x) => x.g.kind !== 'project')
        const projects = kids.filter((x) => x.g.kind === 'project')
        if (!host)
          return (
            <div key={team}>
              {!filter.team && <h2 className="cal-team">{TEAM_WORD[team as Team]}</h2>}
              {kids.map(card)}
            </div>
          )
        const isFolded = folded.has(host.g.id)
        return (
          <section key={team} id={anchor(host.g.id)} className="cal-group cal-group--host" data-kind="team">
            {head(
              host.g,
              true,
              <span className="cal-group__end">
                {countLine(mine.map((x) => x.g.id))}
                <QuickAdd group={host.g} cal={cal} people={people} />
              </span>,
            )}
            {!isFolded && (
              <>
                {tasks(host)}
                {season.length > 0 && <div className="cal-group__kids">{season.map(card)}</div>}
                {projects.length > 0 && (
                  <div className="cal-group__kids">
                    <h3 className="cal-group__sub">Off-season projects</h3>
                    {projects.map(card)}
                  </div>
                )}
              </>
            )}
          </section>
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
