// The workshop drawn as clay (WORKSHOP_MAP.md): about 9 × 5.4 m, seen from the entry at the
// bottom-left, looking down. Height lifts things up the screen and leans them a little right.
// Units are metres; x runs along the back wall, y from the back wall toward the entry, z is up.
// Built once at load (about 450 polygons). To move something, change its numbers here.

export type Face = 't' | 's' | 'w' // top, south (toward the entry), west (left side)
export type Tone = 'n' | 'wall' | 'w2' | 'm' | 'win' // clay, wall, darker inset, machine (takes its state colour), window
export type Spot = 'lathe' | 'mill' | 'stock' | 'saw'

export interface Poly {
  points: string
  face: Face
  tone: Tone
}
export interface Shadow {
  points?: string
  ellipse?: [number, number, number]
  spot: Spot | null
}
export interface Room {
  viewBox: string
  floor: string
  /** Scenery drawn before and after the spots, in painter's order. */
  layers: { spot: Spot | null; polys: Poly[] }[]
  shadows: Shadow[]
  /** Where each spot's tag points, in SVG units. */
  anchors: Record<Spot, [number, number]>
  entry: [number, number]
}

const S = 78
const KX = 0.07
const KY = 0.72
const OX = 70
const OY = 290
const RW = 9
const RD = 5.4
const WH = 2.4
const N = 40

type Pt = [number, number]
const P = (x: number, y: number, z = 0): Pt => [OX + x * S + z * S * KX, OY + y * S - z * S * KY]
const pts = (ps: Pt[]) => ps.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
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

function build(): Room {
  const layers: Room['layers'] = [{ spot: null, polys: [] }]
  const shadows: Shadow[] = []
  const anchors = {} as Room['anchors']
  let cur: Spot | null = null

  const poly = (ps: Pt[], face: Face, tone: Tone) => layers[layers.length - 1].polys.push({ points: pts(ps), face, tone })
  const begin = (spot: Spot, a: [number, number, number]) => {
    cur = spot
    anchors[spot] = P(...a)
    layers.push({ spot, polys: [] })
  }
  const end = () => {
    cur = null
    layers.push({ spot: null, polys: [] })
  }

  const box = (x: number, y: number, w: number, d: number, z: number, h: number, t: Tone = 'n') => {
    const x1 = x + w
    const y1 = y + d
    const z1 = z + h
    poly([P(x, y, z), P(x, y1, z), P(x, y1, z1), P(x, y, z1)], 'w', t)
    poly([P(x, y1, z), P(x1, y1, z), P(x1, y1, z1), P(x, y1, z1)], 's', t)
    poly([P(x, y, z1), P(x1, y, z1), P(x1, y1, z1), P(x, y1, z1)], 't', t)
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
    const a = ANG.map((g) => P(x1, cy + r * Math.cos(g), cz + r * Math.sin(g)))
    const b = ANG.map((g) => P(x0, cy + r * Math.cos(g), cz + r * Math.sin(g)))
    poly(hull([...a, ...b]), 't', t)
    poly(b, 'w', t)
  }
  const shadow = (x: number, y: number, w: number, d: number, pad = 0.08) =>
    shadows.push({ points: pts([P(x - pad, y - pad), P(x + w + pad, y - pad), P(x + w + pad, y + d + pad), P(x - pad, y + d + pad)]), spot: cur })
  const rshadow = (cx: number, cy: number, r: number) => {
    const [ex, ey] = P(cx, cy)
    shadows.push({ ellipse: [ex, ey, (r + 0.08) * S], spot: cur })
  }
  const table = (x: number, y: number, w: number, d: number, h: number, leg = 0.07) => {
    shadow(x, y, w, d, 0.04)
    for (const [lx, ly] of [
      [x, y],
      [x + w - leg, y],
      [x, y + d - leg],
      [x + w - leg, y + d - leg],
    ])
      box(lx, ly, leg, leg, 0, h - 0.06)
    box(x, y, w, d, h - 0.06, 0.06)
  }
  // A seam on a front face, and one on a top face.
  const strip = (x0: number, x1: number, y: number, z: number, th: number, t: Tone = 'n') =>
    poly([P(x0, y, z), P(x1, y, z), P(x1, y, z + th), P(x0, y, z + th)], 'w', t)
  const tstrip = (x0: number, x1: number, y0: number, y1: number, z: number, t: Tone = 'n') =>
    poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], 'w', t)

  // ---------- walls ----------
  const floor = pts([P(0, 0), P(RW, 0), P(RW, RD), P(0, RD)])
  box(-0.15, -0.15, RW + 0.3, 0.15, 0, WH, 'wall')
  for (const [a, b] of [
    [0.95, 2.15],
    [2.35, 3.55],
    [3.75, 4.45],
  ])
    poly([P(a, 0, 1.0), P(b, 0, 1.0), P(b, 0, 2.05), P(a, 0, 2.05)], 't', 'win')
  box(RW, -0.15, 0.15, RD + 0.3, 0, WH, 'wall')

  // ---------- back row ----------
  // Air reel on its cabinet
  shadow(1.62, 0.04, 0.42, 0.34)
  box(1.62, 0.04, 0.42, 0.34, 0, 1.0)
  strip(1.66, 2.0, 0.38, 0.5, 0.012)
  box(1.78, 0.36, 0.1, 0.03, 0.6, 0.05)
  cylY(1.83, 1.72, 0.2, 0.0, 0.14)
  cylY(1.83, 1.72, 0.17, 0.14, 0.16, 'w2')
  cylY(1.83, 1.72, 0.06, 0.16, 0.2)
  box(1.995, 0.1, 0.02, 0.02, 1.02, 0.62)

  // Bin with lid and slot
  rshadow(4.75, 0.55, 0.3)
  cylZ(4.75, 0.55, 0.29, 0, 0.84)
  cylZ(4.75, 0.55, 0.31, 0.84, 0.05)
  tstrip(4.6, 4.9, 0.52, 0.58, 0.891)

  // Bench with the disc sander and the grinder
  shadow(6.75, 0.05, 1.65, 0.62)
  box(6.75, 0.05, 1.65, 0.62, 0, 0.86)
  for (const z of [0.3, 0.58]) strip(6.8, 8.35, 0.67, z, 0.012)
  box(7.5, 0.67, 0.3, 0.02, 0.64, 0.03)
  box(7.62, 0.2, 0.32, 0.22, 0.86, 0.05)
  box(7.71, 0.24, 0.14, 0.14, 0.91, 0.07)
  cylX(0.31, 1.08, 0.1, 7.6, 7.96)
  cylX(0.31, 1.08, 0.15, 7.47, 7.6)
  cylX(0.31, 1.08, 0.15, 7.96, 8.09)
  box(7.48, 0.44, 0.11, 0.07, 0.98, 0.02)
  box(7.97, 0.44, 0.11, 0.07, 0.98, 0.02)
  box(7.48, 0.4, 0.11, 0.015, 1.2, 0.09, 'w2')
  box(7.97, 0.4, 0.11, 0.015, 1.2, 0.09, 'w2')
  box(6.88, 0.12, 0.44, 0.3, 0.86, 0.08)
  cylX(0.27, 1.08, 0.1, 7.12, 7.38)
  cylY(7.05, 1.1, 0.22, 0.41, 0.45)
  cylY(7.05, 1.1, 0.2, 0.45, 0.455, 'w2')
  box(6.97, 0.45, 0.2, 0.04, 0.9, 0.08)
  box(6.85, 0.46, 0.42, 0.18, 0.98, 0.03)

  // Mitre saw on its stand: opens the cut list
  begin('saw', [5.87, 0.45, 1.36])
  table(5.45, 0.12, 0.85, 0.58, 0.8)
  box(5.55, 0.2, 0.65, 0.46, 0.8, 0.06)
  cylZ(5.87, 0.45, 0.2, 0.86, 0.02)
  tstrip(5.86, 5.88, 0.27, 0.65, 0.881)
  box(5.58, 0.3, 0.58, 0.04, 0.86, 0.08)
  box(5.82, 0.18, 0.1, 0.1, 0.86, 0.32)
  box(5.8, 0.2, 0.14, 0.3, 1.12, 0.07)
  cylX(0.42, 1.08, 0.2, 5.83, 5.91)
  cylX(0.34, 1.14, 0.08, 5.91, 6.08)
  box(5.8, 0.5, 0.14, 0.05, 1.18, 0.14)
  end()

  // Milling machine
  begin('mill', [3.2, 1.13, 2.02])
  const M: Tone = 'm'
  shadow(2.82, 0.22, 0.76, 0.95)
  box(2.82, 0.22, 0.76, 0.95, 0, 0.14, M) // base
  box(2.95, 0.24, 0.5, 0.55, 0.14, 1.38, M) // column
  cylZ(3.2, 0.5, 0.25, 1.52, 0.06, M) // turret
  box(3.03, 0.24, 0.34, 0.95, 1.58, 0.18, M) // ram
  box(2.97, 0.79, 0.46, 0.38, 0.14, 0.82, M) // knee
  strip(3.0, 3.4, 1.17, 0.5, 0.012, M)
  cylY(3.2, 0.42, 0.05, 1.17, 1.25, M) // knee crank
  box(2.95, 0.82, 0.5, 0.42, 0.96, 0.12, M) // saddle
  cylY(3.2, 1.0, 0.06, 1.24, 1.3, M) // cross feed wheel
  box(2.45, 0.96, 1.5, 0.26, 1.08, 0.07, M) // table
  for (const ty of [1.01, 1.08, 1.15]) tstrip(2.48, 3.92, ty, ty + 0.015, 1.151, M)
  cylX(1.09, 1.11, 0.08, 2.37, 2.45, M) // table wheels
  cylX(1.09, 1.11, 0.08, 3.95, 4.03, M)
  box(3.05, 0.99, 0.3, 0.2, 1.15, 0.06, M) // vise
  box(3.05, 0.99, 0.3, 0.05, 1.21, 0.07, M)
  box(3.05, 1.12, 0.3, 0.05, 1.21, 0.07, M)
  cylY(3.2, 1.24, 0.015, 1.19, 1.32, M)
  box(3.07, 0.92, 0.26, 0.12, 1.36, 0.36, M) // head knuckle
  box(3.07, 1.0, 0.26, 0.26, 1.3, 0.4, M) // head
  cylZ(3.2, 1.13, 0.05, 1.18, 0.12, M) // quill
  cylZ(3.2, 1.13, 0.015, 1.13, 0.05, M) // cutter
  box(3.33, 1.12, 0.14, 0.02, 1.52, 0.02, M) // quill lever
  cylZ(3.2, 1.13, 0.13, 1.7, 0.28, M) // motor
  cylZ(3.2, 1.13, 0.09, 1.98, 0.04, M)
  box(3.45, 0.5, 0.18, 0.03, 1.55, 0.02, M) // DRO arm and screen
  box(3.62, 0.48, 0.26, 0.05, 1.45, 0.2, M)
  end()

  // Lathe, along the left wall, facing away from the entrance: headstock and chuck at the front
  // (toward the entrance), tailstock at the back. Drawn back to front.
  begin('lathe', [0.42, 1.79, 1.42])
  const L: Tone = 'm'
  shadow(0.08, 0.3, 0.7, 1.75)
  box(0.08, 0.3, 0.66, 1.75, 0, 0.8, L) // cabinet
  strip(0.12, 0.7, 2.05, 0.42, 0.012, L)
  box(0.04, 0.26, 0.74, 1.83, 0.8, 0.04, L) // chip tray
  box(0.24, 0.35, 0.28, 1.18, 0.84, 0.12, L) // bed
  tstrip(0.27, 0.31, 0.35, 1.53, 0.961, L) // ways
  tstrip(0.45, 0.49, 0.35, 1.53, 0.961, L)
  cylY(0.37, 1.14, 0.08, 0.36, 0.39, L) // tailstock wheel
  box(0.22, 0.37, 0.3, 0.28, 0.96, 0.1, L) // tailstock
  box(0.26, 0.39, 0.22, 0.24, 1.06, 0.14, L)
  cylY(0.37, 1.14, 0.035, 0.63, 0.8, L) // quill
  box(0.12, 0.87, 0.6, 0.3, 0.96, 0.08, L) // saddle
  box(0.22, 0.93, 0.36, 0.18, 1.04, 0.06, L) // cross slide
  box(0.3, 0.95, 0.14, 0.14, 1.1, 0.1, L) // tool post
  box(0.36, 1.03, 0.03, 0.12, 1.14, 0.015, L) // tool
  box(0.62, 0.84, 0.14, 0.36, 0.7, 0.34, L) // apron
  cylX(1.02, 0.88, 0.08, 0.76, 0.8, L) // apron wheel
  cylY(0.38, 1.08, 0.03, 1.25, 1.41, L) // the part
  cylY(0.38, 1.08, 0.15, 1.41, 1.53, L) // chuck
  box(0.1, 1.53, 0.6, 0.5, 0.84, 0.46, L) // headstock
  box(0.14, 1.59, 0.52, 0.4, 1.3, 0.12, L) // belt cover
  for (const kx of [0.2, 0.3, 0.56]) cylY(kx, 1.0, 0.025, 2.03, 2.06, L) // speed knobs
  box(0.7, 1.9, 0.03, 0.03, 1.3, 0.25, L) // DRO post and screen
  box(0.6, 1.9, 0.24, 0.05, 1.5, 0.2, L)
  end()

  // ---------- middle row ----------
  table(6.0, 1.7, 1.3, 2.6, 0.9) // the big work table
  box(6.05, 1.75, 1.2, 2.5, 0.2, 0.03)
  box(6.15, 1.9, 0.8, 0.6, 0.23, 0.08)
  box(6.25, 2.6, 0.7, 0.5, 0.9, 0.012)
  box(6.75, 2.0, 0.34, 0.22, 0.9, 0.12)
  box(6.75, 2.0, 0.34, 0.22, 1.02, 0.02, 'w2')

  // Stock shelf: three heights, tubes and profiles lie along it
  begin('stock', [8.68, 1.52, 1.84])
  shadow(8.45, 1.45, 0.5, 3.0)
  for (const [px, py] of [
    [8.45, 1.5],
    [8.9, 1.5],
  ])
    box(px, py, 0.05, 0.05, 0, 1.8)
  ;[0.12, 0.72, 1.32].forEach((zl, li) => {
    box(8.45, 1.5, 0.5, 2.9, zl, 0.04)
    ;[8.5, 8.6, 8.7, 8.81].forEach((k, i) => {
      if ((i + li) % 2) cylY(k + 0.04, zl + 0.08, 0.04, 1.42, 4.4 - 0.2 * i)
      else box(k, 1.42, 0.08, 3.0 - 0.15 * i, zl + 0.04, 0.08)
    })
  })
  for (const [px, py] of [
    [8.45, 4.35],
    [8.9, 4.35],
  ])
    box(px, py, 0.05, 0.05, 0, 1.8)
  end()

  table(0.02, 2.0, 2.0, 0.78, 0.9) // secondary table, with a bench vise and a parts bin
  box(0.3, 2.15, 0.3, 0.2, 0.9, 0.08)
  box(0.3, 2.15, 0.3, 0.05, 0.98, 0.1)
  box(0.3, 2.3, 0.3, 0.05, 0.98, 0.1)
  cylY(0.45, 0.95, 0.015, 2.35, 2.48)
  box(1.2, 2.25, 0.5, 0.35, 0.9, 0.1)
  box(1.24, 2.29, 0.42, 0.27, 0.991, 0.01, 'w2')

  // ---------- front row ----------
  // Workshop PC: a touchscreen on the left wall, nothing on the floor under it
  box(0.0, 4.38, 0.05, 0.16, 1.18, 0.22) // wall bracket
  box(0.05, 4.1, 0.1, 0.72, 1.05, 0.46) // screen, facing into the room

  table(2.4, 4.78, 2.9, 0.58, 0.9) // drill bits and the charging station
  for (let i = 0; i < 5; i++) {
    box(2.52 + i * 0.3, 4.88, 0.24, 0.16, 0.9, 0.04)
    box(2.55 + i * 0.3, 4.9, 0.18, 0.1, 0.94, 0.005, 'w2')
  }
  for (let i = 0; i < 3; i++) {
    const x = 4.15 + i * 0.36
    box(x, 4.9, 0.2, 0.24, 0.9, 0.06)
    box(x + 0.04, 4.98, 0.12, 0.1, 0.96, 0.14)
    box(x + 0.02, 4.94, 0.16, 0.22, 1.1, 0.07)
  }

  // Beta tool cart
  for (const [wx, wy] of [
    [6.12, 4.9],
    [6.9, 4.9],
    [6.12, 5.26],
    [6.9, 5.26],
  ])
    cylZ(wx, wy, 0.045, 0, 0.07)
  shadow(6.05, 4.82, 0.92, 0.5)
  box(6.05, 4.82, 0.92, 0.5, 0.07, 0.95)
  for (let k = 0; k < 6; k++) {
    strip(6.09, 6.93, 5.32, 0.2 + k * 0.13, 0.012)
    box(6.4, 5.32, 0.3, 0.015, 0.24 + k * 0.13, 0.02, 'w2')
  }
  box(6.05, 4.82, 0.92, 0.5, 1.02, 0.02, 'w2')

  // The left and front walls, cut low so you can see in; the gap is the entry.
  box(-0.15, -0.15, 0.15, RD + 0.3, 0, 0.22, 'wall')
  box(-0.15, RD, 0.62, 0.15, 0, 0.22, 'wall')
  box(1.55, RD, RW - 1.4, 0.15, 0, 0.22, 'wall')

  const entry = P(1.06, RD + 0.5)
  return { viewBox: '40 80 780 730', floor, layers: layers.filter((l) => l.polys.length), shadows, anchors, entry: [entry[0], entry[1] + 12] }
}

export const ROOM: Room = build()
