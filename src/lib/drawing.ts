import { buildPDFz, buildZip, classifyPart, computeViews, makeDrawing, Svg, type Framed, type Info, type TitleBlock } from './step/engine'
import { plateDxf } from './step/dxf'
import { download, fileSafe, gunzip, partName, partNo, saveFile, type Part, type Robot, type Subsystem } from './mfg'

// Drawings are built in the browser from each part's small geometry file, so the title block
// (material, maker) is always current and a phone never has to parse a whole assembly.

export interface Ctx {
  robot: Pick<Robot, 'name'>
  sub: Pick<Subsystem, 'number' | 'name'>
}

const geo = new Map<string, Promise<Framed>>()
const views = new Map<string, { info: Info; pre: unknown }>()

export function loadGeometry(path: string): Promise<Framed> {
  let p = geo.get(path)
  if (!p) {
    p = download('parts', path)
      .then(gunzip)
      .then((t) => JSON.parse(t) as Framed)
    p.catch(() => geo.delete(path))
    geo.set(path, p)
  }
  return p
}

export const canDraw = (p: Part) => !!p.geometry_path && p.machine !== 'Bought'

function titleBlock(p: Part, ctx: Ctx): TitleBlock {
  return {
    team: 'STEAMPUNK 1577',
    subsystem: `${ctx.sub.number} ${ctx.sub.name}`.toUpperCase(),
    name: partName(p),
    partNo: partNo(p),
    version: ctx.robot.name,
    material: p.material,
    tolerance: p.machine === '3D print' ? '±0.15' : '',
    drawnBy: p.drawn_by ?? '',
    maker: p.maker_name ?? '',
    qty: p.qty,
  }
}

async function prepared(p: Part) {
  const G = await loadGeometry(p.geometry_path!)
  // CNC parts are cut from the file, so they all get the plate drawing (width and bearing checks),
  // even a long bar. The machine is part of the key: changing it redraws the part.
  const key = p.geometry_path! + '|' + p.machine
  let v = views.get(key)
  if (!v) {
    const info = p.machine === 'CNC' ? { cls: 'plate' as const } : classifyPart(G, p.name)
    v = { info, pre: computeViews(G, info) }
    views.set(key, v)
  }
  return { G, ...v }
}

export async function partDrawing(p: Part, ctx: Ctx) {
  const { G, info, pre } = await prepared(p)
  return makeDrawing(G, info, titleBlock(p, ctx), pre)
}

/** A page that stands in for a part with no drawing, so the printed stack stays complete. */
function placeholder(p: Part) {
  const d = new Svg()
  d.text(20, 140, `${partNo(p)}  ${partName(p)}  x${p.qty}`, 9)
  d.text(20, 125, p.machine === 'Bought' ? 'Bought part, no drawing.' : 'No drawing: drop the STEP file again on the subsystem page.', 5)
  return d
}

export async function batchPdf(parts: Part[], ctx: Ctx, onProgress?: (done: number, total: number) => void) {
  const pages = []
  let i = 0
  for (const p of parts) {
    pages.push(canDraw(p) ? (await partDrawing(p, ctx)).doc : placeholder(p))
    onProgress?.(++i, parts.length)
    // Give the page a breath between heavy parts so the progress text updates.
    await new Promise((r) => setTimeout(r, 0))
  }
  return buildPDFz(pages, `${ctx.robot.name} ${ctx.sub.number} ${ctx.sub.name}`)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export async function savePdf(parts: Part[], ctx: Ctx, onProgress?: (done: number, total: number) => void) {
  const bytes = await batchPdf(parts, ctx, onProgress)
  const name = parts.length === 1 ? `${partNo(parts[0])} ${partName(parts[0])}` : `${ctx.robot.name} ${ctx.sub.number} ${ctx.sub.name} ${stamp()}`
  saveFile(`${fileSafe(name)}.pdf`, bytes, 'application/pdf')
}

export async function partDxfText(p: Part) {
  const G = await loadGeometry(p.geometry_path!)
  return plateDxf(G)
}

export async function saveDxf(parts: Part[], ctx: Ctx) {
  return saveDxfAs(parts, `${ctx.robot.name} ${ctx.sub.number} ${ctx.sub.name}`)
}

/** One DXF, or a zip named `${name} DXF <date>` when there are several (the CNC Home zips by plate). */
export async function saveDxfAs(parts: Part[], name: string) {
  if (parts.length === 1) {
    saveFile(`${fileSafe(`${partNo(parts[0])} ${partName(parts[0])}`)}.dxf`, await partDxfText(parts[0]), 'application/dxf')
    return
  }
  const files = []
  for (const p of parts) files.push({ name: `${fileSafe(`${partNo(p)} ${partName(p)}${p.qty > 1 ? ` x${p.qty}` : ''}`)}.dxf`, data: await partDxfText(p) })
  saveFile(`${fileSafe(`${name} DXF ${stamp()}`)}.zip`, buildZip(files), 'application/zip')
}

export async function saveStep(p: Part) {
  const blob = await download('parts', p.step_path!)
  saveFile(`${fileSafe(`${partNo(p)} ${partName(p)}`)}.step`, blob, 'application/step')
}
