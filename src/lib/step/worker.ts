import { StepFile, buildProject, buildScene, buildSequence, findJoints, partFrame, renderScene, setHardwareStock, toFrame } from './engine'
import { partStep } from './partStep'

// Parses a whole assembly STEP off the main thread, so the page never freezes.
// Returns one row per distinct part, with its geometry (in its own frame) as JSON for drawings,
// and a standalone STEP for parts that get 3D printed.

export interface WorkerPart {
  sig: string
  name: string
  qty: number
  size: number[]
  custom: boolean
  bad: boolean
  method: string
  /** Machines in order, e.g. Lathe then Mill, and why (classify.js). */
  route: string[]
  why: string
  material: string
  cls: string | null
  geometry: string | null
  step: string | null
}

/** A picture from renderScene, in a W × H box: filled faces, labels, arrows and bolt-hole markers. */
export interface Res {
  ops: { loops: number[][][]; fill: string; stroke: string; w: number }[]
  labels: { text: string; p: number[]; at: number[] }[]
  arrows: { a: number[]; b: number[] }[]
  markers: number[][]
}

export interface AJoint {
  type: string
  size: string
  count: number
  parts: { partNo: string; name: string; sig: string; d: number; len: number; material?: string }[]
  grip: number
  key: string
  note?: string
  tapDepth?: number
  blind?: boolean
  thumb: Res
}

export interface AStep {
  key: string
  phase: string
  title: string
  text: string
  tools: string[]
}

/** Bolt table and assembly guide for one upload. Step pictures live in chunk files of `chunk` steps. */
export interface Analysis {
  v: 1
  steps: AStep[]
  tools: string[]
  joints: AJoint[]
  chunk: number
  W: number
  H: number
  cover: Res
}

export type WorkerMsg =
  | { type: 'progress'; text: string }
  | { type: 'done'; items: WorkerPart[]; rootName: string; skipped: string[] }
  | { type: 'analysis'; analysis: Analysis; chunks: Res[][] }
  | { type: 'error'; message: string }

export interface AnalyzeRequest {
  analyze: { parts: Record<string, { no: string; method: string }>; stock: unknown }
}

const post = (m: WorkerMsg) => (self as unknown as Worker).postMessage(m)

/** Bought parts can be huge (motors). Their geometry is only kept when it is small. */
const MAX_BOUGHT_POINTS = 20000

const round = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v)

/** One file's parts. `single` is a file that holds one part, so it's its own printable STEP. */
async function partsOf(text: string, single: boolean, progress: (t: string) => void, keep = false): Promise<WorkerPart[]> {
  if (!/ISO-10303-21/.test(text.slice(0, 400))) throw new Error("This doesn't look like a STEP file. Export the assembly from Onshape as STEP.")
  const S = new StepFile(text)
  const P = await buildProject(S, {}, progress)
  if (keep) kept = { S, P }
  return P.items.map((it) => {
    let G = it.G
    if (!G && !it.bad) {
      const n = it.g.edges.reduce((s, x) => s + x.pts.length, 0)
      if (n <= MAX_BOUGHT_POINTS) G = toFrame(it.g, partFrame(it.g))
    }
    let step: string | null = null
    if (it.method === '3D print') {
      try {
        step = single && P.items.length === 1 ? text : partStep(S, text, it.pd)
      } catch {
        step = null
      }
    }
    return {
      sig: it.sig,
      name: it.name,
      qty: it.qty,
      size: (G?.size ?? it.size).slice(),
      custom: it.custom,
      bad: !!it.bad,
      method: it.method,
      route: (it as { route?: string[] }).route ?? [],
      why: (it as { why?: string }).why ?? '',
      material: it.material ?? '',
      cls: it.info?.cls ?? null,
      geometry: G ? JSON.stringify({ edges: G.edges, faces: G.faces, size: G.size }, round) : null,
      step,
    }
  })
}

// The last single-file parse, kept so the bolt table and guide can be worked out once the
// upload knows Steamhub's part numbers. Loose part files have no positions, so they get none.
let kept: { S: StepFile; P: Awaited<ReturnType<typeof buildProject>> } | null = null

const PICTURE = { W: 640, H: 400, minPx: 24, maxPts: 16 }
const CHUNK = 12

function analyze(req: AnalyzeRequest['analyze']) {
  if (!kept) throw new Error('Nothing to analyze')
  const { P } = kept
  setHardwareStock(req.stock as Parameters<typeof setHardwareStock>[0])
  // Steamhub's numbers and machines, so joints and steps say 3004, not Tom's 2004.
  for (const it of P.items) {
    const m = req.parts[it.sig]
    if (!m) continue
    it.partNo = m.no
    it.method = m.method
    it.custom = m.method !== 'Bought'
  }
  post({ type: 'progress', text: 'Finding bolts' })
  const scene = buildScene(P as never)
  const joints = findJoints(P as never) as (Omit<AJoint, 'thumb'> & { pts?: number[][]; groups?: unknown; inst?: unknown })[]
  post({ type: 'progress', text: 'Working out the build order' })
  const Q = buildSequence(P as never, scene, joints, {}) as { steps: (AStep & Record<string, unknown>)[]; tools: string[] }
  const zero = (scene as { inst: unknown[] }).inst.map(() => [0, 0, 0])

  const outJoints: AJoint[] = joints.map((j) => {
    const sigs = new Set(j.parts.map((p) => p.sig))
    const cur = new Set((scene as { inst: { sig: string }[] }).inst.map((it, i) => (sigs.has(it.sig) ? i : -1)).filter((i) => i >= 0))
    const thumb = renderScene(scene, { W: 160, H: 110, pad: 4, minPx: 4, maxPts: 12, offsets: zero, current: cur, markers: j.pts || [] }) as Res
    return { type: j.type, size: j.size, count: j.count, parts: j.parts, grip: j.grip, key: j.key, note: j.note, tapDepth: j.tapDepth, blind: j.blind, thumb }
  })

  post({ type: 'progress', text: 'Drawing the guide' })
  const seen = new Map<string, number>()
  const steps: AStep[] = []
  const pics: Res[] = []
  Q.steps.forEach((st, i) => {
    const base = `${st.phase}|${st.title}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    steps.push({ key: n > 1 ? `${base}|${n}` : base, phase: st.phase, title: st.title, text: st.text, tools: (st.tools as string[]) || [] })
    const offsets = (scene as { inst: unknown[] }).inst.map((_, k) => ((st.offsets as Record<number, number[]> | null)?.[k]) || [0, 0, 0])
    pics.push(
      renderScene(scene, {
        ...PICTURE,
        offsets,
        visible: st.final ? null : st.vis,
        current: st.final ? null : st.current,
        labels: st.labels || [],
        arrows: st.arrows || [],
        markers: st.markers || [],
      }) as Res,
    )
    if (i % 20 === 0) post({ type: 'progress', text: `Drawing the guide ${i + 1}/${Q.steps.length}` })
  })
  const cover = renderScene(scene, { ...PICTURE, offsets: zero }) as Res
  const chunks: Res[][] = []
  for (let i = 0; i < pics.length; i += CHUNK) chunks.push(pics.slice(i, i + CHUNK))
  const analysis: Analysis = { v: 1, steps, tools: Q.tools, joints: outJoints, chunk: CHUNK, W: PICTURE.W, H: PICTURE.H, cover }
  post({ type: 'analysis', analysis, chunks })
}

// One assembly file is the normal case. Onshape can also export every part as its own file;
// then each file is one instance, and identical parts are merged into a quantity.
self.onmessage = async (e: MessageEvent<{ files: { name: string; buf: ArrayBuffer }[] } | AnalyzeRequest>) => {
  if ('analyze' in e.data) {
    try {
      analyze(e.data.analyze)
    } catch (err) {
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  try {
    const { files } = e.data
    kept = null
    const dec = new TextDecoder('latin1')
    const merged = new Map<string, WorkerPart>()
    let rootName = files[0]?.name ?? 'Assembly'
    const skipped: string[] = []
    for (let i = 0; i < files.length; i++) {
      const many = files.length > 1
      post({ type: 'progress', text: many ? `Reading file ${i + 1} of ${files.length}` : 'Reading the file' })
      const text = dec.decode(files[i].buf)
      let items: WorkerPart[]
      try {
        items = await partsOf(text, many, many ? () => {} : (t) => post({ type: 'progress', text: t }), !many)
      } catch (err) {
        // With a folder of part files, one bad file shouldn't sink the rest.
        if (!many) throw err
        skipped.push(files[i].name)
        continue
      }
      for (const it of items) {
        const m = merged.get(it.sig)
        if (m) m.qty += it.qty
        else merged.set(it.sig, it)
      }
      if (!many) rootName = files[0].name
    }
    post({ type: 'progress', text: 'Packing parts' })
    post({ type: 'done', items: [...merged.values()], rootName, skipped })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
