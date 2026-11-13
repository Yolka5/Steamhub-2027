import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Select } from './Select'
import { Sheet, useBusy, useToast } from './ui'
import { useWho } from '../lib/auth'
import {
  deleteEvent,
  EVENT_KINDS,
  EVENT_WORD,
  groupOrder,
  isoDay,
  longDay,
  REMINDER_CHOICES,
  saveEvent,
  toDate,
  todayIso,
  TEAM_WORD,
  WEEKDAYS,
  WEEKDAY_LETTER,
  type CalEvent,
  type EventKind,
} from '../lib/cal'
import { applyRow, putRows, type Cal } from '../lib/useCal'

// Meetings, competitions, deadlines. ?event=new&on=2026-11-14 adds one; ?event=<id>&on=<day>
// opens one (the day says which time a repeating event was tapped, for "Skip this day").

export function EventSheetHost({ cal }: { cal: Cal }) {
  const [params, setParams] = useSearchParams()
  const id = params.get('event')
  const on = params.get('on')
  const ev = id && id !== 'new' ? cal.events.find((e) => e.id === id) : undefined
  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('event')
    next.delete('on')
    setParams(next, { replace: true })
  }
  const missing = !!id && id !== 'new' && !cal.loading && !ev
  return (
    <Sheet open={!!id} onClose={close} title={id === 'new' ? 'New event' : missing ? 'Event not found' : 'Event'}>
      {missing ? (
        <p className="soft">This event was deleted.</p>
      ) : id === 'new' || ev ? (
        <EventForm key={id} ev={ev} on={on} cal={cal} onDone={close} />
      ) : (
        <p className="soft">Loading</p>
      )}
    </Sheet>
  )
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const at = (day: string, time: string) => {
  const d = toDate(day)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h || 0, m || 0)
  return d.toISOString()
}

function EventForm({ ev, on, cal, onDone }: { ev?: CalEvent; on: string | null; cal: Cal; onDone: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [confirm, setConfirm] = useState(false)
  const [title, setTitle] = useState(ev?.title ?? '')
  const [kind, setKind] = useState<EventKind>(ev?.kind ?? 'meeting')
  const [group, setGroup] = useState(ev?.group_id ?? '')
  const [day, setDay] = useState(ev ? isoDay(new Date(ev.starts_at)) : (on ?? todayIso()))
  const [endDay, setEndDay] = useState(ev?.ends_at ? isoDay(new Date(ev.ends_at)) : (on ?? todayIso()))
  const [allDay, setAllDay] = useState(ev?.all_day ?? false)
  const [start, setStart] = useState(ev ? hhmm(ev.starts_at) : '16:00')
  const [end, setEnd] = useState(ev?.ends_at ? hhmm(ev.ends_at) : '20:00')
  const [repeat, setRepeat] = useState<number[]>(ev?.repeat_days ?? [])
  const [until, setUntil] = useState(ev?.repeat_until ?? '')
  const [reminders, setReminders] = useState<number[]>(ev?.reminders ?? [])
  const [notes, setNotes] = useState(ev?.notes ?? '')

  const save = () =>
    run(async () => {
      if (!who) return
      if (!title.trim()) return toast('Give the event a name')
      if (!day) return toast('Pick a day')
      const startsAt = allDay ? at(day, '00:00') : at(day, start)
      const endsAt = allDay ? at(endDay && endDay >= day ? endDay : day, '23:59') : at(day, end && end > start ? end : start)
      const res = await saveEvent(
        {
          title: title.trim(),
          kind,
          group_id: group || null,
          starts_at: startsAt,
          ends_at: endsAt,
          all_day: allDay,
          repeat_days: repeat.length ? [...repeat].sort() : null,
          repeat_until: repeat.length && until ? until : null,
          skip_days: ev?.skip_days ?? [],
          reminders: [...reminders].sort((a, b) => a - b),
          notes: notes.trim(),
        },
        who,
        ev?.id,
      )
      if (res.error) return toast(res.error)
      putRows('events', [res.data!])
      toast(ev ? 'Event saved' : `${title.trim()} added`)
      onDone()
    })

  const skip = () =>
    run(async () => {
      if (!who || !ev || !on) return
      const res = await saveEvent({ ...ev, skip_days: [...new Set([...ev.skip_days, on])] }, who, ev.id)
      if (res.error) return toast(res.error)
      putRows('events', [res.data!])
      toast(`${ev.title} skipped on ${longDay(on)}`, {
        undo: async () => {
          const back = await saveEvent({ ...ev }, who, ev.id)
          if (back.data) putRows('events', [back.data])
        },
      })
      onDone()
    })

  const remove = () =>
    run(async () => {
      if (!ev) return
      const res = await deleteEvent(ev.id)
      if (res.error) return toast(res.error)
      applyRow('events', 'delete', ev)
      toast(`${ev.title} deleted`)
      onDone()
    })

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <form
      className="form cal-event"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {ev?.source === 'google' && <p className="soft small">From the team’s Google Calendar. Change it there: the next hourly sync puts back edits made here.</p>}
      <label className="ctl">
        <span className="ctl__name">Name</span>
        <input className="field" data-autofocus={!ev || undefined} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'meeting' ? 'Team meeting' : kind === 'competition' ? 'District event #1' : 'Order deadline'} />
      </label>

      <div className="picks picks--seg cal-event__kinds" role="radiogroup" aria-label="Kind">
        {EVENT_KINDS.map((k) => (
          <button key={k} type="button" role="radio" className="pick" aria-checked={kind === k} onClick={() => setKind(k)}>
            {EVENT_WORD[k]}
          </button>
        ))}
      </div>

      <label className="check">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day
      </label>

      <div className="cal-event__when">
        <label className="ctl">
          <span className="ctl__name">{allDay ? 'From' : 'Day'}</span>
          <input type="date" className="field num" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        {allDay ? (
          <label className="ctl">
            <span className="ctl__name">To</span>
            <input type="date" className="field num" value={endDay} min={day} onChange={(e) => setEndDay(e.target.value)} />
          </label>
        ) : (
          <>
            <label className="ctl">
              <span className="ctl__name">Starts</span>
              <input type="time" className="field num" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="ctl">
              <span className="ctl__name">Ends</span>
              <input type="time" className="field num" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </>
        )}
      </div>

      <div className="ctl">
        <span className="ctl__name">Repeats every week on</span>
        <div className="cal-days" role="group" aria-label="Repeat days">
          {WEEKDAY_LETTER.map((l, i) => (
            <button key={i} type="button" className="cal-day-btn" aria-pressed={repeat.includes(i)} aria-label={WEEKDAYS[i]} onClick={() => setRepeat((r) => toggle(r, i))}>
              {l}
            </button>
          ))}
        </div>
        {repeat.length > 0 && (
          <label className="cal-event__until">
            <span className="soft small">Until</span>
            <input type="date" className="field num" value={until} min={day} onChange={(e) => setUntil(e.target.value)} />
            <span className="soft small">{until ? '' : 'No end'}</span>
          </label>
        )}
      </div>

      <div className="ctl">
        <span className="ctl__name">For</span>
        <Select
          value={group}
          onChange={setGroup}
          options={[{ value: '', label: 'The whole team' }, ...[...cal.groups].sort(groupOrder).map((g) => ({ value: g.id, label: g.name, group: TEAM_WORD[g.team] }))]}
        />
      </div>

      <div className="ctl">
        <span className="ctl__name">Remind</span>
        <div className="cal-chips" role="group" aria-label="Reminders">
          {REMINDER_CHOICES.map((r) => (
            <button key={r.min} type="button" className="chip" aria-pressed={reminders.includes(r.min)} onClick={() => setReminders((x) => toggle(x, r.min))}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="soft small">
          {group ? 'Its group’s lead and everyone with an open task in it.' : 'Everyone on the team.'}
          {kind === 'meeting' ? ' When a meeting ends, leads who haven’t sent today’s update get a reminder.' : ''}
        </span>
      </div>

      <label className="ctl">
        <span className="ctl__name">Notes</span>
        <textarea className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where, what to bring." />
      </label>

      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Saving' : ev ? 'Save event' : 'Add event'}
      </button>

      {ev && (
        <div className="cal-event__more">
          {ev.repeat_days?.length && on ? (
            <button type="button" className="q-btn" onClick={skip}>
              Skip {longDay(on)}
            </button>
          ) : null}
          {confirm ? (
            <>
              <button type="button" className="q-btn" onClick={() => setConfirm(false)}>
                Keep it
              </button>
              <button type="button" className="q-btn q-btn--danger" onClick={remove}>
                {ev.repeat_days?.length ? 'Delete every week' : 'Delete event'}
              </button>
            </>
          ) : (
            <button type="button" className="q-btn" onClick={() => setConfirm(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </form>
  )
}
