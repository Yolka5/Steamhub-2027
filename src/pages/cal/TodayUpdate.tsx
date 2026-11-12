import { useEffect, useState } from 'react'
import { useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { saveUpdate, todayIso, type CalGroup, type Phase } from '../../lib/cal'
import { putRows, type Cal } from '../../lib/useCal'

// Today's update, written right where the group's updates are read. Not sent yet: a box and
// Send. Sent: the text, with Edit. Sending again the same day replaces it.

export function TodayUpdate({ group, phase, cal }: { group: CalGroup; phase: Phase | null; cal: Cal }) {
  const who = useWho()
  const toast = useToast()
  const [busy, run] = useBusy()
  const today = todayIso()
  const sent = cal.updates.find((u) => u.group_id === group.id && u.day === today)
  const [editing, setEditing] = useState(!sent)
  const [text, setText] = useState(sent?.text ?? '')
  useEffect(() => {
    if (!editing) setText(sent?.text ?? '')
  }, [sent?.text, editing])
  useEffect(() => setEditing(!sent), [sent?.id])

  const send = () =>
    run(async () => {
      if (!who) return
      const t = text.trim()
      if (!t) return toast('Write what happened today first')
      const res = await saveUpdate(group.id, phase?.id ?? null, today, t, who)
      if (res.error) return toast(res.error)
      putRows('cal_updates', [res.data!])
      setEditing(false)
      toast(sent ? 'Update changed' : `${group.name} update sent`)
    })

  if (sent && !editing)
    return (
      <div className="cal-today cal-today--sent">
        <div className="cal-feed__head">
          <span className="strong">Today</span>
          <span className="soft small">Sent{phase ? ` · ${phase.name}` : ''}</span>
          <button type="button" className="q-btn q-btn--small cal-today__edit" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <p className="cal-feed__text" dir="auto">
          {sent.text}
        </p>
      </div>
    )

  return (
    <form
      className="cal-today"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label className="strong" htmlFor={`today-${group.id}`}>
        Today's update
      </label>
      <textarea
        id={`today-${group.id}`}
        className="field cal-update__text cal-today__text"
        rows={4}
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened today, what's next, what's stuck."
      />
      <div className="cal-today__foot">
        <span className="soft small">{phase ? `Goes under ${phase.name}.` : 'Everyone can read it on Updates.'}</span>
        {sent && (
          <button type="button" className="q-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
        <button type="submit" className="q-btn q-btn--main">
          {busy ? 'Sending' : sent ? 'Save' : 'Send'}
        </button>
      </div>
    </form>
  )
}
