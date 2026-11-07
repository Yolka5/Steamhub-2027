import { fileSafe, fromMethod, guessMaterial, gzip, logPart, MACHINES, notify, type Part, type Subsystem, type UploadSummary, type Who } from './mfg'
import type { Analysis, Res, WorkerMsg, WorkerPart } from './step/worker'
import { supabase } from './supabase'

// One STEP upload for a subsystem: parse in a worker, store the file, then match the parts
// against what's already there.
//  - same geometry signature: unchanged
//  - same name, new geometry: changed. Keeps its number; if it was released, the lead and maker hear about it
//  - new name: a new part with the next free number, in design
//  - missing from the file: cancelled. The lead hears about it if it was in progress or done
// Numbers are never reused or reshuffled.

export interface UploadResult {
  summary?: UploadSummary
  error?: string
}

interface Parsed {
  items: WorkerPart[]
  rootName: string
  skipped: string[]
  /** Works out the bolt table and guide with Steamhub's numbers. Single assembly files only. */
  analyze: (parts: Record<string, { no: string; method: string }>, stock: unknown) => Promise<{ analysis: Analysis; chunks: Res[][] }>
  close: () => void
}

/** The worker stays open after parsing, so the analysis can use the parse it already has. */
function parse(files: File[], onProgress: (t: string) => void): Promise<Parsed> {
  const worker = new Worker(new URL('./step/worker.ts', import.meta.url), { type: 'module' })
  let waiting: { resolve: (m: WorkerMsg) => void; reject: (e: Error) => void } | null = null
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
    const m = e.data
    if (m.type === 'progress') onProgress(m.text)
    else if (m.type === 'error') waiting?.reject(new Error(m.message))
    else waiting?.resolve(m)
  }
  worker.onerror = (e) => waiting?.reject(new Error(e.message || 'The STEP reader crashed'))
  const ask = (msg: unknown, transfer: Transferable[] = []) =>
    new Promise<WorkerMsg>((resolve, reject) => {
      waiting = { resolve, reject }
      worker.postMessage(msg, transfer)
    })
  const close = () => worker.terminate()
  return Promise.all(files.map(async (f) => ({ name: f.name, buf: await f.arrayBuffer() })))
    .then((list) => ask({ files: list }, list.map((x) => x.buf)))
    .then((m) => {
      if (m.type !== 'done') throw new Error('Unexpected reply from the STEP reader')
      return {
        items: m.items,
        rootName: m.rootName,
        skipped: m.skipped,
        close,
        analyze: async (parts: Record<string, { no: string; method: string }>, stock: unknown) => {
          const r = await ask({ analyze: { parts, stock } })
          if (r.type !== 'analysis') throw new Error('Unexpected reply from the STEP reader')
          return { analysis: r.analysis, chunks: r.chunks }
        },
      }
    })
    .catch((e) => {
      close()
      throw e
    })
}

const half = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v)
const TOM_METHOD: Record<string, string> = { CNC: 'CNC', Mill: 'Milling', Lathe: 'Lathe', '3D print': '3D print', Bought: 'Bought' }

/** Bolt table and assembly guide for a single assembly file, saved next to the part files. */
async function saveAnalysis(parsed: Parsed, sub: Subsystem, uploadId: string, onProgress: (t: string) => void) {
  const [{ data: rows }, { data: stock }] = await Promise.all([
    supabase.from('parts').select('sig, part_no, machine').eq('subsystem_id', sub.id),
    supabase.from('settings').select('value').eq('key', 'hardware_stock').maybeSingle(),
  ])
  const parts: Record<string, { no: string; method: string }> = {}
  for (const r of rows ?? []) parts[r.sig] = { no: String(r.part_no), method: TOM_METHOD[r.machine] ?? 'Milling' }
  const { analysis, chunks } = await parsed.analyze(parts, stock?.value ?? null)
  onProgress('Saving the bolt table and guide')
  const dir = `${sub.id}/${uploadId}`
  await pool(chunks, 4, async (c, i) => {
    await supabase.storage.from('parts').upload(`${dir}/guide-${i}.json.gz`, await gzip(JSON.stringify(c, half)), { contentType: 'application/gzip' })
  })
  const path = `${dir}/analysis.json.gz`
  const up = await supabase.storage.from('parts').upload(path, await gzip(JSON.stringify(analysis, half)), { contentType: 'application/gzip' })
  if (up.error) throw new Error(up.error.message)
  await supabase.from('step_uploads').update({ analysis_path: path }).eq('id', uploadId)
}

/** Runs a few uploads at a time. */
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

const ORDER = (m: string) => MACHINES.indexOf(fromMethod(m))

export async function uploadStep(fileList: File[], sub: Subsystem, existing: Part[], who: Who, onProgress: (t: string) => void): Promise<UploadResult> {
  const steps = fileList.filter((f) => /\.(step|stp)$/i.test(f.name))
  if (!steps.length) return { error: 'No STEP files there. Export the assembly from Onshape as STEP.' }
  let parsed: Parsed
  try {
    parsed = await parse(steps, onProgress)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  try {
    return await afterParse(parsed, steps, sub, existing, who, onProgress)
  } finally {
    parsed.close()
  }
}

async function afterParse(parsed: Parsed, steps: File[], sub: Subsystem, existing: Part[], who: Who, onProgress: (t: string) => void): Promise<UploadResult> {
  const { items, skipped } = parsed
  if (!items.length) return { error: skipped.length ? "None of these files could be read as STEP." : 'No parts found in this file. Export the assembly, not a single Part Studio.' }

  // One assembly file is kept for the bolt table and assembly guide later. Loose part files are
  // not: they carry no positions, so those two can't use them anyway.
  const single = steps.length === 1 ? steps[0] : null
  const label = single ? single.name : `${steps.length} part files`
  let stepPath = ''
  if (single) {
    onProgress('Saving the STEP file')
    const path = `${sub.id}/${Date.now()}-${fileSafe(single.name)}`
    const up = await supabase.storage.from('step').upload(path, single, { contentType: 'application/step' })
    if (!up.error) stepPath = path
  }
  const file = { name: label }
  const { data: upload, error: upErr } = await supabase
    .from('step_uploads')
    .insert({ subsystem_id: sub.id, path: stepPath, filename: label, size: steps.reduce((s, f) => s + f.size, 0), uploaded_by: who.userId, uploaded_by_name: who.name, part_count: items.length })
    .select()
    .single()
  if (upErr) return { error: upErr.message }

  // ----- Match -----
  const live = existing.slice()
  const used = new Set<string>()
  const bySig = new Map(live.map((p) => [p.sig, p]))
  const byName = new Map<string, Part[]>()
  for (const p of live) {
    const k = p.name.trim().toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), p])
  }

  type Plan = { item: WorkerPart; part?: Part; kind: 'same' | 'changed' | 'new' }
  const plans: Plan[] = items.map((item) => {
    const s = bySig.get(item.sig)
    if (s && !used.has(s.id)) {
      used.add(s.id)
      return { item, part: s, kind: s.qty !== item.qty ? 'changed' : 'same' }
    }
    const n = (byName.get(item.name.trim().toLowerCase()) ?? []).find((p) => !used.has(p.id))
    if (n) {
      used.add(n.id)
      return { item, part: n, kind: 'changed' }
    }
    return { item, kind: 'new' }
  })
  const gone = live.filter((p) => !used.has(p.id) && p.status !== 'cancelled')

  // New parts: next free numbers, by machine then size, as Tom's tool numbers them.
  const base = sub.number * 1000
  let nextNo = Math.max(base, ...live.map((p) => p.part_no)) + 1
  const fresh = plans
    .filter((p) => p.kind === 'new')
    .sort((a, b) => ORDER(a.item.method) - ORDER(b.item.method) || (b.item.size[0] ?? 0) - (a.item.size[0] ?? 0) || a.item.name.localeCompare(b.item.name))
  const numbers = new Map<Plan, number>()
  for (const p of fresh) numbers.set(p, nextNo++)

  // ----- Files: geometry for drawings, STEP for printed parts -----
  const files = new Map<Plan, { geometry?: string; step?: string }>()
  const needFiles = plans.filter((p) => p.kind !== 'same' || !p.part?.geometry_path)
  let done = 0
  await pool(needFiles, 6, async (p, i) => {
    const out: { geometry?: string; step?: string } = {}
    const key = `${sub.id}/${upload.id}/${i}`
    if (p.item.geometry) {
      const r = await supabase.storage.from('parts').upload(`${key}.json.gz`, await gzip(p.item.geometry), { contentType: 'application/gzip' })
      if (!r.error) out.geometry = `${key}.json.gz`
    }
    if (p.item.step) {
      const r = await supabase.storage.from('parts').upload(`${key}.step`, new Blob([p.item.step], { type: 'application/step' }))
      if (!r.error) out.step = `${key}.step`
    }
    files.set(p, out)
    onProgress(`Saving parts ${++done}/${needFiles.length}`)
  })

  // ----- Database -----
  onProgress('Updating the part list')
  const link = (id: string) => `/manufacturing/p/${id}`
  const subLink = `/manufacturing/s/${sub.id}`
  const errors: string[] = []

  const newRows = fresh.map((p) => {
    const machine = p.item.custom ? fromMethod(p.item.method) : 'Bought'
    const f = files.get(p) ?? {}
    return {
      subsystem_id: sub.id,
      part_no: numbers.get(p)!,
      sig: p.item.sig,
      name: p.item.name,
      qty: p.item.qty,
      machine,
      material: guessMaterial(machine, p.item.cls, p.item.size, p.item.name),
      size: p.item.size.map((v) => Math.round(v * 100) / 100),
      cls: p.item.cls,
      bad: p.item.bad,
      notes: p.item.bad ? 'Geometry could not be read' : '',
      drawn_by: who.name,
      geometry_path: f.geometry ?? null,
      step_path: f.step ?? null,
      last_upload_id: upload.id,
    }
  })
  if (newRows.length) {
    const { data, error } = await supabase.from('parts').insert(newRows).select('id')
    if (error) errors.push(error.message)
    else await Promise.all((data ?? []).map((r) => logPart(r.id, 'added', who, { file: file.name })))
  }

  const toLead: string[] = []
  await pool(
    plans.filter((p) => p.part),
    6,
    async (p) => {
      const part = p.part!
      const f = files.get(p) ?? {}
      const patch: Partial<Part> = { last_upload_id: upload.id, drawn_by: who.name }
      if (f.geometry) patch.geometry_path = f.geometry
      if (f.step) patch.step_path = f.step
      if (part.status === 'cancelled') patch.status = 'todo'
      if (p.kind === 'changed') {
        Object.assign(patch, { sig: p.item.sig, qty: p.item.qty, size: p.item.size.map((v) => Math.round(v * 100) / 100), cls: p.item.cls, bad: p.item.bad })
        if (part.released_at) {
          patch.changed = true
          toLead.push(`${part.part_no} ${part.name}`)
          await notify([part.maker_id, sub.lead_id], 'part_changed', `${part.part_no} ${part.name} changed in CAD after it was released`, link(part.id), who.userId)
        }
        await logPart(part.id, 'changed', who, { file: file.name, qty: p.item.qty !== part.qty ? [part.qty, p.item.qty] : undefined })
      }
      const { error } = await supabase.from('parts').update(patch).eq('id', part.id)
      if (error) errors.push(error.message)
    },
  )

  if (gone.length) {
    const { error } = await supabase
      .from('parts')
      .update({ status: 'cancelled' })
      .in(
        'id',
        gone.map((p) => p.id),
      )
    if (error) errors.push(error.message)
    for (const p of gone) {
      await logPart(p.id, 'cancelled', who, { reason: 'not in the new STEP', file: file.name })
      if (p.status === 'doing' || p.status === 'done')
        await notify([sub.lead_id, p.maker_id], 'part_gone', `${p.part_no} ${p.name} is gone from the CAD but was ${p.status === 'done' ? 'already made' : 'in progress'}`, link(p.id), who.userId)
    }
  }

  const summary: UploadSummary = {
    added: fresh.length,
    changed: plans.filter((p) => p.kind === 'changed').length,
    same: plans.filter((p) => p.kind === 'same').length,
    gone: gone.length,
    bad: items.filter((i) => i.bad).length,
    skipped: skipped.length,
  }
  await supabase.from('step_uploads').update({ summary }).eq('id', upload.id)
  if (toLead.length > 3) await notify([sub.lead_id], 'upload', `${toLead.length} released parts changed in the new STEP`, subLink, who.userId)
  if (single) {
    try {
      await saveAnalysis(parsed, sub, upload.id, onProgress)
    } catch (e) {
      errors.push(`Parts saved, but the bolt table and guide failed: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (errors.length) return { summary, error: errors[0] }
  return { summary }
}
