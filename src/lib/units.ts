// Typing a unit after a number: "4in" in a mm field becomes 101.6. Each field has one unit; what
// was typed is turned into it when the unit is the same kind (a length into a length). Units of
// other kinds, or ones not listed, are refused with a reason.

type Family = Record<string, number>

// Factor to the family's base unit. Keys are lowercased with spaces, dots and "·" removed.
const FAMILIES: { name: string; units: Family }[] = [
  { name: 'length', units: { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, inch: 0.0254, inches: 0.0254, '"': 0.0254, "''": 0.0254, ft: 0.3048, feet: 0.3048, foot: 0.3048, "'": 0.3048 } },
  { name: 'mass', units: { kg: 1, g: 0.001, gr: 0.001, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523 } },
  { name: 'torque', units: { nm: 1, ncm: 0.01, nmm: 0.001, inlb: 0.112984829, lbin: 0.112984829, 'in-lb': 0.112984829, 'lb-in': 0.112984829, ftlb: 1.355817948, lbft: 1.355817948, 'ft-lb': 1.355817948, 'lb-ft': 1.355817948, ozin: 0.00706155, 'oz-in': 0.00706155 } },
  { name: 'speed', units: { 'm/s': 1, mps: 1, 'ft/s': 0.3048, fps: 0.3048, 'in/s': 0.0254, 'km/h': 1 / 3.6, kmh: 1 / 3.6, 'cm/s': 0.01, 'mm/s': 0.001 } },
  { name: 'acceleration', units: { 'm/s²': 1, 'm/s2': 1, 'm/s^2': 1, 'ft/s²': 0.3048, 'ft/s2': 0.3048, 'ft/s^2': 0.3048, g: 9.80665 } },
  { name: 'angle', units: { deg: 1, '°': 1, degrees: 1, rad: 180 / Math.PI, rev: 360, rot: 360 } },
  { name: 'angular speed', units: { 'deg/s': 1, '°/s': 1, 'rad/s': 180 / Math.PI, rpm: 6, rps: 360 } },
  { name: 'time', units: { s: 1, sec: 1, ms: 0.001, min: 60 } },
  { name: 'current', units: { a: 1, ma: 0.001 } },
  { name: 'voltage', units: { v: 1 } },
]

const clean = (u: string) => u.toLowerCase().replace(/[\s.·]/g, '')

function familyOf(unit: string) {
  const u = clean(unit)
  // "A/motor" is a current per motor: still amps.
  const base = u.split('/motor')[0]
  return FAMILIES.find((f) => u in f.units) ?? FAMILIES.find((f) => base in f.units) ?? null
}

const KIND_WORD: Record<string, string> = { length: 'a length', mass: 'a mass', torque: 'a torque', speed: 'a speed', acceleration: 'an acceleration', angle: 'an angle', 'angular speed': 'a turning speed', time: 'a time', current: 'a current', voltage: 'a voltage' }

export interface Typed {
  /** The number in the field's unit, or null when it can't be read. */
  value: number | null
  /** Why it can't be read. */
  error?: string
  /** The unit typed, when it was another one than the field's ("in"). */
  from?: string
}

/** "4in", "4 in", "4,5", "1/2 in", "-3" read for a field in `unit`. Empty text reads as no value with no error. */
export function readTyped(text: string, unit?: string): Typed {
  const t = text.trim()
  if (!t) return { value: null }
  const m = /^(-?\d*[.,]?\d+(?:\s*\/\s*\d+(?:[.,]\d+)?)?|-?\d+[.,]?)\s*(.*)$/.exec(t)
  if (!m) return { value: null, error: 'Type a number.' }
  const [whole, den] = m[1].replace(/,/g, '.').split('/')
  let n = Number(whole)
  if (den != null) n = n / Number(den)
  if (!Number.isFinite(n)) return { value: null, error: 'Type a number.' }
  const typed = m[2].trim()
  if (!typed || !unit) return typed ? { value: null, error: 'Type a number.' } : { value: n }
  const fam = familyOf(unit)
  const key = clean(typed)
  if (!fam) return clean(unit) === key ? { value: n } : { value: null, error: `This field is in ${unit}.` }
  const fieldKey = clean(unit) in fam.units ? clean(unit) : clean(unit).split('/motor')[0]
  if (key === fieldKey) return { value: n }
  const factor = fam.units[key]
  if (factor == null) {
    const other = FAMILIES.find((f) => key in f.units)
    return { value: null, error: other ? `This field takes ${KIND_WORD[fam.name]}, in ${unit}.` : `Unknown unit "${typed}". Use ${unit}.` }
  }
  return { value: (n * factor) / fam.units[fieldKey], from: typed }
}

/** A number short enough to put back in a field: 101.6, not 101.60000000000001. */
export const tidy = (n: number) => String(Math.round(n * 1e4) / 1e4)

/** mm stored as cm and back, for fields that show mm but save cm. */
export const convert = (n: number, from: string, to: string) => {
  if (from === to) return n
  const f = familyOf(from)
  if (!f) return n
  const a = f.units[clean(from)]
  const b = f.units[clean(to)]
  return a != null && b != null ? (n * a) / b : n
}

/** Text from a field read as a number in `unit`, or null: "4in" in a mm field is 101.6. */
export const numIn = (text: string, unit: string) => readTyped(text, unit).value
