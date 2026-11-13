// SteamLab's nightly recap (STEAMLAB.md). Collects one workshop day (Israel time) into JSON, asks
// Claude for a team recap and one per subsystem, saves them in steamlab_recaps, and pushes the
// headlines: the team one to mentors and admins, each subsystem's to its lead.
//
//   POST {}                              the nightly run (cron at 00:00 UTC): recaps yesterday
//   POST { day: 'YYYY-MM-DD', dry, force }  an admin's manual run; dry saves but sends no pushes
//
// Deployed with verify_jwt off, because cron has no user token. A call needs either the Vault key
// cron sends (x-steamlab-key) or an admin's sign-in. A day with no activity costs nothing: no call
// to Claude, no rows, no pushes. A day that already has a recap is skipped unless forced.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import Anthropic from 'npm:@anthropic-ai/sdk'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const MODEL = 'claude-opus-5-5'
const TZ = 'Asia/Jerusalem'
const MIN = 60_000
const STALE = 3 * 60 * MIN

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-steamlab-key',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// ---------- Israel days ----------

function offsetMin(at: Date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 120
}
/** UTC ms of local midnight that starts `day`. */
function dayStart(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  return guess - offsetMin(new Date(guess)) * MIN
}
const localDay = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at)
const addDay = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const hhmm = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const first = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'Someone'

// ---------- Machine runs (the same pairing as src/lib/workshopMap.ts) ----------

const STARTS = new Set(['claimed', 'status_doing'])
const ENDS = new Set(['status_done', 'status_todo', 'status_cancelled', 'status_missing'])
interface Ev { part_id: string; action: string; by_name: string | null; details: { for?: string } | null; at: string; part: { part_no: number; machine: string; name: string; subsystem_id: string } | null }
interface Run { partId: string; partNo: number; name: string; machine: string; sub: string; who: string; start: number; end: number | null; done: boolean }

function pairRuns(events: Ev[]): Run[] {
  const runs: Run[] = []
  const open = new Map<string, Run>()
  const last = new Map<string, Run>()
  for (const e of events) {
    if (!e.part || e.part.machine === 'Bought') continue
    const at = new Date(e.at).getTime()
    const who = e.details?.for || e.by_name || 'Someone'
    const o = open.get(e.part_id)
    if (STARTS.has(e.action)) {
      if (o) {
        if (e.action !== 'claimed') continue
        o.end = at
        o.done = false
      }
      const prev = last.get(e.part_id)
      if (!o && prev && prev.done && e.action === 'status_doing' && prev.end !== null && at - prev.end < 30 * MIN) {
        prev.end = null
        prev.done = false
        open.set(e.part_id, prev)
        continue
      }
      const r: Run = { partId: e.part_id, partNo: e.part.part_no, name: e.part.name, machine: e.part.machine, sub: e.part.subsystem_id, who, start: at, end: null, done: false }
      runs.push(r)
      open.set(e.part_id, r)
    } else if (o) {
      o.end = at
      o.done = e.action === 'status_done'
      last.set(e.part_id, o)
      open.delete(e.part_id)
    }
  }
  return runs
}

// ---------- One day as JSON ----------

interface Sub { id: string; robot_id: string; number: number; name: string; lead_id: string | null }
interface Robot { id: string; name: string; season: number; archived: boolean; offseason?: boolean }
interface Group { id: string; season: number; kind: string; subsystem_number: number | null; subsystem_id?: string | null; name: string; lead_id: string | null }
interface Phase { group_id: string; name: string; kind: string; robot_id: string | null; sort: number; starts_on: string | null; ends_on: string | null; done_at: string | null }

async function collect(day: string) {
  const from = dayStart(day)
  const to = dayStart(addDay(day, 1))
  const iso = (t: number) => new Date(t).toISOString()

  const [{ data: robots }, { data: subsAll }] = await Promise.all([db.from('robots').select('id, name, season, archived, offseason'), db.from('subsystems').select('id, robot_id, number, name, lead_id')])
  const active = ((robots ?? []) as Robot[]).filter((r) => !r.archived)
  const subs = ((subsAll ?? []) as Sub[]).filter((s) => active.some((r) => r.id === s.robot_id)).sort((a, b) => a.robot_id.localeCompare(b.robot_id) || a.number - b.number)
  const seasons = [...new Set(active.map((r) => r.season))]
  const subIds = subs.map((s) => s.id)

  const [parts, events, tests, picks, updates, groups, phases, people] = await Promise.all([
    subIds.length ? db.from('parts').select('id, subsystem_id, status, machine, done_at').in('subsystem_id', subIds) : Promise.resolve({ data: [] }),
    db.from('part_events').select('part_id, action, by_name, details, at, part:parts!inner(part_no, machine, name, subsystem_id)').in('action', [...STARTS, ...ENDS]).gte('at', iso(from - 12 * 60 * MIN)).lt('at', iso(to)).order('at').limit(5000),
    db.from('prototype_tests').select('n, result, measure_name, measure_value, by_name, at, prototype:prototypes!inner(name, season, subsystem_number)').gte('at', iso(from)).lt('at', iso(to)),
    db.from('prototypes').select('name, season, subsystem_number').eq('status', 'chosen').gte('updated_at', iso(from)).lt('updated_at', iso(to)),
    db.from('cal_updates').select('group_id, text').eq('day', day),
    seasons.length ? db.from('cal_groups').select('id, season, kind, subsystem_number, subsystem_id, name, lead_id').in('season', seasons) : Promise.resolve({ data: [] }),
    db.from('cal_phases').select('group_id, name, kind, robot_id, sort, starts_on, ends_on, done_at'),
    db.from('profiles').select('id, name'),
  ])
  const nameOf = (id: string | null) => ((people.data ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? null
  const gs = (groups.data ?? []) as Group[]
  const ps = (phases.data ?? []) as Phase[]
  const subOfGroup = (g: Group) =>
    g.kind === 'project' ? subs.find((s) => s.id === g.subsystem_id) : g.kind === 'subsystem' ? subs.find((s) => s.number === g.subsystem_number && active.some((r) => r.id === s.robot_id && r.season === g.season && !r.offseason)) : undefined
  const subByNumber = (season: number, n: number | null) => subs.find((s) => s.number === n && active.some((r) => r.id === s.robot_id && r.season === season && !r.offseason))

  const runs = pairRuns(((events.data ?? []) as unknown as Ev[])).filter((r) => (r.end ?? Infinity) > from && r.start < to)
  const counted = (r: Run) => Math.max(0, Math.min(r.end ?? to, to, r.start + STALE) - Math.max(r.start, from))
  const finished = runs.filter((r) => r.done && r.end! >= from && r.end! < to)

  const groupOfSub = new Map<string, Group>()
  for (const g of gs) {
    const s = subOfGroup(g)
    if (s && !groupOfSub.has(s.id)) groupOfSub.set(s.id, g)
  }
  const updateOf = new Map(((updates.data ?? []) as { group_id: string; text: string }[]).map((u) => [u.group_id, u.text]))

  const subsystems = subs.map((s) => {
    const robot = active.find((r) => r.id === s.robot_id)!
    const mine = ((parts.data ?? []) as { subsystem_id: string; status: string; machine: string; done_at: string | null }[]).filter((p) => p.subsystem_id === s.id && p.status !== 'cancelled' && p.machine !== 'Bought')
    const made = mine.filter((p) => p.status === 'done' && (!p.done_at || +new Date(p.done_at) < to)).length
    const pct = mine.length ? Math.round((made / mine.length) * 100) : 0
    const g = groupOfSub.get(s.id)
    const phase = g ? ps.filter((p) => p.group_id === g.id && p.kind === 'manufacturing' && (!p.robot_id || p.robot_id === robot.id) && p.starts_on && p.ends_on).sort((a, b) => a.sort - b.sort)[0] : undefined
    let plan: number | null = null
    let behind: number | null = null
    if (phase?.starts_on && phase.ends_on) {
      const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
      const len = days(phase.starts_on, phase.ends_on) + 1
      const into = Math.min(Math.max(days(phase.starts_on, day) + 1, 0), len)
      plan = Math.round((into / len) * 100)
      behind = Math.round(((plan - pct) / (100 / len)) * 10) / 10
    }
    const mineRuns = runs.filter((r) => r.sub === s.id)
    return {
      id: s.id,
      name: s.name,
      robot: robot.name,
      lead: first(nameOf(s.lead_id)),
      parts_total: mine.length,
      parts_made_by_end_of_day: made,
      made_pct: pct,
      plan_pct: plan,
      days_behind_plan: behind,
      manufacturing_phase: phase ? { name: phase.name, starts_on: phase.starts_on, ends_on: phase.ends_on } : null,
      finished_today: finished.filter((r) => r.sub === s.id).map((r) => ({ part: `${r.partNo} ${r.name}`, machine: r.machine, by: first(r.who) })),
      machine_minutes_today: Math.round(mineRuns.reduce((a, r) => a + counted(r), 0) / MIN),
      daily_update: g ? (updateOf.get(g.id) ?? null) : null,
      daily_update_expected: !!g,
    }
  })

  const machines = Object.fromEntries(
    ['CNC', 'Mill', 'Lathe', '3D print'].map((m) => {
      const rs = runs.filter((r) => r.machine === m)
      const lastEnd = Math.max(0, ...rs.map((r) => Math.min(r.end ?? to, to)))
      return [m, { sessions: rs.length, busy_minutes: Math.round(rs.reduce((a, r) => a + counted(r), 0) / MIN), first_start: rs.length ? hhmm(Math.max(from, Math.min(...rs.map((r) => r.start)))) : null, last_used_until: lastEnd ? hhmm(lastEnd) : null, still_running_at_midnight: rs.some((r) => !r.end || r.end >= to) }]
    }),
  )

  const byPerson = new Map<string, { parts_finished: number; machine_minutes: number }>()
  for (const r of runs) {
    const k = first(r.who)
    const v = byPerson.get(k) ?? { parts_finished: 0, machine_minutes: 0 }
    v.machine_minutes += Math.round(counted(r) / MIN)
    if (r.done && r.end! >= from && r.end! < to) v.parts_finished++
    byPerson.set(k, v)
  }

  type Test = { n: number; result: string | null; measure_name: string; measure_value: number | null; by_name: string | null; prototype: { name: string; season: number; subsystem_number: number | null } }
  const testList = ((tests.data ?? []) as unknown as Test[]).map((t) => ({
    prototype: t.prototype.name,
    subsystem: subByNumber(t.prototype.season, t.prototype.subsystem_number)?.name ?? null,
    test: t.n,
    result: t.result,
    measured: t.measure_value != null && t.measure_name ? `${t.measure_name} ${t.measure_value}` : null,
    by: first(t.by_name),
  }))
  const chosen = ((picks.data ?? []) as { name: string; season: number; subsystem_number: number | null }[]).map((p) => ({ prototype: p.name, subsystem: subByNumber(p.season, p.subsystem_number)?.name ?? null }))
  const phasesDone = ps.filter((p) => p.done_at && +new Date(p.done_at) >= from && +new Date(p.done_at) < to).map((p) => ({ group: gs.find((g) => g.id === p.group_id)?.name ?? null, phase: p.name }))
  const expected = subsystems.filter((s) => s.daily_update_expected)

  const events_count = runs.length + testList.length + chosen.length + updateOf.size + phasesDone.length
  return {
    input: {
      day,
      weekday: weekday(day),
      parts_finished: finished.length,
      machines,
      people: Object.fromEntries(byPerson),
      subsystems,
      prototype_tests: testList,
      prototypes_chosen: chosen,
      calendar_phases_done: phasesDone,
      daily_updates: { sent: expected.filter((s) => s.daily_update).length, expected: expected.length, missing: expected.filter((s) => !s.daily_update).map((s) => s.name) },
    },
    events: events_count,
    subs,
  }
}

// ---------- Claude ----------

const RECAP = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'paragraphs', 'look'],
  properties: {
    headline: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'string' } },
    look: { type: 'array', items: { type: 'string' } },
  },
}
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['team', 'subsystems'],
  properties: {
    team: RECAP,
    subsystems: {
      type: 'array',
      items: { ...RECAP, required: ['subsystem_id', ...RECAP.required], properties: { subsystem_id: { type: 'string' }, ...RECAP.properties } },
    },
  },
}

const SYSTEM = `You write the nightly recap for SteamLab, the page the mentors and subsystem leads of FRC team 1577 Steampunk read each morning. The user message is one workshop day as JSON, collected from the team's own tools.

Write two kinds of recap:
- team: for the mentors, about the whole team.
- subsystems: one for every subsystem in the JSON that had activity that day, sent a daily update, or is behind plan. Use its id as subsystem_id. Its lead reads it.

Each recap has:
- headline: one sentence with the most important thing, at most 14 words.
- paragraphs: one to three short paragraphs.
- look: up to three concrete things worth doing tomorrow, each at most 14 words. Leave it empty when nothing needs attention.

How to write:
- Lead with the schedule: who is behind or ahead of plan (days_behind_plan above 0.8 is behind, made_pct at least 5 points over plan_pct is ahead), and the likely reason the data shows, such as a machine left idle, few sessions, or a missing daily update. When plan_pct is null, say nothing about that subsystem's schedule.
- Then what got done: parts finished, machine time, prototype tests and their results, prototypes chosen, phases finished. Use the daily_update text for context, in your own words.
- Plain English, short sentences, numbers with units ("2 h 10 min", "41%", "3 parts").
- First names only, to credit work. Never blame anyone.
- Only facts that are in the JSON. Never invent numbers, causes or plans.
- No markdown, no em dashes, no exclamation marks, no greetings.`

interface Out {
  team: { headline: string; paragraphs: string[]; look: string[] }
  subsystems: { subsystem_id: string; headline: string; paragraphs: string[]; look: string[] }[]
}

async function write(input: unknown): Promise<{ out: Out; model: string }> {
  const client = new Anthropic()
  // Server-side fallback: if the model declines, the API re-runs the request on another model.
  const params: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  }
  const res = await client.beta.messages.create(params as never)
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write this recap')
  if (res.stop_reason === 'max_tokens') throw new Error('The recap was cut off')
  const text = res.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined
  if (!text) throw new Error('No recap in the answer')
  return { out: JSON.parse(text.text) as Out, model: res.model }
}

// ---------- Run ----------

async function allowed(req: Request) {
  const key = req.headers.get('x-steamlab-key')
  if (key) {
    const { data } = await db.rpc('steamlab_key_ok', { k: key })
    return data === true ? 'cron' : null
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  if (!data.user) return null
  const { data: p } = await db.from('profiles').select('is_admin, banned').eq('id', data.user.id).maybeSingle()
  return p?.is_admin && !p.banned ? 'admin' : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await allowed(req)
  if (!who) return json({ error: 'Not allowed' }, 401)

  let body: { day?: string; dry?: boolean; force?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // The nightly run sends {}.
  }
  const day = body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : addDay(localDay(new Date()), -1)

  if (!body.force) {
    const { data: done } = await db.from('steamlab_recaps').select('id').eq('day', day).eq('scope', 'team').maybeSingle()
    if (done) return json({ day, skipped: 'already written' })
  }

  const { input, events, subs } = await collect(day)
  if (!events) return json({ day, skipped: 'no activity' })

  let result: { out: Out; model: string }
  try {
    result = await write(input)
  } catch (e) {
    console.error('steamlab recap failed', (e as Error).message)
    return json({ day, error: (e as Error).message }, 502)
  }
  const { out, model } = result
  const ids = new Set(subs.map((s) => s.id))
  const rows = [
    { day, scope: 'team', ...out.team, events, model },
    ...out.subsystems.filter((s) => ids.has(s.subsystem_id)).map(({ subsystem_id, ...r }) => ({ day, scope: subsystem_id, ...r, events, model })),
  ].map((r) => ({ day: r.day, scope: r.scope, headline: r.headline, paragraphs: r.paragraphs, look: r.look.slice(0, 3), events: r.events, model: r.model }))
  const { error } = await db.from('steamlab_recaps').upsert(rows, { onConflict: 'day,scope' })
  if (error) return json({ day, error: error.message }, 500)

  let pushed = 0
  if (!body.dry) {
    const wd = weekday(day)
    const { data: mentors } = await db.from('profiles').select('id').or('mentor.eq.true,is_admin.eq.true').eq('banned', false).eq('shared', false)
    const mentorIds = new Set(((mentors ?? []) as { id: string }[]).map((m) => m.id))
    const notes = [...mentorIds].map((user_id) => ({ user_id, kind: 'steamlab', text: `SteamLab, ${wd}: ${out.team.headline}`, link: `/steamlab?day=${day}` }))
    for (const r of rows.filter((x) => x.scope !== 'team')) {
      const lead = subs.find((s) => s.id === r.scope)?.lead_id
      if (lead && !mentorIds.has(lead)) notes.push({ user_id: lead, kind: 'steamlab', text: `SteamLab, ${wd}, ${subs.find((s) => s.id === r.scope)!.name}: ${r.headline}`, link: `/steamlab?day=${day}&scope=${r.scope}` })
    }
    if (notes.length) {
      const { error: nerr } = await db.from('notifications').insert(notes)
      if (nerr) console.error('steamlab push failed', nerr.message)
      else pushed = notes.length
    }
  }
  return json({ day, by: who, events, recaps: rows.length, pushed, model })
})
