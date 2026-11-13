import { notify, type Who } from './mfg'
import { supabase } from './supabase'

// Calendar model: groups, phases, tasks, daily updates and events. See CALENDAR.md.

export type Team = 'mechanics' | 'electronics' | 'programming'
/** 'project': a subsystem of an off-season project, one group each, after the season's subsystems. */
export type GroupKind = 'team' | 'cnc' | 'workshop' | 'subsystem' | 'project'
export type PhaseKind = 'prototypes' | 'cad' | 'manufacturing' | 'custom'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export type EventKind = 'meeting' | 'competition' | 'deadline' | 'other'

export const TEAMS: Team[] = ['mechanics', 'electronics', 'programming']
export const TEAM_WORD: Record<Team, string> = { mechanics: 'Mechanics', electronics: 'Electronics', programming: 'Programming' }

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
export const STATUS_WORD: Record<TaskStatus, string> = { todo: 'Not started', doing: 'In progress', done: 'Done' }
/** Tapping the status on a row moves it on. */
export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' }

export const PRIORITIES: Priority[] = ['low', 'normal', 'high']
export const PRIORITY_WORD: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export const EVENT_KINDS: EventKind[] = ['meeting', 'competition', 'deadline', 'other']
export const EVENT_WORD: Record<EventKind, string> = { meeting: 'Meeting', competition: 'Competition', deadline: 'Deadline', other: 'Other' }

export interface CalGroup {
  id: string
  season: number
  team: Team
  kind: GroupKind
  subsystem_number: number | null
  /** The off-season project subsystem a 'project' group follows. */
  subsystem_id?: string | null
  name: string
  lead_id: string | null
  sort: number
  created_at: string
}

export interface Phase {
  id: string
  group_id: string
  name: string
  kind: PhaseKind
  robot_id: string | null
  sort: number
  starts_on: string | null
  ends_on: string | null
  follows_previous: boolean
  done_at: string | null
  done_by: string | null
  dismissed_for: string | null
  suggested_at: string | null
  created_at: string
}

export interface Task {
  id: string
  group_id: string
  phase_id: string | null
  parent_id: string | null
  title: string
  status: TaskStatus
  priority: Priority
  starts_on: string | null
  due_on: string | null
  notes: string
  prototype_id: string | null
  part_id: string | null
  sort: number
  done_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Owner {
  task_id: string
  user_id: string
}

export interface Wait {
  task_id: string
  waits_for_id: string
}

export interface Update {
  id: string
  group_id: string
  phase_id: string | null
  day: string
  author_id: string | null
  text: string
  created_at: string
  updated_at: string
}

export interface CalEvent {
  id: string
  title: string
  kind: EventKind
  group_id: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  /** 0 Sunday to 6 Saturday. */
  repeat_days: number[] | null
  repeat_until: string | null
  skip_days: string[]
  /** Minutes before the start. */
  reminders: number[]
  notes: string
  /** 'google' when it comes from the linked Google Calendar. Missing before the import migration. */
  source?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type Res<T> = { data?: T; error?: string }

// ---------- Days ----------
// Days are 'YYYY-MM-DD' in local (Israel) time, as the database keeps them.

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayIso = () => isoDay(new Date())
export const addDays = (day: string, n: number) => {
  const d = toDate(day)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
/** Whole days from a to b (b later is positive). */
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)
export const maxDay = (a: string, b: string) => (a > b ? a : b)
export const minDay = (a: string, b: string) => (a < b ? a : b)

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** "Today", "Tomorrow", "Thu 14", or "Thu 14 Dec" outside this month. */
export function dayLabel(day: string, today = todayIso()) {
  const n = daysBetween(today, day)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  const d = toDate(day)
  const t = toDate(today)
  const sameMonth = d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', ...(sameMonth && Math.abs(n) < 25 ? {} : { month: 'short' }) })
}

export const longDay = (day: string) => toDate(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

/** "Mon 11 → Thu 14", or one day. */
export function rangeLabel(start: string | null, end: string | null) {
  if (start && end && start !== end) return `${dayLabel(start)} → ${dayLabel(end)}`
  const one = end ?? start
  return one ? dayLabel(one) : 'No date'
}

// ---------- Typing a task ----------

const DAY_WORDS: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** One date word: "thu", "today", "tomorrow", "14/11", "14.11.27", "14 nov" is read by the caller. */
function readDay(word: string, today: string): string | null {
  const w = word.toLowerCase()
  if (w === 'today') return today
  if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw') return addDays(today, 1)
  if (w in DAY_WORDS) {
    // The next one, today included: "thu" on a Thursday is today.
    const diff = (DAY_WORDS[w] - toDate(today).getDay() + 7) % 7
    return addDays(today, diff)
  }
  const m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(w)
  if (m) {
    const t = toDate(today)
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : t.getFullYear()
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
    if (d.getDate() !== Number(m[1])) return null
    // No year and already past by more than a month: next year's.
    if (!m[3] && daysBetween(isoDay(d), today) > 31) d.setFullYear(++y)
    return isoDay(d)
  }
  return null
}

export interface Quick {
  title: string
  starts_on: string | null
  due_on: string | null
  priority: Priority
  owners: string[]
}

/**
 * "Roller test v2 thu high" → title, due Thursday, high. Only words at the end are read, so a
 * title like "High goal shooter" stays as it is. Also: "mon-thu" (a range), "14/11", "14 nov",
 * "today", "tomorrow", "low", "!" for high, and "@noa" for an owner (a first name or full name).
 */
export function parseQuick(text: string, people: { id: string; name: string }[], today = todayIso()): Quick {
  const words = text.trim().split(/\s+/)
  const out: Quick = { title: '', starts_on: null, due_on: null, priority: 'normal', owners: [] }
  const findPerson = (handle: string) => {
    const h = handle.toLowerCase()
    return (
      people.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === h) ??
      people.find((p) => p.name.toLowerCase().split(/\s+/)[0] === h) ??
      people.find((p) => p.name.toLowerCase().startsWith(h))
    )
  }
  while (words.length > 1) {
    const w = words[words.length - 1]
    const lw = w.toLowerCase()
    if ((lw === 'high' || lw === '!' || lw === 'urgent') && out.priority === 'normal') {
      out.priority = 'high'
      words.pop()
      continue
    }
    if (lw === 'low' && out.priority === 'normal') {
      out.priority = 'low'
      words.pop()
      continue
    }
    if (w.startsWith('@') && w.length > 1) {
      const p = findPerson(w.slice(1))
      if (!p) break
      if (!out.owners.includes(p.id)) out.owners.unshift(p.id)
      words.pop()
      continue
    }
    if (!out.due_on) {
      // "14 nov" or "nov 14"
      const prev = words[words.length - 2]?.toLowerCase()
      const mi = MONTHS.indexOf(lw.slice(0, 3))
      const pmi = prev ? MONTHS.indexOf(prev.slice(0, 3)) : -1
      if (mi >= 0 && prev && /^\d{1,2}$/.test(prev) && words.length > 2) {
        const d = readDay(`${prev}/${mi + 1}`, today)
        if (d) {
          out.due_on = d
          words.splice(-2)
          continue
        }
      }
      if (pmi >= 0 && /^\d{1,2}$/.test(lw) && words.length > 2) {
        const d = readDay(`${lw}/${pmi + 1}`, today)
        if (d) {
          out.due_on = d
          words.splice(-2)
          continue
        }
      }
      const range = /^([^-–]+)[-–]([^-–]+)$/.exec(lw)
      if (range) {
        const a = readDay(range[1], today)
        const b = a ? readDay(range[2], a) : null
        if (a && b) {
          out.starts_on = a
          out.due_on = b
          words.pop()
          continue
        }
      }
      const d = readDay(lw, today)
      if (d) {
        out.due_on = d
        words.pop()
        // "by thu", "due thu", "on thu"
        const before = words[words.length - 1]?.toLowerCase()
        if (words.length > 1 && (before === 'by' || before === 'due' || before === 'on')) words.pop()
        continue
      }
    }
    break
  }
  out.title = words.join(' ')
  return out
}

// ---------- Waits: moving a task later moves what waits for it ----------

export interface DateMove {
  id: string
  starts_on: string | null
  due_on: string | null
}

/** The first day a task can start once everything it waits for is done. */
const endOf = (t: Pick<Task, 'starts_on' | 'due_on'>) => t.due_on ?? t.starts_on

/**
 * After `moved` gets new dates, every task waiting for it (and for those, down the chain) that
 * now starts on or before its predecessor's end moves later just enough to start the day after.
 * Tasks with room to spare stay put. Returns every change, `moved` first.
 */
export function pushWaiting(moved: DateMove, tasks: Pick<Task, 'id' | 'starts_on' | 'due_on'>[], waits: Wait[]): DateMove[] {
  const now = new Map(tasks.map((t) => [t.id, { id: t.id, starts_on: t.starts_on, due_on: t.due_on }]))
  now.set(moved.id, { ...moved })
  const changes = new Map<string, DateMove>([[moved.id, { ...moved }]])
  const queue = [moved.id]
  let guard = 0
  while (queue.length && guard++ < 5000) {
    const id = queue.shift()!
    const end = endOf(now.get(id)!)
    if (!end) continue
    for (const w of waits.filter((x) => x.waits_for_id === id)) {
      const t = now.get(w.task_id)
      if (!t) continue
      const first = t.starts_on ?? t.due_on
      if (!first) continue
      const need = addDays(end, 1)
      if (first >= need) continue
      const by = daysBetween(first, need)
      const next = { id: t.id, starts_on: t.starts_on && addDays(t.starts_on, by), due_on: t.due_on && addDays(t.due_on, by) }
      now.set(t.id, next)
      changes.set(t.id, next)
      queue.push(t.id)
    }
  }
  return [...changes.values()]
}

/** The same for a group's phases: a phase that follows the previous one starts after it ends. */
export function pushPhases(moved: { id: string; starts_on: string | null; ends_on: string | null }, phases: Phase[]) {
  const list = phases
    .filter((p) => p.group_id === phases.find((x) => x.id === moved.id)?.group_id)
    .sort((a, b) => a.sort - b.sort)
    .map((p) => (p.id === moved.id ? { ...p, starts_on: moved.starts_on, ends_on: moved.ends_on } : { ...p }))
  const changes: { id: string; starts_on: string | null; ends_on: string | null }[] = [moved]
  const i = list.findIndex((p) => p.id === moved.id)
  for (let j = i + 1; j < list.length; j++) {
    const prevEnd = list[j - 1].ends_on ?? list[j - 1].starts_on
    const p = list[j]
    const first = p.starts_on ?? p.ends_on
    if (!p.follows_previous || !prevEnd || !first) break
    const need = addDays(prevEnd, 1)
    if (first >= need) break
    const by = daysBetween(first, need)
    p.starts_on = p.starts_on && addDays(p.starts_on, by)
    p.ends_on = p.ends_on && addDays(p.ends_on, by)
    changes.push({ id: p.id, starts_on: p.starts_on, ends_on: p.ends_on })
  }
  return changes
}

// ---------- Phases ----------

/** The phase a group is in: the first one not marked done. */
export function currentPhase(phases: Phase[], groupId: string) {
  return phases.filter((p) => p.group_id === groupId).sort((a, b) => a.sort - b.sort).find((p) => !p.done_at) ?? null
}

// ---------- Events ----------

export interface Occurrence {
  event: CalEvent
  day: string
  /** Start and end in local time, as Dates. */
  start: Date
  end: Date
}

const timeOf = (iso: string) => {
  const d = new Date(iso)
  return [d.getHours(), d.getMinutes()] as const
}

/** Every time an event happens from `from` to `to` (days, both included). */
export function occurrences(e: CalEvent, from: string, to: string): Occurrence[] {
  const first = isoDay(new Date(e.starts_at))
  const lengthMs = e.ends_at ? new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() : 0
  const at = (day: string) => {
    const [h, m] = timeOf(e.starts_at)
    const s = toDate(day)
    s.setHours(h, m)
    return { event: e, day, start: s, end: new Date(s.getTime() + lengthMs) }
  }
  if (!e.repeat_days?.length) {
    // A one-off can run over several days (a competition).
    const last = isoDay(new Date(e.ends_at ?? e.starts_at))
    if (last < from || first > to) return []
    return [{ event: e, day: first, start: new Date(e.starts_at), end: new Date(e.ends_at ?? e.starts_at) }]
  }
  const out: Occurrence[] = []
  let d = maxDay(from, first)
  const end = e.repeat_until ? minDay(to, e.repeat_until) : to
  for (let guard = 0; d <= end && guard < 800; guard++, d = addDays(d, 1)) {
    if (!e.repeat_days.includes(toDate(d).getDay())) continue
    if (e.skip_days.includes(d)) continue
    out.push(at(d))
  }
  return out
}

export const timeLabel = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const REMINDER_CHOICES: { min: number; label: string }[] = [
  { min: 0, label: 'At the start' },
  { min: 30, label: '30 min before' },
  { min: 60, label: '1 hour before' },
  { min: 1440, label: '1 day before' },
  { min: 10080, label: '1 week before' },
]

// ---------- Saving ----------

export async function ensureSeason(season: number) {
  await supabase.rpc('cal_ensure_season', { s: season })
}

export async function createTask(
  input: Pick<Task, 'group_id' | 'title'> & Partial<Pick<Task, 'phase_id' | 'parent_id' | 'starts_on' | 'due_on' | 'priority' | 'sort' | 'prototype_id' | 'part_id'>>,
  owners: string[],
  who: Who,
): Promise<Res<Task>> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ status: 'todo', priority: 'normal', notes: '', ...input, created_by: who.userId, sort: input.sort ?? Date.now() / 1000 })
    .select()
    .single()
  if (error) return { error: error.message }
  if (owners.length) {
    await supabase.from('task_owners').insert(owners.map((user_id) => ({ task_id: data.id, user_id })))
    await notify(owners, 'task_assigned', `${who.name.split(' ')[0]} gave you a task: ${data.title}`, `/calendar?task=${data.id}`, who.userId)
  }
  return { data: data as Task }
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Res<Task>> {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { error: error.message.includes('tasks_check') ? 'The due day has to be on or after the start.' : error.message }
  if (!data) return { error: 'This task was deleted.' }
  return { data: data as Task }
}

/** Several date changes at once (a move and everything waiting for it). */
export async function moveTasks(moves: DateMove[]): Promise<Res<Task[]>> {
  const out: Task[] = []
  for (const m of moves) {
    const r = await updateTask(m.id, { starts_on: m.starts_on, due_on: m.due_on })
    if (r.error) return { error: r.error, data: out }
    out.push(r.data!)
  }
  return { data: out }
}

/**
 * Status with the knock-on: when a task is done, the owners of tasks that were waiting only for
 * done things hear they can start.
 */
export async function setTaskStatus(t: Task, status: TaskStatus, who: Who, ctx: { tasks: Task[]; waits: Wait[]; owners: Owner[] }) {
  const res = await updateTask(t.id, { status })
  if (res.error || status !== 'done') return res
  const statusOf = (id: string) => (id === t.id ? 'done' : ctx.tasks.find((x) => x.id === id)?.status)
  for (const w of ctx.waits.filter((x) => x.waits_for_id === t.id)) {
    const next = ctx.tasks.find((x) => x.id === w.task_id)
    if (!next || next.status === 'done') continue
    const ready = ctx.waits.filter((x) => x.task_id === next.id).every((x) => statusOf(x.waits_for_id) === 'done')
    if (!ready) continue
    const owners = ctx.owners.filter((o) => o.task_id === next.id).map((o) => o.user_id)
    await notify(owners, 'task_ready', `${next.title} can start: ${t.title} is done`, `/calendar?task=${next.id}`, who.userId)
  }
  return res
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  return { error: error?.message }
}

export async function addOwner(task: Task, userId: string, who: Who) {
  const { error } = await supabase.from('task_owners').insert({ task_id: task.id, user_id: userId })
  if (error && error.code !== '23505') return { error: error.message }
  await notify([userId], 'task_assigned', `${who.name.split(' ')[0]} gave you a task: ${task.title}`, `/calendar?task=${task.id}`, who.userId)
  return {}
}

export async function removeOwner(taskId: string, userId: string) {
  const { error } = await supabase.from('task_owners').delete().eq('task_id', taskId).eq('user_id', userId)
  return { error: error?.message }
}

export async function addWait(taskId: string, waitsForId: string) {
  const { error } = await supabase.from('task_waits').insert({ task_id: taskId, waits_for_id: waitsForId })
  if (error?.code === '23505') return {}
  return { error: error ? (error.message.includes('loop') ? "That would make them wait for each other in a loop." : error.message) : undefined }
}

export async function removeWait(taskId: string, waitsForId: string) {
  const { error } = await supabase.from('task_waits').delete().eq('task_id', taskId).eq('waits_for_id', waitsForId)
  return { error: error?.message }
}

export async function createPhase(groupId: string, name: string, phases: Phase[]): Promise<Res<Phase>> {
  const mine = phases.filter((p) => p.group_id === groupId)
  const sort = Math.max(0, ...mine.map((p) => p.sort)) + 1
  const { data, error } = await supabase.from('cal_phases').insert({ group_id: groupId, name, sort }).select().single()
  return error ? { error: error.message } : { data: data as Phase }
}

export async function updatePhase(id: string, patch: Partial<Phase>): Promise<Res<Phase>> {
  const { data, error } = await supabase.from('cal_phases').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { error: error.message.includes('cal_phases_check') ? 'The end has to be on or after the start.' : error.message }
  return { data: data as Phase }
}

export async function movePhases(moves: { id: string; starts_on: string | null; ends_on: string | null }[]) {
  for (const m of moves) {
    const r = await updatePhase(m.id, { starts_on: m.starts_on, ends_on: m.ends_on })
    if (r.error) return r
  }
  return {}
}

export async function deletePhase(id: string) {
  const { error } = await supabase.from('cal_phases').delete().eq('id', id)
  return { error: error?.message }
}

export async function updateGroup(id: string, patch: Partial<CalGroup>) {
  const { error } = await supabase.from('cal_groups').update(patch).eq('id', id)
  return { error: error?.message }
}

/** One update per group per day: sending again the same day replaces it. */
export async function saveUpdate(groupId: string, phaseId: string | null, day: string, text: string, who: Who): Promise<Res<Update>> {
  const { data, error } = await supabase
    .from('cal_updates')
    .upsert({ group_id: groupId, phase_id: phaseId, day, text, author_id: who.userId, updated_at: new Date().toISOString() }, { onConflict: 'group_id,day' })
    .select()
    .single()
  return error ? { error: error.message } : { data: data as Update }
}

export async function deleteUpdate(id: string) {
  const { error } = await supabase.from('cal_updates').delete().eq('id', id)
  return { error: error?.message }
}

export type EventInput = Omit<CalEvent, 'id' | 'created_by' | 'created_at' | 'updated_at'>

export async function saveEvent(input: EventInput, who: Who, id?: string): Promise<Res<CalEvent>> {
  const q = id
    ? supabase.from('events').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('events').insert({ ...input, created_by: who.userId })
  const { data, error } = await q.select().single()
  return error ? { error: error.message } : { data: data as CalEvent }
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  return { error: error?.message }
}

// ---------- Order ----------

const PRI_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

/** Open first, then by due day (none last), high priority first on the same day. */
export function taskOrder(a: Task, b: Task) {
  const done = Number(a.status === 'done') - Number(b.status === 'done')
  if (done) return done
  const ad = a.due_on ?? '9999'
  const bd = b.due_on ?? '9999'
  if (ad !== bd) return ad < bd ? -1 : 1
  return PRI_RANK[a.priority] - PRI_RANK[b.priority] || a.sort - b.sort
}

export function groupOrder(a: CalGroup, b: CalGroup) {
  return TEAMS.indexOf(a.team) - TEAMS.indexOf(b.team) || a.sort - b.sort || a.name.localeCompare(b.name)
}

export const firstName = (name: string | null | undefined) => (name ?? '').split(' ')[0]
