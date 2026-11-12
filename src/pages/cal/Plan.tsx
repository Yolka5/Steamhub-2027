import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProgressBar, StatusIcon, useOpenTask } from '../../components/cal'
import { useWho } from '../../lib/auth'
import { addDays, currentPhase, dayLabel, firstName, groupOrder, occurrences, rangeLabel, TEAM_WORD, todayIso, type Task, type Team } from '../../lib/cal'
import type { Progress } from '../../lib/calLinked'
import type { Profile } from '../../lib/mfg'
import type { Cal } from '../../lib/useCal'
import type { BoardFilter } from './Board'

// The Gantt for phones: the same plan as a list, readable without sideways scrolling. What's
// coming up first, then each group's phases (done, now, next, with dates and progress) and its
// dated tasks in order. Dragging bars stays on computers.

const SHOW = 4

export function Plan({ cal, linked, filter, people }: { cal: Cal; linked: Map<string, Progress>; filter: BoardFilter; people: Profile[] }) {
  const who = useWho()
  const today = todayIso()
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null
  const mine = useMemo(() => new Set(cal.owners.filter((o) => o.user_id === who?.userId).map((o) => o.task_id)), [cal.owners, who])

  // Competitions and deadlines in the next 8 weeks.
  const coming = useMemo(() => {
    const out: { key: string; day: string; title: string }[] = []
    for (const e of cal.events)
      if (e.kind === 'competition' || e.kind === 'deadline')
        for (const o of occurrences(e, today, addDays(today, 56))) out.push({ key: `${e.id}${o.day}`, day: o.day, title: e.title })
    return out.sort((a, b) => (a.day < b.day ? -1 : 1)).slice(0, 3)
  }, [cal.events, today])

  const groups = [...cal.groups].filter((g) => !filter.team || g.team === filter.team).sort(groupOrder)
  let lastTeam: Team | null = null

  return (
    <div className="cal-plan">
      {coming.length > 0 && (
        <section className="cal-plan__coming" aria-label="Coming up">
          {coming.map((c) => (
            <div key={c.key} className="cal-plan__milestone">
              <i aria-hidden="true" />
              <span className="strong">{c.title}</span>
              <span className="soft small num">{dayLabel(c.day)}</span>
            </div>
          ))}
        </section>
      )}
      {groups.map((g) => {
        const phases = cal.phases.filter((p) => p.group_id === g.id).sort((a, b) => a.sort - b.sort)
        const tasks = cal.tasks
          .filter((t) => t.group_id === g.id && !t.parent_id && (filter.done || t.status !== 'done') && (t.starts_on || t.due_on) && (!filter.mine || mine.has(t.id)))
          .sort((a, b) => ((a.starts_on ?? a.due_on)! < (b.starts_on ?? b.due_on)! ? -1 : 1))
        // Groups with nothing planned only add scrolling here; the Board still lists them.
        if ((filter.mine || !phases.length) && !tasks.length) return null
        const head = g.team !== lastTeam && !filter.team
        lastTeam = g.team
        const cur = currentPhase(cal.phases, g.id)
        return (
          <div key={g.id}>
            {head && <h2 className="cal-team">{TEAM_WORD[g.team]}</h2>}
            <section className="cal-plan__group">
              <div className="cal-plan__head">
                <Link to={`/calendar/g/${g.id}`} className="strong cal-plan__name">
                  {g.name}
                </Link>
                <span className="soft small">{g.lead_id ? firstName(nameOf(g.lead_id)) : 'No lead'}</span>
              </div>

              {phases.length > 0 && (
                <ol className="cal-steps">
                  {phases.map((p) => {
                    const now = p.id === cur?.id
                    const end = p.ends_on ?? p.starts_on
                    const late = !p.done_at && !!end && end < today
                    const prog = linked.get(p.id)
                    return (
                      <li key={p.id} className="cal-step" data-state={p.done_at ? 'done' : now ? 'now' : 'next'}>
                        <span className="cal-step__dot" aria-hidden="true" />
                        <div className="cal-step__body">
                          <div className="cal-step__top">
                            <span className="cal-step__name">{p.name}</span>
                            <span className="small num cal-step__when" data-late={late || undefined}>
                              {p.done_at ? 'Done' : p.starts_on || p.ends_on ? rangeLabel(p.starts_on, p.ends_on) : 'No dates'}
                            </span>
                          </div>
                          {now && prog && (
                            <div className="cal-step__prog">
                              <ProgressBar p={prog} />
                              <span className="soft small">{prog.line}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}

              {tasks.length > 0 && <PlanTasks tasks={tasks} cal={cal} />}
            </section>
          </div>
        )
      })}
    </div>
  )
}

function PlanTasks({ tasks, cal }: { tasks: Task[]; cal: Cal }) {
  const open = useOpenTask()
  const [all, setAll] = useState(false)
  const today = todayIso()
  const shown = all ? tasks : tasks.slice(0, SHOW)
  return (
    <>
      <ul className="cal-plan__tasks">
        {shown.map((t) => {
          const waits = cal.waits.filter((w) => w.task_id === t.id).map((w) => cal.tasks.find((x) => x.id === w.waits_for_id)).filter((x): x is Task => !!x && x.status !== 'done')
          const late = t.status !== 'done' && !!t.due_on && t.due_on < today
          return (
            <li key={t.id}>
              <button type="button" className="cal-plan__task" onClick={() => open(t.id)}>
                <span className="cal-mini-status" data-status={t.status}>
                  <StatusIcon status={t.status} />
                </span>
                <span className="row__main">
                  <span>{t.title}</span>
                  {waits.length > 0 && <span className="soft small">after {waits.map((w) => w.title).join(', ')}</span>}
                </span>
                <span className="small num cal-step__when" data-late={late || undefined}>
                  {rangeLabel(t.starts_on, t.due_on)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {tasks.length > SHOW && (
        <button type="button" className="link-btn soft small cal-plan__more" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `${tasks.length - SHOW} more`}
        </button>
      )}
    </>
  )
}
