import { cutPiece, reservePiece } from './actions'
import { loadGeometry } from './drawing'
import { barDims, hexDims, logPart, notify, partName, stockLength, type Part, type Subsystem, type Who } from './mfg'
import { tubeWall } from './step/engine'
import { fitsSection, KERF, sizeLabel, type Piece, type Query } from './stock'
import { supabase } from './supabase'

// Which stock piece each bar part (tube, rod, hex) is cut from.
//
// A reservation is for a subsystem. Parts point at a piece with `piece_id`, and one piece can
// feed several parts: its planned length is every linked part's cut plus a saw cut between them.
// Every STEP upload links reserved pieces to parts that fit, rechecks the links it already has,
// and drops links that stopped fitting. Done cuts only that part's length; the piece stays
// reserved until its last part is cut.

/** Still needs its stock cut. Done parts were cut already; cancelled ones don't need any. */
export const isOpen = (p: Pick<Part, 'status'>) => p.status !== 'done' && p.status !== 'cancelled'

/** Mill and Lathe parts can come from bar stock; the rest never do. */
export const barMachine = (p: Pick<Part, 'machine'>) => p.machine === 'Mill' || p.machine === 'Lathe'

/** Round and hex bar has to be the size; a profile can be off a little. */
export const tolFor = (q: Query) => (q.kind === 'rect_tube' ? 0.5 : 0.2)

/** What to look for in stock, from the part's shape alone. Null when it isn't cut from bar stock. */
export function barQuery(p: Pick<Part, 'machine' | 'size' | 'qty' | 'cls'>, wall?: number): Query | null {
  if (!barMachine(p) || !p.size?.length) return null
  const {
    section: [y, z],
  } = barDims(p.size)
  const length = stockLength(p)
  if (p.cls === 'tube') return { kind: 'rect_tube', a: y, b: z, wall: wall ? Math.round(wall * 100) / 100 : undefined, length }
  const hex = hexDims(p.size)
  if (hex) return { kind: 'hex', a: hex.flats, length }
  // Round when the section is a circle and it's turned; a milled square bar isn't round stock.
  if (Math.abs(y - z) < 0.05 && (p.cls === 'round' || p.machine === 'Lathe')) return { kind: 'round', a: y, length }
  return null
}

/** The same, with a tube's wall read from its geometry so 20×40×1 and 20×40×2 don't mix. */
export async function stockQuery(p: Part): Promise<Query | null> {
  if (p.cls !== 'tube' || !p.geometry_path) return barQuery(p)
  let wall: number | undefined
  try {
    wall = tubeWall(await loadGeometry(p.geometry_path)) ?? undefined
  } catch {
    wall = undefined
  }
  return barQuery(p, wall)
}

/** Length a piece needs for these cuts: each cut, plus a saw cut between them. */
export function plannedFor(lengths: number[]): number | null {
  if (!lengths.length) return null
  return Math.round((lengths.reduce((s, l) => s + l, 0) + KERF * (lengths.length - 1)) * 10) / 10
}

/** What's left on a piece after these cuts. Below zero means they don't fit. */
export function freeAfter(pieceLength: number, lengths: number[]): number {
  if (!lengths.length) return pieceLength
  return Math.round((pieceLength - plannedFor(lengths)! - KERF) * 10) / 10
}

/** Whether one more cut fits next to the ones already planned. A cut that uses the piece up exactly fits. */
export const roomFor = (pieceLength: number, lengths: number[], len: number) => pieceLength - plannedFor([...lengths, len])! >= -0.05

/** The subsystem's label, as reservations typed by hand carry it. */
const labelOf = (sub: Pick<Subsystem, 'number' | 'name'>) => `${sub.number} ${sub.name}`.trim().toLowerCase()

/** Reserved for this subsystem: picked from the list, or typed with the same name. Prototype stock is never matched. */
export function reservedFor(piece: Piece, sub: Pick<Subsystem, 'id' | 'number' | 'name'>) {
  if (piece.status !== 'reserved' || piece.prototype_id) return false
  if (piece.subsystem_id) return piece.subsystem_id === sub.id
  return piece.reserved_for?.trim().toLowerCase() === labelOf(sub)
}

/** Open parts on each piece, from a subsystem's part list. */
export function linksByPiece(parts: Part[], except?: string): Map<string, Part[]> {
  const m = new Map<string, Part[]>()
  for (const p of parts) {
    if (!p.piece_id || !isOpen(p) || p.id === except) continue
    m.set(p.piece_id, [...(m.get(p.piece_id) ?? []), p])
  }
  return m
}

export interface Choice {
  piece: Piece
  /** Parts already cut from it. */
  shared: Part[]
  /** Left on the piece after this part's cut. */
  left: number
}

/**
 * Pieces this part could be cut from: first ones already reserved for the subsystem with room
 * left (the reserver's own first, then least waste), then available stock, least waste first.
 */
export function choicesFor(part: Part, q: Query, pieces: Piece[], subParts: Part[], sub: Subsystem, me?: string): { reserved: Choice[]; available: Choice[] } {
  const need = stockLength(part)
  const links = linksByPiece(subParts, part.id)
  const section = { ...q, length: undefined }
  const tol = tolFor(q)
  const reserved: Choice[] = []
  const available: Choice[] = []
  for (const piece of pieces) {
    if (piece.id === part.piece_id || !fitsSection(section, piece, tol)) continue
    const shared = links.get(piece.id) ?? []
    const lens = shared.map(stockLength)
    if (!roomFor(piece.length, lens, need)) continue
    const c = { piece, shared, left: Math.max(0, freeAfter(piece.length, [...lens, need])) }
    if (reservedFor(piece, sub)) reserved.push(c)
    else if (piece.status === 'available') available.push(c)
  }
  const mine = (c: Choice) => (me && c.piece.reserved_by === me ? 0 : 1)
  reserved.sort((a, b) => mine(a) - mine(b) || a.left - b.left)
  available.sort((a, b) => a.left - b.left)
  return { reserved, available: available.slice(0, 4) }
}

// ---------- Writes ----------

type Res = { part?: Part; piece?: Piece; error?: string }

/** Open parts linked to a piece, in any subsystem. */
async function openOn(pieceId: string, except?: string) {
  let q = supabase.from('parts').select('id, part_no, name, size, qty, cls, status').eq('piece_id', pieceId).not('status', 'in', '(done,cancelled)')
  if (except) q = q.neq('id', except)
  const { data } = await q
  return (data ?? []) as Pick<Part, 'id' | 'part_no' | 'name' | 'size' | 'qty' | 'cls' | 'status'>[]
}

/** Sets each piece's planned length from the open parts linked to it. */
export async function syncPlanned(ids: (string | null | undefined)[]) {
  const out: Piece[] = []
  for (const id of new Set(ids.filter((x): x is string => !!x))) {
    const on = await openOn(id)
    const { data } = await supabase.from('pieces').update({ planned_length: plannedFor(on.map(stockLength)) }).eq('id', id).eq('status', 'reserved').select().maybeSingle()
    if (data) out.push(data as Piece)
  }
  return out
}

/** Cut this part from that piece. Available stock gets reserved for the subsystem on the way. */
export async function linkPart(part: Part, piece: Piece, sub: Subsystem, who: Who): Promise<Res & { pieces?: Piece[] }> {
  const need = stockLength(part)
  if (piece.status === 'available') {
    const r = await reservePiece(piece.id, who, `${sub.number} ${sub.name}`, need, sub.id)
    if (r.error) return { error: r.error }
  } else if (!reservedFor(piece, sub)) {
    return { error: `${piece.id} is reserved for something else now. Pick another piece.` }
  } else {
    const on = await openOn(piece.id, part.id)
    if (!roomFor(piece.length, on.map(stockLength), need))
      return { error: `${piece.id} hasn't got ${need} mm left after the parts already on it. Pick another piece.` }
  }
  const { data, error } = await supabase.from('parts').update({ piece_id: piece.id }).eq('id', part.id).select().single()
  if (error) return { error: error.message }
  await logPart(part.id, 'stock_linked', who, { piece: piece.id, cut: need })
  // A piece typed in by name gets the subsystem, so the next upload finds it without the name.
  if (!piece.subsystem_id) await supabase.from('pieces').update({ subsystem_id: sub.id }).eq('id', piece.id)
  const pieces = await syncPlanned([piece.id, part.piece_id])
  return { part: data as Part, pieces }
}

/** The part no longer comes from its piece. The piece stays reserved for the subsystem. */
export async function unlinkPart(part: Part, who: Who, reason?: string): Promise<Res & { pieces?: Piece[] }> {
  if (!part.piece_id) return { part }
  const { data, error } = await supabase.from('parts').update({ piece_id: null }).eq('id', part.id).select().single()
  if (error) return { error: error.message }
  await logPart(part.id, 'stock_unlinked', who, { piece: part.piece_id, reason })
  const pieces = await syncPlanned([part.piece_id])
  return { part: data as Part, pieces }
}

/** A machine that never uses bar stock lets go of the piece. */
export async function afterMachineChange(part: Part, who: Who) {
  if (!part.piece_id || barMachine(part)) return { part, pieces: [] as Piece[] }
  return unlinkPart(part, who, `machine changed to ${part.machine}`)
}

/** Released or used up from the Stock page: its parts let go. Returns them so Undo can put them back. */
export async function unlinkAll(pieceId: string, who: Who, reason: string): Promise<string[]> {
  const on = await openOn(pieceId)
  if (!on.length) return []
  const ids = on.map((p) => p.id)
  await supabase.from('parts').update({ piece_id: null }).in('id', ids)
  await logPart(ids, 'stock_unlinked', who, { piece: pieceId, reason })
  return ids
}

export async function relinkAll(pieceId: string, partIds: string[], who: Who) {
  if (!partIds.length) return []
  await supabase.from('parts').update({ piece_id: pieceId }).in('id', partIds)
  await logPart(partIds, 'stock_linked', who, { piece: pieceId })
  return syncPlanned([pieceId])
}

export interface CutForPart {
  piece?: Piece
  part?: Part
  leftover?: number
  /** Other parts still to be cut from the leftover. */
  keptFor?: number
  /** Why nothing was cut. */
  skipped?: string
  error?: string
}

/**
 * The part is done: cut its length off its piece. Nothing is cut when the piece isn't reserved for
 * it anymore or is too short, so a part never eats someone else's stock. While other parts still
 * need the piece, the leftover stays reserved for them.
 */
export async function cutForPart(part: Part, piece: Piece | undefined, who: Who): Promise<CutForPart> {
  if (!part.piece_id) return {}
  const need = stockLength(part)
  const drop = async (why: string): Promise<CutForPart> => {
    const r = await unlinkPart(part, who, why)
    return { part: r.part, skipped: `${part.piece_id} wasn't cut: ${why}. If you cut it anyway, cut it on its Stock page.` }
  }
  if (!piece || piece.status !== 'reserved') return drop("it isn't reserved anymore")
  if (piece.subsystem_id && piece.subsystem_id !== part.subsystem_id) return drop("it's reserved for another subsystem now")
  if (piece.length < need - 0.05) return drop(`it's ${piece.length} mm and this part needs ${need} mm`)

  const others = await openOn(piece.id, part.id)
  const keep = others.length && piece.length - need - KERF > 0 ? { planned: plannedFor(others.map(stockLength)) } : undefined
  const res = await cutPiece(piece, need, who, { part: `${part.part_no} ${partName(part)}`, keep })
  if (res.error) return { error: res.error }
  // The link is spent: a later "Not done yet" then Done mustn't cut it again.
  const { data } = await supabase.from('parts').update({ piece_id: null }).eq('id', part.id).select().single()
  await logPart(part.id, 'stock_cut', who, { piece: piece.id, cut: need, leftover: res.leftover })
  return { piece: res.piece, part: (data as Part) ?? undefined, leftover: res.leftover, keptFor: keep ? others.length : 0 }
}

// ---------- Matching ----------

export interface StockMatch {
  linked: number
  unlinked: number
  /** Bar parts with no stock after matching. */
  missing: number
}

/**
 * Links reserved stock to the subsystem's bar parts. Runs after every upload, and after stock is
 * reserved for the subsystem. Links that still fit stay; the planned length follows the CAD.
 */
export async function matchStock(sub: Subsystem, who: Who): Promise<StockMatch> {
  const [{ data: partRows }, { data: pieceRows }] = await Promise.all([
    supabase.from('parts').select('*').eq('subsystem_id', sub.id),
    supabase.from('pieces').select('*').eq('status', 'reserved').is('prototype_id', null),
  ])
  const parts = (partRows ?? []) as Part[]
  const pool = ((pieceRows ?? []) as Piece[]).filter((p) => reservedFor(p, sub))
  const byId = new Map(pool.map((p) => [p.id, p]))
  // Linked pieces that aren't in the pool anymore (released, used, moved to another subsystem).
  const lost = [...new Set(parts.map((p) => p.piece_id).filter((id): id is string => !!id && !byId.has(id)))]

  const queries = new Map<string, Query | null>()
  await Promise.all(parts.filter((p) => isOpen(p)).map(async (p) => queries.set(p.id, await stockQuery(p))))

  // Where every part stands now, and why links go.
  const target = new Map<string, string | null>(parts.map((p) => [p.id, p.piece_id]))
  const why = new Map<string, string>()
  const drop = (p: Part, reason: string) => {
    target.set(p.id, null)
    why.set(p.id, reason)
  }
  for (const p of parts) {
    if (!p.piece_id) continue
    if (p.status === 'done') continue
    if (p.status === 'cancelled') drop(p, 'the part is gone from the CAD')
    else if (!queries.get(p.id)) drop(p, "it isn't cut from bar stock anymore")
    else if (lost.includes(p.piece_id)) drop(p, "the piece isn't reserved for this subsystem anymore")
    else {
      const q = queries.get(p.id)!
      if (!fitsSection({ ...q, length: undefined }, byId.get(p.piece_id)!, tolFor(q))) drop(p, 'its size changed in the CAD')
    }
  }
  // Too much on one piece now (a part got longer): the longest goes and gets matched again.
  const on = (pieceId: string) => parts.filter((p) => isOpen(p) && target.get(p.id) === pieceId)
  for (const piece of pool) {
    let list = on(piece.id)
    while (list.length && freeAfter(piece.length, list.map(stockLength)) < -KERF - 0.05) {
      const longest = list.reduce((a, b) => (stockLength(b) > stockLength(a) ? b : a))
      drop(longest, `it's ${stockLength(longest)} mm now and doesn't fit on ${piece.id} with the other parts`)
      list = on(piece.id)
    }
  }

  // Parts without stock get the best fit: the uploader's own reservations first, then least waste.
  const waiting = parts
    .filter((p) => isOpen(p) && queries.get(p.id) && !target.get(p.id))
    .sort((a, b) => stockLength(b) - stockLength(a))
  for (const p of waiting) {
    const q = queries.get(p.id)!
    const need = stockLength(p)
    let best: { piece: Piece; rank: number; left: number } | null = null
    for (const piece of pool) {
      if (!fitsSection({ ...q, length: undefined }, piece, tolFor(q))) continue
      const lens = on(piece.id).map(stockLength)
      if (!roomFor(piece.length, lens, need)) continue
      const rank = piece.reserved_by === who.userId ? 0 : 1
      const left = freeAfter(piece.length, [...lens, need])
      if (!best || rank < best.rank || (rank === best.rank && left < best.left)) best = { piece, rank, left }
    }
    if (best) target.set(p.id, best.piece.id)
  }

  // ----- Save -----
  const changed = parts.filter((p) => target.get(p.id) !== p.piece_id)
  let linked = 0
  let unlinked = 0
  for (const p of changed) {
    const to = target.get(p.id) ?? null
    const { error } = await supabase.from('parts').update({ piece_id: to }).eq('id', p.id)
    if (error) continue
    if (to) {
      linked++
      await logPart(p.id, 'stock_linked', who, { piece: to, cut: stockLength(p), auto: true })
    } else {
      unlinked++
      await logPart(p.id, 'stock_unlinked', who, { piece: p.piece_id, reason: why.get(p.id) })
      // The person who reserved it hears about it when it's their piece and nobody else is looking.
      const piece = byId.get(p.piece_id!)
      if (piece && isOpen(p))
        await notify(
          [piece.reserved_by],
          'stock_unlinked',
          `${piece.id} no longer goes to ${p.part_no} ${partName(p)}: ${why.get(p.id)}. It needs ${stockLength(p)} mm of ${sizeLabel(piece)}.`,
          `/manufacturing/s/${sub.id}`,
          who.userId,
        )
    }
  }
  const touched = new Set([...changed.map((p) => p.piece_id), ...changed.map((p) => target.get(p.id))].filter((x): x is string => !!x))
  // Pieces whose parts got longer or shorter keep their links but need a new planned length too.
  for (const p of parts) if (p.piece_id && target.get(p.id) === p.piece_id && isOpen(p)) touched.add(p.piece_id)
  const named = pool.filter((p) => !p.subsystem_id && [...target.values()].includes(p.id)).map((p) => p.id)
  if (named.length) await supabase.from('pieces').update({ subsystem_id: sub.id }).in('id', named)
  await syncPlanned([...touched])

  const missing = parts.filter((p) => isOpen(p) && queries.get(p.id) && !target.get(p.id)).length
  return { linked, unlinked, missing }
}

/**
 * A cut typed in on the Stock page. When it's for one of the linked parts, that part's link is
 * spent; while other parts still need the piece, the leftover stays reserved for them.
 */
export async function cutByHand(
  piece: Piece,
  final: number,
  forPart: Pick<Part, 'id' | 'part_no' | 'name' | 'size' | 'qty' | 'cls'> | null,
  users: Pick<Part, 'id' | 'size' | 'qty'>[],
  who: Who,
) {
  const rest = users.filter((u) => u.id !== forPart?.id)
  const keep = rest.length ? { planned: plannedFor(rest.map(stockLength)) } : undefined
  const res = await cutPiece(piece, final, who, { part: forPart ? `${forPart.part_no} ${partName(forPart)}` : undefined, keep })
  if (res.error || !forPart) return res
  await supabase.from('parts').update({ piece_id: null }).eq('id', forPart.id)
  await logPart(forPart.id, 'stock_cut', who, { piece: piece.id, cut: final, leftover: res.leftover })
  return res
}
