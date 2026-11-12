import { Link, useSearchParams } from 'react-router-dom'
import { CalTabs, useCalSeason } from '../../components/cal'
import { EventSheetHost } from '../../components/EventSheet'
import { TaskSheetHost } from '../../components/TaskSheet'
import { LoadError } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { TEAMS, TEAM_WORD, todayIso, type Team } from '../../lib/cal'
import { useLinked, useSuggestNotify } from '../../lib/calLinked'
import { useCal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { usePhone } from '../../lib/usePhone'
import { Board } from './Board'
import { Gantt } from './Gantt'
import { MonthView } from './MonthView'
import { Plan } from './Plan'

// The Calendar: Board, Calendar and Gantt over the same tasks. View and filters live in the URL,
// so a link shows the same screen to everyone.

export default function CalendarPage() {
  const season = useCalSeason()
  const cal = useCal(season)
  const linked = useLinked(season, cal)
  const { userId } = useAuth()
  useSuggestNotify(cal, linked, userId)
  const { people } = usePeople()
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'board'
  const team = (params.get('team') as Team | null) ?? null
  const mine = params.get('mine') === '1'
  const done = params.get('done') === '1'

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  // Leads see "Send today's update" until every group they lead has one for today.
  const today = todayIso()
  const led = cal.groups.filter((g) => g.lead_id === userId)
  const unsent = led.filter((g) => !cal.updates.some((u) => u.group_id === g.id && u.day === today))

  const filters = (
    <div className="cal-filters">
      <div className="picks picks--seg" role="radiogroup" aria-label="Team">
        <button type="button" role="radio" className="pick" aria-checked={!team} onClick={() => set('team', null)}>
          All
        </button>
        {TEAMS.map((t) => (
          <button key={t} type="button" role="radio" className="pick" aria-checked={team === t} onClick={() => set('team', t)}>
            {TEAM_WORD[t]}
          </button>
        ))}
      </div>
      <div className="picks picks--seg" role="radiogroup" aria-label="Whose">
        <button type="button" role="radio" className="pick" aria-checked={!mine} onClick={() => set('mine', null)}>
          Everyone
        </button>
        <button type="button" role="radio" className="pick" aria-checked={mine} onClick={() => set('mine', '1')}>
          Mine
        </button>
      </div>
      {view === 'board' && (
        <label className="check">
          <input type="checkbox" checked={done} onChange={(e) => set('done', e.target.checked ? '1' : null)} />
          Show done
        </label>
      )}
    </div>
  )

  return (
    <div className={`page cal-page${view === 'gantt' ? ' page--full' : ''}`}>
      <div className="page__head">
        <h1 className="page__title">Calendar</h1>
        <div className="cal-head-end">
          {unsent.length > 0 && !phone && (
            <Link to={unsent.length === 1 ? `/calendar/update?g=${unsent[0].id}` : '/calendar/update'} className="q-btn q-btn--main">
              Send today's update
            </Link>
          )}
          {!phone && <CalTabs />}
        </div>
      </div>
      {/* On phones it's a direct child of the page, so it can stick under the top bar. */}
      {phone && <CalTabs />}

      {/* Phones: a slim row instead of a big button, so the tasks start on the first screen. */}
      {unsent.length > 0 && phone && (
        <Link to={unsent.length === 1 ? `/calendar/update?g=${unsent[0].id}` : '/calendar/update'} className="row cal-update-row">
          <span className="row__main">
            <span className="strong">Send today's update</span>
            <span className="soft small">{unsent.map((g) => g.name).join(', ')}</span>
          </span>
          <span className="q-btn q-btn--small">Write it</span>
        </Link>
      )}

      {phone ? (
        <details className="finder__more mfg-filters-fold">
          <summary>
            Filters <span className="soft">{[team ? TEAM_WORD[team] : 'All teams', mine ? 'mine' : 'everyone', done && view === 'board' ? 'with done' : ''].filter(Boolean).join(' · ')}</span>
          </summary>
          {filters}
        </details>
      ) : (
        filters
      )}

      {cal.error && !cal.groups.length ? (
        <LoadError onRetry={cal.reload} />
      ) : cal.loading ? (
        <p className="soft">Loading</p>
      ) : view === 'calendar' ? (
        <MonthView cal={cal} filter={{ team, mine, done }} people={people} />
      ) : view === 'gantt' ? (
        phone ? <Plan cal={cal} linked={linked} filter={{ team, mine, done }} people={people} /> : <Gantt cal={cal} linked={linked} filter={{ team, mine, done }} people={people} />
      ) : (
        <Board cal={cal} linked={linked} filter={{ team, mine, done }} people={people} />
      )}

      <TaskSheetHost cal={cal} />
      <EventSheetHost cal={cal} />
    </div>
  )
}
