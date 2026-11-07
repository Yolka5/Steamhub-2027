import { useCallback, useEffect, useState } from 'react'
import { download, gunzip } from './mfg'
import { buildPDFz, jointHardware, setHardwareStock, Svg, textW, wrapText } from './step/engine'
import type { AJoint, Analysis, Res } from './step/worker'
import { supabase } from './supabase'

// Bolt table and assembly guide, read from what the upload saved (see upload.ts, saveAnalysis).
// Pictures are vector data drawn into SVG on screen and into the PDF for printing.

const cache = new Map<string, Promise<unknown>>()
function loadGz<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = download('parts', path)
      .then(gunzip)
      .then((t) => JSON.parse(t) as T)
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

export const loadAnalysis = (path: string) => loadGz<Analysis>(path)
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
export const loadChunk = (analysisPath: string, i: number) => loadGz<Res[]>(`${dirOf(analysisPath)}/guide-${i}.json.gz`)

// ---------- Pictures ----------

const BLUE = '#1a5fb4'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const n = (v: number) => (Math.round(v * 2) / 2).toString()

/** A saved picture as SVG. Paper stays white in both themes, like the printout. */
export function resToSvg(res: Res, W: number, H: number) {
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img"><rect width="${W}" height="${H}" fill="#fbfaf7"/>`]
  for (const o of res.ops)
    parts.push(`<path d="${o.loops.map((L) => 'M' + L.map((q) => `${n(q[0])} ${n(q[1])}`).join('L') + 'Z').join('')}" fill="${o.fill}" fill-rule="evenodd" stroke="${o.stroke}" stroke-width="${o.w}" stroke-linejoin="round"/>`)
  for (const a of res.arrows ?? []) {
    const dx = a.b[0] - a.a[0]
    const dy = a.b[1] - a.a[1]
    const L = Math.hypot(dx, dy)
    if (L < 12) continue
    const ux = dx / L
    const uy = dy / L
    parts.push(
      `<line x1="${n(a.a[0])}" y1="${n(a.a[1])}" x2="${n(a.b[0])}" y2="${n(a.b[1])}" stroke="${BLUE}" stroke-width="1.6" stroke-dasharray="5 4"/>`,
      `<path d="M${n(a.b[0])} ${n(a.b[1])}L${n(a.b[0] - ux * 9 - uy * 4.5)} ${n(a.b[1] - uy * 9 + ux * 4.5)}L${n(a.b[0] - ux * 9 + uy * 4.5)} ${n(a.b[1] - uy * 9 - ux * 4.5)}Z" fill="${BLUE}"/>`,
    )
  }
  for (const q of res.markers ?? []) parts.push(`<circle cx="${n(q[0])}" cy="${n(q[1])}" r="4" fill="${BLUE}" stroke="#fff" stroke-width="1.5"/>`)
  for (const l of res.labels ?? []) {
    const w = textW(l.text, 12) + 10
    parts.push(
      `<line x1="${n(l.p[0])}" y1="${n(l.p[1])}" x2="${n(l.at[0] - 4)}" y2="${n(l.at[1])}" stroke="#2b1d10" stroke-width="0.8"/>`,
      `<circle cx="${n(l.p[0])}" cy="${n(l.p[1])}" r="2.4" fill="#2b1d10"/>`,
      `<rect x="${n(l.at[0] - 3)}" y="${n(l.at[1] - 9)}" width="${n(w)}" height="18" rx="3" fill="#fff" stroke="#2b1d10" stroke-width="0.8"/>`,
      `<text x="${n(l.at[0] + 2)}" y="${n(l.at[1] + 4)}" font-size="12" font-weight="600" font-family="system-ui, sans-serif" fill="#2b1d10">${esc(l.text)}</text>`,
    )
  }
  parts.push('</svg>')
  return parts.join('')
}

// ---------- Hardware ----------

export const JOINT_WORD: Record<string, string> = {
  nut: 'Bolt and nut',
  tap: 'Bolt into a tap',
  rivet: 'Rivet',
  shaft: 'Shaft-end bolt',
  tapOpen: 'Tapped, nothing on it',
  open: 'Open hole',
  none: 'Not fastened',
}

export interface Stock {
  metric?: number[]
  inch?: number[]
  nut?: 'nylock' | 'plain'
  heads?: string
  rivets?: string
  notes?: string
}

export function useHardwareStock() {
  const [stock, setStock] = useState<Stock | null>(null)
  const reload = useCallback(async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'hardware_stock').maybeSingle()
    setStock((data?.value as Stock) ?? {})
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { stock, reload }
}

export async function saveHardwareStock(value: Stock) {
  const { error } = await supabase.from('settings').upsert({ key: 'hardware_stock', value, updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export interface JointRow {
  j: AJoint
  type: string
  hw: { items: [string, number][]; text: string; ok: boolean }
}

/** What each joint gets, with the type someone picked, and the shopping list with 10% spare. */
export function hardwareRows(joints: AJoint[], types: Record<string, string>, stock: Stock | null) {
  setHardwareStock(stock)
  const rows: JointRow[] = joints.map((j) => {
    const type = types[`${j.type}|${j.key}`] ?? (j.type === 'open' || j.type === 'tapOpen' ? 'none' : j.type)
    return { j, type, hw: type === 'none' ? { items: [], text: 'Nothing', ok: true } : jointHardware(j, type) }
  })
  const tot = new Map<string, number>()
  for (const r of rows) for (const [name, q] of r.hw.items) tot.set(name, (tot.get(name) ?? 0) + q * r.j.count)
  const list = [...tot]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, qty]) => ({ name, qty, take: Math.ceil(qty * 1.1) }))
  return { rows, list }
}

// ---------- Guide PDF ----------

/** Tom's guide PDF: a cover with tools and order, then one page per step with its picture. */
export async function guidePdf(a: Analysis, analysisPath: string, title: string, done: Set<string>, onProg?: (t: string) => void) {
  const pages: Svg[] = []
  const pic = (doc: Svg, box: number[], res: Res) => {
    const sx = (box[2] - box[0]) / a.W
    const sy = (box[3] - box[1]) / a.H
    const s = Math.min(sx, sy)
    const T = (q: number[]) => [box[0] + q[0] * s, box[3] - q[1] * s]
    for (const o of res.ops) doc.path(o.loops.map((L) => L.map(T)), o.fill, o.stroke, o.w * s)
    for (const ar of res.arrows ?? []) {
      const p = T(ar.a)
      const q = T(ar.b)
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const L = Math.hypot(dx, dy)
      if (L < 3) continue
      doc.ops.push({ k: 'pl', pts: [p, q], w: 0.45, dash: '1.6,1.2', color: BLUE })
      const ux = dx / L
      const uy = dy / L
      doc.path([[q, [q[0] - ux * 2.4 - uy * 1.2, q[1] - uy * 2.4 + ux * 1.2], [q[0] - ux * 2.4 + uy * 1.2, q[1] - uy * 2.4 - ux * 1.2]]], BLUE, BLUE, 0.1)
    }
    for (const m0 of res.markers ?? []) {
      const q = T(m0)
      const c = Array.from({ length: 12 }, (_, i) => [q[0] + Math.cos((i / 12) * 6.283) * 0.9, q[1] + Math.sin((i / 12) * 6.283) * 0.9])
      doc.path([c], BLUE, '#ffffff', 0.15)
    }
    for (const l of res.labels ?? []) {
      const p = T(l.p)
      const q = T(l.at)
      doc.line(p[0], p[1], q[0] - 1, q[1], 0.2)
      const w = textW(l.text, 3) + 2
      doc.path([[[q[0] - 1, q[1] - 2.2], [q[0] - 1 + w, q[1] - 2.2], [q[0] - 1 + w, q[1] + 2.2], [q[0] - 1, q[1] + 2.2]]], '#ffffff', '#2b1d10', 0.2)
      doc.text(q[0], q[1] - 1, l.text, 3)
    }
    doc.poly([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]], 0.25)
  }
  const header = (d: Svg, page: number) => {
    d.text(12, 200, `Assembly guide: ${title}`, 3.4)
    d.text(285, 200, `STEAMPUNK 1577  ·  page ${page}`, 3, 'end')
    d.line(12, 197, 285, 197, 0.3)
  }

  // Cover
  const cover = new Svg()
  header(cover, 1)
  cover.text(12, 184, 'Assembly guide', 9)
  cover.text(12, 175, title, 5)
  cover.text(12, 168, `${a.steps.length} steps, one for each pair of parts that go together`, 3.4)
  let y = 156
  cover.text(12, y, 'Tools you need', 4.2)
  y -= 6.5
  for (const t of a.tools) {
    cover.text(14, y, `• ${t}`, 3.4)
    y -= 5
  }
  y -= 4
  cover.text(12, y, 'Order', 4.2)
  y -= 6.5
  const phases: { name: string; n: number; first: number }[] = []
  a.steps.forEach((st, i) => {
    const p = phases.find((x) => x.name === st.phase)
    if (p) p.n++
    else phases.push({ name: st.phase, n: 1, first: i + 1 })
  })
  phases.forEach((p, i) => {
    cover.text(14, y, `${i + 1}. ${p.name}  (steps ${p.first}-${p.first + p.n - 1})`, 3.4)
    y -= 5
  })
  cover.text(12, 14, "Grey = already assembled. Orange = this step's part. Blue arrow = where it goes. Blue dots = bolt holes.", 3)
  pic(cover, [130, 20, 285, 190], a.cover)
  pages.push(cover)

  for (let i = 0; i < a.steps.length; i++) {
    const st = a.steps[i]
    if (onProg && i % 6 === 0) {
      onProg(`Making the PDF ${i + 1}/${a.steps.length}`)
      await new Promise((r) => setTimeout(r, 0))
    }
    const res = (await loadChunk(analysisPath, Math.floor(i / a.chunk)))[i % a.chunk]
    const d = new Svg()
    header(d, i + 2)
    d.poly([[12, 182], [18, 182], [18, 188], [12, 188], [12, 182]], 0.4)
    if (done.has(st.key)) d.poly([[13, 185], [14.8, 183], [17.2, 187]], 0.6)
    d.text(22, 182.5, `${i + 1}`, 8)
    d.text(36, 188, st.phase, 3.2)
    const tl = wrapText(st.title, 5.4, 240)
    tl.forEach((L, k) => d.text(36, 181.5 - k * 6.5, L, 5.4))
    let yy = 181.5 - tl.length * 6.5 - 5
    const dl = wrapText(st.text, 3.9, 98)
    dl.forEach((L, k) => d.text(13, yy - k * 5.2, L, 3.9))
    yy -= dl.length * 5.2 + 5
    if (st.tools.length) {
      d.text(13, yy, 'Tools', 3.6)
      yy -= 5
      for (const t of st.tools) {
        d.text(15, yy, `• ${t}`, 3.3)
        yy -= 4.6
      }
    }
    if (res) pic(d, [116, 14, 285, 170], res)
    pages.push(d)
  }
  onProg?.('Compressing')
  return buildPDFz(pages, `Assembly guide ${title}`)
}
