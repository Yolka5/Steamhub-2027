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

/** What everyone may read about an account. Emails are for the admin only (admin_people). */
export const PROFILE_COLUMNS = 'id, name, avatar, is_admin, banned, shared, room, workshop_lead, created_at'

export interface Profile {
  id: string
  name: string
  /** Only from admin_people(), for the admin's People page. */
  email?: string | null
  avatar: string | null
  is_admin: boolean
  banned: boolean
  /** The shared workshop PC account: Start asks who's making the part. */
  shared?: boolean
  /** Where a shared PC stands. 'cnc' gets the CNC Home; null is the workshop. */
  room?: 'cnc' | null
  /** Hands out parts on the board (WORKSHOP_TASKS.md). Admins can too. */
  workshop_lead?: boolean
  created_at: string
}

export interface Robot {
  id: string
  name: string
  season: number
  created_by: string | null
  created_at: string
  archived: boolean
  /** 1 for V1, 2 for V2… of its season. Test and practice robots have none. */
  version: number | null
  /** An off-season project: its year, but never the season's robot. Missing until the migration runs. */
  offseason?: boolean
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
  /** When it went In progress. Kept by a database trigger; the workshop map reads it. */
  started_at: string | null
  /** Who the workshop lead gave it to (WORKSHOP_TASKS.md). */
  assignee_id: string | null
  assigned_at: string | null
  assigned_by: string | null
  /** The lead's order inside the person's list; smaller is sooner. */
  queue_pos: number | null
  /** When it was finished, kept by the database. The board keeps done parts for 12 hours. */
  done_at: string | null
  /** The workshop lead sent it back before making it: why, who, when. Release clears it. */
  rejected_note: string | null
  rejected_by: string | null
  rejected_at: string | null
  /** An "Ask first" question is waiting for an answer. */
  asking: boolean
  /** "Done, with a note": what was made differently, for assembly. */
  made_differently: string | null
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

/**
 * A hex bar's across-flats and length, or null when it isn't hex. Across corners is across flats
 * × 2/√3 (12.7 hex is 14.7 across corners). Any two sides can be the hex, so a short spacer
 * (12.7 hex, 5 long) is found as well as a long shaft.
 */
export function hexDims(size: number[]): { flats: number; length: number } | null {
  const s = size.map(Number)
  // Two equal sides is a round section (a 12.7 rod 14.7 long would otherwise look like hex).
  if (Math.abs(s[0] - s[1]) < 0.05 || Math.abs(s[0] - s[2]) < 0.05 || Math.abs(s[1] - s[2]) < 0.05) return null
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      if (i === j || !(s[j] > 0)) continue
      if (Math.abs(s[i] / s[j] - 2 / Math.sqrt(3)) < 0.02) return { flats: s[j], length: s[3 - i - j] }
    }
  return null
}

/** Onshape's own names for parts nobody named: "Part 1", "Part 17", "Body 2". */
export const isDefaultName = (name: string) => /^\s*(part|body|solid)[\s_-]*\d+\s*$/i.test(name)

/**
 * The name to show. A part still called "Part 1" gets a name from its shape and size instead, so
 * the workshop list never shows six different "Part 1"s. The stored name stays as it came from the
 * STEP, because a re-upload matches parts by that name.
 */
export function partName(p: Pick<Part, 'name' | 'cls' | 'size'> & { part_no?: number; machine?: Machine }): string {
  // "3035 - Wheels Shaft" numbered 3035 shows as "Wheels Shaft": the number is already beside it.
  if (p.part_no != null) {
    const m = /^\s*(\d{3,5})\s*[-–_. ]\s*(\S.*)$/.exec(p.name)
    if (m && Number(m[1]) === p.part_no) return m[2].trim()
  }
  if (!isDefaultName(p.name) || !p.size?.length) return p.name
  const s = p.size.map(Number).sort((a, b) => b - a)
  const { length, section } = barDims(s)
  const [w, h] = section
  // Steamhub: the CNC cuts everything from plate or block, so a long CNC part reads as a plate, as
  // its drawing does (drawing.ts).
  const cls = p.machine === 'CNC' && p.cls !== 'print' ? 'plate' : p.cls
  // Hex first: a short hex spacer is classed as a block by its proportions.
  const hex = cls !== 'plate' && cls !== 'print' ? hexDims(s) : null
  if (hex) return `Hex ${fmtMm(hex.flats)}, ${fmtMm(hex.length)} long`
  switch (cls) {
    case 'plate': {
      // Over 12 mm it's cut from a block, as the material guess says.
      if (s[2] > 12) return `Block ${sizeText(s)}`
      return `Plate ${fmtMm(plateThickness(s))} mm, ${fmtMm(s[0])} × ${fmtMm(s[1])}`
    }
    case 'tube':
      return `Tube ${fmtMm(w)} × ${fmtMm(h)}, ${fmtMm(length)} long`
    case 'round':
      return `Round Ø${fmtMm(w)}, ${fmtMm(length)} long`
    case 'long':
      return `Bar ${fmtMm(w)} × ${fmtMm(h)}, ${fmtMm(length)} long`
    case 'print':
      return `Printed part ${sizeText(s)}`
    case 'block':
      return `Block ${sizeText(s)}`
    default:
      return `Part ${sizeText(s)}`
  }
}

/** Cut length for all of a part's copies from one piece: every copy plus a saw cut between them. */
export const stockLength = (p: Pick<Part, 'size' | 'qty'>) => {
  const len = hexDims(p.size)?.length ?? barDims(p.size).length
  return Math.round((len * p.qty + KERF * (p.qty - 1)) * 10) / 10
}

/** Tom's methods to Steamhub's machines. */
export const fromMethod = (m: string): Machine =>
  (({ CNC: 'CNC', Milling: 'Mill', Lathe: 'Lathe', '3D print': '3D print', Bought: 'Bought' }) as Record<string, Machine>)[m] ?? 'Mill'

/**
 * The plate a part is cut from: its thinnest side, snapped to a thickness the team stocks (6.35,
 * not 6.4) when it's within 0.2 mm, like the material guess.
 */
export function plateThickness(size: number[]): number {
  const t = Math.min(...size.map(Number))
  const near = PLATE_THICKNESS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a))
  return Math.abs(near - t) <= 0.2 ? near : Math.round(t * 100) / 100
}

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

/** One history row per part, all in one request when there are many (a release, an upload). */
export async function logPart(partIds: string | string[], action: string, who: Who, details?: Record<string, unknown>) {
  const ids = Array.isArray(partIds) ? partIds : [partIds]
  if (!ids.length) return
  await supabase.from('part_events').insert(ids.map((part_id) => ({ part_id, action, by_id: who.userId, by_name: who.name, details: details ?? null })))
}

export async function notify(userIds: (string | null | undefined)[], kind: string, text: string, link: string, except?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== except))]
  if (!ids.length) return
  await supabase.from('notifications').insert(ids.map((user_id) => ({ user_id, kind, text, link })))
}

export async function updatePart(id: string, patch: Partial<Part>, expect?: Partial<Pick<Part, 'status'>>): Promise<Res<Part>> {
  let q = supabase.from('parts').update(patch).eq('id', id)
  // Only if it's still as the person saw it, so two people tapping Start can't both get the part.
  if (expect?.status) q = q.eq('status', expect.status)
  const { data, error } = await q.select().maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Someone else just changed this part. It shows their change now.' }
  return { data: data as Part }
}

export async function updateParts(ids: string[], patch: Partial<Part>): Promise<Res<Part[]>> {
  const { data, error } = await supabase.from('parts').update(patch).in('id', ids).select()
  return error ? { error: error.message } : { data: data as Part[] }
}

export async function releaseParts(parts: Part[], who: Who) {
  const fresh = parts.filter((p) => !p.released_at)
  const ids = fresh.map((p) => p.id)
  if (!ids.length) return { data: [] as Part[] }
  // Releasing again clears a rejection: the responsible person fixed it.
  const res = await updateParts(ids, { released_at: new Date().toISOString(), released_by: who.userId, rejected_note: null, rejected_by: null, rejected_at: null })
  if (!res.error) {
    await logPart(ids, 'released', who)
    // The workshop lead hears there's something to hand out (bought parts aren't handed out).
    const made = fresh.filter((p) => p.machine !== 'Bought')
    if (made.length) {
      const { data: sub } = await supabase.from('subsystems').select('number, name').eq('id', made[0].subsystem_id).maybeSingle()
      const where = sub ? ` in ${sub.number} ${sub.name}` : ''
      await notify(await workshopLeads(), 'released', `${made.length} ${made.length === 1 ? 'part' : 'parts'} released${where}, waiting to be handed out`, '/manufacturing/board', who.userId)
    }
  }
  return res
}

/** Who a part is credited to when it isn't the signed-in account (the shared workshop PC). */
export interface Maker {
  /** Null for a name typed in that has no account. */
  id: string | null
  name: string
}

export async function claimPart(p: Part, who: Who, maker?: Maker) {
  const m = maker ?? { id: who.userId, name: who.name }
  const patch: Partial<Part> = { maker_id: m.id, maker_name: m.name, status: 'doing' }
  // Starting an unassigned part grabs it: it joins the maker's list (a typed-in name has no list).
  if (!p.assignee_id && m.id && p.status === 'todo') Object.assign(patch, { assignee_id: m.id, assigned_at: new Date().toISOString() })
  const res = await updatePart(p.id, patch, { status: p.status })
  // The event keeps the account that tapped Start; `for` says who is really making it.
  if (!res.error) await logPart(p.id, 'claimed', who, maker ? { for: maker.name } : undefined)
  return res
}

export async function setStatus(p: Part, status: PartStatus, who: Who) {
  const patch: Partial<Part> = { status }
  // Finishing a part nobody claimed still records who made it.
  if (status === 'done' && !p.maker_id && p.machine !== 'Bought') {
    // An assigned part is made by the person it's assigned to, whoever taps Done.
    const name = p.assignee_id ? await personName(p.assignee_id) : null
    Object.assign(patch, p.assignee_id && name ? { maker_id: p.assignee_id, maker_name: name } : { maker_id: who.userId, maker_name: who.name })
  }
  const res = await updatePart(p.id, patch, { status: p.status })
  if (res.error) return res
  await logPart(p.id, `status_${status}`, who)
  if (status === 'done' && p.assignee_id) await tellIfEmpty(p.assignee_id, who)
  // Bought parts: missing goes on Uri's wishlist once; got it takes it off.
  if (p.machine === 'Bought' && status === 'missing') {
    const { data: open } = await supabase.from('wishlist').select('id').eq('part_id', p.id).eq('status', 'open').limit(1)
    if (!open?.length)
      await supabase.from('wishlist').insert({ item: partName(p), qty: p.qty, subsystem_id: p.subsystem_id, part_id: p.id, asked_by: who.userId, asked_by_name: who.name })
  }
  if (p.machine === 'Bought' && status === 'done') await supabase.from('wishlist').update({ status: 'bought' }).eq('part_id', p.id).eq('status', 'open')
  return res
}

/** "2027 V2" is version 2. Test robots ("Test robot (intake)") have none. */
export const versionIn = (name: string) => {
  const m = /\bv(\d{1,2})\b/i.exec(name)
  return m ? Number(m[1]) : null
}

export async function createRobot(
  name: string,
  season: number,
  who: Who,
  copyFrom?: string,
  /** Subsystems typed in at setup, used when nothing is copied. */
  subsystems?: { number: number; name: string; lead_id: string | null }[],
  offseason = false,
): Promise<Res<Robot>> {
  // An off-season project never counts as a V robot, even with "v2" in its name.
  const version = offseason ? null : versionIn(name)
  const { data, error } = await supabase
    .from('robots')
    .insert({ name, season, version, created_by: who.userId, ...(offseason ? { offseason } : {}) })
    .select()
    .single()
  if (error) return { error: error.code === '23505' ? `This season already has a V${version}. Someone may have just made it.` : error.message }
  let subs = subsystems ?? []
  if (copyFrom) {
    const { data: from } = await supabase.from('subsystems').select('number, name, lead_id').eq('robot_id', copyFrom)
    subs = from ?? []
  }
  if (subs.length) {
    const { error: e } = await supabase.from('subsystems').insert(subs.map((s) => ({ ...s, robot_id: data.id })))
    if (e) return { data: data as Robot, error: `${name} was made, but its subsystems weren't: ${e.message}` }
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

// ---------- Workshop tasks (WORKSHOP_TASKS.md) ----------

/** The board keeps a done part for this long after Done. */
export const DONE_KEEP_MS = 12 * 3600_000

/** Parts the workshop hands out: released, made in house, still around. */
export const isTask = (p: Part) => !!p.released_at && p.machine !== 'Bought' && p.status !== 'cancelled' && p.status !== 'missing'
export const isOpen = (p: Part) => p.status === 'todo' || p.status === 'doing'
export const doneRecently = (p: Part, now = Date.now()) => p.status === 'done' && !!p.done_at && now - Date.parse(p.done_at) < DONE_KEEP_MS

/** A person's list: in progress first, then urgent, then the lead's order, then part number. */
export function queueSort(a: Part, b: Part) {
  const rank = (p: Part) => (p.status === 'doing' ? 0 : p.urgent ? 1 : 2)
  return rank(a) - rank(b) || (a.queue_pos ?? Infinity) - (b.queue_pos ?? Infinity) || a.part_no - b.part_no
}

const firstName = (name: string) => name.split(' ')[0]

async function personName(id: string) {
  const { data } = await supabase.from('profiles').select('name').eq('id', id).maybeSingle()
  return (data?.name as string | undefined) ?? null
}

/** Workshop leads, who hear about releases and give-backs. With none set, the admins. */
export async function workshopLeads(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id, workshop_lead, is_admin, banned')
  const rows = (data ?? []) as { id: string; workshop_lead: boolean; is_admin: boolean; banned: boolean }[]
  const leads = rows.filter((r) => r.workshop_lead && !r.banned)
  return (leads.length ? leads : rows.filter((r) => r.is_admin && !r.banned)).map((r) => r.id)
}

/** "Noam has nothing left": the moment the lead needs to hand out more. */
async function tellIfEmpty(personId: string, who: Who) {
  const { count } = await supabase
    .from('parts')
    .select('id', { count: 'exact', head: true })
    .eq('assignee_id', personId)
    .in('status', ['todo', 'doing'])
    .neq('machine', 'Bought')
  if (count !== 0) return
  const name = (await personName(personId)) ?? 'Someone'
  await notify(await workshopLeads(), 'list_empty', `${firstName(name)} has nothing left to make`, '/manufacturing/board', who.userId)
}

/** The end of a person's list, for parts handed to them now. */
async function lastPos(personId: string) {
  const { data } = await supabase.from('parts').select('queue_pos').eq('assignee_id', personId).not('queue_pos', 'is', null).order('queue_pos', { ascending: false }).limit(1)
  return (data?.[0]?.queue_pos as number | undefined) ?? 0
}

async function inBatches<T, R>(items: T[], run: (x: T) => Promise<R>, size = 8): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))))
  return out
}

/**
 * Hands parts to a person, at the end of their list in part-number order, or at `at` (a queue
 * position, for a card dropped between two others). Leads and admins only; the database checks.
 */
export async function assignParts(parts: Part[], person: { id: string; name: string }, who: Who, at?: number): Promise<Res<Part[]>> {
  const list = parts.filter((p) => p.assignee_id !== person.id || at !== undefined).sort((a, b) => a.part_no - b.part_no)
  if (!list.length) return { data: [] }
  let pos = at ?? (await lastPos(person.id))
  const now = new Date().toISOString()
  const results = await inBatches(list, (p) => {
    pos = at ?? pos + 1
    return updatePart(p.id, { assignee_id: person.id, assigned_at: now, assigned_by: who.userId, queue_pos: pos })
  })
  const failed = results.find((r) => r.error)
  const saved = results.flatMap((r) => (r.data ? [r.data] : []))
  const moved = list.filter((p) => saved.some((s) => s.id === p.id))
  if (moved.length) {
    await logPart(
      moved.map((p) => p.id),
      'assigned',
      who,
      { to: person.name },
    )
    const fresh = moved.filter((p) => p.assignee_id !== person.id)
    if (fresh.length) {
      const one = fresh.length === 1 ? `${fresh[0].part_no} ${partName(fresh[0])}` : `${fresh.length} parts`
      await notify([person.id], 'assigned', `${firstName(who.name)} gave you ${one}`, '/manufacturing/mine', who.userId)
    }
    await tellPrevious(fresh, `moved to ${firstName(person.name)}`, who)
  }
  return failed ? { error: failed.error, data: saved } : { data: saved }
}

/** Back to Unassigned, by the lead. */
export async function unassignParts(parts: Part[], who: Who): Promise<Res<Part[]>> {
  const list = parts.filter((p) => p.assignee_id)
  if (!list.length) return { data: [] }
  const res = await updateParts(
    list.map((p) => p.id),
    { assignee_id: null, assigned_at: null, assigned_by: null, queue_pos: null },
  )
  if (res.error) return res
  await logPart(
    list.map((p) => p.id),
    'unassigned',
    who,
  )
  await tellPrevious(list, 'unassigned', who)
  return res
}

/** "Itamar moved 3012 to Ari": one note per person who lost parts. */
async function tellPrevious(parts: Part[], what: string, who: Who) {
  const by = new Map<string, Part[]>()
  for (const p of parts) if (p.assignee_id) by.set(p.assignee_id, [...(by.get(p.assignee_id) ?? []), p])
  for (const [id, list] of by) {
    const one = list.length === 1 ? `${list[0].part_no} ${partName(list[0])} was` : `${list.length} of your parts were`
    await notify([id], 'unassigned', `${one} ${what}`, '/manufacturing/mine', who.userId)
  }
}

/** Moves a part inside its person's list, to a queue position between its new neighbours. */
export async function moveInQueue(p: Part, pos: number) {
  return updatePart(p.id, { queue_pos: pos })
}

/** A queue position between two cards (either can be missing at the ends of the list). */
export function between(before: Part | undefined, after: Part | undefined) {
  const a = before?.queue_pos ?? null
  const b = after?.queue_pos ?? null
  if (a == null && b == null) return Date.now() / 1000
  if (a == null) return b! - 1
  if (b == null) return a + 1
  return (a + b) / 2
}

/** The person hands it back: Unassigned and To-do again, and the leads hear about it. */
export async function giveBack(p: Part, who: Who): Promise<Res<Part>> {
  const owner = p.assignee_id
  const res = await updatePart(p.id, { assignee_id: null, assigned_at: null, assigned_by: null, queue_pos: null, status: 'todo', maker_id: null, maker_name: null })
  if (res.error) return res
  await logPart(p.id, 'gave_back', who)
  const name = owner ? ((await personName(owner)) ?? who.name) : who.name
  await notify(await workshopLeads(), 'gave_back', `${firstName(name)} gave back ${p.part_no} ${partName(p)}`, '/manufacturing/board', who.userId)
  if (owner) await tellIfEmpty(owner, who)
  return res
}

// ---------- Pushback: reject, ask first, done with a note (WORKSHOP_TASKS.md) ----------

export type RequestKind = 'ask' | 'done_note' | 'reject'
export type RequestStatus = 'open' | 'approved' | 'denied' | 'info'

export interface PartRequest {
  id: string
  part_id: string
  kind: RequestKind
  note: string
  by_id: string | null
  by_name: string
  /** The person it's really from, when the shared PC asks for them. */
  for_id: string | null
  status: RequestStatus
  answer: string | null
  answered_by: string | null
  answered_by_name: string | null
  answered_at: string | null
  created_at: string
}

/** Who a part's notes go to: whoever released it, and the subsystem lead if that's someone else. */
export async function responsibleFor(p: Pick<Part, 'released_by' | 'subsystem_id'>) {
  const { data } = await supabase.from('subsystems').select('lead_id').eq('id', p.subsystem_id).maybeSingle()
  return [...new Set([p.released_by, (data?.lead_id as string | null | undefined) ?? null].filter((x): x is string => !!x))]
}

async function addRequest(p: Part, kind: RequestKind, note: string, by: { id: string | null; name: string }, who: Who, status: RequestStatus) {
  const { error } = await supabase
    .from('part_requests')
    .insert({ part_id: p.id, kind, note, by_id: who.userId, by_name: by.name, for_id: by.id, status })
  return error?.message
}

const label = (p: Part) => `${p.part_no} ${partName(p)}`

/**
 * The workshop lead sends a part back before it's made: off the workshop list, back to In design
 * on its subsystem page with the note, until it's released again.
 */
export async function rejectPart(p: Part, note: string, who: Who): Promise<Res<Part>> {
  const to = await responsibleFor(p)
  const res = await updatePart(
    p.id,
    { released_at: null, rejected_note: note, rejected_by: who.userId, rejected_at: new Date().toISOString(), assignee_id: null, assigned_at: null, assigned_by: null, queue_pos: null, asking: false },
    { status: 'todo' },
  )
  if (res.error) return res
  await addRequest(p, 'reject', note, { id: who.userId, name: who.name }, who, 'info')
  await logPart(p.id, 'rejected', who, { note })
  await notify(to, 'part_rejected', `${firstName(who.name)} rejected ${label(p)}: ${note}`, `/manufacturing/p/${p.id}`, who.userId)
  if (p.assignee_id) await notify([p.assignee_id], 'unassigned', `${label(p)} was sent back to design: ${note}`, `/manufacturing/p/${p.id}`, who.userId)
  return res
}

/** "Can I make it this way?": a question to the responsible people before starting. */
export async function askFirst(p: Part, note: string, who: Who, by?: Maker): Promise<Res<Part>> {
  const asker = by ?? { id: who.userId, name: who.name }
  const err = await addRequest(p, 'ask', note, asker, who, 'open')
  if (err) return { error: err }
  const res = await updatePart(p.id, { asking: true })
  if (res.error) return res
  await logPart(p.id, 'asked', who, by ? { for: by.name, note } : { note })
  await notify(await responsibleFor(p), 'part_ask', `${firstName(asker.name)} asks about ${label(p)}: ${note}`, `/manufacturing/p/${p.id}`, who.userId)
  return res
}

/** Go ahead, or make it as drawn. The asker hears back. */
export async function answerAsk(p: Part, r: PartRequest, ok: boolean, answer: string, who: Who): Promise<Res<Part>> {
  const { error } = await supabase
    .from('part_requests')
    .update({ status: ok ? 'approved' : 'denied', answer: answer || null, answered_by: who.userId, answered_by_name: who.name, answered_at: new Date().toISOString() })
    .eq('id', r.id)
    .eq('status', 'open')
  if (error) return { error: error.message }
  // Still asking if someone else has another open question on this part.
  const { count } = await supabase.from('part_requests').select('id', { count: 'exact', head: true }).eq('part_id', p.id).eq('status', 'open')
  const res = await updatePart(p.id, { asking: !!count })
  if (res.error) return res
  await logPart(p.id, ok ? 'ask_approved' : 'ask_denied', who, answer ? { note: answer } : undefined)
  const text = ok ? `Go ahead with ${label(p)} your way` : `Make ${label(p)} as drawn`
  await notify([r.for_id ?? r.by_id], 'part_answer', `${firstName(who.name)}: ${text}${answer ? `. ${answer}` : ''}`, `/manufacturing/p/${p.id}`, who.userId)
  return res
}

/** Finished, but not quite as drawn: done, flagged for assembly, and the responsible people told. */
export async function doneWithNote(p: Part, note: string, who: Who): Promise<Res<Part>> {
  const res = await setStatus(p, 'done', who)
  if (res.error || !res.data) return res
  const flagged = await updatePart(p.id, { made_differently: note })
  if (flagged.error) return flagged
  const maker = res.data.maker_name ?? who.name
  await addRequest(p, 'done_note', note, { id: res.data.maker_id, name: maker }, who, 'info')
  await notify(await responsibleFor(p), 'part_done_note', `${firstName(maker)} made ${label(p)} differently: ${note}`, `/manufacturing/p/${p.id}`, who.userId)
  return flagged
}

/** A part's questions and notes, newest first. */
export async function partRequests(partId: string) {
  const { data } = await supabase.from('part_requests').select('*').eq('part_id', partId).order('created_at', { ascending: false })
  return (data as PartRequest[] | null) ?? []
}

// ----- Deleting a robot -----

/** What deleting a robot takes with it, for the confirm sheet. */
export async function robotFootprint(robotId: string) {
  const { data: subs } = await supabase.from('subsystems').select('id').eq('robot_id', robotId)
  const ids = (subs ?? []).map((s) => s.id as string)
  const none = ['00000000-0000-0000-0000-000000000000']
  const of = ids.length ? ids : none
  const [parts, worked, stock, phases] = await Promise.all([
    supabase.from('parts').select('id', { count: 'exact', head: true }).in('subsystem_id', of),
    // Released or made: real work, so the sheet asks for the robot's name.
    supabase.from('parts').select('id', { count: 'exact', head: true }).in('subsystem_id', of).or('released_at.not.is.null,status.eq.done'),
    supabase.from('pieces').select('id', { count: 'exact', head: true }).in('subsystem_id', of).eq('status', 'reserved'),
    supabase.from('cal_phases').select('id', { count: 'exact', head: true }).eq('robot_id', robotId),
  ])
  return { subs: ids.length, parts: parts.count ?? 0, worked: worked.count ?? 0, stock: stock.count ?? 0, phases: phases.count ?? 0 }
}

/** Every file under a folder of a bucket, walking into subfolders. */
async function filesUnder(bucket: string, dir: string): Promise<string[]> {
  const { data } = await supabase.storage.from(bucket).list(dir, { limit: 1000 })
  const out: string[] = []
  for (const f of data ?? []) {
    const p = `${dir}/${f.name}`
    // Folders come back without an id.
    if (f.id) out.push(p)
    else out.push(...(await filesUnder(bucket, p)))
  }
  return out
}

/**
 * Deletes a robot with its subsystems, parts and their history (the database cascades those).
 * Before that: reserved stock goes back on the shelf, open wishlist items for its parts go, and its
 * files leave storage, except geometry the part-label test set still scores the guesser with.
 */
export async function deleteRobot(robotId: string): Promise<{ error?: string }> {
  const { data: subs, error } = await supabase.from('subsystems').select('id').eq('robot_id', robotId)
  if (error) return { error: error.message }
  const ids = (subs ?? []).map((s) => s.id as string)
  if (ids.length) {
    const free = await supabase
      .from('pieces')
      .update({ status: 'available', reserved_by: null, reserved_by_name: null, reserved_for: null, planned_length: null, reserved_at: null, subsystem_id: null })
      .in('subsystem_id', ids)
      .eq('status', 'reserved')
    if (free.error) return { error: free.error.message }
    const wish = await supabase.from('wishlist').delete().in('subsystem_id', ids).eq('status', 'open')
    if (wish.error) return { error: wish.error.message }
  }
  // Files first, while the parts still say which geometry the labels need.
  const { data: parts } = ids.length ? await supabase.from('parts').select('id').in('subsystem_id', ids) : { data: [] }
  const partIds = (parts ?? []).map((p) => p.id as string)
  const keep = new Set<string>()
  for (let i = 0; i < partIds.length; i += 200) {
    const { data } = await supabase.from('part_labels').select('geometry_path').in('part_id', partIds.slice(i, i + 200))
    for (const l of data ?? []) if (l.geometry_path) keep.add(l.geometry_path as string)
  }
  for (const sub of ids) {
    for (const bucket of ['parts', 'step']) {
      const files = (await filesUnder(bucket, sub)).filter((p) => !keep.has(p))
      for (let i = 0; i < files.length; i += 100) await supabase.storage.from(bucket).remove(files.slice(i, i + 100))
    }
  }
  const del = await supabase.from('robots').delete().eq('id', robotId)
  if (del.error) return { error: del.error.message }
  return {}
}
