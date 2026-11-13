import type { Machine } from './mfg'

// Shared pieces for the clay room maps (WORKSHOP_MAP.md): the shape a room comes out as, and a
// small kit to build one from boxes, cylinders and profiles in metres. Each room picks its own
// camera: how far height leans sideways (kx, negative leans left), how tall fronts are (ky), and
// how much depth is foreshortened (ys).

export type Face = 't' | 's' | 'w' // top, front (toward the door), the side you see
/** n clay, wall, w2 darker inset, win window, m machine (takes its state colour), m2 machine inset */
export type Tone = 'n' | 'wall' | 'w2' | 'win' | 'm' | 'm2'
export type Spot = 'lathe' | 'mill' | 'stock' | 'saw' | 'cnc' | 'endmills'

export interface Poly {
  points: string
  face: Face
  tone: Tone
}
export interface Shadow {
  points?: string
  ellipse?: [number, number, number, number]
  spot: Spot | null
}
export interface Room {
  name: string
  viewBox: string
  /** Home's mini map: the part of the room where the machines are. */
  miniViewBox: string
  floor: string
  layers: { spot: Spot | null; polys: Poly[] }[]
  shadows: Shadow[]
  anchors: Partial<Record<Spot, [number, number]>>
  entry: [number, number]
  entryLabel: string
  /** Spots with a live machine state. */
  machines: { spot: Spot; machine: Machine }[]
  /** Spots that open a page. */
  links: { spot: Spot; label: string; to: string }[]
}

type Pt = [number, number]
const N = 40
const ANG = Array.from({ length: N }, (_, i) => (2 * Math.PI * i) / N)

function hull(points: Pt[]): Pt[] {
  const seen = new Set<string>()
  const p = points
    .map(([a, b]): Pt => [Math.round(a * 100) / 100, Math.round(b * 100) / 100])
    .filter(([a, b]) => {
      const k = `${a},${b}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = []
  const up: Pt[] = []
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
    lo.push(q)
  }
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
    up.push(q)
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)]
}

/** The camera and drawing tools for one room. Draw back to front; begin()/end() wrap a spot. */
export function roomKit(cam: { s: number; kx: number; ky: number; ys: number; ox: number; oy: number }) {
  const { s: S, kx: KX, ky: KY, ys: YS, ox: OX, oy: OY } = cam
  const layers: Room['layers'] = [{ spot: null, polys: [] }]
  const shadows: Shadow[] = []
  const anchors: Room['anchors'] = {}
  let cur: Spot | null = null

  const P = (x: number, y: number, z = 0): Pt => [OX + x * S + z * S * KX, OY + y * S * YS - z * S * KY]
  const pts = (ps: Pt[]) => ps.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
  const poly = (ps: Pt[], face: Face, tone: Tone) => layers[layers.length - 1].polys.push({ points: pts(ps), face, tone })
  const begin = (spot: Spot, a?: [number, number, number]) => {
    cur = spot
    if (a) anchors[spot] = P(...a)
    layers.push({ spot, polys: [] })
  }
  const end = () => {
    cur = null
    layers.push({ spot: null, polys: [] })
  }

  // A side face shows when it faces you: toward the door (+y), or toward the side you look from.
  const visible = (nx: number, ny: number) => ny * KY * YS - nx * KX > 1e-6

  /** Any convex footprint [[x, y], ...] raised from z by h; faces at any angle. */
  const prism = (foot: Pt[], z: number, h: number, t: Tone = 'n') => {
    const cx = foot.reduce((a, p) => a + p[0], 0) / foot.length
    const cy = foot.reduce((a, p) => a + p[1], 0) / foot.length
    const faces: { k: number; q: Pt[]; f: Face }[] = []
    foot.forEach(([ax, ay], i) => {
      const [bx, by] = foot[(i + 1) % foot.length]
      let nx = by - ay
      let ny = -(bx - ax)
      if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) [nx, ny] = [-nx, -ny]
      const ln = Math.hypot(nx, ny) || 1
      nx /= ln
      ny /= ln
      if (visible(nx, ny)) faces.push({ k: (ay + by) / 2, q: [P(ax, ay, z), P(bx, by, z), P(bx, by, z + h), P(ax, ay, z + h)], f: ny >= Math.abs(nx) * 0.7 ? 's' : 'w' })
    })
    faces.sort((a, b) => a.k - b.k).forEach((f) => poly(f.q, f.f, t))
    poly(
      foot.map(([x, y]) => P(x, y, z + h)),
      't',
      t,
    )
  }
  const box = (x: number, y: number, w: number, d: number, z: number, h: number, t: Tone = 'n') =>
    prism(
      [
        [x, y],
        [x + w, y],
        [x + w, y + d],
        [x, y + d],
      ],
      z,
      h,
      t,
    )
  /** A box with its upright edges chamfered. */
  const cbox = (x: number, y: number, w: number, d: number, z: number, h: number, c = 0.05, t: Tone = 'n') =>
    prism(
      [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + d - c],
        [x + w - c, y + d],
        [x + c, y + d],
        [x, y + d - c],
        [x, y + c],
      ],
      z,
      h,
      t,
    )
  /** A w × d footprint centred on (cx, cy), turned by a radians. */
  const rot = (cx: number, cy: number, w: number, d: number, a: number): Pt[] =>
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([px, py]) => [cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a)])
  /** A side profile [[y, z], ...] run from x0 to x1 (sloped plates). */
  const prismX = (x0: number, x1: number, prof: Pt[], t: Tone = 'n') => {
    const cy = prof.reduce((a, p) => a + p[0], 0) / prof.length
    const cz = prof.reduce((a, p) => a + p[1], 0) / prof.length
    const quads: { k: number; q: Pt[]; f: Face }[] = []
    prof.forEach(([ay, az], i) => {
      const [by, bz] = prof[(i + 1) % prof.length]
      let ny = bz - az
      let nz = -(by - ay)
      if (ny * ((ay + by) / 2 - cy) + nz * ((az + bz) / 2 - cz) < 0) [ny, nz] = [-ny, -nz]
      if (ny * KY * YS + nz > 1e-6) quads.push({ k: (ay + by) / 2, q: [P(x0, ay, az), P(x0, by, bz), P(x1, by, bz), P(x1, ay, az)], f: nz > Math.abs(ny) * 0.6 ? 't' : 's' })
    })
    quads.sort((a, b) => a.k - b.k).forEach((f) => poly(f.q, f.f, t))
    const xc = KX >= 0 ? x0 : x1
    poly(
      prof.map(([y, z]) => P(xc, y, z)),
      'w',
      t,
    )
  }
  const cylZ = (cx: number, cy: number, r: number, z: number, h: number, t: Tone = 'n') => {
    const b = ANG.map((a) => P(cx + r * Math.cos(a), cy + r * Math.sin(a), z))
    const tp = ANG.map((a) => P(cx + r * Math.cos(a), cy + r * Math.sin(a), z + h))
    poly(hull([...b, ...tp]), 's', t)
    poly(tp, 't', t)
  }
  const cylY = (cx: number, cz: number, r: number, y0: number, y1: number, t: Tone = 'n') => {
    const a = ANG.map((g) => P(cx + r * Math.cos(g), y0, cz + r * Math.sin(g)))
    const b = ANG.map((g) => P(cx + r * Math.cos(g), y1, cz + r * Math.sin(g)))
    poly(hull([...a, ...b]), 'w', t)
    poly(b, 's', t)
  }
  const cylX = (cy: number, cz: number, r: number, x0: number, x1: number, t: Tone = 'n') => {
    const [near, far] = KX >= 0 ? [x0, x1] : [x1, x0]
    const a = ANG.map((g) => P(far, cy + r * Math.cos(g), cz + r * Math.sin(g)))
    const b = ANG.map((g) => P(near, cy + r * Math.cos(g), cz + r * Math.sin(g)))
    poly(hull([...a, ...b]), 't', t)
    poly(b, 'w', t)
  }
  /** A flexible hose: short discs along a path of [x, y, z] points. */
  const hose = (path: [number, number, number][], r: number, t: Tone = 'n', step = 0.04) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, y0, z0] = path[i]
      const [x1, y1, z1] = path[i + 1]
      const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / step))
      for (let j = 0; j < n; j++) {
        const f = j / n
        cylZ(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r, z0 + (z1 - z0) * f, step * 0.75, t)
      }
    }
  }
  /** Seams: on a front face, and on a top face. */
  const strip = (x0: number, x1: number, y: number, z: number, th: number, t: Tone = 'n') => poly([P(x0, y, z), P(x1, y, z), P(x1, y, z + th), P(x0, y, z + th)], 'w', t)
  const tstrip = (x0: number, x1: number, y0: number, y1: number, z: number, t: Tone = 'n') => poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], 'w', t)
  /** A row of n small round heads (bolts, lights) on a front face. */
  const dots = (x0: number, x1: number, n: number, y: number, z: number, r = 0.012, t: Tone = 'n') => {
    for (let i = 0; i < n; i++) cylY(x0 + ((x1 - x0) * i) / Math.max(1, n - 1), z, r, y, y + 0.006, t)
  }
  const shadow = (x: number, y: number, w: number, d: number, pad = 0.08) =>
    shadows.push({ points: pts([P(x - pad, y - pad), P(x + w + pad, y - pad), P(x + w + pad, y + d + pad), P(x - pad, y + d + pad)]), spot: cur })
  const rshadow = (cx: number, cy: number, r: number) => {
    const [ex, ey] = P(cx, cy)
    shadows.push({ ellipse: [ex, ey, (r + 0.08) * S, (r + 0.08) * S * YS], spot: cur })
  }

  const done = (rest: Omit<Room, 'layers' | 'shadows' | 'anchors'>): Room => ({ ...rest, layers: layers.filter((l) => l.polys.length), shadows, anchors })

  return { P, pts, poly, begin, end, prism, box, cbox, rot, prismX, cylZ, cylY, cylX, hose, strip, tstrip, dots, shadow, rshadow, done, KX }
}
