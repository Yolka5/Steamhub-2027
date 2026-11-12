// Demo part geometry for the guide screenshots, in the shape the STEP reader produces
// (partGeometry in src/lib/step/engine.js), framed the same way the upload worker frames it.
import { partFrame, toFrame } from '../../src/lib/step/engine.js'

let nextId = 1
const circle = (o, r, z, n = 48) => {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / n
    pts.push([o[0] + r * Math.cos(t), o[1] + r * Math.sin(t), z])
  }
  return pts
}
const cEdge = (o, r, z) => ({ kind: 'circle', pts: circle(o, r, z), center: [o[0], o[1], z], axis: [0, 0, 1], radius: r, full: true, id: nextId++ })
const line = (a, b) => ({ kind: 'line', pts: [a, b], id: nextId++ })

function finish(raw) {
  for (const f of raw.faces) {
    if (f.kind === 'plane') {
      let A = 0
      for (const L of f.loops) {
        let s = 0
        for (let i = 0; i < L.length; i++) {
          const p = L[i], q = L[(i + 1) % L.length]
          const px = p[0] * f.x[0] + p[1] * f.x[1] + p[2] * f.x[2], py = p[0] * f.y[0] + p[1] * f.y[1] + p[2] * f.y[2]
          const qx = q[0] * f.x[0] + q[1] * f.x[1] + q[2] * f.x[2], qy = q[0] * f.y[0] + q[1] * f.y[1] + q[2] * f.y[2]
          s += px * qy - qx * py
        }
        A += s / 2
      }
      f.area = Math.abs(A)
    }
    if (f.kind === 'cyl') Object.assign(f, { full: true, a0: 0, span: 2 * Math.PI })
  }
  return toFrame(raw, partFrame(raw))
}

function holeFaces(o, r, t, edges, faces) {
  const top = cEdge(o, r, t), bot = cEdge(o, r, 0)
  edges.push(top, bot)
  faces.push({ kind: 'cyl', o: [o[0], o[1], 0], axis: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], r, outward: false, loops: [top.pts, bot.pts], hmin: 0, hmax: t })
  return { top, bot }
}

/** A rectangular plate, `holes` as [x, y, r]. */
export function plate(w, h, t, holes) {
  const edges = [], faces = []
  const c = [[0, 0], [w, 0], [w, h], [0, h]]
  const loopAt = (z) => c.map(([x, y]) => [x, y, z])
  for (const z of [0, t]) for (let i = 0; i < 4; i++) edges.push(line(loopAt(z)[i], loopAt(z)[(i + 1) % 4]))
  for (let i = 0; i < 4; i++) edges.push(line(loopAt(0)[i], loopAt(t)[i]))
  const topHoles = [], botHoles = []
  for (const [x, y, r] of holes) {
    const { top, bot } = holeFaces([x, y], r, t, edges, faces)
    topHoles.push(top.pts.slice().reverse())
    botHoles.push(bot.pts)
  }
  faces.push({ kind: 'plane', o: [0, 0, t], n: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], loops: [loopAt(t), ...topHoles] })
  faces.push({ kind: 'plane', o: [0, 0, 0], n: [0, 0, -1], x: [1, 0, 0], y: [0, -1, 0], loops: [loopAt(0).reverse(), ...botHoles] })
  const sides = [
    { o: [0, 0, 0], n: [0, -1, 0], x: [1, 0, 0], y: [0, 0, 1], q: [[0, 0], [w, 0]] },
    { o: [w, 0, 0], n: [1, 0, 0], x: [0, 1, 0], y: [0, 0, 1], q: [[w, 0], [w, h]] },
    { o: [w, h, 0], n: [0, 1, 0], x: [-1, 0, 0], y: [0, 0, 1], q: [[w, h], [0, h]] },
    { o: [0, h, 0], n: [-1, 0, 0], x: [0, -1, 0], y: [0, 0, 1], q: [[0, h], [0, 0]] },
  ]
  for (const s of sides) {
    const [a, b] = s.q
    faces.push({ kind: 'plane', o: s.o, n: s.n, x: s.x, y: s.y, loops: [[[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], t], [a[0], a[1], t]]] })
  }
  return finish({ edges, faces })
}

/** A round spacer or shaft: outer diameter, bore (0 for solid), length. */
export function spacer(od, bore, len) {
  const edges = [], faces = []
  const o = [0, 0]
  const outTop = cEdge(o, od / 2, len), outBot = cEdge(o, od / 2, 0)
  edges.push(outTop, outBot)
  faces.push({ kind: 'cyl', o: [0, 0, 0], axis: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], r: od / 2, outward: true, loops: [outTop.pts, outBot.pts], hmin: 0, hmax: len })
  const top = [outTop.pts], bot = [outBot.pts]
  if (bore) {
    const h = holeFaces(o, bore / 2, len, edges, faces)
    top.push(h.top.pts.slice().reverse())
    bot.push(h.bot.pts)
  }
  faces.push({ kind: 'plane', o: [0, 0, len], n: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0], loops: top })
  faces.push({ kind: 'plane', o: [0, 0, 0], n: [0, 0, -1], x: [1, 0, 0], y: [0, -1, 0], loops: bot })
  return finish({ edges, faces })
}
