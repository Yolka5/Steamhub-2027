import type { TaskStatus } from './cal'

// A Monday board exported to Excel: the board's name on top, then each group as its name, a header
// row ("Name", "Person", "Status", "Date"…) and its items. Subitems sit under their item one column
// in, after their own "Subitems" header row; they come in as subtasks. Columns are matched by their
// header, and can be changed.

export interface MondayItem {
  group: string
  cells: Record<string, string>
  /** Subitems, by their own header ("Subitems" is the name column). */
  subs: Record<string, string>[]
}

export interface MondayBoard {
  board: string
  headers: string[]
  groups: string[]
  items: MondayItem[]
}

const isHeader = (row: string[]) => /^(name|item|item name|task|שם)$/i.test((row[0] ?? '').trim())

export function parseMonday(rows: string[][]): MondayBoard {
  const board = rows.find((r) => r.some(Boolean))?.find(Boolean) ?? 'Monday'
  const headers: string[] = []
  const groups: string[] = []
  const items: MondayItem[] = []
  let head: string[] | null = null
  let subHead: string[] | null = null
  let group = 'Items'
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (isHeader(row)) {
      head = row.map((h) => h.trim())
      subHead = null
      // The group's name is the last one-cell row above its header.
      for (let j = i - 1; j >= 0; j--) {
        const filled = (rows[j] ?? []).filter(Boolean)
        if (filled.length === 1 && filled[0] !== board) {
          group = filled[0]
          break
        }
        if (filled.length > 1 || isHeader(rows[j] ?? [])) break
      }
      if (!groups.includes(group)) groups.push(group)
      for (const h of head) if (h && !headers.includes(h)) headers.push(h)
      continue
    }
    if (!head) continue
    if (!row.some(Boolean)) {
      head = null
      continue
    }
    // Subitems and their header start one column in.
    if (!(row[0] ?? '').trim()) {
      const second = (row[1] ?? '').trim()
      if (/^(subitems?|subitem name|תת[- ]?פריטים?)$/i.test(second)) {
        subHead = row.slice(1).map((h) => h.trim())
        continue
      }
      const parent = items[items.length - 1]
      if (subHead && second && parent) {
        const sub: Record<string, string> = {}
        subHead.forEach((h, k) => {
          if (h) sub[k === 0 ? 'Name' : h] = (row[k + 1] ?? '').trim()
        })
        parent.subs.push(sub)
      }
      continue
    }
    subHead = null
    const cells: Record<string, string> = {}
    head.forEach((h, k) => {
      if (h) cells[h] = (row[k] ?? '').trim()
    })
    items.push({ group, cells, subs: [] })
  }
  return { board, headers, groups, items }
}

export type Field = 'name' | 'owner' | 'status' | 'due' | 'timeline' | 'priority' | 'notes'

/** Which header holds what, guessed from the names Monday uses. */
export function guessColumns(headers: string[]): Record<Field, string> {
  const find = (re: RegExp, skip: string[] = []) => headers.find((h) => re.test(h) && !skip.includes(h)) ?? ''
  const name = headers.find((h) => /^(name|item|item name|task|שם)$/i.test(h)) ?? headers[0] ?? ''
  const timeline = find(/timeline|ציר זמן/i)
  return {
    name,
    owner: find(/person|people|owner|assignee|responsible|אחראי|בעלים/i),
    status: find(/status|סטטוס/i),
    timeline,
    due: find(/due|deadline|date|תאריך|יעד/i, [timeline]),
    priority: find(/priority|עדיפות/i),
    notes: find(/notes|text|description|update|הערות|תיאור/i),
  }
}

/** Lower case, letters and digits only: "Prototypes wood- Micha" → "prototypeswoodmicha". */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
    // "prototypes" and "prototype", "prints" and "print"
    .map((w) => w.replace(/s$/, ''))

function edits(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Words that mean the same thing in Monday group names and Steamhub group names. */
const ALIKE: Record<string, string> = { plastic: 'print', '3d': 'print', printed: 'print', dev: 'woodbot' }

/**
 * The Steamhub group a Monday group most likely goes to, or null. Same name first, then a small
 * spelling difference ("Programing"), then shared words ("Plastic prototypes" → "Prototypes - 3D
 * prints"), where a word that only one group has wins over "prototype", which many share.
 */
export function matchGroup<G extends { id: string; name: string }>(name: string, groups: G[]): G | null {
  const n = norm(name)
  const same = groups.find((g) => norm(g.name) === n)
  if (same) return same
  const close = groups.find((g) => n.length > 4 && edits(norm(g.name), n) <= 2)
  if (close) return close
  const mine = new Set(words(name).map((w) => ALIKE[w] ?? w))
  const common = new Map<string, number>()
  for (const g of groups) for (const w of new Set(words(g.name))) common.set(w, (common.get(w) ?? 0) + 1)
  let best: G | null = null
  let score = 0
  for (const g of groups) {
    let s = 0
    for (const w of new Set(words(g.name))) if (mine.has(w)) s += 1 / (common.get(w) ?? 1)
    if (s > score) {
      score = s
      best = g
    }
  }
  // At least one word only a single group has, or a few shared ones.
  return score >= 1 ? best : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-11-15", "15/11/2026", "Nov 15, 2026" or "15 Nov 2026", as YYYY-MM-DD. */
export function day(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    // Israel writes day first.
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`
  }
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const d = new Date(t)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return null
}

/** A Monday timeline, "2026-11-01 - 2026-11-15", as its two days. */
export function span(text: string): { start: string | null; end: string | null } {
  const parts = text.split(/\s+[-–]\s+|\s+to\s+/)
  if (parts.length === 2) return { start: day(parts[0]), end: day(parts[1]) }
  const one = day(text)
  return { start: null, end: one }
}

export function statusOf(text: string): TaskStatus {
  if (/done|complete|finished|✓|בוצע|הושלם|סיים/i.test(text)) return 'done'
  if (/working|progress|stuck|review|doing|בעבודה|בתהליך|תקוע/i.test(text)) return 'doing'
  return 'todo'
}

export function priorityOf(text: string): 'low' | 'normal' | 'high' {
  if (/high|critical|urgent|גבוה|דחוף/i.test(text)) return 'high'
  if (/low|נמוך/i.test(text)) return 'low'
  return 'normal'
}

/** People named in a Monday person cell ("Noa Levi, Tomer"), matched by full or first name. */
export function ownersOf(text: string, people: { id: string; name: string }[]) {
  const ids: string[] = []
  const missing: string[] = []
  for (const raw of text.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
    const low = raw.toLowerCase()
    const hit =
      people.find((p) => p.name.toLowerCase() === low) ??
      people.find((p) => p.name.split(' ')[0].toLowerCase() === low.split(' ')[0] && (!low.includes(' ') || p.name.toLowerCase().startsWith(low)))
    if (hit) ids.push(hit.id)
    else missing.push(raw)
  }
  return { ids: [...new Set(ids)], missing }
}
