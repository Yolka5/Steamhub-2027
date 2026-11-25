import { notify, type Who } from './mfg'
import { supabase } from './supabase'

// Calendar model: groups, phases, tasks, daily updates and events. See CALENDAR.md.

/** A section's key: 'mechanics', 'electronics', 'programming', 'strategy', or one added later. */
export type Team = string
/**
 * 'team': a section's own group (tasks "for Mechanics"). 'project': a subsystem of an off-season
 * project, one group each, after the season's subsystems. 'custom': added by hand inside a section.
 */
export type GroupKind = 'team' | 'cnc' | 'workshop' | 'subsystem' | 'project' | 'custom'
export type PhaseKind = 'prototypes' | 'cad' | 'manufacturing' | 'custom'
export type TaskStatus = 'todo' | 'doing' | 'done' | 'delayed' | 'cancelled'
export type Priority = 'low' | 'normal' | 'high'
/** 'other' is shown as Event, the default. Competitions are the plan's milestones. */
export type EventKind = 'other' | 'competition'

// ---------- Sections and colours ----------
// Sections are rows in cal_sections. Their order and names are kept here too, so sorting and
// labels work anywhere without passing the list around; useCal keeps it current.

export interface Section {
  key: string
  name: string
  /** A palette key ('blue') or a custom '#rrggbb'. */
  color: string
  sort: number
  created_at: string
}

/** Built in: automatic groups (CNC, Workshop, subsystems, projects) land in Mechanics. */
export const FIXED_SECTIONS = ['mechanics', 'electronics', 'programming']

let SECTIONS: Section[] = [
  { key: 'mechanics', name: 'Mechanics', color: 'blue', sort: 0, created_at: '' },
  { key: 'electronics', name: 'Electronics', color: 'teal', sort: 1, created_at: '' },
  { key: 'programming', name: 'Programming', color: 'purple', sort: 2, created_at: '' },
  { key: 'strategy', name: 'Strategy', color: 'pink', sort: 3, created_at: '' },
]
export const setSections = (list: Section[]) => {
  if (list.length) SECTIONS = [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
}
export const sectionList = () => SECTIONS
export const sectionName = (key: string | null | undefined) => SECTIONS.find((x) => x.key === key)?.name ?? (key ? key[0].toUpperCase() + key.slice(1) : '')
const sectionRank = (key: string) => {
  const i = SECTIONS.findIndex((x) => x.key === key)
  return i === -1 ? 999 : i
}

/** Twelve colours, each checked for readable text on light and dark, none close to a status colour. */
export const PALETTE: { key: string; name: string; light: string; dark: string }[] = [
  { key: 'blue', name: 'Blue', light: '#2f6fdb', dark: '#6fa0f0' },
  { key: 'teal', name: 'Teal', light: '#138a7e', dark: '#4cc3b5' },
  { key: 'purple', name: 'Purple', light: '#7a4fd6', dark: '#a98af0' },
  { key: 'pink', name: 'Pink', light: '#d23f8a', dark: '#f07ab4' },
  { key: 'indigo', name: 'Indigo', light: '#4450b8', dark: '#8a93ea' },
  { key: 'cyan', name: 'Cyan', light: '#0f86b0', dark: '#55c0e6' },
  { key: 'brown', name: 'Brown', light: '#8a5a2b', dark: '#c99460' },
  { key: 'slate', name: 'Slate', light: '#55606e', dark: '#9aa6b4' },
  { key: 'magenta', name: 'Magenta', light: '#a8329e', dark: '#df73d6' },
  { key: 'plum', name: 'Plum', light: '#8e3b5c', dark: '#d3829f' },
  { key: 'olive', name: 'Olive', light: '#6f7a1e', dark: '#b4bd55' },
  { key: 'sky', name: 'Sky', light: '#3a8fc9', dark: '#7fbde8' },
]

const hexRgb = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}
const rgbHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`

/** Light and dark values of a colour: a palette key, or a custom hex (its dark one is lifted). */
export function colorPair(color: string | null | undefined): { light: string; dark: string } {
  const p = PALETTE.find((x) => x.key === color)
  if (p) return { light: p.light, dark: p.dark }
  const rgb = color ? hexRgb(color) : null
  if (!rgb) return { light: PALETTE[7].light, dark: PALETTE[7].dark }
  const [r, g, b] = rgb
  return { light: rgbHex(r, g, b), dark: rgbHex(r + (255 - r) * 0.35, g + (255 - g) * 0.35, b + (255 - b) * 0.35) }
}

const lum = (h: string) => {
  const rgb = hexRgb(h)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** What's wrong with a custom colour, or null: too pale or too dark to see, or it looks like a status. */
export function colorWarning(hex: string): string | null {
  const { light, dark } = colorPair(hex)
  if (contrast(light, '#fbfbf9') < 2.2) return 'Too pale to see in light mode.'
  if (contrast(dark, '#0c0c0c') < 2.2) return 'Too dark to see in dark mode.'
  const rgb = hexRgb(hex)!
  const near = ([['#d23b28', 'late'], ['#f2b705', 'in progress'], ['#2b8a33', 'done']] as const).find(([c]) => {
    const o = hexRgb(c)!
    return Math.hypot(rgb[0] - o[0], rgb[1] - o[1], rgb[2] - o[2]) < 60
  })
  return near ? `Looks like the ${near[1]} colour. People may read it as a status.` : null
}

/** The colour a section shows. */
export const sectionColor = (key: string | null | undefined) => SECTIONS.find((x) => x.key === key)?.color ?? 'slate'
/** A group's own colour, else its section's. */
export const groupColor = (g: Pick<CalGroup, 'team' | 'color'> | null | undefined) => (g ? (g.color ?? sectionColor(g.team)) : 'slate')

/**
 * Style for anything that carries a colour: give the element the class "sec" and this style, and
 * CSS reads var(--sec), which follows light and dark mode by itself.
 */
export function secStyle(color: string | null | undefined): Record<string, string> {
  const { light, dark } = colorPair(color)
  return { '--sec-l': light, '--sec-d': dark }
}

/** The next palette colour nobody uses, for a new section. */
export function freeColor() {
  const used = new Set(SECTIONS.map((x) => x.color))
  return PALETTE.find((p) => !used.has(p.key))?.key ?? PALETTE[SECTIONS.length % PALETTE.length].key
}

/** Guess a section from an event's title (Google blocks come with none). One tap confirms. */
export function suggestSection(title: string): string | null {
  const t = title.toLowerCase()
  const has = (k: string) => SECTIONS.some((x) => x.key === k)
  if (/תוכנה|תכנות|programming|software|code|vision/.test(t) && has('programming')) return 'programming'
  if (/אלקטרוניקה|חשמל|electronics|wiring|חיווט/.test(t) && has('electronics')) return 'electronics'
  if (/קיקאוף|kickoff|kick-off|scouting|סקאוטינג|אסטרטגיה|strategy/.test(t) && has('strategy')) return 'strategy'
  if (/מכני|מכניקה|mechanic|cad|סיאנסי|cnc|workshop|סדנה/.test(t) && has('mechanics')) return 'mechanics'
  for (const x of SECTIONS) if (t.includes(x.name.toLowerCase())) return x.key
  return null
}

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'done', 'delayed', 'cancelled']
export const STATUS_WORD: Record<TaskStatus, string> = { todo: 'Not started', doing: 'In progress', done: 'Done', delayed: 'Delayed', cancelled: 'Cancelled' }
/** Tapping the status on a row moves it on. Delayed picks back up; Cancelled starts over. */
export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo', delayed: 'doing', cancelled: 'todo' }
/** Nothing left to do: done, or cancelled. Cancelled things drop out of counts and open lists. */
export const isClosed = (s: TaskStatus | null | undefined) => s === 'done' || s === 'cancelled'
/** Counted in "x of y done": everything but cancelled. */
export const counts = (s: TaskStatus) => s !== 'cancelled'

export const PRIORITIES: Priority[] = ['low', 'normal', 'high']
export const PRIORITY_WORD: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export const EVENT_KINDS: EventKind[] = ['other', 'competition']
export const EVENT_WORD: Record<EventKind, string> = { other: 'Event', competition: 'Competition' }

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
  /** Own colour; null uses the section's. */
  color?: string | null
  /** GitHub issues with this label land here. */
  github_label?: string | null
  created_at: string
}

/** A list inside a group ("To-Do December"). */
export interface CalList {
  id: string
  group_id: string
  name: string
  sort: number
  created_at: string
}

export type CommentKind = 'task' | 'group' | 'list' | 'phase' | 'event'

/** A comment on a task, group, list, phase or event. A reply has a parent; replies go one level deep. */
export interface CalComment {
  id: string
  target_kind: CommentKind
  target_id: string
  parent_id: string | null
  author_id: string | null
  text: string
  /** Paths in the private prototypes bucket. */
  photos: string[]
  mentions: string[]
  tell_all: boolean
  created_at: string
  updated_at: string
}

export interface Follow {
  user_id: string
  target_kind: CommentKind
  target_id: string
  mode: 'follow' | 'mute'
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
  /** Set by hand. Any number of a group's phases can be In progress. Done keeps done_at in step. */
  status: TaskStatus
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
  /** Old text label from Monday; lists replaced it. */
  section?: string | null
  /** The list inside the group it sits in. */
  list_id?: string | null
  /** 'github' when it comes from a GitHub issue: title, status and owners follow GitHub. */
  source?: string | null
  gh_id?: number | null
  gh_number?: number | null
  gh_url?: string | null
  /** GitHub logins of assignees not linked to a profile yet. */
  gh_people?: string[]
  /** GitHub gave it dates, so they follow GitHub. Without, its dates are Steamhub's to set. */
  gh_dated?: boolean
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
  /** Not started / In progress / Done on the event itself. Null: no status. */
  status?: TaskStatus | null
  /** A task the event follows: the task's status wins over `status`. */
  task_id?: string | null
  /** The kind was set by hand, so the Google sync keeps it. */
  kind_by_hand?: boolean
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

/** A GitHub issue whose dates come from GitHub: Steamhub shows them but doesn't move them. */
export const datesLocked = (t: { source?: string | null; gh_dated?: boolean }) => t.source === 'github' && !!t.gh_dated

/** The first day a task can start once everything it waits for is done. */
const endOf = (t: Pick<Task, 'starts_on' | 'due_on'>) => t.due_on ?? t.starts_on

/**
 * After `moved` gets new dates, every task waiting for it (and for those, down the chain) that
 * now starts on or before its predecessor's end moves later just enough to start the day after.
 * Tasks with room to spare stay put. Returns every change, `moved` first.
 */
export function pushWaiting(moved: DateMove, tasks: (Pick<Task, 'id' | 'starts_on' | 'due_on'> & { source?: string | null; gh_dated?: boolean })[], waits: Wait[]): DateMove[] {
  // GitHub tasks with GitHub dates keep them: nothing in Steamhub moves them.
  const fixed = new Set(tasks.filter(datesLocked).map((t) => t.id))
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
      if (!t || fixed.has(t.id)) continue
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

/** The phase a group is in: the first one In progress, or else the first not done. */
export function currentPhase(phases: Phase[], groupId: string) {
  const mine = phases.filter((p) => p.group_id === groupId).sort((a, b) => a.sort - b.sort)
  return mine.find((p) => p.status === 'doing') ?? mine.find((p) => !isClosed(p.status)) ?? null
}

/**
 * The bar on the left of a phase row: yellow on every phase In progress; when none is, black on
 * the next one to start.
 */
export function phaseBars(phases: Phase[], groupId: string) {
  const mine = phases.filter((p) => p.group_id === groupId).sort((a, b) => a.sort - b.sort)
  const out = new Map<string, 'doing' | 'next'>()
  for (const p of mine) if (p.status === 'doing') out.set(p.id, 'doing')
  if (!out.size) {
    const next = mine.find((p) => !isClosed(p.status))
    if (next) out.set(next.id, 'next')
  }
  return out
}

// ---------- Pills: status and time ----------

/**
 * Status colour. Not started stays grey while its start day is ahead (or it has no dates), and turns
 * red once the start day has passed and it still hasn't started.
 */
export type StatusTone = 'wait' | 'late' | 'doing' | 'done' | 'delayed' | 'cancelled'
export function statusTone(status: TaskStatus, startsOn: string | null, dueOn: string | null = null, today = todayIso()): StatusTone {
  if (status !== 'todo') return status
  const start = startsOn ?? dueOn
  return start && start < today ? 'late' : 'wait'
}

export interface TimePill {
  /** none: no dates. grey: start ahead (or due far off). green: plenty of time. yellow: last
   *  quarter. red: past the end and not done. */
  tone: 'none' | 'grey' | 'green' | 'yellow' | 'red'
  /** Share of the time already gone, 0 to 1. */
  fill: number
  label: string
  /** "2 days late", "3 days early", "on time". */
  extra?: string
}

/** Short enough for a pill: "Mon 9 → Thu 19" in one month, "29 Oct → 12 Nov" across two. */
function pillRange(a: string, b: string) {
  if (a === b) return dayLabel(a)
  const A = toDate(a)
  const B = toDate(b)
  if (A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear()) {
    const wd = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short' })
    return `${wd(A)} ${A.getDate()} → ${wd(B)} ${B.getDate()}`
  }
  const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${dm(A)} → ${dm(B)}`
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * The date pill: the time already gone fills it, green until the last 25% of the time, yellow in
 * it, red once late. Done shows the planned dates against when it was finished.
 */
export function timePill(item: { start: string | null; end: string | null; status: TaskStatus; doneDay?: string | null }, today = todayIso()): TimePill {
  const { start, end, status } = item
  if (status === 'cancelled') return { tone: 'none', fill: 0, label: 'Cancelled' }
  if (!start && !end) return { tone: 'none', fill: 0, label: 'Set dates' }
  const label = start && end ? pillRange(start, end) : dayLabel((end ?? start)!)
  if (status === 'done') {
    const done = item.doneDay ?? today
    const diff = end ? daysBetween(end, done) : 0
    const extra = !end ? undefined : diff < 0 ? `${plural(-diff, 'day')} early` : diff > 0 ? `${plural(diff, 'day')} late` : 'on time'
    return { tone: 'green', fill: 1, label, extra }
  }
  if (end && end < today) return { tone: 'red', fill: 1, label: `${plural(daysBetween(end, today), 'day')} late` }
  if (!start || !end) {
    // One day only (a due day): yellow for the last two days, grey before.
    const day = (end ?? start)!
    return { tone: daysBetween(today, day) <= 2 ? 'yellow' : 'grey', fill: 0, label }
  }
  if (today < start) return { tone: 'grey', fill: 0, label }
  const total = daysBetween(start, end) + 1
  const gone = daysBetween(start, today) + 1
  const share = Math.min(1, gone / total)
  return { tone: 1 - share <= 0.25 ? 'yellow' : 'green', fill: share, label }
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
  input: Pick<Task, 'group_id' | 'title'> & Partial<Pick<Task, 'phase_id' | 'parent_id' | 'list_id' | 'starts_on' | 'due_on' | 'priority' | 'sort' | 'prototype_id' | 'part_id'>>,
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
  if (res.error || !isClosed(status)) return res
  const statusOf = (id: string) => (id === t.id ? 'done' : ctx.tasks.find((x) => x.id === id)?.status)
  for (const w of ctx.waits.filter((x) => x.waits_for_id === t.id)) {
    const next = ctx.tasks.find((x) => x.id === w.task_id)
    if (!next || isClosed(next.status)) continue
    const ready = ctx.waits.filter((x) => x.task_id === next.id).every((x) => isClosed(statusOf(x.waits_for_id)))
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

/** Status by hand. Done takes `doneAt` when Steamhub knows when the work really finished. */
export async function setPhaseStatus(p: Phase, status: TaskStatus, who: Who, doneAt?: string | null): Promise<Res<Phase>> {
  return updatePhase(p.id, status === 'done' ? { status, done_at: doneAt ?? new Date().toISOString(), done_by: who.userId } : { status, done_at: null, done_by: null })
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

// ---------- Comments ----------

/** People @mentioned in a comment: "@Noa" or "@NoaLevi", matched like the task line's @name. */
export function mentionsIn(text: string, people: { id: string; name: string }[]) {
  const out: string[] = []
  for (const m of text.matchAll(/@([\p{L}][\p{L}\d_-]*)/gu)) {
    const h = m[1].toLowerCase()
    const p =
      people.find((x) => x.name.toLowerCase().replace(/\s+/g, '') === h) ?? people.find((x) => x.name.toLowerCase().split(/\s+/)[0] === h)
    if (p && !out.includes(p.id)) out.push(p.id)
  }
  return out
}

export async function addComment(
  input: { target_kind: CommentKind; target_id: string; parent_id?: string | null; text: string; photos?: string[]; mentions?: string[]; tell_all?: boolean },
  who: Who,
): Promise<Res<CalComment>> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ parent_id: null, photos: [], mentions: [], tell_all: false, ...input, author_id: who.userId })
    .select()
    .single()
  return error ? { error: error.message.includes('comments') && error.code === '42P01' ? 'The comments migration has not run on the database yet.' : error.message } : { data: data as CalComment }
}

export async function editComment(id: string, patch: Pick<CalComment, 'text' | 'mentions'>): Promise<Res<CalComment>> {
  const { data, error } = await supabase.from('comments').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Only the person who wrote a comment can change it.' }
  return { data: data as CalComment }
}

export async function deleteComment(n: CalComment) {
  const { error } = await supabase.from('comments').delete().eq('id', n.id)
  if (!error && n.photos.length) await supabase.storage.from('prototypes').remove(n.photos)
  return { error: error?.message }
}

export async function uploadCommentPhoto(targetId: string, blob: Blob) {
  const path = `comments/${targetId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
  const { error } = await supabase.storage.from('prototypes').upload(path, blob, { contentType: 'image/jpeg' })
  return error ? { error: error.message } : { path }
}

/** Follow, mute, or back to the usual (null). */
export async function setFollow(kind: CommentKind, id: string, mode: Follow['mode'] | null, userId: string): Promise<Res<Follow | null>> {
  if (!mode) {
    const { error } = await supabase.from('comment_follows').delete().eq('user_id', userId).eq('target_kind', kind).eq('target_id', id)
    return error ? { error: error.message } : { data: null }
  }
  const { data, error } = await supabase
    .from('comment_follows')
    .upsert({ user_id: userId, target_kind: kind, target_id: id, mode }, { onConflict: 'user_id,target_kind,target_id' })
    .select()
    .single()
  return error ? { error: error.message } : { data: data as Follow }
}

// ---------- Sections, groups and lists ----------

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

export async function createSection(name: string): Promise<Res<Section>> {
  const n = name.trim()
  if (!n) return { error: 'Give the section a name.' }
  if (SECTIONS.some((x) => x.name.toLowerCase() === n.toLowerCase())) return { error: `There is already a section called ${n}.` }
  let key = slug(n) || 'section'
  for (let i = 2; SECTIONS.some((x) => x.key === key); i++) key = `${slug(n) || 'section'}-${i}`
  const sort = Math.max(0, ...SECTIONS.map((x) => x.sort)) + 1
  const { data, error } = await supabase.from('cal_sections').insert({ key, name: n, color: freeColor(), sort }).select().single()
  return error ? { error: error.message } : { data: data as Section }
}

export async function updateSection(key: string, patch: Partial<Pick<Section, 'name' | 'color' | 'sort'>>): Promise<Res<Section>> {
  const { data, error } = await supabase.from('cal_sections').update(patch).eq('key', key).select().maybeSingle()
  if (error) return { error: error.message.includes('cal_sections_name_check') ? 'Names are 1 to 40 letters.' : error.message }
  return { data: data as Section }
}

/** Only an empty section goes: its own groups are deleted with it, if they hold nothing. */
export async function deleteSection(key: string) {
  if (FIXED_SECTIONS.includes(key)) return { error: 'Mechanics, Electronics and Programming stay: automatic groups land in them.' }
  const { data: groups } = await supabase.from('cal_groups').select('id, kind').eq('team', key)
  const ids = (groups ?? []).map((g) => g.id as string)
  if ((groups ?? []).some((g) => g.kind !== 'team')) return { error: 'Move or delete its groups first.' }
  if (ids.length) {
    const { count: n } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).in('group_id', ids)
    if (n) return { error: `It still has ${n} ${n === 1 ? 'task' : 'tasks'}. Move them first.` }
    const { count: e } = await supabase.from('events').select('id', { count: 'exact', head: true }).in('group_id', ids)
    if (e) return { error: `${e} ${e === 1 ? 'event is' : 'events are'} for it. Change them first.` }
    const del = await supabase.from('cal_groups').delete().in('id', ids)
    if (del.error) return { error: del.error.message }
  }
  const { error } = await supabase.from('cal_sections').delete().eq('key', key)
  return { error: error?.message, groupIds: ids }
}

export async function createGroup(season: number, team: string, name: string, groups: CalGroup[]): Promise<Res<CalGroup>> {
  const n = name.trim()
  if (!n) return { error: 'Give the group a name.' }
  const sort = Math.max(50, ...groups.filter((g) => g.team === team && g.kind === 'custom').map((g) => g.sort)) + 1
  const { data, error } = await supabase.from('cal_groups').insert({ season, team, kind: 'custom', name: n, sort }).select().single()
  return error ? { error: error.message } : { data: data as CalGroup }
}

/** Only groups made by hand go; their tasks and phases go with them. */
export async function deleteGroup(id: string) {
  const { error } = await supabase.from('cal_groups').delete().eq('id', id).eq('kind', 'custom')
  return { error: error?.message }
}

export async function createList(groupId: string, name: string, lists: CalList[]): Promise<Res<CalList>> {
  const n = name.trim()
  if (!n) return { error: 'Give the list a name.' }
  const mine = lists.filter((l) => l.group_id === groupId)
  if (mine.some((l) => l.name.toLowerCase() === n.toLowerCase())) return { error: `There is already a list called ${n} here.` }
  const sort = Math.max(0, ...mine.map((l) => l.sort)) + 1
  const { data, error } = await supabase.from('cal_lists').insert({ group_id: groupId, name: n, sort }).select().single()
  return error ? { error: error.message } : { data: data as CalList }
}

export async function updateList(id: string, patch: Partial<Pick<CalList, 'name' | 'sort'>>): Promise<Res<CalList>> {
  const { data, error } = await supabase.from('cal_lists').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { error: error.code === '23505' ? 'There is already a list with that name here.' : error.message }
  return { data: data as CalList }
}

/** Its tasks stay in the group, out of any list. */
export async function deleteList(id: string) {
  const { error } = await supabase.from('cal_lists').delete().eq('id', id)
  return { error: error?.message }
}

/** An event's status: its task's when it follows one, else its own, else none. */
export function eventStatus(e: Pick<CalEvent, 'status' | 'task_id'>, tasks: Pick<Task, 'id' | 'status'>[]): TaskStatus | null {
  if (e.task_id) {
    const t = tasks.find((x) => x.id === e.task_id)
    if (t) return t.status
  }
  return e.status ?? null
}

/**
 * Steamhub's own fields on an event, saved on their own: status, the task it follows, who it's for,
 * reminders, and the kind. They work on Google events too, which the sync doesn't undo.
 */
export async function setEventStatus(id: string, patch: Partial<Pick<CalEvent, 'status' | 'task_id' | 'group_id' | 'reminders' | 'kind' | 'kind_by_hand'>>): Promise<Res<CalEvent>> {
  const { data, error } = await supabase.from('events').update(patch).eq('id', id).select().maybeSingle()
  if (error) return { error: error.message.includes('status') || error.message.includes('task_id') ? 'The event status migration has not run on the database yet.' : error.message }
  if (!data) return { error: 'This event was deleted.' }
  return { data: data as CalEvent }
}

export type EventInput = Omit<CalEvent, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'status' | 'task_id'>

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
  const done = Number(isClosed(a.status)) - Number(isClosed(b.status))
  if (done) return done
  const ad = a.due_on ?? '9999'
  const bd = b.due_on ?? '9999'
  if (ad !== bd) return ad < bd ? -1 : 1
  return PRI_RANK[a.priority] - PRI_RANK[b.priority] || a.sort - b.sort
}

export function groupOrder(a: CalGroup, b: CalGroup) {
  return sectionRank(a.team) - sectionRank(b.team) || a.sort - b.sort || a.name.localeCompare(b.name)
}

export const firstName = (name: string | null | undefined) => (name ?? '').split(' ')[0]
