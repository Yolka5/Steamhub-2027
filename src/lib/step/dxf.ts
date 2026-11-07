import { projectView, VIEWS, type Framed } from './engine'

// Plate profile for the CNC (Estlcam), in mm, looking down the plate's thin axis.
// Holes and round edges go out as true CIRCLE and ARC entities; Tom's version wrote them as
// short line segments, which CAM handles badly. Everything else is the visible outline.

interface Round {
  x: number
  y: number
  r: number
  full: boolean
  a0: number
  a1: number
}

const f = (v: number) => v.toFixed(4)

/** Hidden-line removal splits straight edges into many short pieces; join the ones in line again. */
function straighten(L: [number, number][]): [number, number][] {
  if (L.length < 3) return L
  const out: [number, number][] = [L[0]]
  for (let i = 1; i < L.length - 1; i++) {
    const a = out[out.length - 1]
    const b = L[i]
    const c = L[i + 1]
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1
    if (Math.abs(cross) / len > 1e-4) out.push(b)
  }
  out.push(L[L.length - 1])
  return out
}
const deg = (a: number) => ((((a * 180) / Math.PI) % 360) + 360) % 360

export function plateDxf(G: Framed): string {
  const rounds: Round[] = []
  const seen = new Set<string>()
  for (const e of G.edges) {
    if (e.kind !== 'circle' || !e.center || !e.axis || !e.radius) continue
    if (Math.abs(Math.abs(e.axis[2]) - 1) > 1e-3) continue
    const [cx, cy] = e.center
    const p0 = e.pts[0]
    const p1 = e.pts[e.pts.length - 1]
    const t0 = Math.atan2(p0[1] - cy, p0[0] - cx)
    const t1 = Math.atan2(p1[1] - cy, p1[0] - cx)
    // DXF arcs run counterclockwise. Points follow the circle's own axis, so flip when it points down.
    const [a0, a1] = e.axis[2] > 0 ? [deg(t0), deg(t1)] : [deg(t1), deg(t0)]
    const full = !!e.full
    // Top and bottom of a through hole project onto the same circle; write it once.
    const key = full ? `c${cx.toFixed(3)},${cy.toFixed(3)},${e.radius.toFixed(3)}` : `a${cx.toFixed(3)},${cy.toFixed(3)},${e.radius.toFixed(3)},${a0.toFixed(2)},${a1.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    rounds.push({ x: cx, y: cy, r: e.radius, full, a0, a1 })
  }

  const onRound = (p: [number, number]) => rounds.some((c) => Math.abs(Math.hypot(p[0] - c.x, p[1] - c.y) - c.r) < 0.02)
  const pv = projectView(G, VIEWS.front)
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']
  for (const raw of pv.vis) {
    // A polyline that lies on a circle is that circle's tessellation: the true entity replaces it.
    if (raw.length > 2 && raw.every(onRound)) continue
    const L = straighten(raw)
    for (let i = 0; i < L.length - 1; i++) {
      out.push('0', 'LINE', '8', '0', '10', f(L[i][0]), '20', f(L[i][1]), '30', '0', '11', f(L[i + 1][0]), '21', f(L[i + 1][1]), '31', '0')
    }
  }
  for (const c of rounds) {
    if (c.full) out.push('0', 'CIRCLE', '8', '0', '10', f(c.x), '20', f(c.y), '30', '0', '40', f(c.r))
    else out.push('0', 'ARC', '8', '0', '10', f(c.x), '20', f(c.y), '30', '0', '40', f(c.r), '50', c.a0.toFixed(4), '51', c.a1.toFixed(4))
  }
  out.push('0', 'ENDSEC', '0', 'EOF')
  return out.join('\n')
}
