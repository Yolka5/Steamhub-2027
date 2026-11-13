import { useEffect, useState } from 'react'
import { addDays, daysBetween, toDate, type CalGroup, type Phase } from './cal'
import type { Machine, Part, Robot, Subsystem } from './mfg'
import { supabase } from './supabase'
import { pairRuns, type Run } from './workshopMap'

// SteamLab (STEAMLAB.md): one day of the whole team, for mentors and leads. Machine sessions come
// from part_events (the same pairing as the workshop map's History), the feed from the tables
// people already fill in, and the plan from each subsystem's manufacturing phase in the Calendar.

// ---------- Who can open it ----------

let access: Promise<boolean> | null = null
let accessFor: string | null = null

/** Mentors, admins and leads (can_steamlab() in the database). Asked once per signed-in person; null while asking. */
export function useSteamlabAccess(userId: string | null) {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (!userId) return setOk(null)
    if (!access || accessFor !== userId) {
      accessFor = userId
      access = Promise.resolve(supabase.rpc('can_steamlab')).then(
        ({ data }) => data === true,
        () => false,
      )
    }
    let live = true
    access.then((v) => live && setOk(v))
    return () => {
      live = false
    }
  }, [userId])
  return ok
}

// ---------- One day ----------

export interface DayRun extends Run {
  subsystemId: string
}

export type FeedKind = 'done' | 'test' | 'pick' | 'update' | 'phase'
export interface FeedItem {
  t: number
  kind: FeedKind
  text: string
  meta: string
  /** The subsystem it belongs to, for the hover filter. */
  sub: string | null
  link?: string
}

export interface DayData {
  runs: DayRun[]
  feed: FeedItem[]
  /** Daily updates sent, per Calendar group id. */
  updates: Set<string>
  error?: string
}

const dayStart = (day: string) => toDate(day).getTime()
export const dayBounds = (day: string) => [dayStart(day), dayStart(addDays(day, 1))] as const

const STARTS = ['claimed', 'status_doing']
const ENDS = ['status_done', 'status_todo', 'status_cancelled', 'status_missing']

interface PartRef {
  part_no: number
  machine: Machine
  name: string
  subsystem_id: string
}

interface Ctx {
  subs: Subsystem[]
  robots: Robot[]
  groups: CalGroup[]
  nameOfSub: (id: string | null) => string
}

/** Which subsystem a Calendar group follows, among the active robots. */
export function subOfGroup(g: CalGroup | undefined, subs: Subsystem[], robots: Robot[]): Subsystem | null {
  if (!g) return null
  if (g.kind === 'project') return subs.find((s) => s.id === g.subsystem_id) ?? null
  if (g.kind !== 'subsystem' || g.subsystem_number == null) return null
  return subs.find((s) => s.number === g.subsystem_number && robots.some((r) => r.id === s.robot_id && r.season === g.season && !r.offseason)) ?? null
}

export async function loadDay(day: string, ctx: Ctx): Promise<DayData> {
  const [from, to] = dayBounds(day)
  // Half a day before, so a part started the evening before still pairs with its finish.
  const since = new Date(from - 12 * 3600_000).toISOString()
  const until = new Date(to).toISOString()
  const dayFrom = new Date(from).toISOString()

  const [ev, tests, picks, updates, phases] = await Promise.all([
    supabase
      .from('part_events')
      .select('part_id, action, by_name, details, at, part:parts!inner(part_no, machine, name, subsystem_id)')
      .in('action', [...STARTS, ...ENDS])
      .gte('at', since)
      .lt('at', until)
      .order('at')
      .limit(5000),
    supabase
      .from('prototype_tests')
      .select('id, n, result, measure_name, measure_value, by_name, at, prototype:prototypes!inner(id, name, season, subsystem_number)')
      .gte('at', dayFrom)
      .lt('at', until)
      .order('at'),
    supabase.from('prototypes').select('id, name, season, subsystem_number, updated_at').eq('status', 'chosen').gte('updated_at', dayFrom).lt('updated_at', until),
    supabase.from('cal_updates').select('group_id, text, created_at').eq('day', day),
    supabase.from('cal_phases').select('group_id, name, done_at').gte('done_at', dayFrom).lt('done_at', until),
  ])
  const error = ev.error?.message ?? tests.error?.message ?? updates.error?.message

  type Ev = { part_id: string; action: string; by_name: string | null; details: { for?: string } | null; at: string; part: PartRef | null }
  const events = (ev.data as unknown as Ev[] | null) ?? []
  const partOf = new Map(events.filter((e) => e.part).map((e) => [e.part_id, e.part!]))
  const runs: DayRun[] = pairRuns(events as never)
    .filter((r) => (r.end ?? Infinity) > from && r.start < to)
    .map((r) => ({ ...r, subsystemId: partOf.get(r.partId)?.subsystem_id ?? '' }))

  const subByNumber = (season: number, n: number | null) => ctx.subs.find((s) => s.number === n && ctx.robots.some((r) => r.id === s.robot_id && r.season === season && !r.offseason))?.id ?? null
  const feed: FeedItem[] = []
  for (const r of runs)
    if (r.done && r.end && r.end >= from && r.end < to) {
      const p = partOf.get(r.partId)
      feed.push({ t: r.end, kind: 'done', text: `${first(r.who)} finished ${r.partNo} ${p?.name ?? ''}`.trim(), meta: `${r.machine} · ${ctx.nameOfSub(r.subsystemId)}`, sub: r.subsystemId, link: `/manufacturing/p/${r.partId}` })
    }
  type Test = { id: string; n: number; result: string | null; measure_name: string; measure_value: number | null; by_name: string | null; at: string; prototype: { id: string; name: string; season: number; subsystem_number: number | null } }
  for (const x of (tests.data as unknown as Test[] | null) ?? []) {
    const sub = subByNumber(x.prototype.season, x.prototype.subsystem_number)
    const measure = x.measure_value != null && x.measure_name ? `${x.measure_name} ${x.measure_value}` : x.result ? RESULT[x.result] ?? x.result : ''
    feed.push({ t: +new Date(x.at), kind: 'test', text: `${x.by_name ? first(x.by_name) : 'Someone'} filmed test ${x.n} of ${x.prototype.name}`, meta: ['Prototypes', ctx.nameOfSub(sub), measure].filter(Boolean).join(' · '), sub, link: `/prototypes/${x.prototype.id}` })
  }
  type Pick = { id: string; name: string; season: number; subsystem_number: number | null; updated_at: string }
  for (const x of (picks.data as Pick[] | null) ?? []) {
    const sub = subByNumber(x.season, x.subsystem_number)
    feed.push({ t: +new Date(x.updated_at), kind: 'pick', text: `${x.name} chosen for the robot`, meta: ['Prototypes', ctx.nameOfSub(sub)].filter(Boolean).join(' · '), sub, link: `/prototypes/${x.id}` })
  }
  const sent = new Set<string>()
  for (const u of (updates.data as { group_id: string; text: string; created_at: string }[] | null) ?? []) {
    sent.add(u.group_id)
    const g = ctx.groups.find((x) => x.id === u.group_id)
    const sub = subOfGroup(g, ctx.subs, ctx.robots)?.id ?? null
    feed.push({ t: +new Date(u.created_at), kind: 'update', text: `${g?.name ?? 'A group'} sent the daily update`, meta: clip(u.text, 90), sub, link: '/calendar/summary' })
  }
  for (const p of (phases.data as { group_id: string; name: string; done_at: string }[] | null) ?? []) {
    const g = ctx.groups.find((x) => x.id === p.group_id)
    const sub = subOfGroup(g, ctx.subs, ctx.robots)?.id ?? null
    feed.push({ t: +new Date(p.done_at), kind: 'phase', text: `${g?.name ?? 'A group'} finished ${p.name}`, meta: 'Calendar', sub })
  }
  feed.sort((a, b) => b.t - a.t)
  return { runs, feed, updates: sent, error }
}

const RESULT: Record<string, string> = { worked: 'worked', partly: 'partly worked', failed: 'failed' }
export const first = (n: string) => n.trim().split(/\s+/)[0] || 'Someone'
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

// ---------- Schedule ----------

export interface Schedule {
  sub: Subsystem
  robot: Robot
  made: number
  total: number
  pct: number
  /** Where the manufacturing phase wants it by the end of the day; null without plan dates. */
  plan: number | null
  /** Positive is behind. Null without plan dates. */
  daysBehind: number | null
  status: 'behind' | 'ahead' | 'on' | 'none'
}

/** Parts made by the end of `day`, against the subsystem's manufacturing phase. */
export function scheduleOf(sub: Subsystem, robot: Robot, parts: Part[], groups: CalGroup[], phases: Phase[], robots: Robot[], subs: Subsystem[], day: string): Schedule {
  const [, end] = dayBounds(day)
  const mine = parts.filter((p) => p.subsystem_id === sub.id && p.status !== 'cancelled' && p.machine !== 'Bought')
  const made = mine.filter((p) => p.status === 'done' && (!p.done_at || +new Date(p.done_at) < end)).length
  const total = mine.length
  const pct = total ? Math.round((made / total) * 100) : 0

  const group = groups.find((g) => subOfGroup(g, subs, robots)?.id === sub.id)
  const phase = group ? phases.filter((p) => p.group_id === group.id && p.kind === 'manufacturing' && (!p.robot_id || p.robot_id === robot.id) && p.starts_on && p.ends_on).sort((a, b) => a.sort - b.sort)[0] : undefined
  if (!phase || !phase.starts_on || !phase.ends_on) return { sub, robot, made, total, pct, plan: null, daysBehind: null, status: 'none' }
  const len = daysBetween(phase.starts_on, phase.ends_on) + 1
  const into = Math.min(Math.max(daysBetween(phase.starts_on, day) + 1, 0), len)
  const plan = Math.round((into / len) * 100)
  const perDay = 100 / len
  const daysBehind = (plan - pct) / perDay
  const status = daysBehind >= 0.8 ? 'behind' : pct - plan >= 5 ? 'ahead' : 'on'
  return { sub, robot, made, total, pct, plan, daysBehind, status }
}

export function statusWord(s: Schedule) {
  if (s.status === 'none') return 'No plan dates'
  if (s.status === 'ahead') return 'Ahead'
  if (s.status === 'on') return 'On track'
  const d = s.daysBehind ?? 0
  return d >= 1.75 ? `${Math.round(d)} days behind` : d >= 1.25 ? '1.5 days behind' : 'A day behind'
}

// ---------- Recaps ----------

export interface Recap {
  day: string
  scope: string
  headline: string
  paragraphs: string[]
  look: string[]
  events: number
  created_at: string
}

export async function loadRecaps(day: string): Promise<Recap[]> {
  const { data } = await supabase.from('steamlab_recaps').select('day, scope, headline, paragraphs, look, events, created_at').eq('day', day)
  return (data as Recap[] | null) ?? []
}

/** Plain text for pasting into a chat. */
export function recapText(r: Recap, title: string) {
  return [`${title}: ${r.headline}`, '', ...r.paragraphs, ...(r.look.length ? ['', 'Worth a look:', ...r.look.map((l) => `- ${l}`)] : [])].join('\n')
}
