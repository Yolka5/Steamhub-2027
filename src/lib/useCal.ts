import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { ensureSeason, type CalEvent, type CalGroup, type Owner, type Phase, type Task, type Update, type Wait } from './cal'
import { selectAll, supabase } from './supabase'
import { useReloadOnReturn } from './useReturn'

// The Calendar's data for one season, loaded once and shared by every Calendar screen, so
// switching between Board, Calendar and Gantt is instant. Realtime keeps it in step with
// everyone else; coming back to the app or the connection returning reloads it.

export interface CalData {
  groups: CalGroup[]
  phases: Phase[]
  tasks: Task[]
  owners: Owner[]
  waits: Wait[]
  updates: Update[]
  events: CalEvent[]
}

interface State extends CalData {
  season: number | null
  loading: boolean
  error: string | null
}

const empty: State = { season: null, groups: [], phases: [], tasks: [], owners: [], waits: [], updates: [], events: [], loading: true, error: null }

let state: State = empty
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

let loadingSeason: number | null = null

async function load(season: number) {
  loadingSeason = season
  await ensureSeason(season)
  const g = await supabase.from('cal_groups').select('*').eq('season', season)
  if (g.error) {
    if (loadingSeason === season) set({ loading: false, error: g.error.message })
    return
  }
  const ids = (g.data as CalGroup[]).map((x) => x.id)
  const none = Promise.resolve({ data: [], error: null })
  const [p, t, o, w, u, e] = await Promise.all([
    ids.length ? supabase.from('cal_phases').select('*').in('group_id', ids) : none,
    ids.length ? selectAll<Task>(() => supabase.from('tasks').select('*').in('group_id', ids).order('id')) : none,
    // Owners and waits are small for the whole history, and filtering by hundreds of task ids
    // would make a URL too long; anything from another season is ignored below.
    selectAll<Owner>(() => supabase.from('task_owners').select('*').order('task_id')),
    selectAll<Wait>(() => supabase.from('task_waits').select('*').order('task_id')),
    ids.length ? selectAll<Update>(() => supabase.from('cal_updates').select('*').in('group_id', ids).order('id')) : none,
    selectAll<CalEvent>(() => supabase.from('events').select('*').order('starts_at')),
  ])
  if (loadingSeason !== season) return
  const err = p.error ?? t.error ?? o.error ?? w.error ?? u.error ?? e.error
  if (err && !state.groups.length) return set({ loading: false, error: err.message })
  set({
    season,
    groups: g.data as CalGroup[],
    phases: (p.data as Phase[]) ?? [],
    tasks: (t.data as Task[]) ?? [],
    owners: (o.data as Owner[]) ?? [],
    waits: (w.data as Wait[]) ?? [],
    updates: (u.data as Update[]) ?? [],
    events: (e.data as CalEvent[]) ?? [],
    loading: false,
    error: null,
  })
}

type Key = keyof CalData
const KEYS: Record<string, { key: Key; same: (a: never, b: never) => boolean }> = {
  cal_groups: { key: 'groups', same: (a: CalGroup, b: CalGroup) => a.id === b.id },
  cal_phases: { key: 'phases', same: (a: Phase, b: Phase) => a.id === b.id },
  tasks: { key: 'tasks', same: (a: Task, b: Task) => a.id === b.id },
  task_owners: { key: 'owners', same: (a: Owner, b: Owner) => a.task_id === b.task_id && a.user_id === b.user_id },
  task_waits: { key: 'waits', same: (a: Wait, b: Wait) => a.task_id === b.task_id && a.waits_for_id === b.waits_for_id },
  cal_updates: { key: 'updates', same: (a: Update, b: Update) => a.id === b.id },
  events: { key: 'events', same: (a: CalEvent, b: CalEvent) => a.id === b.id },
}

/** Applies one row change, from realtime or from a save, right away. */
export function applyRow(table: keyof typeof KEYS, kind: 'upsert' | 'delete', row: object) {
  const k = KEYS[table]
  const list = state[k.key] as object[]
  const same = k.same as (a: object, b: object) => boolean
  // Rows of another season's groups don't belong here.
  if (kind === 'upsert' && 'group_id' in row && table !== 'events' && !state.groups.some((g) => g.id === (row as { group_id: string }).group_id)) return
  if (kind === 'upsert' && table === 'cal_groups' && (row as CalGroup).season !== state.season) return
  const i = list.findIndex((x) => same(x, row))
  if (kind === 'delete') {
    if (i === -1) return
    set({ [k.key]: list.filter((_, j) => j !== i) } as Partial<State>)
    return
  }
  const next = list.slice()
  if (i === -1) next.push(row)
  else next[i] = { ...next[i], ...row }
  set({ [k.key]: next } as Partial<State>)
}

/** Several saved rows at once, as a save returns them. */
export const putRows = (table: keyof typeof KEYS, rows: object[]) => rows.forEach((r) => applyRow(table, 'upsert', r))

let channel: ReturnType<typeof supabase.channel> | null = null
let users = 0

function connect() {
  if (channel) return
  channel = supabase.channel('calendar')
  for (const table of Object.keys(KEYS)) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (msg) => {
      if (msg.eventType === 'DELETE') applyRow(table, 'delete', msg.old)
      else applyRow(table, 'upsert', msg.new)
    })
  }
  channel.subscribe()
}

function disconnect() {
  if (!channel) return
  supabase.removeChannel(channel)
  channel = null
}

/** The season's Calendar. `season` null while the robots are still loading. */
export function useCal(season: number | null) {
  const s = useSyncExternalStore(subscribe, () => state)

  useEffect(() => {
    if (season == null) return
    if (state.season !== season) {
      if (state.season != null) state = { ...empty }
      load(season)
    }
    users++
    connect()
    return () => {
      // Kept for a few seconds, so moving between Calendar pages doesn't reconnect.
      users--
      window.setTimeout(() => users === 0 && disconnect(), 5000)
    }
  }, [season])

  const reload = useCallback(() => (season != null ? load(season) : undefined), [season])
  useReloadOnReturn(reload)

  return useMemo(() => {
    const taskIds = new Set(s.tasks.map((t) => t.id))
    return {
      ...s,
      loading: s.loading || s.season !== season,
      owners: s.owners.filter((o) => taskIds.has(o.task_id)),
      waits: s.waits.filter((w) => taskIds.has(w.task_id) && taskIds.has(w.waits_for_id)),
      reload,
    }
  }, [s, season, reload])
}

export type Cal = ReturnType<typeof useCal>
