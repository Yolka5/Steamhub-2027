import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { notify, type Who } from './mfg'
import { supabase } from './supabase'
import { useRobots } from './useMfg'
import { useReloadOnReturn } from './useReturn'

// Prototypes: see PROTOTYPES.md. A prototype hangs off a subsystem by season + number, so one
// intake prototype shows on the 2027 V1 and V2 intake alike. A test is one video plus the value
// of every parameter it ran with.

/** Longer clips keep only their start; past this, paste a link instead. */
export const MAX_SECONDS = 90

export type ProtoStatus = 'idea' | 'building' | 'testing' | 'chosen' | 'dropped'
export type Result = 'worked' | 'partly' | 'failed'
export type ParamKind = 'number' | 'text' | 'choice' | 'bool'
export type BlockKind = 'notes' | 'photos' | 'checklist' | 'proscons' | 'links' | 'calc' | 'stock' | 'chart'
export type Value = string | number | boolean | null

export const STATUSES: ProtoStatus[] = ['idea', 'building', 'testing', 'chosen', 'dropped']
export const STATUS_WORD: Record<ProtoStatus, string> = { idea: 'Idea', building: 'Building', testing: 'Testing', chosen: 'Chosen', dropped: 'Dropped' }
export const STATUS_TAG: Record<ProtoStatus, string> = { idea: 'tag tag--design', building: 'tag', testing: 'tag tag--reserved', chosen: 'tag tag--ok', dropped: 'tag tag--gone' }

export const RESULTS: Result[] = ['worked', 'partly', 'failed']
export const RESULT_WORD: Record<Result, string> = { worked: 'Worked', partly: 'Partly', failed: 'Failed' }
export const RESULT_TAG: Record<Result, string> = { worked: 'tag tag--ok', partly: 'tag tag--reserved', failed: 'tag tag--bad' }

export const BLOCK_WORD: Record<BlockKind, { name: string; what: string }> = {
  notes: { name: 'Notes', what: 'Free text' },
  photos: { name: 'Photos', what: 'Pictures of the build' },
  checklist: { name: 'Checklist', what: "What's left to build or try" },
  proscons: { name: 'Pros and cons', what: 'Two lists, side by side' },
  links: { name: 'Links', what: 'Onshape, Chief Delphi, reveal videos' },
  calc: { name: 'Calculator mechanism', what: 'Ratio and current from the team robot' },
  stock: { name: 'Stock used', what: 'Pieces reserved for this prototype' },
  chart: { name: 'Parameter chart', what: 'One parameter against the results' },
}

/** What a new prototype starts with when its subsystem has no saved layout. */
export const DEFAULT_LAYOUT: { kind: BlockKind; title: string }[] = [
  { kind: 'notes', title: 'Notes' },
  { kind: 'checklist', title: 'To do' },
  { kind: 'links', title: 'Links' },
]

/** One field of a library item, as the team edits it on /prototypes/library. */
export interface LibField {
  name: string
  unit: string
  kind: ParamKind
  /** Choices, or for a number the sizes offered as one tap ("2, 2.25, 3"). */
  options: string[]
  /** Shown only when another field of the same item has one of these values. */
  only_if?: { field: string; is: string[] } | null
}

/** A library item: one parameter, or a group of them added together (Wheel: type, diameter, color). */
export interface LibItem {
  id: string
  name: string
  fields: LibField[]
  /** Words in a subsystem's name that start it with this item; "*" is every subsystem. */
  starter_for: string[]
  position: number
  updated_at: string
}

export interface Prototype {
  id: string
  season: number
  subsystem_number: number | null
  name: string
  concept: string
  status: ProtoStatus
  status_note: string
  owner_id: string | null
  cover_path: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ParamDef {
  id: string
  season: number
  subsystem_number: number | null
  prototype_id: string | null
  name: string
  unit: string
  kind: ParamKind
  options: string[]
  key: boolean
  position: number
  /** Shown only when another parameter has one of these values: Compliant color when Wheel type is Compliant. */
  only_if: { def: string; is: string[] } | null
  created_at: string
}

export interface Test {
  id: string
  prototype_id: string
  n: number
  values: Record<string, Value>
  result: Result | null
  score: number | null
  measure_name: string
  measure_value: number | null
  note: string
  video_path: string | null
  poster_path: string | null
  video_link: string | null
  duration_s: number | null
  video_size: number | null
  by_id: string | null
  by_name: string | null
  at: string
}

export interface Block {
  id: string
  prototype_id: string
  kind: BlockKind
  title: string
  data: Record<string, unknown>
  position: number
  collapsed: boolean
  updated_by: string | null
  updated_at: string
}

type Res<T> = { data?: T; error?: string }

// ---------- Seasons and subsystems ----------

/** The season people are working on: the newest robot's, or next year's from September (kickoff is in January). */
export function useSeasons() {
  const { robots, subs, loading } = useRobots()
  const now = new Date()
  const fallback = now.getFullYear() + (now.getMonth() >= 8 ? 1 : 0)
  const seasons = useMemo(() => [...new Set([fallback, ...robots.map((r) => r.season)])].sort((a, b) => b - a), [robots, fallback])
  const current = robots.length ? Math.max(...robots.map((r) => r.season)) : fallback
  /** Subsystem numbers and names of a season, one per number. Active robots win over archived ones. */
  const subsystemsOf = useCallback(
    (season: number) => {
      const byNo = new Map<number, { number: number; name: string; lead_id: string | null; id: string; robotName: string }>()
      const rs = robots.filter((r) => r.season === season).sort((a, b) => Number(a.archived) - Number(b.archived) || b.created_at.localeCompare(a.created_at))
      for (const r of rs)
        for (const s of subs.filter((x) => x.robot_id === r.id))
          if (!byNo.has(s.number)) byNo.set(s.number, { number: s.number, name: s.name, lead_id: s.lead_id, id: s.id, robotName: r.name })
      return [...byNo.values()].sort((a, b) => a.number - b.number)
    },
    [robots, subs],
  )
  return { seasons, current, subsystemsOf, loading, robots, subs }
}

export const subLabel = (n: number | null, list: { number: number; name: string }[]) => {
  if (n == null) return 'No subsystem yet'
  const s = list.find((x) => x.number === n)
  return s ? `${s.number} ${s.name}` : `Subsystem ${n}`
}

// ---------- Signed links to private files ----------

const signed = new Map<string, { url: string; until: number }>()
const HOUR = 3600

// Every card asks for its own picture, so asks made in the same moment are collected and sent as
// one request: a list of 20 prototypes signs its 20 posters in one round trip, not 20.
const asked = new Set<string>()
const signers = new Set<() => void>()
let flushing = 0
function askSigned(paths: string[]) {
  for (const p of paths) asked.add(p)
  if (flushing) return
  flushing = window.setTimeout(async () => {
    const want = [...asked]
    asked.clear()
    flushing = 0
    const { data } = await supabase.storage.from('prototypes').createSignedUrls(want, HOUR)
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, { url: d.signedUrl, until: Date.now() + HOUR * 1000 })
    signers.forEach((s) => s())
  }, 0)
}

/** Signed links for files in the private prototypes bucket, cached for most of an hour. */
export function useSigned(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join('|')
  const [, bump] = useState(0)
  useEffect(() => {
    const again = () => bump((n) => n + 1)
    signers.add(again)
    const want = [...new Set(key ? key.split('|') : [])].filter((p) => (signed.get(p)?.until ?? 0) < Date.now() + 60_000)
    if (want.length) askSigned(want)
    return () => {
      signers.delete(again)
    }
  }, [key])
  return (path: string | null | undefined) => (path ? (signed.get(path)?.url ?? null) : null)
}

export async function signedUrl(path: string) {
  const hit = signed.get(path)
  if (hit && hit.until > Date.now() + 60_000) return hit.url
  const { data } = await supabase.storage.from('prototypes').createSignedUrl(path, HOUR)
  if (data?.signedUrl) signed.set(path, { url: data.signedUrl, until: Date.now() + HOUR * 1000 })
  return data?.signedUrl ?? null
}

// ---------- Loading ----------

/**
 * Live list of a table's rows, reloaded on any change. Lists here are small. key changes when the
 * query does; `skip` waits for what the query needs (the prototype's season).
 */
function useLive<T>(table: string, key: string, load: () => PromiseLike<{ data: unknown; error?: { message: string } | null }>, skip = false) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loader = useRef(load)
  loader.current = load
  const reload = useCallback(async () => {
    if (skip) return
    const { data, error } = await loader.current()
    // A failed reload keeps what's on screen.
    if (!error) setRows((data as T[]) ?? [])
    setError(error?.message ?? null)
    setLoading(false)
    // key stands for the query, which lives in the loader
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip])
  useReloadOnReturn(reload)
  useEffect(() => {
    if (skip) return
    reload()
    const ch = supabase
      .channel(`${table}-${Math.random().toString(36).slice(2, 9)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [reload, table, skip])
  return { rows, setRows, loading, error, reload }
}

/** Every prototype of a season. With no season yet (a prototype page still loading), nothing is fetched. */
export function usePrototypes(season: number | null) {
  const none = season == null
  const protos = useLive<Prototype>('prototypes', `list-${season}`, () => supabase.from('prototypes').select('*').eq('season', season ?? 0).order('created_at'), none)
  const ids = protos.rows.map((p) => p.id)
  const tests = useLive<Test>(
    'prototype_tests',
    `list-${ids.join(',')}`,
    () => (ids.length ? supabase.from('prototype_tests').select('*').in('prototype_id', ids).order('n') : Promise.resolve({ data: [] })),
    none,
  )
  const params = useLive<ParamDef>('param_defs', `list-${season}`, () => supabase.from('param_defs').select('*').eq('season', season ?? 0).order('position'), none)
  return { prototypes: protos.rows, tests: tests.rows, params: params.rows, loading: protos.loading, error: protos.error, reload: protos.reload }
}

export function usePrototype(id: string) {
  const proto = useLive<Prototype>('prototypes', `one-${id}`, () => supabase.from('prototypes').select('*').eq('id', id))
  const p = proto.rows[0] ?? null
  const tests = useLive<Test>('prototype_tests', `one-${id}`, () => supabase.from('prototype_tests').select('*').eq('prototype_id', id).order('n'))
  const blocks = useLive<Block>('prototype_blocks', `one-${id}`, () => supabase.from('prototype_blocks').select('*').eq('prototype_id', id).order('position'))
  const season = p?.season ?? 0
  const sub = p?.subsystem_number ?? -1
  const params = useLive<ParamDef>(
    'param_defs',
    `one-${id}-${season}-${sub}`,
    () =>
      supabase
        .from('param_defs')
        .select('*')
        .or(`prototype_id.eq.${id},and(prototype_id.is.null,season.eq.${season},subsystem_number.eq.${sub})`)
        .order('position'),
  )
  return {
    proto: p,
    loading: proto.loading,
    error: proto.error,
    /** Tests load after the prototype; forms that copy the last test's values wait for this. */
    testsLoading: tests.loading,
    tests: tests.rows,
    blocks: blocks.rows,
    setBlocks: blocks.setRows,
    params: params.rows,
    reload: () => Promise.all([proto.reload(), tests.reload(), blocks.reload(), params.reload()]),
    reloadParams: params.reload,
  }
}

/**
 * Who leads a prototype: someone picked by hand (owner_id), else its subsystem's lead from
 * Manufacturing, read live so a new lead there takes over every prototype of the subsystem, else
 * whoever made it.
 */
export function leadOf(p: Pick<Prototype, 'owner_id' | 'subsystem_number' | 'created_by'>, subs: { number: number; lead_id: string | null }[]) {
  return p.owner_id ?? subs.find((s) => s.number === p.subsystem_number)?.lead_id ?? p.created_by
}

/** Parameters of one prototype: its subsystem's set first, then its own. */
export function paramsOf(p: Pick<Prototype, 'id' | 'season' | 'subsystem_number'>, all: ParamDef[]) {
  const shared = all.filter((d) => !d.prototype_id && d.season === p.season && d.subsystem_number === p.subsystem_number && p.subsystem_number != null)
  const own = all.filter((d) => d.prototype_id === p.id)
  return [...shared.sort((a, b) => a.position - b.position), ...own.sort((a, b) => a.position - b.position)]
}

// ---------- Parameter library ----------

/** The team's parameter library: what the + chips add and what a new subsystem starts with. */
export function useLibrary() {
  const lib = useLive<LibItem>('param_library', 'all', () => supabase.from('param_library').select('*').order('position'))
  return { items: lib.rows, loading: lib.loading, error: lib.error, reload: lib.reload }
}

/** Library items with none of their fields on the prototype yet, for the + chips. */
export function libSuggestions(items: LibItem[], params: Pick<ParamDef, 'name'>[]) {
  const have = new Set(params.map((d) => d.name.toLowerCase()))
  return items.filter((i) => i.fields.length && !i.fields.some((f) => have.has(f.name.toLowerCase())))
}

/** Items a subsystem (or a prototype with none yet) starts with, by the words in its name. */
export function startersFor(items: LibItem[], name: string) {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return items.filter((i) => i.starter_for.some((w) => w === '*' || words.some((x) => x === w.toLowerCase() || x === `${w.toLowerCase()}s`)))
}

/**
 * Adds library items' fields as parameters: to the subsystem's set, or to the prototype alone
 * when it has no subsystem. Fields already there (same name) are skipped; "only when" links are
 * turned from field names into the new parameter ids.
 */
export async function addLibItems(p: Pick<Prototype, 'id' | 'season' | 'subsystem_number'>, items: LibItem[], existing: ParamDef[]): Promise<{ error?: string }> {
  const have = new Map(existing.map((d) => [d.name.toLowerCase(), d.id]))
  let keys = existing.filter((d) => d.key).length
  let position = Math.max(0, ...existing.map((d) => d.position))
  const shared = p.subsystem_number != null
  for (const item of items) {
    // Plain fields first, so the ones that depend on them can point at their ids.
    const order = [...item.fields].sort((a, b) => Number(!!a.only_if) - Number(!!b.only_if))
    for (const f of order) {
      if (have.has(f.name.toLowerCase())) continue
      const on = f.only_if ? have.get(f.only_if.field.toLowerCase()) : undefined
      const key = !f.only_if && keys < 3
      const { data, error } = await supabase
        .from('param_defs')
        .insert({
          season: p.season,
          subsystem_number: p.subsystem_number,
          prototype_id: shared ? null : p.id,
          name: f.name,
          unit: f.kind === 'number' ? f.unit : '',
          kind: f.kind,
          options: f.options ?? [],
          // The first three plain ones are key: shown on cards and on the video.
          key,
          only_if: on && f.only_if ? { def: on, is: f.only_if.is } : null,
          position: position + 1 + item.fields.indexOf(f) / 100,
        })
        .select('id')
        .single()
      if (error) return { error: error.message }
      have.set(f.name.toLowerCase(), data.id)
      if (key) keys++
    }
    position += 1
  }
  return {}
}

/** Whether a parameter is in use, given the values: one with "only when" hides otherwise. */
export function shown(d: ParamDef, values: Record<string, Value>) {
  if (!d.only_if) return true
  const v = values[d.only_if.def]
  return v != null && d.only_if.is.includes(String(v))
}

/**
 * A choice typed in that isn't on the list yet joins it, here and in the library, so lists grow
 * from use and the next person taps it.
 */
export async function growChoices(params: ParamDef[], values: Record<string, Value>, library: LibItem[]) {
  for (const d of params) {
    const v = values[d.id]
    if (d.kind !== 'choice' || v == null || v === '' || d.options.includes(String(v))) continue
    await supabase.from('param_defs').update({ options: [...d.options, String(v)] }).eq('id', d.id)
    const same = (f: LibField) => f.name.toLowerCase() === d.name.toLowerCase()
    const item = library.find((i) => i.fields.some(same))
    if (!item) continue
    const fields = item.fields.map((f) => (same(f) && !f.options.includes(String(v)) ? { ...f, options: [...f.options, String(v)] } : f))
    await supabase.from('param_library').update({ fields, updated_at: new Date().toISOString() }).eq('id', item.id)
  }
}

export async function saveLibItem(item: Pick<LibItem, 'name' | 'fields' | 'starter_for'> & { id?: string; position?: number }) {
  const row = { name: item.name, fields: item.fields, starter_for: item.starter_for, updated_at: new Date().toISOString() }
  const { error } = item.id
    ? await supabase.from('param_library').update(row).eq('id', item.id)
    : await supabase.from('param_library').insert({ ...row, position: item.position ?? 1000 })
  return error ? { error: error.message } : {}
}

export async function deleteLibItem(id: string) {
  const { error } = await supabase.from('param_library').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

// ---------- Values ----------

export function fmtValue(d: ParamDef, v: Value | undefined): string {
  if (v === undefined || v === null || v === '') return '–'
  if (d.kind === 'bool') return v ? 'Yes' : 'No'
  if (d.kind === 'number') {
    const n = Number(v)
    const s = Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : String(v)
    return d.unit ? (d.unit === ':1' ? `${s}:1` : d.unit === '°' ? `${s}°` : `${s} ${d.unit}`) : s
  }
  return String(v)
}

const same = (a: Value | undefined, b: Value | undefined) => (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '')

/** Parameters whose value differs from the test before. */
export function changedSince(test: Test, tests: Test[], params: ParamDef[]) {
  const prev = tests.filter((t) => t.n < test.n).sort((a, b) => b.n - a.n)[0]
  if (!prev) return []
  return params.filter((d) => !same(test.values[d.id], prev.values[d.id])).map((d) => ({ def: d, from: prev.values[d.id], to: test.values[d.id] }))
}

/** Key parameters as "Compression 15 mm" lines, for cards, the overlay and the WhatsApp copy. */
export function keyLines(params: ParamDef[], values: Record<string, Value>, all = false) {
  const keys = params.filter((d) => d.key)
  return (all || !keys.length ? params : keys)
    .filter((d) => values[d.id] !== undefined && values[d.id] !== null && values[d.id] !== '')
    .map((d) => `${d.name} ${fmtValue(d, values[d.id])}`)
}

export const resultScore = (t: Pick<Test, 'result'>) => (t.result === 'worked' ? 1 : t.result === 'partly' ? 0.5 : t.result === 'failed' ? 0 : null)

/**
 * Whether a smaller measured number is the better one. Times are (cycle time, seconds to intake);
 * counts and distances aren't (balls in out of 10, shot distance). Read from the measure's name,
 * so nobody has to fill in another field.
 */
export const lowerIsBetter = (name: string | null | undefined) => /\b(time|times|sec|secs|seconds|cycle|ms)\b|\(s\)/i.test(name ?? '')

/** The measured number as a score where bigger is always better, or null when there's none. */
export const measureScore = (t: Pick<Test, 'measure_value' | 'measure_name'>) =>
  t.measure_value == null ? null : lowerIsBetter(t.measure_name) ? -t.measure_value : t.measure_value

/** The test that best shows a prototype: worked over partly over failed, then score, then measured, then newest. */
export function bestTest(tests: Test[]) {
  return tests
    .slice()
    .sort((a, b) => (resultScore(b) ?? -1) - (resultScore(a) ?? -1) || (b.score ?? 0) - (a.score ?? 0) || (measureScore(b) ?? -1e9) - (measureScore(a) ?? -1e9) || b.n - a.n)[0]
}

// ---------- Actions ----------

export async function createPrototype(
  row: { season: number; subsystem_number: number | null; name: string; concept: string },
  who: Who,
  /** The subsystem's name, which picks the starter parameters. */
  subName?: string | null,
): Promise<Res<Prototype>> {
  const { data, error } = await supabase
    .from('prototypes')
    // No owner: the lead follows the subsystem's lead (leadOf).
    .insert({ ...row, owner_id: null, created_by: who.userId, status: 'idea' })
    .select()
    .single()
  if (error) return { error: error.message }
  // Start from the subsystem's saved layout, or the default one.
  let layout = DEFAULT_LAYOUT
  if (row.subsystem_number != null) {
    const { data: l } = await supabase.from('subsystem_layouts').select('layout').eq('season', row.season).eq('subsystem_number', row.subsystem_number).maybeSingle()
    if (Array.isArray(l?.layout) && l.layout.length) layout = l.layout as typeof DEFAULT_LAYOUT
  }
  await supabase.from('prototype_blocks').insert(layout.map((b, i) => ({ prototype_id: data.id, kind: b.kind, title: b.title, position: i + 1, updated_by: who.userId })))
  // Starter parameters from the library, by the subsystem's name (or the prototype's, with none
  // yet), unless the subsystem already has its set.
  const had =
    row.subsystem_number != null
      ? (await supabase.from('param_defs').select('id').is('prototype_id', null).eq('season', row.season).eq('subsystem_number', row.subsystem_number).limit(1)).data
      : []
  if (!had?.length) {
    const { data: lib } = await supabase.from('param_library').select('*').order('position')
    const items = startersFor((lib ?? []) as LibItem[], subName ?? row.name)
    if (items.length) await addLibItems(data as Prototype, items, [])
  }
  return { data: data as Prototype }
}

export async function updatePrototype(id: string, patch: Partial<Prototype>) {
  const { error } = await supabase.from('prototypes').update(patch).eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deletePrototype(p: Prototype, tests: Test[], blocks: Block[]) {
  const files = [
    ...tests.flatMap((t) => [t.video_path, t.poster_path]),
    ...blocks.flatMap((b) => (b.kind === 'photos' ? ((b.data.photos as { path: string }[]) ?? []).map((x) => x.path) : [])),
  ].filter((x): x is string => !!x)
  const { error } = await supabase.from('prototypes').delete().eq('id', p.id)
  if (error) return { error: error.message }
  if (files.length) await supabase.storage.from('prototypes').remove(files)
  return {}
}

export async function addParam(def: Omit<ParamDef, 'id' | 'created_at' | 'position'>, after: ParamDef[]) {
  const position = Math.max(0, ...after.map((d) => d.position)) + 1
  const { data, error } = await supabase.from('param_defs').insert({ ...def, position }).select().single()
  return error ? { error: error.message } : { data: data as ParamDef }
}

export async function updateParam(id: string, patch: Partial<ParamDef>) {
  const { error } = await supabase.from('param_defs').update(patch).eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteParam(id: string) {
  const { error } = await supabase.from('param_defs').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

export interface TestInput {
  values: Record<string, Value>
  result: Result | null
  score: number | null
  measure_name: string
  measure_value: number | null
  note: string
  video_link: string | null
}

/** `followers`: the lead and everyone who filmed a test before hear about a new one. */
export async function saveTest(p: Prototype, input: TestInput, who: Who, followers: (string | null)[], existing?: Test): Promise<Res<Test>> {
  if (existing) {
    const { data, error } = await supabase.from('prototype_tests').update(input).eq('id', existing.id).select().single()
    return error ? { error: error.message } : { data: data as Test }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase.from('prototype_tests').select('n').eq('prototype_id', p.id).order('n', { ascending: false }).limit(1)
    const n = (last?.[0]?.n ?? 0) + 1
    const { data, error } = await supabase
      .from('prototype_tests')
      .insert({ ...input, prototype_id: p.id, n, by_id: who.userId, by_name: who.name })
      .select()
      .single()
    if (error?.code === '23505') continue // two people saved at once: take the next number
    if (error) return { error: error.message }
    // A first test moves an idea or build into testing.
    if (p.status === 'idea' || p.status === 'building') await updatePrototype(p.id, { status: 'testing' })
    await notify(followers, 'proto_test', `${who.name} added test ${n} to ${p.name}`, `/prototypes/${p.id}#test-${n}`, who.userId)
    return { data: data as Test }
  }
  return { error: 'Someone else is saving tests right now. Try again.' }
}

export async function deleteTest(t: Test) {
  const { error } = await supabase.from('prototype_tests').delete().eq('id', t.id)
  if (error) return { error: error.message }
  const files = [t.video_path, t.poster_path].filter((x): x is string => !!x)
  if (files.length) await supabase.storage.from('prototypes').remove(files)
  // The cover was this test's picture: take the newest other test's, or none.
  if (t.poster_path) {
    const { data: next } = await supabase.from('prototype_tests').select('poster_path').eq('prototype_id', t.prototype_id).not('poster_path', 'is', null).order('n', { ascending: false }).limit(1)
    await supabase.from('prototypes').update({ cover_path: next?.[0]?.poster_path ?? null }).eq('id', t.prototype_id).eq('cover_path', t.poster_path)
  }
  return {}
}

export async function addBlock(protoId: string, kind: BlockKind, blocks: Block[], who: Who) {
  const position = Math.max(0, ...blocks.map((b) => b.position)) + 1
  const { data, error } = await supabase
    .from('prototype_blocks')
    .insert({ prototype_id: protoId, kind, title: BLOCK_WORD[kind].name, position, updated_by: who.userId })
    .select()
    .single()
  return error ? { error: error.message } : { data: data as Block }
}

export async function updateBlock(id: string, patch: Partial<Block>, who: Who | null) {
  const { error } = await supabase
    .from('prototype_blocks')
    .update({ ...patch, updated_by: who?.userId ?? null })
    .eq('id', id)
  return error ? { error: error.message } : {}
}

export async function deleteBlock(b: Block) {
  const { error } = await supabase.from('prototype_blocks').delete().eq('id', b.id)
  if (error) return { error: error.message }
  if (b.kind === 'photos') {
    const paths = ((b.data.photos as { path: string }[]) ?? []).map((x) => x.path)
    if (paths.length) await supabase.storage.from('prototypes').remove(paths)
  }
  return {}
}

export async function saveLayout(season: number, subsystemNumber: number, blocks: Block[]) {
  const layout = blocks.sort((a, b) => a.position - b.position).map((b) => ({ kind: b.kind, title: b.title }))
  const { error } = await supabase.from('subsystem_layouts').upsert({ season, subsystem_number: subsystemNumber, layout })
  return error ? { error: error.message } : {}
}

/** Chosen tells the subsystem's leads; the subsystem page shows it at the top. */
export async function setProtoStatus(p: Prototype, status: ProtoStatus, note: string, who: Who, leads: (string | null)[]) {
  const res = await updatePrototype(p.id, { status, status_note: note })
  if (!res.error && status === 'chosen') await notify(leads, 'proto_chosen', `${p.name} was chosen${note ? `: ${note}` : ''}`, `/prototypes/${p.id}`, who.userId)
  return res
}

// ---------- Video uploads in the background ----------

// Saving a test never waits for the video. The test row is saved at once, then the clip is
// shrunk and uploaded here while the person moves on. Pages read the progress from this store.

export interface Job {
  testId: string
  protoId: string
  stage: 'shrinking' | 'uploading' | 'done' | 'failed'
  progress: number
  error?: string
  note?: string
}

let jobs: Job[] = []
const listeners = new Set<() => void>()
const emit = () => {
  jobs = jobs.slice()
  listeners.forEach((l) => l())
}
const setJob = (testId: string, patch: Partial<Job>) => {
  jobs = jobs.map((j) => (j.testId === testId ? { ...j, ...patch } : j))
  emit()
}

export function useJobs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => jobs,
  )
}

const busy = () => jobs.some((j) => j.stage === 'shrinking' || j.stage === 'uploading')

if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (e) => {
    if (busy()) e.preventDefault()
  })

let chain: Promise<unknown> = Promise.resolve()
/** The clip of each job, kept until it's uploaded so a failed upload can be tried again. */
const clips = new Map<string, { test: Test; file: File }>()

/** One clip at a time, so a phone doesn't encode three videos at once. */
export function queueVideo(test: Test, file: File) {
  clips.set(test.id, { test, file })
  jobs = [...jobs.filter((j) => j.testId !== test.id), { testId: test.id, protoId: test.prototype_id, stage: 'shrinking', progress: 0 }]
  emit()
  chain = chain.then(() => runJob(test, file)).catch(() => {})
}

/** Try a failed upload again with the same clip (the connection dropped, the app was updated). */
export function retryVideo(testId: string) {
  const c = clips.get(testId)
  if (c) queueVideo(c.test, c.file)
}

async function runJob(test: Test, file: File) {
  try {
    // The video library is big, so it only loads when a clip is actually processed.
    const { prepareVideo } = await import('./video')
    const prepared = await prepareVideo(file, (p) => setJob(test.id, { progress: p }))
    setJob(test.id, { stage: 'uploading', progress: 1, note: prepared.trimmed ? 'Only the first 90 s were kept.' : undefined })
    const base = `tests/${test.prototype_id}/${test.id}-${Date.now()}`
    const ext = prepared.compressed || prepared.video.type === 'video/mp4' ? 'mp4' : (file.name.split('.').pop() ?? 'mp4')
    const up = await supabase.storage.from('prototypes').upload(`${base}.${ext}`, prepared.video, { contentType: prepared.video.type || 'video/mp4' })
    if (up.error) throw new Error(up.error.message)
    let poster: string | null = null
    if (prepared.poster) {
      const r = await supabase.storage.from('prototypes').upload(`${base}.jpg`, prepared.poster, { contentType: 'image/jpeg' })
      if (!r.error) poster = `${base}.jpg`
    }
    const old = [test.video_path, test.poster_path].filter((x): x is string => !!x)
    const { error } = await supabase
      .from('prototype_tests')
      .update({ video_path: `${base}.${ext}`, poster_path: poster, duration_s: Math.round(prepared.duration * 10) / 10, video_size: prepared.video.size })
      .eq('id', test.id)
    if (error) throw new Error(error.message)
    if (old.length) await supabase.storage.from('prototypes').remove(old)
    // The first clip's picture becomes the prototype's cover (and replaces it when that clip is replaced).
    if (poster) {
      const { data: p } = await supabase.from('prototypes').select('cover_path').eq('id', test.prototype_id).single()
      if (!p?.cover_path || old.includes(p.cover_path)) await updatePrototype(test.prototype_id, { cover_path: poster })
    }
    setJob(test.id, { stage: 'done' })
    clips.delete(test.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A tab left open across a deploy can't load the video tools any more: say what fixes it.
    const stale = /dynamically imported module|Importing a module script failed|error loading/i.test(msg)
    setJob(test.id, { stage: 'failed', error: stale ? 'Steamhub was updated. Tap Refresh at the top, then try again.' : msg })
  }
}

export async function uploadPhotoFile(protoId: string, blob: Blob) {
  const path = `photos/${protoId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
  const { error } = await supabase.storage.from('prototypes').upload(path, blob, { contentType: 'image/jpeg' })
  return error ? { error: error.message } : { path }
}

/** "youtube.com", "cad.onshape.com": where a link goes. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** YouTube links play inside the page. Anything else opens in a new tab. */
export function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/)
  return m?.[1] ?? null
}
