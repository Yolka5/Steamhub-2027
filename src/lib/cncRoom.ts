import { roomKit, type Room } from './roomKit'

// The CNC room (WORKSHOP_MAP.md, phase 6): 3 m wide, 4.5 m deep, door in the front wall on the
// right. Seen from the door, leaning left, so the left wall stands and the right one is cut low.
// x: left wall 0 to right wall 3. y: back wall 0 to front wall 4.5. z: up. Metres.

function build(): Room {
  const k = roomKit({ s: 80, kx: -0.12, ky: 0.84, ys: 0.86, ox: 60, oy: 330 })
  const { P, pts, poly, begin, end, prism, box, cbox, rot, prismX, cylZ, cylY, cylX, hose, strip, tstrip, dots, shadow, rshadow } = k
  const RW = 3
  const RD = 4.5
  const WH = 2.4
  const floor = pts([P(0, 0), P(RW, 0), P(RW, RD), P(0, RD)])

  // ---------- Back wall: hopper windows, outlets, a cord hanging from the ceiling ----------
  box(-0.15, -0.15, RW + 0.3, 0.15, 0, WH, 'wall')
  for (const [a, b] of [
    [0.88, 1.3],
    [1.62, 2.04],
  ]) {
    poly([P(a - 0.04, 0, 1.76), P(b + 0.04, 0, 1.76), P(b + 0.04, 0, 2.24), P(a - 0.04, 0, 2.24)], 's', 'n')
    poly([P(a, 0, 1.8), P(b, 0, 1.8), P(b, 0, 2.2), P(a, 0, 2.2)], 't', 'win')
    prism(
      [
        [a, 0],
        [b, 0],
        [b, 0.14],
        [a, 0.14],
      ],
      2.16,
      0.025,
      'w2',
    ) // sash tipped open
  }
  for (const ox of [0.55, 2.2]) box(ox, 0, 0.08, 0.015, 1.15, 0.08) // outlets
  box(0.2, 0, 2, 0.012, 1.7, 0.02) // cable run
  box(1.24, 0.03, 0.02, 0.02, 1.45, 0.85) // extension cord
  for (let i = 0; i < 3; i++) box(1.22, 0.02, 0.06, 0.04, 1.5 + i * 0.12, 0.06, 'w2')
  box(-0.15, -0.15, 0.15, RD + 0.3, 0, WH, 'wall') // left wall, full height

  // ---------- Dust collector with the compressor on top, back right ----------
  shadow(2.3, 0.06, 0.62, 0.62)
  cbox(2.3, 0.06, 0.62, 0.62, 0.04, 1.5, 0.04)
  for (const cx of [2.36, 2.86]) cylZ(cx, 0.62, 0.035, 0, 0.05) // casters
  cbox(2.35, 0.665, 0.52, 0.02, 0.2, 0.95, 0.01) // door
  for (let i = 0; i < 6; i++) strip(2.42, 2.8, 0.688, 0.95 + i * 0.045, 0.014, 'w2') // vent slots
  box(2.78, 0.688, 0.03, 0.02, 0.6, 0.18) // handle
  box(2.42, 0.688, 0.16, 0.005, 0.45, 0.1, 'w2') // label
  cylZ(2.85, 0.6, 0.045, 1.54, 0.12) // red cap
  cbox(2.36, 0.12, 0.5, 0.42, 1.54, 0.08, 0.03) // top plate
  cylX(0.3, 1.74, 0.12, 2.38, 2.84) // compressor tank and its end caps
  cylX(0.3, 1.74, 0.125, 2.36, 2.39)
  cylX(0.3, 1.74, 0.125, 2.83, 2.86)
  cylY(2.5, 1.9, 0.045, 0.32, 0.36) // gauge
  box(2.66, 0.2, 0.16, 0.2, 1.86, 0.14) // motor and fins
  for (let i = 0; i < 4; i++) box(2.66, 0.205 + i * 0.05, 0.16, 0.012, 2, 0.015, 'w2')
  hose(
    [
      [2.62, 0.32, 2],
      [2.62, 0.3, 2.2],
      [2.55, 0.22, 2.38],
    ],
    0.13,
  ) // duct to the ceiling

  // ---------- PC corner: cabinet with the jug, two monitors, keyboard shelf ----------
  for (const [px, py] of [
    [2.3, 0.74],
    [2.72, 0.74],
    [2.3, 1.12],
    [2.72, 1.12],
  ])
    box(px, py, 0.05, 0.05, 0, 0.62)
  box(2.3, 0.74, 0.47, 0.02, 0.05, 0.57)
  for (const sz of [0.04, 0.3, 0.6]) box(2.3, 0.74, 0.47, 0.43, sz, 0.03)
  box(2.36, 0.8, 0.3, 0.3, 0.33, 0.12, 'w2')
  cylZ(2.42, 0.95, 0.075, 0.63, 0.21) // white jug
  cylZ(2.42, 0.95, 0.03, 0.84, 0.04)
  box(2.48, 0.91, 0.03, 0.05, 0.75, 0.08)
  const monitor = (cx: number, cy: number, a: number, w: number, h: number, z: number, d = 0.05) => {
    prism(rot(cx, cy, w, d, a), z, h)
    const nx = -Math.sin(a)
    const ny = Math.cos(a) // its front faces the room
    prism(rot(cx + nx * (d / 2 + 0.004), cy + ny * (d / 2 + 0.004), w - 0.05, 0.008, a), z + 0.03, h - 0.06, 'w2') // screen
    prism(rot(cx - nx * (d / 2 + 0.03), cy - ny * (d / 2 + 0.03), 0.14, 0.06, a), z + h * 0.3, 0.14) // mount
  }
  box(2.86, 0.96, 0.14, 0.05, 1.24, 0.06) // arm from the right wall
  box(2.82, 0.92, 0.06, 0.1, 1.2, 0.12)
  monitor(2.56, 0.98, 0, 0.6, 0.38, 1.1) // wide monitor, facing the room
  box(2.96, 1.5, 0.04, 0.14, 1.12, 0.22) // wall bracket and arm
  box(2.86, 1.55, 0.12, 0.04, 1.2, 0.04)
  monitor(2.74, 1.58, 0.75, 0.5, 0.4, 1) // second monitor, swung out
  box(2.94, 1.42, 0.06, 0.06, 0.66, 0.16) // keyboard shelf, keyboard, mouse
  prism(rot(2.8, 1.46, 0.34, 0.24, 0.75), 0.8, 0.025)
  prism(rot(2.79, 1.45, 0.26, 0.1, 0.75), 0.825, 0.014, 'w2')
  cylZ(2.9, 1.37, 0.022, 0.825, 0.018)

  // Whiteboard toward the door
  box(2.94, 2.12, 0.06, 1.62, 0.86, 1.16)
  box(2.93, 2.17, 0.07, 1.52, 0.91, 1.06, 'w2')
  box(2.86, 2.25, 0.1, 1.2, 0.86, 0.035)
  for (const mx of [2.4, 2.6, 2.75]) cylY(2.9, 0.9, 0.012, mx, mx + 0.1)

  // ---------- The CNC router: stand and bed ----------
  begin('cnc', [1.44, 1.0, 1.85])
  const M = 'm' as const
  const M2 = 'm2' as const
  shadow(0.82, 0.12, 1.32, 2.05)
  for (const [px, py] of [
    [0.92, 0.2],
    [1.92, 0.2],
    [0.92, 1.82],
    [1.92, 1.82],
  ])
    cbox(px, py, 0.07, 0.07, 0, 0.8, 0.015, M) // stand posts
  box(0.92, 0.2, 1.07, 1.69, 0.06, 0.04, M)
  box(0.99, 0.27, 0.93, 1.5, 0.1, 0.6, M) // electronics bay
  for (let i = 0; i < 4; i++) {
    box(1 + i * 0.22, 1.77, 0.17, 0.03, 0.16, 0.48, M) // driver boards and their lights
    dots(1.04 + i * 0.22, 1.12 + i * 0.22, 3, 1.8, 0.58, 0.01, M2)
  }
  for (let i = 0; i < 5; i++) box(0.99 + i * 0.19, 1.84, 0.11, 0.02, 0.1, 0.62, M) // front slats
  hose(
    [
      [1.7, 1.86, 0.6],
      [1.68, 1.92, 0.35],
      [1.62, 1.95, 0.15],
    ],
    0.014,
    M,
  )
  box(0.92, 0.2, 1.07, 1.69, 0.74, 0.08, M) // top frame
  cbox(0.84, 0.13, 1.3, 1.88, 0.82, 0.1, 0.03, M) // bed frame
  dots(0.92, 2.06, 9, 2.01, 0.87, 0.012, M2) // bolt heads
  box(0.92, 0.2, 1.14, 1.72, 0.92, 0.03, M) // T-slot plate
  for (const tx of [1.06, 1.22, 1.38, 1.54, 1.7, 1.86]) tstrip(tx, tx + 0.016, 0.24, 1.88, 0.951, M)
  box(1, 1.98, 0.92, 0.17, 0.7, 0.05, M) // tool tray and tools
  for (const [tx, tw] of [
    [1.04, 0.2],
    [1.3, 0.08],
    [1.44, 0.22],
    [1.72, 0.12],
  ])
    box(tx, 2.01, tw, 0.09, 0.75, 0.025, M)
  box(0.85, 0.13, 0.07, 1.88, 0.92, 0.05, M) // rail supports and round rails
  box(2.07, 0.13, 0.07, 1.88, 0.92, 0.05, M)
  cylY(0.885, 1.01, 0.025, 0.14, 2, M)
  cylY(2.105, 1.01, 0.025, 0.14, 2, M)
  box(2.14, 0.3, 0.06, 1.35, 0.94, 0.05, M) // drag chain
  for (let i = 0; i < 8; i++) box(2.14, 0.31 + i * 0.165, 0.06, 0.1, 0.99, 0.035, M)
  box(1.42, 0.02, 0.18, 0.12, 0.84, 0.16, M) // Y motor at the back
  for (let i = 0; i < 4; i++) box(1.42, 0.025 + i * 0.03, 0.18, 0.012, 1, 0.012, M2)
  cylZ(2.06, 2, 0.05, 0.92, 0.04, M) // emergency stop
  cylZ(2.06, 2, 0.06, 0.96, 0.035, M)
  end()

  // Coiled air hose over the machine, behind the gantry
  for (let i = 0; i < 11; i++) cylZ(1.74, 0.58, 0.075, 1.38 + i * 0.085, 0.028)
  box(1.735, 0.575, 0.012, 0.012, 2.31, 0.09)

  // ---------- The CNC router: gantry, Z and spindle ----------
  begin('cnc')
  const plate: [number, number][] = [
    [0.72, 0.92],
    [1.36, 0.92],
    [1.22, 1.66],
    [0.86, 1.66],
  ]
  prismX(0.82, 0.88, plate, M) // sloped side plates
  prismX(2.07, 2.13, plate, M)
  box(0.76, 0.92, 0.06, 0.16, 1.18, 0.16, M) // X motors
  box(2.13, 0.92, 0.06, 0.16, 1.18, 0.16, M)
  cbox(0.82, 0.88, 1.31, 0.22, 1.4, 0.2, 0.02, M) // beam, rails, ball screw
  cylX(1.11, 1.54, 0.02, 0.84, 2.11, M)
  cylX(1.11, 1.44, 0.02, 0.84, 2.11, M)
  cylX(1.12, 1.49, 0.012, 0.84, 2.11, M2)
  for (let i = 0; i < 8; i++) box(0.9 + i * 0.15, 0.92, 0.1, 0.14, 1.6, 0.04, M) // cable chain
  box(1.94, 0.95, 0.16, 0.14, 1.6, 0.14, M)
  cbox(1.28, 1.1, 0.32, 0.12, 1.12, 0.56, 0.015, M) // Z carriage and rails
  cylZ(1.34, 1.18, 0.015, 1.12, 0.56, M)
  cylZ(1.54, 1.18, 0.015, 1.12, 0.56, M)
  box(1.36, 1.04, 0.16, 0.14, 1.68, 0.16, M) // Z motor and fins
  for (let i = 0; i < 4; i++) box(1.36, 1.045 + i * 0.035, 0.16, 0.01, 1.84, 0.012, M2)
  cylZ(1.44, 1.32, 0.13, 0.99, 0.05, M) // dust shoe, brush, bit, collet
  cylZ(1.44, 1.32, 0.12, 0.965, 0.025, M2)
  cylZ(1.44, 1.32, 0.012, 0.94, 0.06, M)
  cylZ(1.44, 1.32, 0.03, 1.04, 0.05, M)
  cylZ(1.44, 1.32, 0.075, 1.09, 0.4, M) // spindle and its rings
  for (const zr of [1.16, 1.3, 1.44]) cylZ(1.44, 1.32, 0.082, zr, 0.012, M)
  cylZ(1.44, 1.32, 0.05, 1.49, 0.05, M)
  box(1.53, 1.3, 0.1, 0.06, 1.02, 0.05, M) // dust port
  end()

  // Dust hoses to the collector
  hose(
    [
      [1.62, 1.33, 1.04],
      [1.86, 1.28, 1.5],
      [2.1, 1, 1.74],
      [2.36, 0.62, 1.58],
      [2.48, 0.5, 1.3],
    ],
    0.07,
  )
  hose(
    [
      [2.3, 0.66, 0.55],
      [2.2, 0.8, 0.6],
      [2.08, 0.92, 0.66],
    ],
    0.06,
  )

  // ---------- Left wall: corkboard, then the parts organizer (End mills) by the door wall ----------
  box(0, 2, 0.035, 1.35, 1, 0.6)
  box(-0.005, 1.98, 0.05, 1.39, 1.58, 0.025)
  for (const [py, pz, ph] of [
    [2.08, 1.24, 0.3],
    [2.42, 1.3, 0.25],
    [2.72, 1.1, 0.36],
    [3.02, 1.2, 0.28],
  ])
    box(0.035, py, 0.012, 0.24, pz, ph, 'w2')
  box(0.035, 2.95, 0.015, 0.2, 1.05, 0.16)

  begin('endmills', [0.2, 3.78, 1.85])
  cbox(0.02, 3.45, 0.36, 0.66, 1.07, 0.62, 0.02)
  for (let r = 0; r < 6; r++) {
    strip(0.05, 0.35, 4.11, 1.11 + r * 0.095, 0.014) // drawer rows and pulls
    dots(0.12, 0.3, 2, 4.112, 1.15 + r * 0.095, 0.01, 'w2')
  }
  box(0.03, 3.47, 0.38, 0.5, 1.69, 0.05) // tray with tape and bits
  box(0.08, 3.52, 0.16, 0.18, 1.74, 0.07)
  cylZ(0.16, 3.61, 0.07, 1.74, 0.07)
  cylZ(0.28, 3.85, 0.05, 1.74, 0.08)
  box(0.24, 3.62, 0.1, 0.06, 1.74, 0.05)
  box(0.1, 4.12, 0.03, 0.03, 0.83, 0.36) // brush and spanner hanging off it
  box(0.07, 4.1, 0.09, 0.07, 0.71, 0.16)
  box(0.3, 4.12, 0.04, 0.04, 0.87, 0.3)
  end()

  rshadow(0.5, 4.05, 0.22) // black bin
  cylZ(0.5, 4.05, 0.22, 0, 0.56)
  cylZ(0.5, 4.05, 0.235, 0.56, 0.04)
  cylZ(0.48, 4.03, 0.17, 0.6, 0.06, 'w2')

  // ---------- The stool: round base, post, chrome foot ring, seat with a low back ----------
  rshadow(1.15, 3.05, 0.24)
  cylZ(1.15, 3.05, 0.24, 0, 0.02)
  cylZ(1.15, 3.05, 0.16, 0.02, 0.025)
  cylZ(1.15, 3.05, 0.03, 0.045, 0.6)
  for (let i = 0; i < 48; i++) {
    const t = (2 * Math.PI * i) / 48
    cylZ(1.15 + 0.2 * Math.cos(t), 3.05 + 0.2 * Math.sin(t), 0.014, 0.3, 0.014)
  }
  for (const t of [0.6, 2.2, 4]) cylZ(1.15 + 0.1 * Math.cos(t), 3.05 + 0.1 * Math.sin(t), 0.01, 0.3, 0.015)
  cylZ(1.15, 3.05, 0.07, 0.6, 0.05)
  cylZ(1.15, 3.05, 0.21, 0.64, 0.07)
  for (let i = 0; i < 26; i++) {
    const t = Math.PI * (1.05 + (0.9 * i) / 25)
    cylZ(1.15 + 0.2 * Math.cos(t), 3.05 + 0.2 * Math.sin(t), 0.035, 0.68, 0.12)
  }

  // ---------- Low walls: front (the door is the gap) and right ----------
  box(-0.15, RD, 1.75, 0.15, 0, 0.22, 'wall')
  box(2.45, RD, RW - 2.3, 0.15, 0, 0.22, 'wall')
  box(RW, -0.15, 0.15, RD + 0.3, 0, 0.22, 'wall')

  const [ex, ey] = P(2, RD + 0.45)
  return k.done({
    name: 'CNC room',
    viewBox: '0 80 430 680',
    miniViewBox: '0 170 400 420',
    floor,
    entry: [ex, ey + 14],
    entryLabel: 'Door',
    machines: [{ spot: 'cnc', machine: 'CNC' }],
    links: [{ spot: 'endmills', label: 'End mills →', to: '/stock/end-mills' }],
  })
}

export const CNC_ROOM: Room = build()
