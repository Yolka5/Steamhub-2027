import type { TaskStatus } from './cal'

// A Monday board exported to Excel: the board's name on top, then each group as its name, a header
// row ("Name", "Person", "Status", "Date"…) and its items. Subitems sit under their item with the
// first column empty; they're left out. Columns are matched by their header, and can be changed.

export interface MondayItem {
  group: string
  cells: Record<string, string>
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
  let group = 'Items'
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (isHeader(row)) {
      head = row.map((h) => h.trim())
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
    if (!(row[0] ?? '').trim()) continue
    const cells: Record<string, string> = {}
    head.forEach((h, k) => {
      if (h) cells[h] = (row[k] ?? '').trim()
    })
    items.push({ group, cells })
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
