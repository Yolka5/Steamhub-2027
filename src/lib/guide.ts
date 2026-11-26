import { useCallback, useEffect, useState } from 'react'
import { download, gunzip } from './mfg'
import { jointHardware, setHardwareStock, textW } from './step/engine'
import type { AJoint, Analysis, Res } from './step/worker'
import { supabase } from './supabase'

// The screw table's joints, read from what the upload saved (see upload.ts, saveAnalysis).
// Pictures are vector data drawn into SVG.

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
  nut: 'Screw and nut',
  tap: 'Screw into a tap',
  rivet: 'Rivet',
  shaft: 'Shaft-end screw',
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
