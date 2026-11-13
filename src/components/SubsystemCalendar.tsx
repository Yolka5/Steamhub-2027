import { Link } from 'react-router-dom'
import { ProgressBar, TaskRow, useCalSeason } from './cal'
import { TaskSheetHost } from './TaskSheet'
import { currentPhase, rangeLabel, taskOrder } from '../lib/cal'
import { useLinked } from '../lib/calLinked'
import { useCal } from '../lib/useCal'
import { usePeople } from '../lib/useMfg'

// On a subsystem's Manufacturing page: its Calendar phases and open tasks, short.

/** A season subsystem by its number, or an off-season project's subsystem by its id. */
export function SubsystemCalendar({ season, number, projectSub }: { season: number; number: number; projectSub?: string }) {
  const current = useCalSeason()
  // Only this season's subsystems have a Calendar group.
  const cal = useCal(current === season ? season : null)
  const linked = useLinked(current === season ? season : null, cal)
  const { nameOf } = usePeople()
  if (current !== season || cal.loading) return null
  const g = cal.groups.find((x) => (projectSub ? x.kind === 'project' && x.subsystem_id === projectSub : x.kind === 'subsystem' && x.subsystem_number === number))
  if (!g) return null
  const phases = cal.phases.filter((p) => p.group_id === g.id).sort((a, b) => a.sort - b.sort)
  const cur = currentPhase(cal.phases, g.id)
  const open = cal.tasks.filter((t) => t.group_id === g.id && !t.parent_id && t.status !== 'done').sort(taskOrder)

  return (
    <section className="section sub-cal">
      <div className="your-tasks__head">
        <h2 className="section__title">Calendar</h2>
        <Link to={`/calendar/g/${g.id}`} className="soft small">
          Phases, tasks and updates
        </Link>
      </div>
      {phases.length > 0 && (
        <ol className="sub-cal__phases">
          {phases.map((p) => (
            <li key={p.id} data-done={!!p.done_at || undefined} data-current={p.id === cur?.id || undefined}>
              <span className="strong small">{p.name}</span>
              <ProgressBar p={linked.get(p.id)} />
              <span className="soft small num">{p.done_at ? 'Done' : p.starts_on || p.ends_on ? rangeLabel(p.starts_on, p.ends_on) : 'No dates'}</span>
            </li>
          ))}
        </ol>
      )}
      {open.length > 0 ? (
        <ul className="rows cal-rows">
          {open.slice(0, 8).map((t) => (
            <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
          ))}
        </ul>
      ) : (
        <p className="soft small">No open tasks.</p>
      )}
      <TaskSheetHost cal={cal} />
    </section>
  )
}
