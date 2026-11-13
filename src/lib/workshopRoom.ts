import { roomKit, type Room } from './roomKit'

// The workshop drawn as clay (WORKSHOP_MAP.md): about 9 × 5.4 m, seen from the entry at the
// front left, leaning right. x: left wall 0 to right wall 9. y: back wall 0 to the front wall 5.4
// (the hallway window). z: up. Metres. Built once at load; to move something, change its numbers.

export type { Face, Poly, Room, Shadow, Spot, Tone } from './roomKit'

const RW = 9
const RD = 5.4
const WH = 2.4

function build(): Room {
  const k = roomKit({ s: 80, kx: 0.12, ky: 0.84, ys: 0.86, ox: 50, oy: 300 })
  const { P, pts, poly, begin, end, prism, box, cbox, rot, prismX, cylZ, cylY, cylX, hose, strip, tstrip, dots, shadow, rshadow } = k
  void prism
  void rot
  const legs = (x: number, y: number, w: number, d: number, h: number, leg = 0.06) => {
    for (const [lx, ly] of [
      [x, y],
      [x + w - leg, y],
      [x, y + d - leg],
      [x + w - leg, y + d - leg],
    ])
      box(lx, ly, leg, leg, 0, h)
  }
  const table = (x: number, y: number, w: number, d: number, h: number, top = 0.06) => {
    shadow(x, y, w, d, 0.04)
    legs(x, y, w, d, h - top)
    box(x, y, w, d, h - top, top)
  }
  const crate = (x: number, y: number, w: number, d: number, z: number, h: number) => {
    box(x, y, w, d, z, h, 'w2')
    box(x + 0.02, y + 0.02, w - 0.04, d - 0.04, z + h - 0.005, 0.005)
    strip(x + 0.03, x + w - 0.03, y + d, z + h * 0.45, 0.02)
  }
  const vise = (x: number, y: number, a: number, t: 'n' | 'w2' = 'n') => {
    prism(rot(x, y, 0.12, 0.2, a), 0.9, 0.06, t) // base
    prism(rot(x, y, 0.16, 0.06, a), 0.96, 0.1, t) // jaws
    const dx = -Math.sin(a) * 0.14
    const dy = Math.cos(a) * 0.14
    prism(rot(x + dx, y + dy, 0.16, 0.06, a), 0.96, 0.1, t)
    cylZ(x + dx * 1.8, y + dy * 1.8, 0.012, 0.98, 0.08) // handle
  }
  const floor = pts([P(0, 0), P(RW, 0), P(RW, RD), P(0, RD)])

  // ================= Back wall: whiteboards, maroon stripe =================
  box(-0.15, -0.15, RW + 0.3, 0.15, 0, WH, 'wall')
  poly([P(0, 0, 1.12), P(RW, 0, 1.12), P(RW, 0, 1.22), P(0, 0, 1.22)], 's', 'w2') // maroon stripe
  for (const [a, b] of [
    [3.55, 5.1],
    [6.1, 7.9],
  ]) {
    poly([P(a - 0.04, 0, 1.0), P(b + 0.04, 0, 1.0), P(b + 0.04, 0, 2.3), P(a - 0.04, 0, 2.3)], 's', 'n') // frame
    poly([P(a, 0, 1.04), P(b, 0, 1.04), P(b, 0, 2.26), P(a, 0, 2.26)], 't', 'win') // board
    box(a, 0, b - a, 0.06, 1.0, 0.03) // ledge
  }
  box(RW, -0.15, 0.15, RD + 0.3, 0, WH, 'wall') // right wall, full height
  poly([P(RW, 0, 1.12), P(RW, RD, 1.12), P(RW, RD, 1.22), P(RW, 0, 1.22)], 'w', 'w2')
  box(RW - 0.02, 1.0, 0.02, 3.2, 1.95, 0.42, 'w2') // Beta banner over the stock rack

  // ================= Back left: fire extinguisher, tool cabinet, air reel =================
  cylZ(0.95, 0.12, 0.07, 0.08, 0.5) // fire extinguisher on its bracket
  cylZ(0.95, 0.12, 0.03, 0.58, 0.06)
  box(0.9, 0.0, 0.1, 0.05, 0.3, 0.1)

  shadow(2.12, 0.06, 0.5, 0.42)
  cbox(2.12, 0.06, 0.5, 0.42, 0, 1.25, 0.02) // grey tool cabinet with drawers
  for (let i = 0; i < 7; i++) {
    strip(2.16, 2.58, 0.48, 0.12 + i * 0.15, 0.012, 'w2')
    box(2.3, 0.48, 0.14, 0.012, 0.18 + i * 0.15, 0.02)
  }
  box(2.18, 0.1, 0.38, 0.26, 1.25, 0.32) // punch card holder on top
  dots(2.22, 2.52, 4, 0.36, 1.45, 0.012, 'w2')
  cylY(2.4, 1.95, 0.2, 0.0, 0.14) // air reel on the wall
  cylY(2.4, 1.95, 0.17, 0.14, 0.16, 'w2')
  cylY(2.4, 1.95, 0.06, 0.16, 0.2)
  hose(
    [
      [2.6, 0.12, 1.95],
      [2.7, 0.2, 1.7],
      [2.72, 0.28, 1.45],
    ],
    0.014,
  )

  // ================= Milling machine =================
  begin('mill', [3.2, 1.13, 2.02])
  const M = 'm' as const
  const M2 = 'm2' as const
  shadow(2.78, 0.22, 0.84, 1.0)
  cbox(2.82, 0.22, 0.76, 0.95, 0, 0.14, 0.04, M) // base
  box(2.88, 0.3, 0.64, 0.8, 0.14, 0.012, M2) // chip pan
  cbox(2.95, 0.24, 0.5, 0.55, 0.14, 1.38, 0.05, M) // column
  for (const zr of [0.5, 0.9]) strip(2.98, 3.42, 0.79, zr, 0.012, M2)
  cylZ(3.2, 0.5, 0.26, 1.52, 0.06, M) // turret
  dots(3.0, 3.4, 5, 0.76, 1.55, 0.01, M2)
  prismX(3.03, 3.37, [[0.24, 1.58], [1.2, 1.58], [1.2, 1.7], [0.6, 1.78], [0.24, 1.78]], M) // ram
  cbox(2.97, 0.79, 0.46, 0.38, 0.14, 0.82, 0.03, M) // knee
  strip(3.0, 3.4, 1.17, 0.5, 0.012, M2)
  cylY(3.2, 0.42, 0.05, 1.17, 1.25, M) // knee crank
  box(3.18, 1.24, 0.04, 0.04, 0.38, 0.08, M)
  box(2.95, 0.82, 0.5, 0.42, 0.96, 0.12, M) // saddle
  cylY(3.2, 1.0, 0.07, 1.24, 1.29, M) // cross feed wheel
  box(2.4, 0.96, 1.6, 0.26, 1.08, 0.07, M) // table
  for (const ty of [1.0, 1.07, 1.14]) tstrip(2.44, 3.96, ty, ty + 0.015, 1.151, M2)
  cylX(1.09, 1.11, 0.08, 2.32, 2.4, M) // table wheels
  cylX(1.09, 1.11, 0.08, 4.0, 4.08, M)
  box(2.28, 1.07, 0.06, 0.04, 1.11, 0.03, M) // handles
  box(4.08, 1.07, 0.06, 0.04, 1.11, 0.03, M)
  box(3.05, 0.99, 0.3, 0.2, 1.15, 0.06, M) // vise
  box(3.05, 0.99, 0.3, 0.05, 1.21, 0.07, M)
  box(3.05, 1.12, 0.3, 0.05, 1.21, 0.07, M)
  cylY(3.2, 1.24, 0.015, 1.19, 1.32, M)
  box(3.07, 0.92, 0.26, 0.12, 1.36, 0.36, M) // head knuckle
  cbox(3.06, 0.99, 0.28, 0.28, 1.3, 0.42, 0.03, M) // head
  cylZ(3.2, 1.13, 0.05, 1.18, 0.12, M) // quill
  cylZ(3.2, 1.13, 0.015, 1.12, 0.06, M) // cutter
  for (let i = 0; i < 3; i++) box(3.34, 1.1 + i * 0.03, 0.15, 0.015, 1.5 + i * 0.03, 0.015, M) // quill feed handles
  cylY(3.1, 1.48, 0.04, 1.27, 1.3, M) // fine feed wheel
  cylZ(3.2, 1.13, 0.13, 1.72, 0.26, M) // motor and its cap
  cylZ(3.2, 1.13, 0.09, 1.98, 0.04, M)
  for (const zr of [1.78, 1.86, 1.94]) cylZ(3.2, 1.13, 0.135, zr, 0.01, M2)
  box(3.48, 0.5, 0.16, 0.03, 1.55, 0.02, M) // DRO arm and screen
  box(3.62, 0.48, 0.28, 0.05, 1.42, 0.22, M)
  box(3.65, 0.535, 0.22, 0.004, 1.47, 0.12, M2)
  end()

  // Shop vacuum between the mill and the saw
  rshadow(4.15, 0.4, 0.2)
  cylZ(4.15, 0.4, 0.2, 0.04, 0.42)
  cylZ(4.15, 0.4, 0.21, 0.46, 0.08, 'w2')
  for (const t of [0.4, 2.4, 4.4]) cylZ(4.15 + 0.17 * Math.cos(t), 0.4 + 0.17 * Math.sin(t), 0.025, 0, 0.04)
  hose(
    [
      [4.3, 0.42, 0.5],
      [4.45, 0.6, 0.3],
      [4.5, 0.75, 0.05],
    ],
    0.03,
  )

  // Green bin with its lid
  rshadow(4.85, 0.6, 0.3)
  cylZ(4.85, 0.6, 0.28, 0, 0.82)
  cylZ(4.85, 0.6, 0.3, 0.82, 0.06)
  tstrip(4.72, 4.98, 0.57, 0.63, 0.881, 'w2') // slot in the lid

  // ================= Mitre saw on its cabinet, clear guard box, flag (opens the cut list) =================
  begin('saw', [5.85, 0.45, 1.55])
  shadow(5.4, 0.1, 0.9, 0.62)
  cbox(5.42, 0.12, 0.86, 0.58, 0, 0.8, 0.02) // dark wooden cabinet
  strip(5.46, 6.24, 0.7, 0.62, 0.012, 'w2')
  strip(5.84, 5.86, 0.7, 0.05, 0.55, 'w2')
  box(5.5, 0.18, 0.7, 0.48, 0.8, 0.06) // saw base and turntable
  cylZ(5.85, 0.45, 0.2, 0.86, 0.02)
  tstrip(5.84, 5.86, 0.27, 0.65, 0.881, 'w2')
  box(5.52, 0.3, 0.66, 0.04, 0.86, 0.08) // fence
  box(5.8, 0.18, 0.1, 0.1, 0.86, 0.32) // pivot and arm
  box(5.78, 0.2, 0.14, 0.3, 1.12, 0.07)
  cylX(0.42, 1.08, 0.2, 5.81, 5.89) // blade guard
  cylX(0.34, 1.14, 0.08, 5.89, 6.06) // motor
  box(5.78, 0.5, 0.14, 0.05, 1.18, 0.14) // handle
  box(6.24, 0.12, 0.015, 0.015, 0.8, 1.1) // flag pole and flag
  box(6.25, 0.12, 0.012, 0.18, 1.5, 0.38, 'w2')
  end()

  // ================= Bench with the disc sander and the grinder =================
  shadow(6.7, 0.05, 1.72, 0.66)
  for (const [px, py] of [
    [6.72, 0.08],
    [8.34, 0.08],
    [6.72, 0.62],
    [8.34, 0.62],
  ])
    box(px, py, 0.05, 0.05, 0, 0.82) // red legs
  box(6.72, 0.08, 1.67, 0.59, 0.22, 0.03) // lower shelf
  for (const [bx, bw] of [
    [6.8, 0.36],
    [7.22, 0.28],
    [7.56, 0.36],
    [7.98, 0.3],
  ])
    box(bx, 0.16, bw, 0.4, 0.25, 0.22, 'w2') // boxes on it
  box(7.0, 0.5, 0.2, 0.14, 0.25, 0.08) // yellow trays
  box(7.3, 0.5, 0.2, 0.14, 0.25, 0.08)
  box(6.7, 0.05, 1.72, 0.66, 0.82, 0.05) // steel top
  // grinder
  box(7.62, 0.2, 0.32, 0.22, 0.87, 0.05)
  box(7.71, 0.24, 0.14, 0.14, 0.92, 0.07)
  cylX(0.31, 1.08, 0.1, 7.6, 7.96)
  cylX(0.31, 1.08, 0.15, 7.47, 7.6)
  cylX(0.31, 1.08, 0.15, 7.96, 8.09)
  box(7.48, 0.44, 0.11, 0.07, 0.98, 0.02)
  box(7.97, 0.44, 0.11, 0.07, 0.98, 0.02)
  box(7.48, 0.4, 0.11, 0.015, 1.2, 0.09, 'w2')
  box(7.97, 0.4, 0.11, 0.015, 1.2, 0.09, 'w2')
  // disc sander
  box(6.88, 0.12, 0.44, 0.3, 0.87, 0.08)
  cylX(0.27, 1.08, 0.1, 7.12, 7.38)
  cylY(7.05, 1.1, 0.22, 0.41, 0.45)
  cylY(7.05, 1.1, 0.2, 0.45, 0.455, 'w2')
  box(6.97, 0.45, 0.2, 0.04, 0.9, 0.08)
  box(6.85, 0.46, 0.42, 0.18, 0.98, 0.03)
  // blue crates stacked on the right of it
  crate(8.45, 0.1, 0.48, 0.62, 0, 0.3)
  crate(8.47, 0.12, 0.46, 0.58, 0.3, 0.26)

  // ================= Lathe, along the left wall, chuck toward the entry =================
  begin('lathe', [0.42, 1.79, 1.5])
  const L = 'm' as const
  shadow(0.06, 0.28, 0.74, 1.8)
  cbox(0.08, 0.3, 0.66, 1.75, 0, 0.8, 0.03, L) // cabinet
  for (const sy of [0.85, 1.4]) strip(0.12, 0.7, 2.05, 0.15 + (sy - 0.85), 0.012, M2) // doors
  dots(0.3, 0.5, 2, 2.05, 0.6, 0.012, M2)
  box(0.04, 0.26, 0.74, 1.83, 0.8, 0.04, L) // chip tray
  box(0.06, 0.28, 0.7, 1.79, 0.84, 0.005, M2)
  box(0.24, 0.35, 0.28, 1.18, 0.84, 0.12, L) // bed
  tstrip(0.27, 0.31, 0.35, 1.53, 0.961, M2) // ways
  tstrip(0.45, 0.49, 0.35, 1.53, 0.961, M2)
  cylY(0.37, 1.14, 0.08, 0.36, 0.39, L) // tailstock wheel and handle
  box(0.36, 0.36, 0.02, 0.02, 1.2, 0.06, L)
  box(0.22, 0.37, 0.3, 0.28, 0.96, 0.1, L) // tailstock
  cbox(0.26, 0.39, 0.22, 0.24, 1.06, 0.14, 0.02, L)
  cylY(0.37, 1.14, 0.035, 0.63, 0.8, L) // quill
  box(0.12, 0.87, 0.6, 0.3, 0.96, 0.08, L) // saddle
  box(0.22, 0.93, 0.36, 0.18, 1.04, 0.06, L) // cross slide
  box(0.3, 0.95, 0.14, 0.14, 1.1, 0.1, L) // tool post
  box(0.36, 1.03, 0.03, 0.12, 1.14, 0.015, L) // tool
  cbox(0.62, 0.84, 0.14, 0.36, 0.7, 0.34, 0.02, L) // apron
  cylX(1.02, 0.88, 0.08, 0.76, 0.8, L) // apron wheel
  cylX(0.93, 1.0, 0.03, 0.76, 0.86, L) // feed levers
  cylX(1.1, 1.0, 0.03, 0.76, 0.86, L)
  cylY(0.38, 1.08, 0.03, 1.25, 1.41, L) // the part
  cylY(0.38, 1.08, 0.15, 1.41, 1.53, L) // chuck
  for (const a of [0, 2.1, 4.2]) box(0.38 + 0.11 * Math.cos(a) - 0.02, 1.4, 0.04, 0.02, 1.08 + 0.11 * Math.sin(a) - 0.02, 0.04, M2) // jaws
  cbox(0.1, 1.53, 0.6, 0.5, 0.84, 0.46, 0.03, L) // headstock
  cbox(0.14, 1.59, 0.52, 0.4, 1.3, 0.12, 0.03, L) // belt cover
  for (const kx of [0.2, 0.3, 0.56]) cylY(kx, 1.0, 0.025, 2.03, 2.06, L) // speed knobs
  box(0.7, 1.9, 0.03, 0.03, 1.3, 0.25, L) // DRO post and screen
  box(0.6, 1.9, 0.24, 0.05, 1.5, 0.2, L)
  box(0.62, 1.95, 0.2, 0.004, 1.53, 0.14, M2)
  box(0.1, 2.06, 0.5, 0.012, 1.3, 0.4, M2) // chuck guard shield
  end()

  // ================= Middle: secondary glass table, the big work table =================
  table(0.02, 2.5, 2.4, 0.95, 0.9) // secondary table
  poly([P(0.04, 2.52, 0.905), P(2.4, 2.52, 0.905), P(2.4, 3.43, 0.905), P(0.04, 3.43, 0.905)], 't', 'win') // its glass top
  box(0.05, 2.53, 2.32, 0.89, 0.2, 0.03) // lower shelf
  cbox(0.25, 2.65, 0.55, 0.45, 0.9, 0.36, 0.02) // grey electrical box
  strip(0.3, 0.75, 3.1, 1.1, 0.012, 'w2')
  box(0.68, 3.09, 0.04, 0.02, 1.05, 0.06)
  box(1.0, 2.65, 0.4, 0.3, 0.9, 0.12, 'w2') // a box of balls
  for (let i = 0; i < 3; i++) cylZ(1.08 + i * 0.12, 2.77, 0.05, 1.02, 0.04)
  box(1.5, 2.6, 0.4, 0.5, 0.9, 0.06) // tools
  box(1.6, 2.75, 0.18, 0.06, 0.96, 0.03, 'w2')

  // The big work table: dark steel top, three vises, black crates on the shelf under it
  shadow(6.1, 1.45, 1.15, 2.95)
  legs(6.12, 1.47, 1.1, 2.9, 0.84, 0.08)
  box(6.16, 1.52, 1.02, 2.8, 0.22, 0.03) // shelf
  for (let i = 0; i < 5; i++) crate(6.2 + (i % 2) * 0.0, 1.58 + i * 0.55, 0.92, 0.5, 0.25, 0.32)
  box(6.1, 1.45, 1.15, 2.95, 0.84, 0.07) // steel top
  box(6.1, 1.45, 1.15, 2.95, 0.91, 0.006, 'w2')
  vise(7.18, 2.05, Math.PI / 2) // two red vises on the right edge
  vise(7.18, 2.75, Math.PI / 2)
  vise(6.18, 3.35, -Math.PI / 2, 'w2') // the blue one on the left edge
  box(6.5, 3.8, 0.3, 0.12, 0.91, 0.02) // pliers and a bracket left on it
  cylZ(6.65, 3.55, 0.12, 0.91, 0.015)

  // ================= Right wall: cantilever stock rack (opens Stock) =================
  begin('stock', [8.6, 2.3, 2.0])
  shadow(8.35, 1.95, 0.6, 2.25)
  const uprights = [2.05, 2.65, 3.25, 3.85]
  for (const uy of uprights) {
    box(8.88, uy, 0.08, 0.08, 0, 1.9) // upright
    box(8.75, uy - 0.04, 0.2, 0.16, 0, 0.04) // foot
  }
  const levels = [0.32, 0.66, 1.0, 1.34, 1.68]
  levels.forEach((z, li) => {
    for (const uy of uprights) prismX(8.42, 8.88, [[uy, z], [uy + 0.08, z], [uy + 0.08, z + 0.05], [uy, z + 0.07]]) // arms, sloping up
    // bars lying on the arms: tubes, profiles and flat bar of different lengths
    for (let i = 0; i < 6; i++) {
      const x = 8.45 + i * 0.07
      const y0 = 1.95 + ((i * 7 + li * 3) % 5) * 0.04
      const len = 1.9 + ((i * 5 + li * 2) % 6) * 0.06
      if ((i + li) % 3 === 0) cylY(x + 0.025, z + 0.08, 0.025, y0, y0 + len)
      else box(x, y0, 0.05, len, z + 0.05, (i + li) % 3 === 1 ? 0.05 : 0.02)
    }
  })
  end()

  // ================= Front wall (hallway window): drill presses, drawers, Beta cart, organizer bench =================
  // Drill press table with two drill presses and the mini mill; drill chargers on the sill
  table(4.55, 4.75, 1.8, 0.62, 0.9)
  box(4.6, 4.8, 1.7, 0.52, 0.2, 0.03) // shelf with crates
  crate(4.65, 4.84, 0.5, 0.44, 0.23, 0.26)
  crate(5.25, 4.84, 0.5, 0.44, 0.23, 0.26)
  box(5.85, 4.86, 0.4, 0.3, 0.23, 0.16) // yellow tub
  const drillPress = (x: number, t: 'n' | 'w2', big: boolean) => {
    const h = big ? 0.75 : 0.62
    box(x - 0.13, 4.9, 0.26, 0.34, 0.9, 0.04, t) // base
    cylZ(x, 5.2, 0.035, 0.94, h, t) // column
    box(x - 0.11, 4.92, 0.22, 0.2, 1.06, 0.03, t) // table
    box(x - 0.07, 4.95, 0.14, 0.12, 1.09, 0.05) // vise on it
    cbox(x - 0.1, 4.98, 0.2, 0.3, 0.94 + h - 0.22, 0.22, 0.02, t) // head
    cylZ(x, 5.13, 0.07, 0.94 + h, 0.12, t) // motor
    cylZ(x, 5.0, 0.02, 0.94 + h - 0.32, 0.1) // chuck
    box(x + 0.1, 5.05, 0.12, 0.012, 0.94 + h - 0.12, 0.012) // feed handle
  }
  drillPress(4.8, 'n', true) // red drill press
  drillPress(5.35, 'w2', false) // black drill press
  box(5.68, 4.9, 0.4, 0.34, 0.9, 0.05) // mini mill: base, column, head, table
  box(5.75, 4.95, 0.3, 0.12, 0.95, 0.04)
  cbox(5.82, 5.15, 0.14, 0.12, 0.95, 0.55, 0.01)
  cbox(5.8, 4.98, 0.18, 0.2, 1.32, 0.18, 0.02)
  cylZ(5.89, 5.04, 0.05, 1.5, 0.08)
  for (let i = 0; i < 5; i++) box(4.62 + i * 0.32, 5.32, 0.18, 0.08, 1.05, 0.08, 'w2') // chargers on the sill
  box(4.55, 5.32, 1.8, 0.08, 1.0, 0.05) // the sill

  // Wooden three-drawer unit, just past the end of the long table
  shadow(6.38, 4.86, 0.38, 0.5)
  box(6.4, 4.84, 0.4, 0.54, 0, 0.1) // crate under it
  cbox(6.4, 4.86, 0.38, 0.5, 0.1, 0.6, 0.01)
  for (let i = 0; i < 3; i++) {
    strip(6.43, 6.75, 5.36, 0.16 + i * 0.19, 0.012, 'w2')
    box(6.54, 5.36, 0.1, 0.012, 0.26 + i * 0.19, 0.02)
  }

  // The long wooden table along the window, from the stock corner over the Beta cart
  const TX = 6.86
  const TW = RW - TX - 0.04
  shadow(TX, 4.72, TW, 0.66)
  legs(TX, 4.72, TW, 0.66, 0.86, 0.05)
  box(TX + TW / 2 - 0.03, 4.72, 0.05, 0.05, 0, 0.86) // middle leg

  // Beta tool cart under it: wheels, drawers with pulls, side handle
  for (const [wx, wy] of [
    [6.98, 4.82],
    [7.66, 4.82],
    [6.98, 5.28],
    [7.66, 5.28],
  ])
    cylZ(wx, wy, 0.04, 0, 0.06)
  cbox(6.92, 4.78, 0.8, 0.56, 0.06, 0.76, 0.02)
  for (let i = 0; i < 7; i++) {
    strip(6.96, 7.68, 5.34, 0.12 + i * 0.095, 0.012, 'w2')
    box(7.16, 5.34, 0.36, 0.014, 0.15 + i * 0.095, 0.022, 'w2')
  }
  box(7.72, 4.9, 0.03, 0.3, 0.45, 0.25) // side handle
  box(6.92, 4.78, 0.8, 0.56, 0.82, 0.015, 'w2') // its top mat

  // Orange-framed shelves of tool cases under the table, in the stock corner
  const SX = 7.82
  for (const px of [SX, RW - 0.08]) box(px, 4.76, 0.04, 0.58, 0, 0.84)
  box(SX, 4.76, RW - 0.04 - SX, 0.02, 0, 0.84) // back panel
  ;[0.04, 0.3, 0.56].forEach((sz, r) => {
    box(SX + 0.04, 4.78, RW - 0.12 - SX, 0.56, sz, 0.02) // shelf
    for (let i = 0; i < 2; i++) {
      const cx = SX + 0.08 + i * 0.5
      cbox(cx, 4.84 + (r % 2) * 0.03, 0.44, 0.42, sz + 0.02, 0.12, 0.015, 'w2') // tool case
      box(cx + 0.18, 5.26 + (r % 2) * 0.03, 0.08, 0.012, sz + 0.08, 0.02) // its latch
    }
  })

  // The top, and what's on it
  box(TX, 4.72, TW, 0.66, 0.86, 0.05) // wooden top
  strip(TX, TX + TW, 5.38, 0.86, 0.012, 'w2')
  for (let i = 0; i < 3; i++) {
    const cx = 7.0 + i * 0.6
    cbox(cx, 5.0, 0.52, 0.34, 0.91, 0.1, 0.02, 'w2') // organizer case, lid open
    for (let c = 0; c < 4; c++) tstrip(cx + 0.04 + c * 0.12, cx + 0.14 + c * 0.12, 5.04, 5.3, 1.011) // its compartments
    box(cx, 4.94, 0.52, 0.06, 0.91, 0.26) // the lid, standing up
    box(cx + 0.2, 5.34, 0.12, 0.012, 0.96, 0.03) // latch
  }
  // Two-tier rack of blue bins along the back, by the window
  for (const [bz, by] of [
    [0.91, 4.74],
    [1.1, 4.76],
  ]) {
    box(7.0, by, 1.72, 0.2, bz, 0.02) // rack shelf
    for (let i = 0; i < 4; i++) {
      cbox(7.04 + i * 0.42, by + 0.01, 0.36, 0.18, bz + 0.02, 0.15, 0.01, 'w2') // bin
      box(7.08 + i * 0.42, by + 0.03, 0.28, 0.12, bz + 0.17, 0.004) // bolts in it
    }
  }
  box(8.78, 4.85, 0.18, 0.2, 0.91, 0.08) // drill bit sets and boxes at the end
  box(8.78, 5.1, 0.16, 0.14, 0.91, 0.12, 'w2')
  for (let i = 0; i < 5; i++) cylZ(8.82 + (i % 3) * 0.05, 5.27, 0.012, 0.91, 0.06 + i * 0.01)

  // ================= Workshop PC: a touchscreen on the left wall =================
  box(0.0, 4.38, 0.05, 0.16, 1.18, 0.22) // wall bracket
  box(0.05, 4.1, 0.1, 0.72, 1.05, 0.46) // screen, facing into the room
  box(0.15, 4.14, 0.004, 0.64, 1.09, 0.38, 'w2')

  // ================= Low walls: left, and front with the entry gap =================
  box(-0.15, -0.15, 0.15, RD + 0.3, 0, 0.22, 'wall')
  box(-0.15, RD, 0.62, 0.15, 0, 0.22, 'wall')
  box(1.55, RD, RW - 1.4, 0.15, 0, 0.22, 'wall')

  const [ex, ey] = P(1.06, RD + 0.5)
  return k.done({
    name: 'Workshop',
    viewBox: '30 50 820 690',
    miniViewBox: '30 150 820 360',
    floor,
    entry: [ex, ey + 12],
    entryLabel: 'Entry',
    machines: [
      { spot: 'lathe', machine: 'Lathe' },
      { spot: 'mill', machine: 'Mill' },
    ],
    links: [
      { spot: 'stock', label: 'Stock →', to: '/stock' },
      { spot: 'saw', label: 'Cut list →', to: '/stock/cut' },
    ],
  })
}

export const ROOM: Room = build()
