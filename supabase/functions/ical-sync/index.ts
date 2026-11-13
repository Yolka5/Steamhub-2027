// Brings a Google Calendar into Steamhub's Calendar as events (CALENDAR.md). An admin pastes the
// calendar's secret iCal address once (settings 'google_calendar'); this reads it every hour (pg_cron)
// and when someone presses Sync now. No Google key: the secret address is the access.
//  - Each Google event becomes one Steamhub event, matched by its iCal UID, so a changed meeting
//    updates in place and a deleted one goes.
//  - Weekly repeats stay one repeating event (Steamhub's own repeat_days); other repeats are written
//    out as separate days for the next year. Cancelled single days become skip days.
//  - Times are Israel time, like the rest of the Calendar.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TZ = 'Asia/Jerusalem'
const SOURCE = 'google'
const DAY = 86_400_000

type Prop = { params: Record<string, string>; value: string }
type VEvent = Map<string, Prop[]>

/** Lines, unfolded (a line starting with a space or tab continues the one before). */
function unfold(text: string) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function parseIcs(text: string): VEvent[] {
  const out: VEvent[] = []
  let cur: VEvent | null = null
  let depth = 0
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = new Map()
      depth = 0
      continue
    }
    if (!cur) continue
    if (line.startsWith('BEGIN:')) depth++
    else if (line === 'END:VEVENT') {
      out.push(cur)
      cur = null
      continue
    } else if (line.startsWith('END:')) depth--
    // Alarms inside an event are not the event's own fields.
    if (depth > 0 || line.startsWith('BEGIN:') || line.startsWith('END:')) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const [name, ...rest] = line.slice(0, colon).split(';')
    const params: Record<string, string> = {}
    for (const r of rest) {
      const eq = r.indexOf('=')
      if (eq > 0) params[r.slice(0, eq).toUpperCase()] = r.slice(eq + 1).replace(/^"|"$/g, '')
    }
    const key = name.toUpperCase()
    cur.set(key, [...(cur.get(key) ?? []), { params, value: line.slice(colon + 1) }])
  }
  return out
}

const text = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()

/** Milliseconds a zone is ahead of UTC at a moment. */
function offset(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms
}

/** A wall-clock time in a zone, as a UTC moment. */
function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let zone = tz
  try {
    offset(guess, zone)
  } catch {
    zone = TZ
  }
  const first = guess - offset(guess, zone)
  return guess - offset(first, zone)
}

type When = { ms: number; allDay: boolean }
function when(p: Prop | undefined): When | null {
  if (!p) return null
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (h == null) return { ms: zoned(+y, +mo, +d, 0, 0, 0, TZ), allDay: true }
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), allDay: false }
  return { ms: zoned(+y, +mo, +d, +h, +mi, +s, p.params.TZID ?? TZ), allDay: false }
}

/** The day in Israel, YYYY-MM-DD. */
function israelDay(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(new Date(ms))
}
const weekday = (ms: number) => new Date(`${israelDay(ms)}T12:00:00Z`).getUTCDay()

const DAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function kindOf(title: string) {
  if (/competition|district|regional|tournament|championship|dcmp|\bcmp\b|week 0|offseason event|תחרות/i.test(title)) return 'competition'
  if (/deadline|due\b|submission|הגשה|דדליין/i.test(title)) return 'deadline'
  if (/meeting|practice|session|build|sync|standup|מפגש|פגישה|אימון|ישיבה/i.test(title)) return 'meeting'
  return 'other'
}

type Row = {
  source: string
  source_uid: string
  title: string
  kind: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  repeat_days: number[] | null
  repeat_until: string | null
  skip_days: string[]
  notes: string
}

function rowsOf(events: VEvent[], now: number): Row[] {
  const horizonEnd = now + 365 * DAY
  const keepAfter = now - 60 * DAY
  const rows = new Map<string, Row>()
  // Single days moved or cancelled in Google: their original day is skipped on the repeating event.
  const skips = new Map<string, string[]>()
  const overrides: VEvent[] = []

  const build = (ev: VEvent, uid: string, startMs: number, endMs: number | null, allDay: boolean): Row => {
    const title = text(ev.get('SUMMARY')?.[0]?.value ?? 'Untitled event')
    const where = text(ev.get('LOCATION')?.[0]?.value ?? '')
    const about = text(ev.get('DESCRIPTION')?.[0]?.value ?? '').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ')
    // All-day ends are exclusive in iCal (the day after); Steamhub ends at 23:59 of the last day.
    const end = endMs == null ? null : allDay ? Math.max(startMs, endMs - 60_000) : Math.max(startMs, endMs)
    return {
      source: SOURCE,
      source_uid: uid,
      title,
      kind: kindOf(title),
      starts_at: new Date(startMs).toISOString(),
      ends_at: end == null ? (allDay ? new Date(startMs + DAY - 60_000).toISOString() : null) : new Date(end).toISOString(),
      all_day: allDay,
      repeat_days: null,
      repeat_until: null,
      skip_days: [],
      notes: [where && `Where: ${where}`, about].filter(Boolean).join('\n').slice(0, 2000),
    }
  }

  for (const ev of events) {
    const uid = ev.get('UID')?.[0]?.value
    const start = when(ev.get('DTSTART')?.[0])
    if (!uid || !start) continue
    if (ev.get('RECURRENCE-ID')) {
      overrides.push(ev)
      continue
    }
    if ((ev.get('STATUS')?.[0]?.value ?? '').toUpperCase() === 'CANCELLED') continue
    const endW = when(ev.get('DTEND')?.[0])
    const dur = endW ? endW.ms - start.ms : start.allDay ? DAY : 0
    const exdates = (ev.get('EXDATE') ?? []).flatMap((p) => p.value.split(',').map((v) => when({ params: p.params, value: v }))).filter((w): w is When => !!w)
    const rrule = ev.get('RRULE')?.[0]?.value
    if (!rrule) {
      if (start.ms + dur < keepAfter) continue
      rows.set(uid, build(ev, uid, start.ms, endW ? endW.ms : null, start.allDay))
      continue
    }
    const r = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v]))
    const interval = Number(r.INTERVAL ?? 1)
    const until = r.UNTIL ? when({ params: {}, value: r.UNTIL })?.ms ?? null : null
    const count = r.COUNT ? Number(r.COUNT) : null
    const byDay = (r.BYDAY ?? '').split(',').map((d: string) => DAYS[d.replace(/^[+-]?\d+/, '')]).filter((d: number | undefined) => d != null) as number[]
    const simpleWeekly = (r.FREQ === 'WEEKLY' || (r.FREQ === 'DAILY' && !r.BYDAY)) && interval === 1 && !count && !/^[+-]?\d/.test(r.BYDAY ?? '')
    if (simpleWeekly) {
      // One Steamhub event that repeats on those weekdays, as the Calendar already does by hand.
      if (until != null && until < keepAfter) continue
      const row = build(ev, uid, start.ms, start.ms + dur, start.allDay)
      row.ends_at = new Date(start.ms + (start.allDay ? DAY - 60_000 : dur)).toISOString()
      row.repeat_days = r.FREQ === 'DAILY' ? [0, 1, 2, 3, 4, 5, 6] : (byDay.length ? byDay : [weekday(start.ms)]).sort()
      row.repeat_until = until != null ? israelDay(until) : null
      row.skip_days = exdates.map((w) => israelDay(w.ms))
      rows.set(uid, row)
      continue
    }
    // Anything else (every other week, monthly, a set number of times): each day written out.
    const ex = new Set(exdates.map((w) => israelDay(w.ms)))
    let n = 0
    let made = 0
    const step = (ms: number, k: number) => {
      const d = new Date(ms)
      if (r.FREQ === 'DAILY') return ms + k * interval * DAY
      if (r.FREQ === 'WEEKLY') return ms + k * interval * 7 * DAY
      if (r.FREQ === 'MONTHLY') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k * interval, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
      return Date.UTC(d.getUTCFullYear() + k * interval, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
    }
    for (let k = 0; k < 400 && made < 120; k++) {
      const base = step(start.ms, k)
      const days = r.FREQ === 'WEEKLY' && byDay.length ? byDay.map((wd) => base + ((wd - weekday(base) + 7) % 7) * DAY).sort((a, b) => a - b) : [base]
      let stop = false
      for (const ms of days) {
        if (ms < start.ms) continue
        if ((until != null && ms > until) || (count != null && n >= count) || ms > horizonEnd) {
          stop = true
          break
        }
        n++
        if (ms + dur < keepAfter || ex.has(israelDay(ms))) continue
        const id = `${uid}#${israelDay(ms)}`
        rows.set(id, build(ev, id, ms, ms + dur, start.allDay))
        made++
      }
      if (stop) break
    }
  }

  for (const ev of overrides) {
    const uid = ev.get('UID')![0].value
    const rec = when(ev.get('RECURRENCE-ID')![0])
    const start = when(ev.get('DTSTART')?.[0])
    if (!rec || !start) continue
    const day = israelDay(rec.ms)
    const parent = rows.get(uid)
    if (parent?.repeat_days) skips.set(uid, [...(skips.get(uid) ?? []), day])
    else rows.delete(`${uid}#${day}`)
    if ((ev.get('STATUS')?.[0]?.value ?? '').toUpperCase() === 'CANCELLED') continue
    const endW = when(ev.get('DTEND')?.[0])
    if ((endW?.ms ?? start.ms) < keepAfter) continue
    const id = `${uid}@${day}`
    rows.set(id, build(ev, id, start.ms, endW ? endW.ms : null, start.allDay))
  }
  for (const [uid, days] of skips) {
    const row = rows.get(uid)
    if (row) row.skip_days = [...new Set([...row.skip_days, ...days])]
  }
  return [...rows.values()]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: setting } = await db.from('settings').select('value').eq('key', 'google_calendar').maybeSingle()
  const cfg = (setting?.value ?? {}) as { url?: string; synced_at?: string; tried_at?: string; count?: number }
  const save = (patch: Record<string, unknown>) =>
    db.from('settings').upsert({ key: 'google_calendar', value: { ...cfg, ...patch }, updated_at: new Date().toISOString() })
  if (!cfg.url) return json({ error: 'No Google Calendar link saved yet' }, 400)
  // Open to calls without a sign-in (the hourly job has none), so it only ever re-reads the saved
  // link, and not more than once a minute.
  const last = Date.parse(cfg.synced_at ?? cfg.tried_at ?? '') || 0
  if (Date.now() - last < 60_000) return json({ count: cfg.count ?? 0, removed: 0, recent: true })

  try {
    // webcal:// is the same address over https.
    const url = cfg.url.trim().replace(/^webcal:\/\//i, 'https://')
    const res = await fetch(url, { redirect: 'follow' })
    const body = await res.text()
    if (!res.ok || !body.includes('BEGIN:VCALENDAR')) throw new Error(res.ok ? 'That link is not a calendar (iCal) address' : `Google answered ${res.status}`)
    const rows = rowsOf(parseIcs(body), Date.now())

    const { data: had } = await db.from('events').select('id, source_uid').eq('source', SOURCE)
    const keep = new Set(rows.map((r) => r.source_uid))
    const gone = (had ?? []).filter((e) => !keep.has(e.source_uid as string)).map((e) => e.id as string)
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('events').upsert(rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'source,source_uid' })
      if (error) throw new Error(error.message)
    }
    for (let i = 0; i < gone.length; i += 200) await db.from('events').delete().in('id', gone.slice(i, i + 200))
    await save({ synced_at: new Date().toISOString(), count: rows.length, error: null })
    return json({ count: rows.length, removed: gone.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await save({ tried_at: new Date().toISOString(), error: message })
    return json({ error: message }, 502)
  }
})
