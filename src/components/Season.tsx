import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Unit } from './Odometer'
import { SeasonCard } from './SeasonCard'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

// 2027 kickoff: FIRST CANOPY season, BIOCORE game reveal, 12:00 ET on 9 January 2027.
export const KICKOFF = new Date('2027-01-09T17:00:00Z')
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

/** On the dev server, ?kickoff=past shows Home as it will look after kickoff. */
const pretend = import.meta.env.DEV && new URLSearchParams(window.location.search).get('kickoff') === 'past'

export function Season() {
  const { shared } = useAuth()
  const now = useNow(1000) + (pretend ? KICKOFF.getTime() - Date.now() + 2 * DAY : 0)
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

  // Nobody sets up robots from the shared workshop PCs: they count down to the next competition.
  if (shared) return <CompetitionCountdown now={now} />

  // After kickoff the countdown's place is the season card: set up V1, then follow it, then V2.
  return <SeasonCard since={Math.floor((now - KICKOFF.getTime()) / DAY)} season={KICKOFF.getUTCFullYear()} />
}

interface Competition {
  id: string
  title: string
  starts_at: string
  all_day: boolean
}

/** The next competition in the Calendar (an event of kind Competition), fresh each time Home opens. */
function useNextCompetition(now: number) {
  const [list, setList] = useState<Competition[] | undefined>(undefined)
  useEffect(() => {
    // From the start of today, so a competition stays up on its own day.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    supabase
      .from('events')
      .select('id, title, starts_at, all_day')
      .eq('kind', 'competition')
      .gte('starts_at', today.toISOString())
      .order('starts_at')
      .limit(20)
      .then(({ data }) => setList((data as Competition[] | null) ?? []))
  }, [])
  if (!list) return undefined
  // Against the same clock as the countdown, so it moves on the day after a competition.
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  return list.find((c) => new Date(c.starts_at).getTime() >= from.getTime()) ?? null
}

function CompetitionCountdown({ now }: { now: number }) {
  const next = useNextCompetition(now)
  if (next === undefined) return <section className="countdown" aria-busy="true" />
  if (!next)
    return (
      <section className="countdown">
        <div className="countdown__info">
          <h2 className="countdown__title">No competition in the Calendar yet</h2>
          <p className="soft">Add one as an event of kind Competition and the countdown shows here.</p>
          <Link className="q-btn" to="/calendar?view=calendar">
            Open the Calendar
          </Link>
        </div>
      </section>
    )
  const at = new Date(next.starts_at).getTime()
  const left = Math.max(0, at - now)
  const days = Math.floor(left / DAY)
  const hours = Math.floor((left % DAY) / 3_600_000)
  const minutes = Math.floor((left % 3_600_000) / 60_000)
  const seconds = Math.floor((left % 60_000) / 1000)
  const when = new Date(at).toLocaleString('en-GB', next.all_day ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  return (
    <section className="countdown" aria-label={left ? `${days} days, ${hours} hours to ${next.title}` : `${next.title} is today`}>
      <div className="countdown__units">
        <Unit value={days} label="Days" digits={days > 99 ? 3 : 2} />
        <Unit value={hours} label="Hours" />
        <Unit value={minutes} label="Minutes" />
        <Unit value={seconds} label="Seconds" />
      </div>
      <div className="countdown__info">
        <h2 className="countdown__title" dir="auto">
          {next.title}
        </h2>
        <p className="soft">
          {left ? 'The next competition.' : 'Today.'}
          <br />
          {when}.
        </p>
      </div>
    </section>
  )
}
