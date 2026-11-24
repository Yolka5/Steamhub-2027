import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { Select } from './Select'
import { Sheet, useBusy, useToast } from './ui'
import { CommentThread } from './Comments'
import { useWho } from '../lib/auth'
import { usePeople } from '../lib/useMfg'
import {
  deleteEvent,
  EVENT_KINDS,
  EVENT_WORD,
  eventStatus,
  setEventStatus,
  STATUSES,
  STATUS_WORD,
  statusTone,
  type TaskStatus,
  groupOrder,
  isoDay,
  longDay,
  REMINDER_CHOICES,
  saveEvent,
  toDate,
  todayIso,
  sectionName,
  suggestSection,
  timeLabel,
  rangeLabel,
  WEEKDAYS,
  WEEKDAY_LETTER,
  type CalEvent,
  type EventKind,
} from '../lib/cal'
import { applyRow, putRows, type Cal } from '../lib/useCal'

// Meetings, competitions, deadlines. ?event=new&on=2026-11-14 adds one; ?event=<id>&on=<day>
// opens one (the day says which time a repeating event was tapped, for "Skip this day").
// A Google event shows what Google owns (name, dates, repeat) as text, and keeps Steamhub's own
// fields editable: who it's for, kind, status, the task it follows, reminders, comments.

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
      ) : ev?.source === 'google' ? (
        <GoogleEvent key={id} ev={ev} cal={cal} />
      ) : id === 'new' || ev ? (
        <EventForm key={id} ev={ev} on={on} cal={cal} onDone={close} />
      ) : (
        <p className="soft">Loading</p>
      )}
    </Sheet>
  )
}

/**
 * Where the event stands: follow a task (its status shows, so a Monday task drives a Google
 * block), or set one by hand. Saved at once, apart from the form, so Google events take it too.
 */
function EventStatus({ ev, cal }: { ev: CalEvent; cal: Cal }) {
  const toast = useToast()
  const task = ev.task_id ? cal.tasks.find((t) => t.id === ev.task_id) : undefined
  const shown = eventStatus(ev, cal.tasks)
  const end = ev.ends_at ? isoDay(new Date(ev.ends_at)) : null
  const start = isoDay(new Date(ev.starts_at))

  const set = async (patch: { status: TaskStatus | null; task_id: string | null }) => {
    const before = ev
    putRows('events', [{ ...ev, ...patch }])
    const res = await setEventStatus(ev.id, patch)
    if (res.error) {
      putRows('events', [before])
      return toast(res.error)
    }
    putRows('events', [res.data!])
  }

  const groupName = new Map(cal.groups.map((g) => [g.id, g.name]))
  const taskOptions = [
    { value: '', label: 'No task' },
    ...cal.tasks
      .filter((t) => !t.parent_id)
      .sort((a, b) => (groupName.get(a.group_id) ?? '').localeCompare(groupName.get(b.group_id) ?? '') || a.title.localeCompare(b.title))
      .map((t) => ({ value: t.id, label: t.title, group: groupName.get(t.group_id) })),
  ]

  return (
    <div className="cal-event__status">
      <div className="ctl">
        <span className="ctl__name">Status</span>
        <div className="cal-st-picks" role="radiogroup" aria-label="Status">
          <button type="button" role="radio" className="cal-st" data-tone="none" aria-checked={shown == null} onClick={() => set({ status: null, task_id: null })}>
            None
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              className="cal-st"
              data-tone={statusTone(s, start, end)}
              aria-checked={shown === s}
              // A task drives it: changing it here changes the event and stops following.
              onClick={() => set({ status: s, task_id: null })}
            >
              {s === 'done' && <Icon name="check" size={14} />}
              {STATUS_WORD[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="ctl">
        <span className="ctl__name">Follows task</span>
        <Select label="Follows task" value={ev.task_id ?? ''} onChange={(v) => set({ status: v ? null : (shown ?? null), task_id: v || null })} options={taskOptions} />
        <span className="soft small">{task ? `Shows the status of ${task.title}, ${groupName.get(task.group_id) ?? ''}. Picking a status above stops following it.` : 'Pick a task and the event shows its status, as it changes.'}</span>
      </div>
    </div>
  )
}

/** Section, then its groups, or the whole team; with a suggestion from the title when it has none. */
function ForPicker({ value, onChange, cal, title }: { value: string; onChange: (groupId: string) => void; cal: Cal; title: string }) {
  const hint = !value ? suggestSection(title) : null
  const hintGroup = hint ? cal.groups.find((g) => g.team === hint && g.kind === 'team') : undefined
  return (
    <div className="ctl">
      <span className="ctl__name">For</span>
      <Select
        label="For"
        value={value}
        onChange={onChange}
        options={[
          { value: '', label: 'The whole team' },
          ...[...cal.groups].sort(groupOrder).map((g) => ({ value: g.id, label: g.kind === 'team' ? `${g.name}, the whole section` : g.name, group: sectionName(g.team) })),
        ]}
      />
      {hintGroup && (
        <span className="cal-suggest-for small">
          <span className="soft">Looks like {hintGroup.name}.</span>
          <button type="button" className="q-btn q-btn--small" onClick={() => onChange(hintGroup.id)}>
            Use it
          </button>
        </span>
      )}
    </div>
  )
}

function Reminders({ value, onChange, group }: { value: number[]; onChange: (v: number[]) => void; group: string }) {
  const toggle = (v: number) => (value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="ctl">
      <span className="ctl__name">Remind</span>
      <div className="cal-chips" role="group" aria-label="Reminders">
        {REMINDER_CHOICES.map((r) => (
          <button key={r.min} type="button" className="chip" aria-pressed={value.includes(r.min)} onClick={() => onChange(toggle(r.min).sort((a, b) => a - b))}>
            {r.label}
          </button>
        ))}
      </div>
      <span className="soft small">
        {group ? 'Its group’s lead and everyone with an open task in it.' : 'Everyone on the team.'}
      </span>
    </div>
  )
}

/** A Google event: Google's part as text, Steamhub's part saved as you change it. */
function GoogleEvent({ ev, cal }: { ev: CalEvent; cal: Cal }) {
  const toast = useToast()
  const { people } = usePeople()
  const save = async (patch: Partial<CalEvent>) => {
    const before = ev
    putRows('events', [{ ...ev, ...patch }])
    const res = await setEventStatus(ev.id, patch)
    if (res.error) {
      putRows('events', [before])
      return toast(res.error)
    }
    putRows('events', [res.data!])
  }
  const start = new Date(ev.starts_at)
  const end = ev.ends_at ? new Date(ev.ends_at) : null
  const day = isoDay(start)
  const endDay = end ? isoDay(end) : day
  const when = ev.all_day ? rangeLabel(day, endDay) : `${longDay(day)}, ${timeLabel(start)}${end ? ` to ${timeLabel(end)}` : ''}`
  const group = cal.groups.find((g) => g.id === ev.group_id)
  return (
    <div className="form cal-event">
      <div className="cal-event__google">
        <h3 className="cal-event__gtitle" dir="auto">
          {ev.title}
        </h3>
        <p className="soft small num">
          {when}
          {ev.repeat_days?.length ? ` · every ${ev.repeat_days.map((d) => WEEKDAYS[d]).join(', ')}` : ''}
        </p>
        {ev.notes && (
          <p className="small cal-event__gnotes" dir="auto">
            {ev.notes}
          </p>
        )}
        <p className="soft small">
          <Icon name="calendar" size={14} /> From the team’s Google Calendar: change the name and time there. Everything below is Steamhub’s and stays.
        </p>
      </div>
      <ForPicker value={ev.group_id ?? ''} onChange={(v) => save({ group_id: v || null })} cal={cal} title={ev.title} />
      <div className="ctl">
        <span className="ctl__name">Kind</span>
        <div className="picks picks--seg cal-event__kinds" role="radiogroup" aria-label="Kind">
          {EVENT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" className="pick" aria-checked={ev.kind === k} onClick={() => ev.kind !== k && save({ kind: k, kind_by_hand: true })}>
              {EVENT_WORD[k]}
            </button>
          ))}
        </div>
      </div>
      <EventStatus ev={ev} cal={cal} />
      <Reminders value={ev.reminders} onChange={(r) => save({ reminders: r })} group={ev.group_id ?? ''} />
      <section className="tsheet__block">
        <h3 className="tsheet__head">Comments</h3>
        <CommentThread cal={cal} people={people} target={{ kind: 'event', id: ev.id, title: ev.title, where: group?.name ?? 'The whole team', groupId: ev.group_id }} compact />
      </section>
    </div>
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
  const { people } = usePeople()
  const [title, setTitle] = useState(ev?.title ?? '')
  const [kind, setKind] = useState<EventKind>(ev?.kind ?? 'other')
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
      {ev && <EventStatus ev={ev} cal={cal} />}
      <label className="ctl">
        <span className="ctl__name">Name</span>
        <input className="field" dir="auto" data-autofocus={!ev || undefined} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'competition' ? 'District event #1' : 'Mock kickoff'} />
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

      <ForPicker value={group} onChange={setGroup} cal={cal} title={title} />

      <Reminders value={reminders} onChange={setReminders} group={group} />

      <label className="ctl">
        <span className="ctl__name">Notes</span>
        <textarea className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where, what to bring." />
      </label>

      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Saving' : ev ? 'Save event' : 'Add event'}
      </button>

      {ev && (
        <section className="tsheet__block">
          <h3 className="tsheet__head">Comments</h3>
          <CommentThread cal={cal} people={people} target={{ kind: 'event', id: ev.id, title: ev.title, where: cal.groups.find((g) => g.id === ev.group_id)?.name ?? 'The whole team', groupId: ev.group_id }} compact />
        </section>
      )}

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
