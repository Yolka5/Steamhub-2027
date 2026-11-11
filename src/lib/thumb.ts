import { classifyPart, isoView, projectView } from './step/engine'
import { loadGeometry } from './drawing'

// Small line-art pictures of parts for lists, so a row says which part it is without opening it.
// One iso view from the part's geometry file, no title block or dimensions. Geometry paths are
// unique per upload, so a thumbnail never goes stale and can be kept on the device.

const KEY = 'thumb:'
const memory = new Map<string, Promise<string | null>>()

// Building a view parses geometry and hides lines, so only a couple run at once.
let running = 0
const waiting: (() => void)[] = []
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await job()
  } finally {
    running--
    waiting.shift()?.()
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

async function build(path: string, name: string): Promise<string | null> {
  const G = await loadGeometry(path)
  // Same corner the drawing's iso view uses: plates from one side, everything else the other.
  const pv = projectView(G, isoView(classifyPart(G, name).cls !== 'plate'))
  const [x0, y0, x1, y1] = pv.bb
  const w = x1 - x0
  const h = y1 - y0
  if (!(w > 0) || !(h > 0)) return null
  // Square box, part centred, a little margin. Y flips because drawings are y-up.
  const side = Math.max(w, h) * 1.08
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const k = 100 / side
  const d = pv.vis
    .map((L) => L.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(50 + (x - cx) * k)} ${r1(50 - (y - cy) * k)}`).join(''))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
}

/**
 * Pictures are about 3.5 KB each and the browser gives about 5 MB, shared with the sign-in
 * session. So only the newest MAX are kept; older ones are rebuilt if they're needed again.
 */
const MAX = 300
const INDEX = 'thumb-index'
function keep(path: string, svg: string) {
  try {
    const saved = localStorage.getItem(INDEX)
    // Pictures kept before the index existed join it, so they can be let go too.
    const start: string[] = saved ? JSON.parse(saved) : Object.keys(localStorage).filter((k) => k.startsWith(KEY)).map((k) => k.slice(KEY.length))
    const order = start.filter((p) => p !== path)
    order.push(path)
    for (const old of order.splice(0, Math.max(0, order.length - MAX))) localStorage.removeItem(KEY + old)
    localStorage.setItem(KEY + path, svg)
    localStorage.setItem(INDEX, JSON.stringify(order))
  } catch {
    /* full or blocked: keep it in memory only */
  }
}

export function partThumb(path: string, name = ''): Promise<string | null> {
  let p = memory.get(path)
  if (p) return p
  try {
    const kept = localStorage.getItem(KEY + path)
    if (kept) {
      p = Promise.resolve(kept)
      memory.set(path, p)
      return p
    }
  } catch {
    /* no storage, build it */
  }
  p = slot(() => build(path, name)).then(
    (svg) => {
      if (svg) keep(path, svg)
      return svg
    },
    () => null,
  )
  memory.set(path, p)
  return p
}
