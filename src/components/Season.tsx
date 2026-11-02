import { useEffect, useState, type CSSProperties } from 'react'

// 2027 kickoff: FIRST CANOPY season, BIOCORE game reveal, 12:00 ET on 9 January 2027.
const KICKOFF = new Date('2027-01-09T17:00:00Z')
const DAY = 86_400_000

const CALENDAR_URL =
  'https://calendar.google.com/calendar/render?action=TEMPLATE' +
  '&text=' +
  encodeURIComponent('FRC 2027 Kickoff: BIOCORE reveal') +
  '&dates=20270109T170000Z/20270109T190000Z' +
  '&details=' +
  encodeURIComponent('FIRST CANOPY season kickoff and BIOCORE game reveal, live on the FIRST Robotics Competition YouTube channel.')

function useNow(every: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(t)
  }, [every])
  return now
}

/**
 * Digits roll like an odometer when they change. A transition, not a keyframe, so a change that
 * lands mid-roll just retargets instead of restarting.
 */
function Rolling({ value, digits = 2 }: { value: number; digits?: number }) {
  const text = String(value).padStart(digits, '0')
  return (
    <span className="roll num" aria-hidden="true">
      {[...text].map((d, i) => (
        <span key={text.length - i} className="roll__col">
          <span className="roll__strip" style={{ '--d': Number(d) } as CSSProperties}>
            {'0123456789'.split('').map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

function Unit({ value, label, digits }: { value: number; label: string; digits?: number }) {
  return (
    <div className="countdown__unit">
      <Rolling value={value} digits={digits} />
      <span className="countdown__label">{label}</span>
    </div>
  )
}

export function Season() {
  const now = useNow(1000)
  const left = KICKOFF.getTime() - now
  const when = KICKOFF.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  if (left > 0) {
    const days = Math.floor(left / DAY)
    const hours = Math.floor((left % DAY) / 3_600_000)
    const minutes = Math.floor((left % 3_600_000) / 60_000)
    const seconds = Math.floor((left % 60_000) / 1000)
    return (
      <section className="countdown" aria-label={`${days} days, ${hours} hours to kickoff`}>
        <div className="countdown__units">
          <Unit value={days} label="Days" digits={days > 99 ? 3 : 2} />
          <Unit value={hours} label="Hours" />
          <Unit value={minutes} label="Minutes" />
          <Unit value={seconds} label="Seconds" />
        </div>
        <div className="countdown__info">
          <h2 className="countdown__title">Kickoff</h2>
          <p className="soft">
            BIOCORE game reveal, FIRST CANOPY season.
            <br />
            {when}.
          </p>
          <a className="q-btn" href={CALENDAR_URL} target="_blank" rel="noreferrer">
            Add to calendar
          </a>
        </div>
      </section>
    )
  }

  const since = Math.floor((now - KICKOFF.getTime()) / DAY)
  const week = Math.floor(since / 7) + 1
  const day = (since % 7) + 1
  return (
    <section className="countdown" aria-label={`Build week ${week}, day ${day}`}>
      <div className="countdown__units">
        <Unit value={week} label="Build week" digits={1} />
        <Unit value={day} label="Day" digits={1} />
      </div>
      <div className="countdown__info">
        <h2 className="countdown__title">BIOCORE build season</h2>
        <div className="season__days" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="season__day" data-state={i + 1 < day ? 'done' : i + 1 === day ? 'today' : undefined} />
          ))}
        </div>
      </div>
    </section>
  )
}
