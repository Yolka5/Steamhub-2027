import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Select } from '../../components/Select'
import { useCalSeason } from '../../components/cal'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { currentPhase, isoDay, groupOrder, longDay, saveUpdate, TEAM_WORD, todayIso } from '../../lib/cal'
import { putRows, useCal } from '../../lib/useCal'

// The lead's end of the day: one text box, one Send. It's filed under the group's current phase,
// so each phase keeps its own history. Sending again the same day replaces it.

export default function UpdatePage() {
  const season = useCalSeason()
  const cal = useCal(season)
  const { userId } = useAuth()
  const who = useWho()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [busy, run] = useBusy()
  const today = todayIso()

  const led = cal.groups.filter((g) => g.lead_id === userId).sort(groupOrder)
  const unsent = led.filter((g) => !cal.updates.some((u) => u.group_id === g.id && u.day === today))
  const id = params.get('g') ?? unsent[0]?.id ?? led[0]?.id ?? null
  const group = cal.groups.find((g) => g.id === id) ?? null
  const existing = group ? cal.updates.find((u) => u.group_id === group.id && u.day === today) : undefined
  const yesterday = group
    ? cal.updates.filter((u) => u.group_id === group.id && u.day < today).sort((a, b) => (a.day < b.day ? 1 : -1))[0]
    : undefined
  const phase = group ? currentPhase(cal.phases, group.id) : null
  const doneToday = group ? cal.tasks.filter((t) => t.group_id === group.id && t.status === 'done' && !!t.done_at && isoDay(new Date(t.done_at)) === today) : []

  const [text, setText] = useState('')
  useEffect(() => setText(existing?.text ?? ''), [existing?.text, group?.id])

  if (cal.error && !cal.groups.length) return <LoadError onRetry={cal.reload} />
  if (cal.loading) return <p className="soft page">Loading</p>

  const send = () =>
    run(async () => {
      if (!who || !group) return
      const t = text.trim()
      if (!t) return toast('Write what happened today first')
      const res = await saveUpdate(group.id, phase?.id ?? null, today, t, who)
      if (res.error) return toast(res.error)
      putRows('cal_updates', [res.data!])
      toast(existing ? 'Update changed' : `${group.name} update sent`)
      const next = unsent.find((g) => g.id !== group.id)
      if (next) setParams({ g: next.id }, { replace: true })
      else navigate('/calendar/summary')
    })

  return (
    <div className="page page--narrow cal-update">
      <div className="page__head">
        <h1 className="page__title">Today's update</h1>
      </div>

      <div className="cal-update__who">
        {led.length > 1 ? (
          <div className="picks picks--seg" role="radiogroup" aria-label="Group">
            {led.map((g) => {
              const sent = cal.updates.some((u) => u.group_id === g.id && u.day === today)
              return (
                <button key={g.id} type="button" role="radio" className="pick" aria-checked={g.id === group?.id} onClick={() => setParams({ g: g.id }, { replace: true })}>
                  {g.name}
                  {sent ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
        ) : (
          <Select
            label="Group"
            className="field--inline"
            value={group?.id ?? ''}
            placeholder="Pick your group"
            onChange={(v) => setParams({ g: v }, { replace: true })}
            options={[...cal.groups].sort(groupOrder).map((g) => ({ value: g.id, label: g.name, group: TEAM_WORD[g.team] }))}
          />
        )}
        <span className="soft small">{longDay(today)}</span>
      </div>

      {group ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <textarea
            className="field cal-update__text"
            rows={7}
            dir="auto"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Rollers slip at 60%, ordered softer wheels. Side plates start tomorrow."
            aria-label={`${group.name} update for today`}
          />
          <p className="soft small">
            Goes under {group.name}
            {phase ? `: ${phase.name}` : ''}. Everyone can read it on Updates.
            {doneToday.length > 0 && ` Done today: ${doneToday.map((t) => t.title).join(', ')}.`}
          </p>
          <button type="submit" className="q-btn q-btn--main q-btn--wide">
            {busy ? 'Sending' : existing ? 'Save the change' : 'Send update'}
          </button>
          {yesterday && (
            <div className="cal-update__last">
              <span className="soft small">Last update, {longDay(yesterday.day)}</span>
              <p dir="auto">{yesterday.text}</p>
            </div>
          )}
        </form>
      ) : (
        <div className="mfg-empty">
          <p className="empty">You don't lead a group yet.</p>
          <p className="soft">Pick a group above to write its update, or set its lead on the group page.</p>
          <Link to="/calendar" className="q-btn">
            Calendar
          </Link>
        </div>
      )}
    </div>
  )
}
