import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { CalTabs, useCalSeason } from '../../components/cal'
import { NotesHost, useOpenNotes } from '../../components/CalPhase'
import { LoadError, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { addDays, firstName, groupOrder, isoDay, longDay, TEAMS, TEAM_WORD, todayIso } from '../../lib/cal'
import { useCal } from '../../lib/useCal'
import { usePhone } from '../../lib/usePhone'
import { usePeople } from '../../lib/useMfg'

// One day's updates from every group, by team, on one screen. Leads who haven't sent theirs show
// as "Not sent yet". Copy turns the whole day into text for the team chat.

export default function Summary() {
  const season = useCalSeason()
  const cal = useCal(season)
  const { people, nameOf } = usePeople()
  const openNotes = useOpenNotes()
  const { userId } = useAuth()
  const toast = useToast()
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  const today = todayIso()
  const day = params.get('d') ?? today
  const go = (d: string) => setParams(d === today ? {} : { d }, { replace: true })

  if (cal.error && !cal.groups.length) return <LoadError onRetry={cal.reload} />

  const groups = [...cal.groups].sort(groupOrder)
  const phaseOf = new Map(cal.phases.map((p) => [p.id, p]))
  // The day's phase notes, under their group (replies stay in the notes panel).
  const notesOf = (groupId: string) =>
    cal.notes
      .filter((n) => !n.parent_id && phaseOf.get(n.phase_id)?.group_id === groupId && isoDay(new Date(n.created_at)) === day)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const rows = groups
    .map((g) => ({ g, u: cal.updates.find((u) => u.group_id === g.id && u.day === day), notes: notesOf(g.id) }))
    // Groups with no lead only show when someone wrote for them anyway.
    .filter((r) => r.u || r.g.lead_id || r.notes.length)
  const sent = rows.filter((r) => r.u).length

  const copy = () => {
    const lines = [`Steamhub updates, ${longDay(day)}`]
    for (const t of TEAMS) {
      const mine = rows.filter((r) => r.g.team === t && (r.u || r.notes.length))
      if (!mine.length) continue
      lines.push('', `*${TEAM_WORD[t]}*`)
      for (const r of mine) {
        if (r.u) lines.push(`${r.g.name} (${firstName(nameOf(r.u.author_id))}): ${r.u.text}`)
        for (const n of r.notes) lines.push(`  ${phaseOf.get(n.phase_id)?.name} · ${firstName(nameOf(n.author_id))}: ${n.text || 'a photo'}`)
      }
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(
      () => toast('Copied. Paste it in the team chat.'),
      () => toast("Couldn't copy here. Select the text instead."),
    )
  }

  return (
    <div className="page cal-page cal-summary">
      <div className="page__head">
        <h1 className="page__title">Updates</h1>
        {!phone && (
          <div className="cal-head-end">
            <CalTabs />
          </div>
        )}
      </div>
      {phone && <CalTabs />}

      <div className="cal-summary__bar">
        <button type="button" className="icon-btn" aria-label="Day before" onClick={() => go(addDays(day, -1))}>
          <Icon name="back" />
        </button>
        <label className="cal-summary__day">
          <span className="strong">{day === today ? 'Today' : longDay(day)}</span>
          <input type="date" className="cal-summary__pick" aria-label="Pick a day" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value)} />
        </label>
        <button type="button" className="icon-btn cal-flip" aria-label="Day after" onClick={() => day < today && go(addDays(day, 1))} hidden={day >= today}>
          <Icon name="back" />
        </button>
        <span className="soft small num">
          {sent} of {rows.length} sent
        </span>
        {(sent > 0 || rows.some((r) => r.notes.length)) && (
          <button type="button" className="q-btn q-btn--small" onClick={copy}>
            <Icon name="copy" size={16} /> Copy as text
          </button>
        )}
      </div>

      {cal.loading ? (
        <p className="soft">Loading</p>
      ) : rows.length === 0 ? (
        <div className="mfg-empty">
          <p className="empty">No leads set yet.</p>
          <p className="soft">Each group's lead writes one update at the end of the day. Set leads on the group pages.</p>
        </div>
      ) : (
        TEAMS.map((t) => {
          const mine = rows.filter((r) => r.g.team === t)
          if (!mine.length) return null
          return (
            <section key={t} className="cal-summary__team">
              <h2 className="cal-team">{TEAM_WORD[t]}</h2>
              <div className="cal-summary__grid">
                {mine.map(({ g, u, notes }) => {
                  const phase = u?.phase_id ? cal.phases.find((p) => p.id === u.phase_id) : null
                  return (
                    <article key={g.id} className="cal-card" data-missing={!u || undefined}>
                      <div className="cal-card__head">
                        <Link to={`/calendar/g/${g.id}`} className="strong">
                          {g.name}
                        </Link>
                        <span className="soft small">
                          {firstName(nameOf(u?.author_id ?? g.lead_id))}
                          {phase ? ` · ${phase.name}` : ''}
                        </span>
                      </div>
                      {u ? (
                        <p className="cal-card__text" dir="auto">
                          {u.text}
                        </p>
                      ) : (
                        <p className="soft small cal-card__missing">
                          {day === today ? 'Not sent yet' : 'Not sent'}
                          {day === today && g.lead_id === userId && (
                            <>
                              {' · '}
                              <Link to={`/calendar/update?g=${g.id}`}>Write it</Link>
                            </>
                          )}
                        </p>
                      )}
                      {notes.length > 0 && (
                        <ul className="cal-card__notes">
                          {notes.map((n) => (
                            <li key={n.id}>
                              <button type="button" className="cal-card__note" onClick={() => openNotes(n.phase_id)}>
                                <span className="soft small">
                                  {phaseOf.get(n.phase_id)?.name} · {firstName(nameOf(n.author_id))}
                                  {n.photos.length ? ` · ${n.photos.length === 1 ? 'photo' : `${n.photos.length} photos`}` : ''}
                                </span>
                                <span className="small" dir="auto">
                                  {n.text}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
      <NotesHost cal={cal} people={people} />
    </div>
  )
}
