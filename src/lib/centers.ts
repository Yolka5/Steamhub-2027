// Center distance math for belts, chain and gears. Everything in mm.

export type DriveKind = 'belt' | 'chain' | 'gear'

export interface DriveType {
  id: string
  kind: DriveKind
  label: string
  /** Belt or chain pitch in mm, or the gear module (mm of pitch diameter per tooth). */
  pitch: number
}

export const DRIVES: DriveType[] = [
  { id: 'htd5', kind: 'belt', label: 'HTD 5 mm belt', pitch: 5 },
  { id: 'gt3', kind: 'belt', label: 'GT2 / HTD 3 mm belt', pitch: 3 },
  { id: 'c25', kind: 'chain', label: '#25 chain', pitch: 6.35 },
  { id: 'c35', kind: 'chain', label: '#35 chain', pitch: 9.525 },
  { id: 'dp20', kind: 'gear', label: '20 DP gear', pitch: 25.4 / 20 },
  { id: 'dp32', kind: 'gear', label: '32 DP gear', pitch: 25.4 / 32 },
  { id: 'mod1', kind: 'gear', label: 'Module 1 gear', pitch: 1 },
  { id: 'mod15', kind: 'gear', label: 'Module 1.5 gear', pitch: 1.5 },
]

/** Usual FRC gear clearance, 0.003 in. */
export const GEAR_EXTRA = 0.0762

/** Exact open-belt pitch length for pulleys z1, z2 at center distance c. */
export function beltLength(p: number, z1: number, z2: number, c: number) {
  const r1 = (Math.min(z1, z2) * p) / (2 * Math.PI)
  const r2 = (Math.max(z1, z2) * p) / (2 * Math.PI)
  const phi = Math.asin(Math.min(1, (r2 - r1) / c))
  return 2 * c * Math.cos(phi) + Math.PI * (r1 + r2) + 2 * phi * (r2 - r1)
}

/** Center distance for a belt of `teeth` teeth. Null if the belt is too short to wrap both pulleys. */
export function beltCenter(p: number, z1: number, z2: number, teeth: number) {
  const L = teeth * p
  const r1 = (Math.min(z1, z2) * p) / (2 * Math.PI)
  const r2 = (Math.max(z1, z2) * p) / (2 * Math.PI)
  // Below r1 + r2 the pulleys overlap, so that's the shortest center distance worth reporting.
  let lo = r1 + r2
  if (beltLength(p, z1, z2, lo) > L) return null
  let hi = L
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (beltLength(p, z1, z2, mid) < L) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Fractional belt teeth that would give exactly center distance c. */
export const beltTeethAt = (p: number, z1: number, z2: number, c: number) => beltLength(p, z1, z2, c) / p

/** Standard chain length formula, in links (fractional). */
export function chainLinksAt(p: number, z1: number, z2: number, c: number) {
  const k = (z2 - z1) / (2 * Math.PI)
  return (2 * c) / p + (z1 + z2) / 2 + (k * k * p) / c
}

/** Center distance for a chain of `links` links. Null if too short. */
export function chainCenter(p: number, z1: number, z2: number, links: number) {
  const a = links - (z1 + z2) / 2
  const k = (z2 - z1) / (2 * Math.PI)
  const disc = a * a - 8 * k * k
  if (a <= 0 || disc < 0) return null
  const c = (p / 4) * (a + Math.sqrt(disc))
  // Sprockets would overlap.
  const minC = (p / Math.sin(Math.PI / z1) + p / Math.sin(Math.PI / z2)) / 2
  return c < minC ? null : c
}

export const pulleyPitchDiameter = (p: number, z: number) => (z * p) / Math.PI
export const sprocketPitchDiameter = (p: number, z: number) => p / Math.sin(Math.PI / z)
export const gearPitchDiameter = (m: number, z: number) => m * z
export const gearCenter = (m: number, z1: number, z2: number) => (m * (z1 + z2)) / 2

export interface Option {
  count: number
  center: number
  delta: number
}

/**
 * Belts or chains around the target: `around` options on each side of the ideal count,
 * stepping by `step` (1 for any count, 5 for belts sold in steps of 5).
 */
export function optionsNear(drive: DriveType, z1: number, z2: number, target: number, step = 1, around = 3): Option[] {
  const p = drive.pitch
  const ideal = drive.kind === 'belt' ? beltTeethAt(p, z1, z2, target) : chainLinksAt(p, z1, z2, target)
  const base = Math.round(ideal / step) * step
  const out: Option[] = []
  for (let i = -around; i <= around; i++) {
    const count = base + i * step
    if (count <= 0) continue
    const center = drive.kind === 'belt' ? beltCenter(p, z1, z2, count) : chainCenter(p, z1, z2, count)
    if (center == null) continue
    out.push({ count, center, delta: center - target })
  }
  return out
}

/** Exact center distance for a belt or chain you already have. Null if it's too short to fit. */
export function centerForCount(drive: DriveType, z1: number, z2: number, count: number) {
  return drive.kind === 'belt' ? beltCenter(drive.pitch, z1, z2, count) : chainCenter(drive.pitch, z1, z2, count)
}

export interface GearPair {
  z1: number
  z2: number
  ratio: number
  center: number
  delta: number
}

/**
 * Gear pairs that fit a center distance you already have, closest to the ratio you want.
 * For a given module the distance only depends on the total teeth, so it tries the tooth totals
 * around the target and, for each, the split that gets nearest the ratio.
 */
export function gearPairsNear(m: number, target: number, ratio: number, minTeeth = 10, maxTeeth = 120, around = 2): GearPair[] {
  const r = Math.max(1, ratio)
  const sum0 = Math.round((2 * target) / m)
  const out: GearPair[] = []
  for (let s = sum0 - around; s <= sum0 + around; s++) {
    // Try the two splits either side of the exact ratio, keep both: one a bit under, one a bit over.
    const ideal = s / (1 + r)
    for (const z1 of new Set([Math.floor(ideal), Math.ceil(ideal)])) {
      const z2 = s - z1
      if (z1 < minTeeth || z2 > maxTeeth || z2 < z1) continue
      const center = gearCenter(m, z1, z2)
      out.push({ z1, z2, ratio: z2 / z1, center, delta: center - target })
    }
  }
  // Closest distance first, then closest ratio.
  return out.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || Math.abs(a.ratio - r) - Math.abs(b.ratio - r))
}
