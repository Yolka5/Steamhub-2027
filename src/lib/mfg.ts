import { KERF } from './stock'
import { supabase } from './supabase'

// Manufacturing model: robots, subsystems and parts. See MANUFACTURING.md.

export type Machine = 'CNC' | 'Mill' | 'Lathe' | '3D print' | 'Bought'
export type PartStatus = 'todo' | 'doing' | 'done' | 'cancelled' | 'missing'

/** Also the order part numbers are handed out in on the first upload. */
export const MACHINES: Machine[] = ['CNC', 'Mill', 'Lathe', '3D print', 'Bought']
export const MADE: Machine[] = ['CNC', 'Mill', 'Lathe', '3D print']

export const STATUS_WORD: Record<PartStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
  missing: 'Missing',
}

export const BOUGHT_WORD: Record<PartStatus, string> = {
  todo: 'Needed',
  doing: 'Needed',
  done: 'Got it',
  cancelled: 'Cancelled',
  missing: 'Missing',
}

export const statusWord = (p: Pick<Part, 'machine' | 'status'>) => (p.machine === 'Bought' ? BOUGHT_WORD : STATUS_WORD)[p.status]

/** Common materials, as the team writes them. The field takes anything. */
export const MATERIALS = [
  'Aluminum 1',
  'Aluminum 1.5',
  'Aluminum 2',
  'Aluminum 3',
  'Aluminum 4',
  'Aluminum 5',
  'Aluminum 6',
  'Aluminum 6.35',
  'Aluminum 8',
  'Aluminum 10',
  'Aluminum block',
  'Aluminum tube',
  'Aluminum profile',
  'Polycarb 2',
  'Polycarb 3',
  'Polycarb 5',
  'Steel',
  'Delrin',
  'HDPE',
  'Wood 18',
  'PLA',
  'PETG',
  'PA-CF',
  'TPU',
]

export interface Profile {
  id: string
  name: string
  email: string | null
  avatar: string | null
  is_admin: boolean
  banned: boolean
  created_at: string
}

export interface Robot {
  id: string
  name: string
  season: number
  created_by: string | null
  created_at: string
  archived: boolean
}

export interface Subsystem {
  id: string
  robot_id: string
  number: number
  name: string
  lead_id: string | null
  assembled: boolean
  created_at: string
}

export interface Part {
  id: string
  subsystem_id: string
  part_no: number
  sig: string
  name: string
  qty: number
  machine: Machine
  material: string
  size: number[]
  cls: string | null
  status: PartStatus
  released_at: string | null
  released_by: string | null
  urgent: boolean
  maker_id: string | null
  maker_name: string | null
  drawn_by: string | null
  notes: string
  changed: boolean
  bad: boolean
  geometry_path: string | null
  step_path: string | null
  own_pdf_path: string | null
  /** The plate a CNC part was cut from. */
  plate_id: string | null
  /** The stock piece reserved for a tube, rod or hex part; cut when the part is done. */
  piece_id: string | null
  last_upload_id: string | null
  created_at: string
  updated_at: string
}

export interface Upload {
  id: string
  subsystem_id: string
  path: string
  filename: string
  size: number | null
  uploaded_by: string | null
  uploaded_by_name: string | null
  uploaded_at: string
  part_count: number | null
  summary: UploadSummary | null
  /** Bolt table and guide, for single assembly files. */
  analysis_path: string | null
}

export interface UploadSummary {
  added: number
  changed: number
  gone: number
  same: number
  bad: number
  /** Files in a folder upload that couldn't be read. */
  skipped?: number
}

export interface Who {
  userId: string
  name: string
}

/** The one place the part number format lives. The old sheet used 2230-26-FB-0216. */
export const partNo = (p: Pick<Part, 'part_no'>) => String(p.part_no)

export const fmtMm = (v: number) => {
  const r = Math.round(v * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export const sizeText = (s: number[]) => s.map(fmtMm).join(' × ')

/**
 * A bar part's length and cross-section. Round parts have two equal sides (the diameter), and the
 * third is the length even when it's the shortest, like a spacer 18 across and 3 long.
 */
export function barDims(size: number[]): { length: number; section: [number, number] } {
  const s = size.map(Number).sort((a, b) => b - a)
  if (Math.abs(s[1] - s[2]) < 0.05) return { length: s[0], section: [s[1], s[2]] }
  if (Math.abs(s[0] - s[1]) < 0.05) return { length: s[2], section: [s[0], s[1]] }
  return { length: s[0], section: [s[1], s[2]] }
}

/** Cut length for all of a part's copies from one piece: every copy plus a saw cut between them. */
export const stockLength = (p: Pick<Part, 'size' | 'qty'>) => {
  const len = barDims(p.size).length
  return Math.round((len * p.qty + KERF * (p.qty - 1)) * 10) / 10
}

/** Tom's methods to Steamhub's machines. */
export const fromMethod = (m: string): Machine =>
  (({ CNC: 'CNC', Milling: 'Mill', Lathe: 'Lathe', '3D print': '3D print', Bought: 'Bought' }) as Record<string, Machine>)[m] ?? 'Mill'

/** Plate thicknesses in the team's stock sheet (mm). */
export const PLATE_THICKNESS = [0.5, 1, 1.2, 1.5, 1.524, 2, 3, 4, 5, 6, 6.35, 8, 10]

/**
 * A first guess. The STEP doesn't carry Onshape's material, so the uploader fixes it when it's
 * wrong; the Onshape API replaces this later (phase 6).
 */
export function guessMaterial(machine: Machine, cls: string | null, size: number[], name: string): string {
  if (machine === 'Bought') return ''
  if (machine === '3D print') return /tpu/i.test(name) ? 'TPU' : 'PLA'
  const thin = Math.min(...size.filter((v) => v > 0))
  const poly = /poly|lexan|pc\b|polycarb/i.test(name)
  if (cls === 'plate' && Number.isFinite(thin)) {
    if (thin > 12) return 'Aluminum block'
    // Snap to a thickness the team actually stocks; otherwise say the real one.
    const near = PLATE_THICKNESS.reduce((a, b) => (Math.abs(b - thin) < Math.abs(a - thin) ? b : a))
    const t = Math.abs(near - thin) <= 0.2 ? near : thin
    return `${poly ? 'Polycarb' : 'Aluminum'} ${t === 1.524 ? '1.524' : t === 6.35 ? '6.35' : fmtMm(t)}`
  }
  if (cls === 'tube') return /profile|extrusion/i.test(name) ? 'Aluminum profile' : 'Aluminum tube'
  if (cls === 'block') return 'Aluminum block'
  return 'Aluminum'
}

// ---------- Actions ----------

type Res<T> = { data?: T; error?: string }

export async function logPart(partId: string, action: string, who: Who, details?: Record<string, unknown>) {
  await supabase.from('part_events').insert({ part_id: partId, action, by_id: who.userId, by_name: who.name, details: details ?? null })
}

export async function notify(userIds: (string | null | undefined)[], kind: string, text: string, link: string, except?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== except))]
  if (!ids.length) return
  await supabase.from('notifications').insert(ids.map((user_id) => ({ user_id, kind, text, link })))
}

export async function updatePart(id: string, patch: Partial<Part>): Promise<Res<Part>> {
  const { data, error } = await supabase.from('parts').update(patch).eq('id', id).select().single()
  return error ? { error: error.message } : { data: data as Part }
}

export async function updateParts(ids: string[], patch: Partial<Part>): Promise<Res<Part[]>> {
  const { data, error } = await supabase.from('parts').update(patch).in('id', ids).select()
  return error ? { error: error.message } : { data: data as Part[] }
}

export async function releaseParts(parts: Part[], who: Who) {
  const ids = parts.filter((p) => !p.released_at).map((p) => p.id)
  if (!ids.length) return { data: [] as Part[] }
  const res = await updateParts(ids, { released_at: new Date().toISOString(), released_by: who.userId })
  if (!res.error) await Promise.all(ids.map((id) => logPart(id, 'released', who)))
  return res
}

export async function claimPart(p: Part, who: Who) {
  const res = await updatePart(p.id, { maker_id: who.userId, maker_name: who.name, status: 'doing' })
  if (!res.error) await logPart(p.id, 'claimed', who)
  return res
}

export async function setStatus(p: Part, status: PartStatus, who: Who) {
  const patch: Partial<Part> = { status }
  // Finishing a part nobody claimed still records who made it.
  if (status === 'done' && !p.maker_id && p.machine !== 'Bought') Object.assign(patch, { maker_id: who.userId, maker_name: who.name })
  const res = await updatePart(p.id, patch)
  if (res.error) return res
  await logPart(p.id, `status_${status}`, who)
  // Bought parts: missing goes on Uri's wishlist once; got it takes it off.
  if (p.machine === 'Bought' && status === 'missing') {
    const { data: open } = await supabase.from('wishlist').select('id').eq('part_id', p.id).eq('status', 'open').limit(1)
    if (!open?.length)
      await supabase.from('wishlist').insert({ item: p.name, qty: p.qty, subsystem_id: p.subsystem_id, part_id: p.id, asked_by: who.userId, asked_by_name: who.name })
  }
  if (p.machine === 'Bought' && status === 'done') await supabase.from('wishlist').update({ status: 'bought' }).eq('part_id', p.id).eq('status', 'open')
  return res
}

export async function createRobot(name: string, season: number, who: Who, copyFrom?: string): Promise<Res<Robot>> {
  const { data, error } = await supabase.from('robots').insert({ name, season, created_by: who.userId }).select().single()
  if (error) return { error: error.message }
  if (copyFrom) {
    const { data: subs } = await supabase.from('subsystems').select('number, name, lead_id').eq('robot_id', copyFrom)
    if (subs?.length) await supabase.from('subsystems').insert(subs.map((s) => ({ ...s, robot_id: data.id })))
  }
  return { data: data as Robot }
}

export async function createSubsystem(robotId: string, number: number, name: string, leadId: string | null): Promise<Res<Subsystem>> {
  const { data, error } = await supabase.from('subsystems').insert({ robot_id: robotId, number, name, lead_id: leadId }).select().single()
  if (error) return { error: error.code === '23505' ? `This robot already has a subsystem ${number}.` : error.message }
  return { data: data as Subsystem }
}

// ---------- Files ----------

export async function gzip(text: string): Promise<Blob> {
  const cs = new CompressionStream('gzip')
  const stream = new Blob([text]).stream().pipeThrough(cs)
  return new Response(stream).blob()
}

export async function gunzip(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

export async function download(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) throw new Error(error?.message ?? 'Download failed')
  return data
}

/** Hands a file to the browser to save. */
export function saveFile(name: string, data: Blob | Uint8Array | string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export const fileSafe = (s: string) => s.replace(/[^\w.\- ]+/g, '_').trim()

// ---------- Time ----------

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
