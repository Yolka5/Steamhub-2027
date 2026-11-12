import { Link } from 'react-router-dom'
import { TaskRow, useCalSeason } from './cal'
import { TaskSheetHost } from './TaskSheet'
import { useAuth } from '../lib/auth'
import { addDays, taskOrder, todayIso } from '../lib/cal'
import { useCal } from '../lib/useCal'
import { usePeople } from '../lib/useMfg'

// Home's Calendar card: your late tasks, today's and the week's, and for leads, today's update.
// Nothing shows when there's nothing for you.

const MAX = 6

export function YourTasks() {
  const season = useCalSeason()
  const cal = useCal(season)
  const { userId } = useAuth()
  const { nameOf } = usePeople()
  if (cal.loading || cal.error) return null

  const today = todayIso()
  const week = addDays(today, 7)
  const mine = new Set(cal.owners.filter((o) => o.user_id === userId).map((o) => o.task_id))
  const list = cal.tasks
    .filter((t) => mine.has(t.id) && t.status !== 'done' && (t.status === 'doing' || (t.due_on && t.due_on <= week)))
    .sort(taskOrder)
  const led = cal.groups.filter((g) => g.lead_id === userId)
  const unsent = led.filter((g) => !cal.updates.some((u) => u.group_id === g.id && u.day === today))
  const openCount = cal.tasks.filter((t) => mine.has(t.id) && t.status !== 'done').length

  if (!list.length && !unsent.length) return null

  return (
    <section className="section your-tasks">
      <div className="your-tasks__head">
        <h2 className="section__title">Your tasks</h2>
        <Link to="/calendar?mine=1" className="soft small">
          All {openCount} open
        </Link>
      </div>
      {unsent.length > 0 && (
        <Link to={unsent.length === 1 ? `/calendar/update?g=${unsent[0].id}` : '/calendar/update'} className="row your-tasks__update">
          <span className="row__main">
            <span className="strong">Send today's update</span>
            <span className="soft small">{unsent.map((g) => g.name).join(', ')}</span>
          </span>
          <span className="q-btn q-btn--small">Write it</span>
        </Link>
      )}
      {list.length > 0 && (
        <ul className="rows cal-rows">
          {list.slice(0, MAX).map((t) => (
            <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} showGroup />
          ))}
        </ul>
      )}
      <TaskSheetHost cal={cal} />
    </section>
  )
}
