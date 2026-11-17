import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { addDays, isoDay, toDate, todayIso } from '../lib/cal'

// Start and end days in Steamhub's look, instead of the browser's own date picker. Two fields; the
// one tapped opens a month under them. Tap the start day, then the end day: the days between fill
// in, like the date pill. Used by the phase editor and the task window.

const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const fieldLabel = (day: string | null) => (day ? toDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null)

export function DateRange({
  start,
  end,
  onChange,
  endWord = 'End',
}: {
  start: string | null
  end: string | null
  onChange: (start: string | null, end: string | null) => void
  endWord?: string
}) {
  const [picking, setPicking] = useState<'start' | 'end' | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const first = (day: string | null) => {
    const d = toDate(day ?? todayIso())
    return isoDay(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const [month, setMonth] = useState(() => first(start ?? end))
  useEffect(() => {
    if (picking) setMonth(first(picking === 'start' ? (start ?? end) : (end ?? start)))
    // Only when a field is opened, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking])

  const m = toDate(month)
  const shift = (n: number) => setMonth(isoDay(new Date(m.getFullYear(), m.getMonth() + n, 1)))
  const gridStart = addDays(month, -m.getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Drop a last row that is all next month.
  const shown = days.slice(0, toDate(days[35]).getMonth() !== m.getMonth() ? 35 : 42)
  const today = todayIso()

  // While choosing the end, the range follows the pointer.
  const lo = start
  const hi = picking === 'end' && start && hover && hover >= start ? hover : end

  const pick = (day: string) => {
    if (picking === 'start') {
      onChange(day, end && end < day ? null : end)
      setPicking('end')
      return
    }
    if (start && day < start) {
      // Before the start: that's the new start, still choosing the end.
      onChange(day, end)
      return
    }
    onChange(start, day)
    setPicking(null)
    setHover(null)
  }

  const field = (which: 'start' | 'end', day: string | null, word: string) => (
    <button type="button" className="dr-field" aria-expanded={picking === which} data-on={picking === which || undefined} onClick={() => setPicking(picking === which ? null : which)}>
      <span className="dr-field__word">{word}</span>
      <span className="dr-field__day num" data-empty={!day || undefined}>
        {fieldLabel(day) ?? 'Pick a day'}
      </span>
    </button>
  )

  return (
    <div className="dr">
      <div className="dr-fields">
        {field('start', start, 'Start')}
        <span className="soft dr-arrow" aria-hidden="true">
          →
        </span>
        {field('end', end, endWord)}
      </div>
      {picking && (
        <div className="dr-cal" onPointerLeave={() => setHover(null)}>
          <div className="dr-cal__head">
            <button type="button" className="icon-btn" aria-label="Month before" onClick={() => shift(-1)}>
              <Icon name="back" size={18} />
            </button>
            <span className="dr-cal__month">{m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
            <button type="button" className="icon-btn" aria-label="Month after" onClick={() => shift(1)}>
              <Icon name="next" size={18} />
            </button>
          </div>
          <p className="soft small dr-cal__say">{picking === 'start' ? 'Tap the first day' : `Tap the ${endWord.toLowerCase()} day`}</p>
          <div className="dr-cal__grid" role="grid">
            {WEEK.map((w) => (
              <span key={w} className="dr-cal__wd" aria-hidden="true">
                {w}
              </span>
            ))}
            {shown.map((d) => {
              const inMonth = toDate(d).getMonth() === m.getMonth()
              const isStart = d === lo
              const isEnd = d === hi
              const inside = !!lo && !!hi && d > lo && d < hi
              return (
                <button
                  key={d}
                  type="button"
                  className="dr-day num"
                  data-out={!inMonth || undefined}
                  data-today={d === today || undefined}
                  data-start={isStart || undefined}
                  data-end={isEnd || undefined}
                  data-in={inside || undefined}
                  data-edge={(isStart && !!hi && hi !== lo) || (isEnd && !!lo && hi !== lo) || undefined}
                  aria-label={toDate(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  aria-pressed={isStart || isEnd}
                  onPointerEnter={() => setHover(d)}
                  onClick={() => pick(d)}
                >
                  <span>{toDate(d).getDate()}</span>
                </button>
              )
            })}
          </div>
          <div className="dr-cal__foot">
            <button
              type="button"
              className="text-btn small"
              onClick={() => {
                if (picking === 'start') onChange(null, end)
                else onChange(start, null)
              }}
            >
              Clear {picking === 'start' ? 'start' : endWord.toLowerCase()}
            </button>
            <button type="button" className="text-btn small" onClick={() => setMonth(first(today))}>
              Today
            </button>
            <button type="button" className="q-btn q-btn--small dr-cal__done" onClick={() => setPicking(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
