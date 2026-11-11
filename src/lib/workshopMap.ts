import { MADE, type Machine, type Part } from './mfg'
import { supabase } from './supabase'

// What the workshop map shows (WORKSHOP_MAP.md). A machine is running while one of its released
// parts is In progress; there are no sensors. History pairs each start with its finish from
// part_events.

export const STALE_MS = 3 * 60 * 60 * 1000
export type MachineState = 'idle' | 'run' | 'stale' | 'urg'
export const STATE_WORD: Record<MachineState, string> = { idle: 'Idle', run: 'Running', stale: 'Forgot Done?', urg: 'Urgent part waiting' }
export const MAP_MACHINES: Machine[] = MADE

export interface MachineView {
  machine: Machine
  state: MachineState
  /** The newest part In progress on it. */
  cur: Part | null
  waiting: Part[]
  urgent: Part[]
  lastUsed: number | null
}

const startOf = (p: Part) => new Date(p.started_at ?? p.updated_at).getTime()

/** `parts` are the released, made-in-house parts of active robots (what the Workshop list shows). */
export function machineView(machine: Machine, parts: Part[], now: number, lastUsed: number | null): MachineView {
  const mine = parts.filter((p) => p.machine === machine)
  const running = mine.filter((p) => p.status === 'doing').sort((a, b) => startOf(b) - startOf(a))
  const waiting = mine.filter((p) => p.status === 'todo')
  const urgent = waiting.filter((p) => p.urgent).sort((a, b) => a.part_no - b.part_no)
  const cur = running[0] ?? null
  // Done parts carry their finish in updated_at, so "last used" works before History loads.
  const doneAt = Math.max(0, ...mine.filter((p) => p.status === 'done').map((p) => new Date(p.updated_at).getTime()))
  const last = Math.max(lastUsed ?? 0, doneAt) || null
  const state: MachineState = cur ? (now - startOf(cur) >= STALE_MS ? 'stale' : 'run') : urgent.length ? 'urg' : 'idle'
  return { machine, state, cur, waiting, urgent, lastUsed: last }
}

export const startedAt = startOf

/** "40 min", "3 h 20 min". */
export function span(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

export const firstName = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'Someone'

// ---------- History ----------

export interface Run {
  partId: string
  partNo: number
  machine: Machine
  who: string
  start: number
  /** Null while it's still running. */
  end: number | null
  done: boolean
}

/** Sunday 00:00 of this week, local time. Weeks start Sunday. */
export function weekStart(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

const STARTS = new Set(['claimed', 'status_doing'])
const ENDS = new Set(['status_done', 'status_todo', 'status_cancelled', 'status_missing'])

interface Ev {
  part_id: string
  action: string
  by_name: string | null
  details: { for?: string } | null
  at: string
  part: { part_no: number; machine: Machine } | null
}

/** Runs that touch this week, from start and finish events. */
export async function loadRuns(now = Date.now()): Promise<{ runs: Run[]; error?: string }> {
  // A day before Sunday, so a part started Saturday and finished Sunday still pairs up.
  const since = new Date(weekStart(now) - 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('part_events')
    .select('part_id, action, by_name, details, at, part:parts!inner(part_no, machine)')
    .in('action', [...STARTS, ...ENDS])
    .gte('at', since)
    .order('at')
    .limit(5000)
  if (error) return { runs: [], error: error.message }
  return { runs: pairRuns((data as unknown as Ev[]) ?? []) }
}

export function pairRuns(events: Ev[]): Run[] {
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
        // Someone else took it over ("I'll make it instead"): a new run from here.
        if (e.action !== 'claimed') continue
        o.end = at
        o.done = false
      }
      const prev = last.get(e.part_id)
      // Undo right after Done carries on the same run.
      if (!o && prev && prev.done && e.action === 'status_doing' && prev.end !== null && at - prev.end < 30 * 60000) {
        prev.end = null
        prev.done = false
        open.set(e.part_id, prev)
        continue
      }
      const r: Run = { partId: e.part_id, partNo: e.part.part_no, machine: e.part.machine, who, start: at, end: null, done: false }
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

/** Hours a run counts for: real time, but at most 3 h, so a forgotten Done can't ruin the week. */
export const countedMs = (r: Run, now: number) => Math.min((r.end ?? now) - r.start, STALE_MS)

export function lastUsedBy(runs: Run[]): Partial<Record<Machine, number>> {
  const out: Partial<Record<Machine, number>> = {}
  for (const r of runs) if (r.end && r.end > (out[r.machine] ?? 0)) out[r.machine] = r.end
  return out
}
