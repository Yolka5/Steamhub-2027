// Stock model, labels, search parsing and matching. All sizes in mm.

export type Kind = 'round_tube' | 'round_rod' | 'rect_tube' | 'angle' | 'flat' | 'hex' | 'other'
export type Status = 'available' | 'reserved' | 'used'

export interface Piece {
  id: string
  kind: Kind
  material: string | null
  a: number | null
  b: number | null
  wall: number | null
  inner_d: number | null
  length: number
  location: string | null
  status: Status
  reserved_by: string | null
  reserved_by_name: string | null
  reserved_for: string | null
  /** The Manufacturing subsystem it's reserved for, when picked from the list. */
  subsystem_id?: string | null
  /** The prototype it's reserved for, from a prototype's Stock used block. */
  prototype_id?: string | null
  planned_length: number | null
  reserved_at: string | null
  photo_url: string | null
  notes: string | null
  created_at: string
  created_by_name: string | null
  updated_at: string
}

export interface Material {
  name: string
  density: number
}

type Field = 'a' | 'b' | 'wall' | 'inner_d'

export interface KindInfo {
  label: string
  prefix: string
  fields: { key: Field; label: string }[]
}

export const KINDS: Record<Kind, KindInfo> = {
  round_tube: { label: 'Round tube', prefix: 'TB', fields: [{ key: 'a', label: 'OD' }, { key: 'inner_d', label: 'ID' }] },
  round_rod: { label: 'Round rod', prefix: 'TB', fields: [{ key: 'a', label: 'OD' }] },
  rect_tube: {
    label: 'Profile',
    prefix: 'PR',
    fields: [{ key: 'a', label: 'Width' }, { key: 'b', label: 'Height' }, { key: 'wall', label: 'Wall' }],
  },
  angle: {
    label: 'Angle',
    prefix: 'AN',
    fields: [{ key: 'a', label: 'Leg A' }, { key: 'b', label: 'Leg B' }, { key: 'wall', label: 'Thickness' }],
  },
  flat: { label: 'Flat bar', prefix: 'FB', fields: [{ key: 'a', label: 'Width' }, { key: 'wall', label: 'Thickness' }] },
  hex: { label: 'Hex', prefix: 'HX', fields: [{ key: 'a', label: 'Across flats' }, { key: 'inner_d', label: 'Bore' }] },
  other: { label: 'Other', prefix: 'OT', fields: [{ key: 'a', label: 'Size' }] },
}

export const KIND_ORDER: Kind[] = ['round_tube', 'round_rod', 'rect_tube', 'angle', 'flat', 'hex', 'other']

export const KERF = 3

const fmt = (n: number | null) => (n == null ? '?' : String(+n.toFixed(2)))

export function sizeLabel(p: Pick<Piece, 'kind' | 'a' | 'b' | 'wall' | 'inner_d'>): string {
  switch (p.kind) {
    case 'round_tube':
      return `Ø${fmt(p.a)} / ${fmt(p.inner_d)}`
    case 'round_rod':
      return `Ø${fmt(p.a)} solid`
    case 'rect_tube':
      return `${fmt(p.a)} × ${fmt(p.b)} × ${fmt(p.wall)}`
    case 'angle':
      return `L ${fmt(p.a)} × ${fmt(p.b)} × ${fmt(p.wall)}`
    case 'flat':
      return `${fmt(p.a)} × ${fmt(p.wall)}`
    case 'hex':
      return p.inner_d ? `Hex ${fmt(p.a)}, bore ${fmt(p.inner_d)}` : `Hex ${fmt(p.a)}`
    default:
      return p.a ? fmt(p.a) : 'Other'
  }
}

/** Cross-section area in mm². */
export function area(p: Pick<Piece, 'kind' | 'a' | 'b' | 'wall' | 'inner_d'>): number | null {
  const { a, b, wall: w, inner_d: i } = p
  if (a == null) return null
  switch (p.kind) {
    case 'round_tube':
      return i == null ? null : (Math.PI / 4) * (a * a - i * i)
    case 'round_rod':
      return (Math.PI / 4) * a * a
    case 'rect_tube':
      return b == null || w == null ? null : a * b - Math.max(0, a - 2 * w) * Math.max(0, b - 2 * w)
    case 'angle':
      return b == null || w == null ? null : w * (a + b - w)
    case 'flat':
      return w == null ? null : a * w
    case 'hex':
      return (Math.sqrt(3) / 2) * a * a - (i ? (Math.PI / 4) * i * i : 0)
    default:
      return null
  }
}

/** Weight of the whole piece in grams, or null when material density is unknown. */
export function weight(p: Piece, densities: Map<string, number>): number | null {
  const ar = area(p)
  const d = p.material ? densities.get(p.material) : undefined
  if (ar == null || !d) return null
  return (ar * d * p.length) / 1000
}

/** Drive "view" links can't be used in <img>, the thumbnail endpoint can. */
export function photoSrc(url: string | null, width = 800): string | null {
  if (!url) return null
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${width}`
  return url
}

export function needsPhoto(p: Piece): boolean {
  return !p.photo_url || /reshoot|blurry/i.test(p.notes ?? '')
}

// ---------- Search ----------

export interface Query {
  id?: string
  kind?: Kind | 'round'
  a?: number
  b?: number
  wall?: number
  inner?: number
  length?: number
  material?: string
}

const KIND_WORDS: [RegExp, Kind | 'round'][] = [
  [/^(round|tube|tubes|pipe|ø)$/, 'round'],
  [/^(rod|rods|solid|shaft)$/, 'round_rod'],
  [/^(profile|profiles|box|rect|rectangle|square|sq)$/, 'rect_tube'],
  [/^(angle|angles|l)$/, 'angle'],
  [/^(flat|bar|plate|strip)$/, 'flat'],
  [/^(hex)$/, 'hex'],
]

/**
 * Turns "20x40x1 700", "round 20/16 700", "rod 12 300" or "TB-014" into a query.
 * Joined sizes (20x40, 20/16) are cross-sections. With loose numbers, the last one is the length
 * and the ones before it are the cross-section.
 */
export function parseQuery(text: string): Query {
  const q: Query = {}
  const t = text.trim().toLowerCase().replace(/,/g, ' ')
  if (!t) return q

  const idMatch = t.match(/^([a-z]{2})-?(\d{1,4})$/)
  if (idMatch && !KIND_WORDS.some(([re]) => re.test(idMatch[1]))) {
    q.id = `${idMatch[1].toUpperCase()}-${idMatch[2].padStart(3, '0')}`
    return q
  }

  const dims: number[] = []
  const loose: number[] = []
  for (let tok of t.split(/\s+/)) {
    tok = tok.replace(/mm$/, '')
    const kw = KIND_WORDS.find(([re]) => re.test(tok))
    if (kw) {
      q.kind = kw[1]
      continue
    }
    if (/^ø?\d+(\.\d+)?([x×*/]\d+(\.\d+)?)+$/.test(tok)) {
      dims.push(...tok.replace('ø', '').split(/[x×*/]/).map(Number))
      if (tok.includes('/') && !q.kind) q.kind = 'round'
      continue
    }
    if (/^ø?\d+(\.\d+)?$/.test(tok)) {
      loose.push(Number(tok.replace('ø', '')))
      continue
    }
    if (/^(6061|7075|steel|stainless|delrin|pom|nylon|ptfe|carbon|poly)/.test(tok)) q.material = tok
  }

  if (dims.length) {
    if (loose.length) q.length = loose[loose.length - 1]
  } else if (loose.length === 1) {
    q.length = loose[0]
  } else if (loose.length > 1) {
    q.length = loose.pop()
    dims.push(...loose)
  }

  if (dims.length) {
    const roundish = q.kind === 'round' || q.kind === 'round_tube' || q.kind === 'round_rod' || q.kind === 'hex'
    if (roundish || (!q.kind && dims.length === 1)) {
      q.a = dims[0]
      if (dims[1] != null) q.inner = dims[1]
    } else if (q.kind === 'flat') {
      q.a = dims[0]
      if (dims[1] != null) q.wall = dims[1]
    } else {
      q.a = dims[0]
      if (dims[1] != null) q.b = dims[1]
      if (dims[2] != null) q.wall = dims[2]
    }
  }
  return q
}

export function queryIsEmpty(q: Query): boolean {
  return Object.values(q).every((v) => v == null || v === '')
}

const near = (want: number | undefined, have: number | null, tol: number) =>
  want == null || (have != null && Math.abs(want - have) <= tol)

function kindMatches(want: Query['kind'], have: Kind) {
  if (!want) return true
  if (want === 'round') return have === 'round_tube' || have === 'round_rod'
  return want === have
}

/** Cross-section check. Profiles and angles match in either orientation. */
export function fitsSection(q: Query, p: Piece, tol: number): boolean {
  if (!kindMatches(q.kind, p.kind)) return false
  if (q.material && !(p.material ?? '').toLowerCase().includes(q.material)) return false
  if (q.b != null && (p.kind === 'rect_tube' || p.kind === 'angle')) {
    const straight = near(q.a, p.a, tol) && near(q.b, p.b, tol)
    const turned = near(q.a, p.b, tol) && near(q.b, p.a, tol)
    if (!straight && !turned) return false
  } else if (!near(q.a, p.a, tol)) return false
  if (!near(q.wall, p.wall, Math.min(tol, 0.3))) return false
  if (q.inner != null) {
    // Asking for a tube with an ID never matches a solid rod.
    if (p.inner_d == null) return false
    if (!near(q.inner, p.inner_d, tol)) return false
  }
  return true
}

export interface Match {
  piece: Piece
  /** Length left over after the cut, null when no length was asked for. */
  leftover: number | null
}

/**
 * Pieces that fit, smallest leftover first so the shortest piece that works gets used.
 * Only available pieces unless includeTaken is set.
 */
export function findMatches(pieces: Piece[], q: Query, tol: number, includeTaken = false): Match[] {
  if (q.id) {
    return pieces.filter((p) => p.id === q.id).map((piece) => ({ piece, leftover: null }))
  }
  const need = q.length != null ? q.length + KERF : null
  return pieces
    .filter((p) => (includeTaken || p.status === 'available') && fitsSection(q, p, tol))
    .filter((p) => need == null || p.length >= q.length!)
    .map((piece) => ({ piece, leftover: need == null ? null : Math.max(0, piece.length - need) }))
    .sort((x, y) => {
      if (x.piece.status !== y.piece.status) return x.piece.status === 'available' ? -1 : 1
      if (x.leftover != null && y.leftover != null) return x.leftover - y.leftover
      return (x.piece.a ?? 0) - (y.piece.a ?? 0) || x.piece.length - y.piece.length
    })
}

/** Same search with wider size tolerance, minus what already matched. */
export function nearMatches(pieces: Piece[], q: Query, tol: number, exclude: Set<string>): Match[] {
  if (q.id || (q.a == null && q.b == null)) return []
  return findMatches(pieces, q, Math.max(tol * 4, 2)).filter((m) => !exclude.has(m.piece.id)).slice(0, 8)
}

// ---------- Cut list ----------

export interface CutPlan {
  piece: Piece
  cuts: number[]
  leftover: number
}

export interface CutResult {
  plans: CutPlan[]
  unplaced: number[]
}

/**
 * Cuts several lengths from the fewest, shortest pieces. Longest cut first; each goes into the
 * piece where it leaves the least over (best fit), opening a new piece only when none fits.
 * Every cut costs KERF, except one that uses up a piece exactly.
 */
export function planCuts(candidates: Piece[], lengths: number[]): CutResult {
  const pool = [...candidates].sort((a, b) => a.length - b.length)
  const open: { piece: Piece; cuts: number[]; left: number }[] = []
  const unplaced: number[] = []
  const fits = (left: number, len: number) => left >= len + KERF || Math.abs(left - len) < 0.5
  const after = (left: number, len: number) => Math.max(0, left - len - (Math.abs(left - len) < 0.5 ? 0 : KERF))

  for (const len of [...lengths].sort((a, b) => b - a)) {
    let best: (typeof open)[number] | null = null
    for (const o of open) if (fits(o.left, len) && (!best || o.left < best.left)) best = o
    if (!best) {
      const i = pool.findIndex((p) => fits(p.length, len))
      if (i === -1) {
        unplaced.push(len)
        continue
      }
      best = { piece: pool[i], cuts: [], left: pool[i].length }
      pool.splice(i, 1)
      open.push(best)
    }
    best.cuts.push(len)
    best.left = after(best.left, len)
  }
  return { plans: open.map((o) => ({ piece: o.piece, cuts: o.cuts, leftover: o.left })), unplaced }
}

/** "700 x4, 350x2 120" becomes [700,700,700,700,350,350,120]. */
export function parseLengths(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:[x×*]\s*(\d+))?/gi)) {
    const len = Number(m[1].replace(',', '.'))
    const n = m[2] ? Math.min(50, Number(m[2])) : 1
    if (len > 0) for (let i = 0; i < n; i++) out.push(len)
  }
  return out
}
