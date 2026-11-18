// Writes Steamhub's own events into the team's Google Calendar (CALENDAR.md, "Google Calendar").
// Called by the database right after an event changes (events_gcal_poke), every hour after the
// Google read, and by Send now on the Import page.
//  - Signs in as a Google service account: the JSON key is the GOOGLE_SERVICE_ACCOUNT secret, and
//    the team calendar is shared with its email with "Make changes to events".
//  - The calendar is the one the iCal link reads (its id is in the link), so both ways meet.
//  - Only events made in Steamhub (source is null) go out, each once: google_id remembers it, so an
//    edit updates it in place. Deleted ones are removed from Google through gcal_trash.
//  - Weekly repeats go as a weekly rule, skipped days as exceptions. Times are Israel time.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TZ = 'Asia/Jerusalem'
const API = 'https://www.googleapis.com/calendar/v3'
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
/** google_id while a run is sending it. */
const PENDING = 'pending'

type Key = { client_email: string; private_key: string }
type Ev = {
  id: string
  title: string
  kind: string
  group_id: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  repeat_days: number[] | null
  repeat_until: string | null
  skip_days: string[] | null
  notes: string | null
  google_id: string | null
}

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** An access token for the service account, by the OAuth JWT flow. */
async function token(key: Key) {
  const pem = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const k = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/calendar.events', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, new TextEncoder().encode(`${head}.${claim}`)))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  })
  const out = await res.json()
  if (!res.ok) throw new Error(`Google sign-in failed: ${out.error_description ?? out.error ?? res.status}`)
  return out.access_token as string
}

/** The calendar id inside an iCal link: .../calendar/ical/<id>/private-.../basic.ics */
function calendarId(url: string | undefined) {
  const m = /\/calendar\/ical\/([^/]+)\//.exec(url ?? '')
  return m ? decodeURIComponent(m[1]) : null
}

/** Parts of a moment in Israel. */
function israel(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}${p.minute}${p.second}` }
}
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const compact = (day: string) => day.replace(/-/g, '')

function body(e: Ev, groupName: string | null) {
  const start = Date.parse(e.starts_at)
  const end = e.ends_at ? Date.parse(e.ends_at) : start + 3600_000
  const s = israel(start)
  const out: Record<string, unknown> = {
    summary: e.title,
    description: [e.notes?.trim(), groupName && `Group: ${groupName}`, 'Made in Steamhub. Change it there: edits here are put back.'].filter(Boolean).join('\n\n'),
    extendedProperties: { private: { steamhub: e.id } },
  }
  if (e.all_day) {
    // A repeating all-day event is one day long; a single one runs to its last day (Google's end is the day after).
    const last = e.repeat_days?.length ? s.day : israel(Math.max(start, end)).day
    out.start = { date: s.day }
    out.end = { date: nextDay(last) }
  } else {
    const len = Math.max(0, end - start)
    out.start = { dateTime: new Date(start).toISOString(), timeZone: TZ }
    out.end = { dateTime: new Date(start + (e.repeat_days?.length ? len % 86_400_000 || len : len)).toISOString(), timeZone: TZ }
  }
  if (e.repeat_days?.length) {
    const rule = [`FREQ=WEEKLY`, `BYDAY=${e.repeat_days.map((d) => DAYS[d]).join(',')}`]
    if (e.repeat_until) rule.push(`UNTIL=${compact(e.repeat_until)}${e.all_day ? '' : 'T235959Z'}`)
    const rec = [`RRULE:${rule.join(';')}`]
    for (const d of e.skip_days ?? []) rec.push(e.all_day ? `EXDATE;VALUE=DATE:${compact(d)}` : `EXDATE;TZID=${TZ}:${compact(d)}T${s.time}`)
    out.recurrence = rec
  } else out.recurrence = []
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: feed }, { data: st }] = await Promise.all([
    db.from('settings').select('value').eq('key', 'google_calendar').maybeSingle(),
    db.from('settings').select('value').eq('key', 'google_calendar_push').maybeSingle(),
  ])
  const state = (st?.value ?? {}) as { on?: boolean; pushed_at?: string; count?: number; error?: string | null; email?: string }
  const save = (patch: Record<string, unknown>) => db.from('settings').upsert({ key: 'google_calendar_push', value: { ...state, ...patch }, updated_at: new Date().toISOString() })

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
  let key: Key | null = null
  try {
    key = raw ? (JSON.parse(raw) as Key) : null
  } catch {
    key = null
  }
  // Asked by the Import page what to share the calendar with, before sending is on.
  const ask = await req.json().catch(() => ({}))
  if (ask?.who) return json({ email: key?.client_email ?? null, calendar: calendarId((feed?.value as { url?: string })?.url) })
  if (!state.on) return json({ skipped: 'Sending to Google is off' })
  if (!key?.client_email || !key.private_key) {
    await save({ error: 'The Google service account key is not set up yet (GOOGLE_SERVICE_ACCOUNT).' })
    return json({ error: 'No service account key' }, 400)
  }
  const cal = calendarId((feed?.value as { url?: string })?.url)
  if (!cal) {
    await save({ error: 'Link the Google Calendar first: its iCal link says which calendar to write to.' })
    return json({ error: 'No calendar linked' }, 400)
  }

  try {
    const access = await token(key)
    const call = (method: string, path: string, payload?: unknown) =>
      fetch(`${API}/calendars/${encodeURIComponent(cal)}/events${path}`, {
        method,
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      })
    const fail = async (r: Response) => {
      const t = await r.json().catch(() => ({}))
      const why = t?.error?.message ?? `Google answered ${r.status}`
      throw new Error(r.status === 403 || r.status === 404 ? `${why}. Share the calendar with ${key!.client_email} and allow "Make changes to events".` : why)
    }

    // Deleted in Steamhub: gone from Google.
    const { data: trash } = await db.from('gcal_trash').select('google_id')
    for (const t of trash ?? []) {
      const r = await call('DELETE', `/${encodeURIComponent(t.google_id)}`)
      if (!r.ok && r.status !== 404 && r.status !== 410) await fail(r)
      await db.from('gcal_trash').delete().eq('google_id', t.google_id)
    }

    const [{ data: evs }, { data: groups }] = await Promise.all([
      db.from('events').select('id, title, kind, group_id, starts_at, ends_at, all_day, repeat_days, repeat_until, skip_days, notes, google_id').is('source', null).or('google_dirty.eq.true,google_id.is.null').limit(200),
      db.from('cal_groups').select('id, name'),
    ])
    const groupName = (id: string | null) => (groups ?? []).find((g) => g.id === id)?.name ?? null
    let sent = 0
    for (const e of (evs ?? []) as Ev[]) {
      // Claim it first, so two runs started a moment apart never send the same event twice.
      const claim = e.google_id
        ? await db.from('events').update({ google_dirty: false }).eq('id', e.id).eq('google_dirty', true).select('id')
        : await db.from('events').update({ google_id: PENDING, google_dirty: false }).eq('id', e.id).is('google_id', null).select('id')
      if (!claim.data?.length) continue
      try {
        const b = body(e, groupName(e.group_id))
        let r = e.google_id ? await call('PUT', `/${encodeURIComponent(e.google_id)}`, b) : null
        // Never sent, or deleted in Google: make it again.
        if (!r || r.status === 404 || r.status === 410) r = await call('POST', '', b)
        if (!r.ok) await fail(r)
        const made = await r.json()
        await db.from('events').update({ google_id: made.id }).eq('id', e.id)
        sent++
      } catch (err) {
        // Put it back as waiting, for the next run.
        await db.from('events').update(e.google_id ? { google_dirty: true } : { google_id: null, google_dirty: true }).eq('id', e.id)
        throw err
      }
    }
    const { count } = await db.from('events').select('id', { count: 'exact', head: true }).is('source', null).not('google_id', 'is', null).neq('google_id', PENDING)
    await save({ pushed_at: new Date().toISOString(), count: count ?? 0, error: null, email: key.client_email })
    return json({ sent, removed: trash?.length ?? 0, count })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await save({ error: message, tried_at: new Date().toISOString(), email: key.client_email })
    return json({ error: message }, 502)
  }
})
