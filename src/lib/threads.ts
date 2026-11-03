// Tap drills and clearance holes. One list feeds the cheat sheet tables, the lookup and Ctrl K.
//
// Imperial: tap drill for 75% thread, close and free fit clearance, from the Little Machine Shop
// tap drill chart (machinist convention), converted to mm. Clearance depends on the screw's
// diameter only, so 10-24 and 10-32 share holes, as do 1/4-20 and 1/4-28.
// Metric: ISO coarse tap drills, clearance from ISO 273 (fine = close fit, medium = free fit).

export interface Thread {
  name: string
  system: 'metric' | 'imperial'
  /** Major diameter, mm. */
  dia: number
  /** Thread pitch, mm. */
  pitch: number
  tap: number
  tapDrill?: string
  close: number
  closeDrill?: string
  free: number
  freeDrill?: string
  /** The ones FRC robots are mostly built with. Shown first. */
  common?: boolean
}

const IN = 25.4
const tpi = (n: number) => +(IN / n).toFixed(3)

export const THREADS: Thread[] = [
  // Imperial
  { name: '#4-40', system: 'imperial', dia: 0.112 * IN, pitch: tpi(40), tap: 2.26, tapDrill: '#43', close: 2.95, closeDrill: '#32', free: 3.26, freeDrill: '#30' },
  { name: '#6-32', system: 'imperial', dia: 0.138 * IN, pitch: tpi(32), tap: 2.71, tapDrill: '#36', close: 3.66, closeDrill: '#27', free: 3.8, freeDrill: '#25' },
  { name: '#8-32', system: 'imperial', dia: 0.164 * IN, pitch: tpi(32), tap: 3.45, tapDrill: '#29', close: 4.31, closeDrill: '#18', free: 4.5, freeDrill: '#16' },
  { name: '#10-24', system: 'imperial', dia: 0.19 * IN, pitch: tpi(24), tap: 3.8, tapDrill: '#25', close: 4.98, closeDrill: '#9', free: 5.11, freeDrill: '#7' },
  { name: '#10-32', system: 'imperial', dia: 0.19 * IN, pitch: tpi(32), tap: 4.04, tapDrill: '#21', close: 4.98, closeDrill: '#9', free: 5.11, freeDrill: '#7', common: true },
  { name: '1/4-20', system: 'imperial', dia: 0.25 * IN, pitch: tpi(20), tap: 5.11, tapDrill: '#7', close: 6.53, closeDrill: 'F', free: 6.76, freeDrill: 'H', common: true },
  { name: '1/4-28', system: 'imperial', dia: 0.25 * IN, pitch: tpi(28), tap: 5.41, tapDrill: '#3', close: 6.53, closeDrill: 'F', free: 6.76, freeDrill: 'H' },
  { name: '5/16-18', system: 'imperial', dia: 0.3125 * IN, pitch: tpi(18), tap: 6.53, tapDrill: 'F', close: 8.2, closeDrill: 'P', free: 8.43, freeDrill: 'Q' },
  { name: '3/8-16', system: 'imperial', dia: 0.375 * IN, pitch: tpi(16), tap: 7.94, tapDrill: '5/16"', close: 9.8, closeDrill: 'W', free: 10.08, freeDrill: 'X' },
  // Metric coarse
  { name: 'M2', system: 'metric', dia: 2, pitch: 0.4, tap: 1.6, close: 2.2, free: 2.4 },
  { name: 'M2.5', system: 'metric', dia: 2.5, pitch: 0.45, tap: 2.05, close: 2.7, free: 2.9 },
  { name: 'M3', system: 'metric', dia: 3, pitch: 0.5, tap: 2.5, close: 3.2, free: 3.4, common: true },
  { name: 'M4', system: 'metric', dia: 4, pitch: 0.7, tap: 3.3, close: 4.3, free: 4.5, common: true },
  { name: 'M5', system: 'metric', dia: 5, pitch: 0.8, tap: 4.2, close: 5.3, free: 5.5, common: true },
  { name: 'M6', system: 'metric', dia: 6, pitch: 1, tap: 5, close: 6.4, free: 6.6, common: true },
  { name: 'M8', system: 'metric', dia: 8, pitch: 1.25, tap: 6.8, close: 8.4, free: 9 },
  { name: 'M10', system: 'metric', dia: 10, pitch: 1.5, tap: 8.5, close: 10.5, free: 11 },
]

/** The order people see first: the FRC regulars, then everything else by size. */
export const COMMON_ORDER = ['#10-32', '1/4-20', 'M3', 'M4', 'M5', 'M6']

/** Full-strength thread depth in aluminum: 1.5 x the screw's diameter. */
export const threadDepth = (t: Thread) => 1.5 * t.dia

/** Whole threads that fit in a wall of this thickness. */
export const threadsInWall = (t: Thread, wall: number) => wall / t.pitch

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/^#/, '').replace(/["”]/g, '').replace(/unc|unf/g, '')

/**
 * Threads that match what was typed, best first. Accepts "10-32", "#10", "10", "M5", "m5",
 * "5", "1/4-20" and "1/4". A bare number matches both a #-size and an M-size of that number.
 */
export function findThreads(text: string): Thread[] {
  const q = norm(text)
  if (!q) return []
  const exact = THREADS.filter((t) => norm(t.name) === q)
  if (exact.length) return exact
  const metric = q.startsWith('m')
  const body = metric ? q.slice(1) : q
  if (!/^[\d./-]+$/.test(body)) return []
  const out = THREADS.filter((t) => {
    const n = norm(t.name)
    if (metric) return t.system === 'metric' && n === `m${body}`
    return n.startsWith(`${body}-`) || n === `m${body}`
  })
  const rank = (t: Thread) => {
    const i = COMMON_ORDER.indexOf(t.name)
    return i === -1 ? 100 : i
  }
  return out.sort((a, b) => rank(a) - rank(b))
}

/** Looks like a thread, not a stock size: "M5", "#10", "10-32", "1/4-20". Used by Ctrl K. */
export const looksLikeThread = (text: string) => /^\s*(m\d+(\.\d+)?|#\d+(-\d+)?|\d+-\d+|\d\/\d+(-\d+)?)\s*$/i.test(text)
