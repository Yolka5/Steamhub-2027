import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { useCalSeason } from '../../components/cal'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { addDays, firstName, isoDay, groupOrder, longDay, saveUpdate, sectionName, todayIso } from '../../lib/cal'
import { usePeople } from '../../lib/useMfg'
import { putRows, useCal } from '../../lib/useCal'

// The end of the day: one text box, one Send. Usually the lead's, but anyone can write a group's
// update when the lead is away. It's filed under the group (not a phase: small phase updates are
// phase notes). Sending again the same day replaces it. The day can be moved back, for an update
// that was forgotten (?d=2026-11-25); never forward, since tomorrow hasn't happened.

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
  const asked = params.get('d')
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked < today ? asked : today
  const isToday = day === today
  const dayName = isToday ? 'today' : day === addDays(today, -1) ? 'yesterday' : longDay(day)
  /** Moves the day and keeps the group. */
  const setDay = (d: string) => {
    const next = new URLSearchParams(params)
    if (d >= today) next.delete('d')
    else next.set('d', d)
    setParams(next, { replace: true })
  }
  const setGroup = (g: string) => setParams(isToday ? { g } : { g, d: day }, { replace: true })

  const led = cal.groups.filter((g) => g.lead_id === userId).sort(groupOrder)
  const unsent = led.filter((g) => !cal.updates.some((u) => u.group_id === g.id && u.day === day))
  const id = params.get('g') ?? unsent[0]?.id ?? led[0]?.id ?? null
  const group = cal.groups.find((g) => g.id === id) ?? null
  const existing = group ? cal.updates.find((u) => u.group_id === group.id && u.day === day) : undefined
  const yesterday = group
    ? cal.updates.filter((u) => u.group_id === group.id && u.day < day).sort((a, b) => (a.day < b.day ? 1 : -1))[0]
    : undefined
  const doneToday = group ? cal.tasks.filter((t) => t.group_id === group.id && t.status === 'done' && !!t.done_at && isoDay(new Date(t.done_at)) === day) : []

  const { people } = usePeople()
  const leadName = firstName(people.find((p) => p.id === group?.lead_id)?.name)
  const [text, setText] = useState('')
  useEffect(() => setText(existing?.text ?? ''), [existing?.text, group?.id, day])

  if (cal.error && !cal.groups.length) return <LoadError onRetry={cal.reload} />
  if (cal.loading) return <p className="soft page">Loading</p>

  const send = () =>
    run(async () => {
      if (!who || !group) return
      const t = text.trim()
      if (!t) return toast(`Write what happened ${isToday ? 'today' : 'that day'} first`)
      const res = await saveUpdate(group.id, null, day, t, who)
      if (res.error) return toast(res.error)
      putRows('cal_updates', [res.data!])
      toast(existing ? 'Update changed' : isToday ? `${group.name} update sent` : `${group.name} update for ${dayName} sent`)
      const next = unsent.find((g) => g.id !== group.id)
      if (next) setGroup(next.id)
      else navigate(isToday ? '/calendar/summary' : `/calendar/summary?d=${day}`)
    })

  return (
    <div className="page page--narrow cal-update">
      <div className="page__head">
        <h1 className="page__title">{isToday ? "Today's update" : 'Daily update'}</h1>
      </div>

      {/* Forgot one? Step back a day, or pick any past day. */}
      <div className="cal-summary__bar cal-update__day">
        <button type="button" className="icon-btn" aria-label="Day before" onClick={() => setDay(addDays(day, -1))}>
          <Icon name="back" />
        </button>
        <label className="cal-summary__day">
          <span className="strong">{isToday ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : longDay(day)}</span>
          <input type="date" className="cal-summary__pick" aria-label="Pick the day this update is for" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <button type="button" className="icon-btn cal-flip" aria-label="Day after" onClick={() => setDay(addDays(day, 1))} hidden={isToday}>
          <Icon name="back" />
        </button>
        {!isToday && (
          <button type="button" className="text-btn small" onClick={() => setDay(today)}>
            Back to today
          </button>
        )}
      </div>

      <div className="cal-update__who">
        {led.length > 1 ? (
          <div className="picks picks--seg" role="radiogroup" aria-label="Group">
            {led.map((g) => {
              const sent = cal.updates.some((u) => u.group_id === g.id && u.day === day)
              return (
                <button key={g.id} type="button" role="radio" className="pick" aria-checked={g.id === group?.id} onClick={() => setGroup(g.id)}>
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
            onChange={(v) => setGroup(v)}
            options={[...cal.groups].sort(groupOrder).map((g) => ({ value: g.id, label: g.name, group: sectionName(g.team) }))}
          />
        )}
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
            aria-label={`${group.name} update for ${dayName}`}
          />
          <p className="soft small">
            Goes under {group.name}
            {leadName && group.lead_id !== userId ? `, for ${leadName} while they're away` : ''}. Everyone can read it on Updates.
            {doneToday.length > 0 && ` Done ${isToday ? 'today' : 'that day'}: ${doneToday.map((t) => t.title).join(', ')}.`}
          </p>
          <button type="submit" className="q-btn q-btn--main q-btn--wide">
            {busy ? 'Sending' : existing ? 'Save the change' : 'Send update'}
          </button>
          {yesterday && (
            <div className="cal-update__last">
              <span className="soft small">Update before, {longDay(yesterday.day)}</span>
              <p dir="auto">{yesterday.text}</p>
            </div>
          )}
        </form>
      ) : (
        <div className="mfg-empty">
          <p className="empty">Pick a group above.</p>
          <p className="soft">Anyone can write a group's update, for days its lead is away.</p>
          <Link to="/calendar" className="q-btn">
            Calendar
          </Link>
        </div>
      )}
    </div>
  )
}
