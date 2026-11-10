import type { Piece } from './stock'

// A drawn picture of a whole stock piece: its real profile pushed out along its length, seen
// from an isometric corner so the end shows the shape (hollow, L, hex) and the bar shows end to
// end. Faces are flat-shaded and painted back to front. Long bars are drawn shorter than true
// scale so the profile stays readable; the length itself is printed next to the picture.

type P2 = [number, number]

export interface StockDrawing {
  viewBox: string
  /** Shaded faces, back to front: SVG path and a 0..1 brightness. */
  faces: { d: string; tone: number; rule?: 'evenodd' }[]
  /** Outline strokes, one SVG path. */
  lines: string
  /** True when the bar is drawn shorter than true scale. */
  shortened: boolean
}

const circle = (r: number, n = 48): P2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)])
const rect = (w: number, h: number): P2[] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
]
const cw = (L: P2[]) => L.slice().reverse()

/** The cross-section: outer loop counter-clockwise, holes clockwise, in mm, centred. */
function section(p: Piece): { outer: P2[]; holes: P2[][]; round: boolean } {
  const a = p.a && p.a > 0 ? p.a : 20
  const b = p.b && p.b > 0 ? p.b : a
  const wall = p.wall && p.wall > 0 ? p.wall : null
  switch (p.kind) {
    case 'rect_tube': {
      const t = wall ?? Math.min(a, b) / 10
      return { outer: rect(a, b), holes: 2 * t < Math.min(a, b) ? [cw(rect(a - 2 * t, b - 2 * t))] : [], round: false }
    }
    case 'round_tube': {
      const id = p.inner_d ?? (wall ? a - 2 * wall : a * 0.8)
      return { outer: circle(a / 2), holes: id > 0 && id < a ? [cw(circle(id / 2))] : [], round: true }
    }
    case 'round_rod':
      return { outer: circle(a / 2), holes: [], round: true }
    case 'angle': {
      const t = Math.min(wall ?? Math.min(a, b) / 8, Math.min(a, b) / 2)
      const L: P2[] = [
        [0, 0],
        [a, 0],
        [a, t],
        [t, t],
        [t, b],
        [0, b],
      ]
      return { outer: L.map(([x, y]) => [x - a / 2, y - b / 2]), holes: [], round: false }
    }
    case 'flat':
      return { outer: rect(a, wall ?? a / 8), holes: [], round: false }
    case 'hex': {
      const r = a / Math.sqrt(3)
      const hex = Array.from({ length: 6 }, (_, i): P2 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3)])
      return { outer: hex, holes: p.inner_d ? [cw(circle(p.inner_d / 2))] : [], round: false }
    }
    default:
      return { outer: rect(a, b), holes: [], round: false }
  }
}

// Isometric: x runs along the bar, y across it, z up. Screen y points down.
const C30 = Math.cos(Math.PI / 6)
const proj = (x: number, y: number, z: number): P2 => [(x - y) * C30, (x + y) * 0.5 - z]
const EYE = [1, 1, 1].map((v) => v / Math.sqrt(3))
const LIGHT = (() => {
  const l = [0.35, 0.55, 1]
  const n = Math.hypot(...l)
  return l.map((v) => v / n)
})()
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const tone = (n: number[]) => 0.5 + 0.5 * dot(n, LIGHT)

const f = (n: number) => Math.round(n * 100) / 100
const path = (pts: P2[], close = true) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + (close ? 'Z' : '')

export function stockDrawing(p: Piece): StockDrawing {
  const { outer, holes, round } = section(p)
  const extent = Math.max(...outer.flatMap(([y, z]) => [Math.abs(y), Math.abs(z)])) * 2
  // True scale up to about 5 profiles long, then grows slower so any bar fits a card.
  const ratio = Math.max(0.2, p.length / extent)
  const shown = Math.min(ratio, 2.5 + 2.2 * Math.log(1 + ratio))
  const L = shown * extent

  type Face = { d: string; tone: number; depth: number; rule?: 'evenodd' }
  const sideFaces = (loop: P2[]) =>
    loop.map((a, i) => {
      const b = loop[(i + 1) % loop.length]
      const dy = b[0] - a[0]
      const dz = b[1] - a[1]
      const len = Math.hypot(dy, dz) || 1
      const n = [0, dz / len, -dy / len]
      const quad: P2[] = [proj(0, a[0], a[1]), proj(L, a[0], a[1]), proj(L, b[0], b[1]), proj(0, b[0], b[1])]
      const mid = [L / 2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      return { a, b, n, visible: dot(n, EYE) > 1e-6, face: { d: path(quad), tone: tone(n), depth: dot(mid, EYE) } as Face }
    })

  const outerSides = sideFaces(outer)
  const holeSides = holes.map(sideFaces)
  const back = (list: ReturnType<typeof sideFaces>) =>
    list
      .filter((s) => s.visible)
      .map((s) => s.face)
      .sort((x, y) => x.depth - y.depth)

  const end = [outer, ...holes].map((loop) => path(loop.map(([y, z]) => proj(L, y, z)))).join('')
  const faces: StockDrawing['faces'] = ([
    ...holeSides.flatMap(back),
    ...back(outerSides),
    { d: end, tone: tone([1, 0, 0]), depth: 0, rule: 'evenodd' as const },
  ] as Face[]).map(({ d, tone: t, rule }) => ({ d, tone: t, rule }))

  // Outlines: the end face, the far end of every visible side, and the long edges that are a
  // silhouette or a sharp corner. Round bars only get their silhouette, so they read smooth.
  const lines: string[] = [end]
  outerSides.forEach((s, i) => {
    if (s.visible) lines.push(path([proj(0, s.a[0], s.a[1]), proj(0, s.b[0], s.b[1])], false))
    const prev = outerSides[(i + outerSides.length - 1) % outerSides.length]
    const silhouette = s.visible !== prev.visible
    const corner = !round && (s.visible || prev.visible)
    if (silhouette || corner) lines.push(path([proj(0, s.a[0], s.a[1]), proj(L, s.a[0], s.a[1])], false))
  })

  // Fit everything with a little room.
  const pts = [...outer.map(([y, z]) => proj(0, y, z)), ...outer.map(([y, z]) => proj(L, y, z))]
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0
  const h = Math.max(...ys) - y0
  const pad = Math.max(w, h) * 0.06
  return {
    viewBox: `${f(x0 - pad)} ${f(y0 - pad)} ${f(w + 2 * pad)} ${f(h + 2 * pad)}`,
    faces,
    lines: lines.join(''),
    shortened: shown < ratio - 1e-6,
  }
}
