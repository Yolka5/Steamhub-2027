import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalTabs, useCalSeason } from '../../components/cal'
import { Icon } from '../../components/Icon'
import { PhaseEditorHost } from '../../components/CalPhase'
import { CommentsHost } from '../../components/Comments'
import { EventSheetHost } from '../../components/EventSheet'
import { TaskSheetHost } from '../../components/TaskSheet'
import { LoadError } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { sectionColor, sectionName, secStyle, todayIso } from '../../lib/cal'
import { useLinked, useSuggestNotify } from '../../lib/calLinked'
import { supabase } from '../../lib/supabase'
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
  const { userId, isAdmin } = useAuth()
  const google = useGoogleLinked(isAdmin)
  useSuggestNotify(cal, linked, userId)
  const { people } = usePeople()
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'board'
  // Sections to show, "mechanics,strategy"; none is all of them. Old links had one team.
  const sections = (params.get('team') ?? '').split(',').filter((k) => k && cal.sections.some((x) => x.key === k))
  const toggleSection = (k: string) => {
    const next = sections.includes(k) ? sections.filter((x) => x !== k) : [...sections, k]
    set('team', next.length ? next.join(',') : null)
  }
  const mine = params.get('mine') === '1'
  const done = params.get('done') === '1'
  // Big view for meetings: read-only phases in large type. Stays on for this screen until Exit.
  const [big, setBigState] = useState(() => {
    try {
      return localStorage.getItem('cal-big') === '1'
    } catch {
      return false
    }
  })
  const setBig = (on: boolean) => {
    setBigState(on)
    try {
      if (on) localStorage.setItem('cal-big', '1')
      else localStorage.removeItem('cal-big')
    } catch {
      /* private mode: lasts this visit */
    }
  }

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
      {/* Sections: pick one or more, so Mechanics + Strategy works. */}
      <div className="cal-secpick" role="group" aria-label="Sections">
        <button type="button" className="chip cal-secpick__chip" aria-pressed={!sections.length} onClick={() => set('team', null)}>
          All
        </button>
        {cal.sections.map((x) => (
          <button key={x.key} type="button" className="chip cal-secpick__chip sec" style={secStyle(sectionColor(x.key))} aria-pressed={sections.includes(x.key)} onClick={() => toggleSection(x.key)}>
            <span className="cal-dot" aria-hidden="true" />
            {x.name}
          </button>
        ))}
        <Link to="/calendar/sections" className="text-btn small cal-secpick__edit">
          Edit sections
        </Link>
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
      {/* Google Calendar and Monday come in from here. */}
      <Link to="/calendar/import" className="q-btn q-btn--small cal-filters__import">
        <Icon name="download" size={16} /> Import
      </Link>
    </div>
  )

  if (big)
    return (
      <div className="page page--full cal-page cal-page--big">
        <div className="page__head">
          <h1 className="page__title">Calendar</h1>
          <button type="button" className="q-btn" onClick={() => setBig(false)}>
            Exit big view
          </button>
        </div>
        {cal.error && !cal.groups.length ? (
          <LoadError onRetry={cal.reload} />
        ) : cal.loading ? (
          <p className="soft">Loading</p>
        ) : (
          <Board cal={cal} linked={linked} filter={{ sections, mine: false, done: false }} people={people} big />
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
          {/* Not a lead, or already sent: still a way in, for a lead who's away today. */}
          {unsent.length === 0 && !phone && (
            <Link to="/calendar/update" className="q-btn">
              Write an update
            </Link>
          )}
          {!phone && <CalTabs />}
          {!phone && (
            <button type="button" className="q-btn" onClick={() => setBig(true)}>
              Big view
            </button>
          )}
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

      {/* Until the team's Google Calendar is linked, admins see the way to it here, not only under Import. */}
      {google === false && (
        <p className="cal-connect soft small">
          <Icon name="calendar" size={18} />
          <span>The team's Google Calendar isn't connected yet.</span>
          <Link to="/calendar/import" className="q-btn q-btn--small">
            Connect Google Calendar
          </Link>
        </p>
      )}

      {phone ? (
        <details className="finder__more mfg-filters-fold">
          <summary>
            Filters <span className="soft">{[sections.length ? sections.map(sectionName).join(' + ') : 'All sections', mine ? 'mine' : 'everyone', done && view === 'board' ? 'with done' : ''].filter(Boolean).join(' · ')}</span>
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
        <MonthView cal={cal} filter={{ sections, mine, done }} people={people} />
      ) : view === 'gantt' ? (
        phone ? <Plan cal={cal} linked={linked} filter={{ sections, mine, done }} people={people} /> : <Gantt cal={cal} linked={linked} filter={{ sections, mine, done }} people={people} />
      ) : (
        <Board cal={cal} linked={linked} filter={{ sections, mine, done }} people={people} />
      )}

      <TaskSheetHost cal={cal} />
      <EventSheetHost cal={cal} />
      <PhaseEditorHost cal={cal} />
      <CommentsHost cal={cal} people={people} />
    </div>
  )
}

/** Whether the Google Calendar link is saved: null while loading or for non-admins (only admins link it). */
function useGoogleLinked(isAdmin: boolean) {
  const [linked, setLinked] = useState<boolean | null>(null)
  useEffect(() => {
    if (!isAdmin) return
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'google_calendar')
      .maybeSingle()
      .then(({ data, error }) => !error && setLinked(!!(data?.value as { url?: string } | null)?.url))
  }, [isAdmin])
  return isAdmin ? linked : null
}
