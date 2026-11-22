// Drawing training (DRAWING_TRAINING.md): STEP uploads that exist only to correct the drawings the
// engine makes and to teach Claude's upload check. Parsed by the same worker and engine as a real
// upload, but stored in drawing_* tables and under training/ in the 'parts' bucket, so nothing
// reaches the workshop.
import { checkExample, svgToPng, type Finding } from './claude'
import { ENGINE_VERSION, loadGeometry, trainingDrawing } from './drawing'
import { bentThickness, download, fileSafe, fromMethod, guessMaterial, gunzip, gzip, type Who } from './mfg'
import { isoView, projectView } from './step/engine'
import type { WorkerMsg, WorkerPart } from './step/worker'
import { supabase } from './supabase'

export const STEPS = ['CNC', 'Lathe', 'Mill', '3D print', 'Bend', 'Bought'] as const
export type Step = (typeof STEPS)[number]
export const SHAPES = ['plate', 'tube', 'long', 'round', 'print', 'block'] as const

/** Fix chips, by group. CNC drawings are minimal on purpose, so they never get "missing dimensions". */
export const FIXES: { group: string; items: string[] }[] = [
  { group: 'Views', items: ['Wrong main view', 'Missing view', 'Extra view', 'Needs section', 'Needs iso'] },
  { group: 'Dimensions', items: ['Missing dimension', 'Wrong feature', 'Overlapping', 'Too many'] },
  { group: 'Scale', items: ['Too small', 'Too big'] },
  { group: 'Bends', items: ['No flat pattern', 'No bend lines', 'No bend direction'] },
  { group: 'Holes', items: ['Missing callout', 'Wrong hole size'] },
  { group: 'Layout', items: ['Text overlap', 'Cut off', 'Other'] },
]
export const fixesFor = (machine: string) =>
  FIXES.map((g) => ({ ...g, items: machine === 'CNC' ? g.items.filter((x) => x !== 'Missing dimension') : g.items }))

export interface Upload {
  id: string
  filename: string
  size: number
  parts: number
  drawn: number
  bought: number
  repeats: number
  test: boolean
  uploaded_by_name: string | null
  at: string
}

export interface Example {
  id: string
  upload_id: string
  sig: string
  name: string
  qty: number
  size: number[]
  geometry_path: string | null
  custom: boolean
  machine: string
  route: string[]
  why: string
  material: string
  cls: string | null
  claude_findings: Finding[] | null
  claude_at: string | null
  status: 'todo' | 'right' | 'corrected' | 'skipped'
  created_at: string
}

/** A pin (no w/h) or a box, in fractions of the drawing. */
export interface Mark {
  n: number
  x: number
  y: number
  w?: number
  h?: number
  note: string
  fix?: string
}

export type Verdict = 'right' | 'corrected' | 'skipped' | 'fixed' | 'partly' | 'not_fixed' | 'worse' | 'still_right' | 'broke'

export interface Review {
  id?: string
  example_id: string
  engine_version: string
  verdict: Verdict
  fixes: string[]
  marks: Mark[]
  made: 'made' | 'bought' | null
  route: string[] | null
  material: string | null
  cls: string | null
  claude_marks: { text: string; kind: string; right: boolean }[]
  note: string
  drawing_path: string | null
  engine_meta: { cls: string; template: string; scale: number } | null
  by_name?: string | null
  at?: string
}

export interface Lesson {
  id: string
  text: string
  kind: 'drawing' | 'route' | 'bought' | 'engine_gap'
  sources: number
  status: 'proposed' | 'live' | 'dropped'
  created_at: string
  approved_at: string | null
}

export const canDrawExample = (e: Example) => e.custom && !!e.geometry_path

/** The drawing of an example, by today's engine. */
export const exampleDrawing = (e: Example) =>
  trainingDrawing({ geometry_path: e.geometry_path!, machine: e.machine, name: e.name, material: e.material, qty: e.qty })

/** The drawing an old review was given on, saved with the review. */
export const savedDrawing = async (path: string) => gunzip(await download('parts', path))

// ---------- Upload ----------

/** The same worker a real upload uses (upload.ts), closed as soon as the parts are read. */
function parse(files: File[], onProgress: (t: string) => void): Promise<{ items: WorkerPart[]; skipped: string[] }> {
  const worker = new Worker(new URL('./step/worker.ts', import.meta.url), { type: 'module' })
  return new Promise<{ items: WorkerPart[]; skipped: string[] }>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const m = e.data
      if (m.type === 'progress') onProgress(m.text)
      else if (m.type === 'error') reject(new Error(m.message))
      else if (m.type === 'done') resolve({ items: m.items, skipped: m.skipped })
    }
    worker.onerror = (e) => reject(new Error(e.message || "The STEP reader didn't start. Refresh the page and drop the file again."))
    Promise.all(files.map(async (f) => ({ name: f.name, buf: await f.arrayBuffer() })))
      .then((list) => worker.postMessage({ files: list }, list.map((x) => x.buf)))
      .catch(reject)
  }).finally(() => worker.terminate())
}

/** As upload.ts: a part with more than one machine carries its route in its notes. */
const routeNote = (it: WorkerPart) => (it.route && it.route.length > 1 ? `Route: ${it.route.join(' → ')}${it.why ? ` (${it.why})` : ''}` : '')

async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        await fn(items[i], i)
      }
    }),
  )
}

export interface UploadDone {
  upload?: Upload
  added: Example[]
  error?: string
}

export async function trainingUpload(fileList: File[], who: Who, test: boolean, onProgress: (t: string) => void): Promise<UploadDone> {
  const steps = fileList.filter((f) => /\.(step|stp)$/i.test(f.name))
  if (!steps.length) return { added: [], error: 'No STEP files there. Export the assembly from Onshape as STEP.' }
  let items: WorkerPart[]
  try {
    ;({ items } = await parse(steps, onProgress))
  } catch (e) {
    return { added: [], error: e instanceof Error ? e.message : String(e) }
  }
  if (!items.length) return { added: [], error: 'No parts found in this file.' }

  // One example per shape: a shape that's already in the training set is counted and skipped.
  const have = new Set<string>()
  const sigs = items.map((i) => i.sig)
  for (let i = 0; i < sigs.length; i += 100) {
    const { data } = await supabase.from('drawing_examples').select('sig').in('sig', sigs.slice(i, i + 100))
    for (const r of data ?? []) have.add(r.sig)
  }
  const fresh = items.filter((i) => !have.has(i.sig))
  const label = steps.length === 1 ? steps[0].name : `${steps.length} STEP files`
  const { data: up, error: upErr } = await supabase
    .from('drawing_uploads')
    .insert({
      filename: label,
      size: steps.reduce((s, f) => s + f.size, 0),
      parts: items.length,
      drawn: fresh.filter((i) => i.custom && i.geometry).length,
      bought: fresh.filter((i) => !i.custom).length,
      repeats: items.length - fresh.length,
      test,
      uploaded_by: who.userId,
      uploaded_by_name: who.name,
    })
    .select()
    .single()
  if (upErr || !up) return { added: [], error: upErr?.message ?? 'Not saved.' }

  const paths = new Map<WorkerPart, string>()
  let done = 0
  await pool(fresh, 6, async (it, i) => {
    if (it.geometry) {
      const path = `training/${up.id}/${i}-${fileSafe(it.name).slice(0, 40)}.json.gz`
      const r = await supabase.storage.from('parts').upload(path, await gzip(it.geometry), { contentType: 'application/gzip' })
      if (!r.error) paths.set(it, path)
    }
    onProgress(`Saving parts ${++done}/${fresh.length}`)
  })

  const rows = fresh.map((it) => {
    const machine = it.custom ? fromMethod(it.method) : 'Bought'
    return {
      upload_id: up.id,
      sig: it.sig,
      name: it.name,
      qty: it.qty,
      size: it.size.map((v) => Math.round(v * 100) / 100),
      geometry_path: paths.get(it) ?? null,
      custom: it.custom,
      machine,
      route: it.custom ? (it.route?.length ? it.route : [machine]) : ['Bought'],
      why: it.why ?? '',
      material: guessMaterial(machine, it.cls, it.size, it.name, bentThickness({ notes: routeNote(it) })),
      cls: it.cls,
    }
  })
  const added: Example[] = []
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.from('drawing_examples').upsert(rows.slice(i, i + 200), { onConflict: 'sig', ignoreDuplicates: true }).select()
    if (error) return { upload: up as Upload, added, error: error.message }
    added.push(...((data ?? []) as Example[]))
  }
  return { upload: up as Upload, added }
}

/** Claude's upload check on each made example, three at a time, as a real upload does. */
export async function checkExamples(list: Example[], onProgress: (done: number, total: number) => void): Promise<{ checked: number; error?: string }> {
  const todo = list.filter(canDrawExample)
  const total = todo.length
  let done = 0
  let checked = 0
  let stop: string | undefined
  onProgress(0, total)
  const next = async () => {
    for (;;) {
      const e = todo.shift()
      if (!e || stop) return
      try {
        const d = await exampleDrawing(e)
        const r = await checkExample(e.id, await svgToPng(d.svg))
        if (r.error && /limit|Sign in|reach Claude|No connection/.test(r.error)) stop = r.error
        else if (!r.error) checked++
      } catch {
        // An unreadable drawing: nothing for Claude to look at.
      }
      onProgress(++done, total)
    }
  }
  await Promise.all([next(), next(), next()])
  return { checked, error: stop }
}

// ---------- Reviews ----------

/** Saves a review on today's engine, with the drawing as it was seen, and the example's status. */
export async function saveReview(e: Example, r: Omit<Review, 'engine_version' | 'drawing_path' | 'engine_meta'>, drawing: { svg: string; cls: string; template: string; scale: number } | null, who: Who | null) {
  let drawing_path: string | null = null
  if (drawing) {
    const path = `training/${e.upload_id}/review-${e.id}-${ENGINE_VERSION}.svg.gz`
    const up = await supabase.storage.from('parts').upload(path, await gzip(drawing.svg), { contentType: 'application/gzip', upsert: true })
    if (!up.error) drawing_path = path
  }
  const row = {
    ...r,
    engine_version: ENGINE_VERSION,
    drawing_path,
    engine_meta: drawing ? { cls: drawing.cls, template: drawing.template, scale: drawing.scale } : null,
    by_id: who?.userId ?? null,
    by_name: who?.name ?? null,
    at: new Date().toISOString(),
  }
  delete (row as { id?: string }).id
  const { error } = await supabase.from('drawing_reviews').upsert(row, { onConflict: 'example_id,engine_version' })
  if (error) return error.message
  if (r.verdict === 'right' || r.verdict === 'corrected' || r.verdict === 'skipped') {
    const { error: e2 } = await supabase.from('drawing_examples').update({ status: r.verdict }).eq('id', e.id)
    if (e2) return e2.message
  }
  return null
}

/** Two iso pictures from opposite corners, for parts with no drawing (bought). As the label page. */
export async function isoPictures(path: string): Promise<string[]> {
  const G = await loadGeometry(path)
  return [false, true].map((flip) => {
    const pv = projectView(G, isoView(flip))
    const [x0, y0, x1, y1] = pv.bb
    const side = Math.max(x1 - x0, y1 - y0) * 1.08 || 1
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const k = 100 / side
    const d = (L: [number, number][][]) =>
      L.map((l) => l.map(([x, y], i) => `${i ? 'L' : 'M'}${(50 + (x - cx) * k).toFixed(2)} ${(50 - (y - cy) * k).toFixed(2)}`).join('')).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d(pv.hid)}" fill="none" stroke="#b8b8b8" stroke-width="0.6" stroke-dasharray="1.5 1" vector-effect="non-scaling-stroke"/><path d="${d(pv.vis)}" fill="none" stroke="#111" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
  })
}

/** Removes an upload: its examples, their reviews and every file under training/<id>/. */
export async function removeUpload(id: string) {
  const { data: files } = await supabase.storage.from('parts').list(`training/${id}`, { limit: 1000 })
  const paths = (files ?? []).map((f) => `training/${id}/${f.name}`)
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('parts').remove(paths.slice(i, i + 100))
  const { error } = await supabase.from('drawing_uploads').delete().eq('id', id)
  return error?.message ?? null
}
