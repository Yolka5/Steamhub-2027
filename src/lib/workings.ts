// The "How it's worked out" lines for every calculation in Steamhub. Each builder takes the
// same inputs as the result on screen and returns the steps with those numbers in them, so the
// explanation can never drift from the answer: it is computed from the same functions.
//
// `formula` and `calc` are LaTeX, rendered by KaTeX. `what`, `why` and plain lines are text.

import type { Line } from '../components/Working'
import { beltLength, centerForCount, chainLinksAt, gearCenter, GEAR_EXTRA, type DriveType } from './centers'
import {
  DATASHEET_V,
  findMotor,
  loadTorque,
  motorConsts,
  outputInertia,
  stallTorqueAt,
  targetSpeed,
  travelOf,
  type Mechanism,
  type MechResult,
  type Robot,
  type RobotResult,
  type Swerve,
  type SwerveRatio,
  type Motor,
} from './calc'
import { threadDepth, threadsInWall, type Thread } from './threads'
import { area, KERF, KINDS, type CutPlan, type Kind, type Match, type Piece, type Query } from './stock'

const PI2 = 2 * Math.PI
const G = 9.81

// ---------- LaTeX helpers ----------

/** Template tag that keeps backslashes, so LaTeX reads as LaTeX. */
const tex = String.raw

/** Number with fixed decimals, so the steps line up. */
const w = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? '?' : n.toFixed(d))

/** User text (a mechanism or set name) made safe inside \text{}. */
const esc = (s: string) => s.replace(/[\\{}$&#^_%~]/g, (c) => (c === '\\' ? '' : c === '~' || c === '^' ? '' : `\\${c}`))

/** A unit after a number, upright and thin-spaced. ² and ³ become real superscripts. */
const u = (s: string) => tex`\,\text{${s}}`.replace(/²/g, '}^2\\text{').replace(/³/g, '}^3\\text{')

/** Upright word inside a formula. */
const t = (s: string) => tex`\text{${esc(s)}}`

/** Named quantity with an upright subscript, like I_stall. */
const sub = (sym: string, s: string) => tex`${sym}_\text{${s}}`

const If = sub('I', 'free')
const Is = sub('I', 'stall')
const Ts = sub('T', 'stall')
const Nf = sub('n', 'free')
const Kv = 'K_v'
const Kt = 'K_t'

// ---------- Center distance ----------

function beltRadii(p: number, z1: number, z2: number) {
  const a = Math.min(z1, z2)
  const b = Math.max(z1, z2)
  return { a, b, r1: (a * p) / PI2, r2: (b * p) / PI2 }
}

/** The belt length formula, worked at one center distance. */
function beltAt(p: number, z1: number, z2: number, c: number): Line[] {
  const { r1, r2 } = beltRadii(p, z1, z2)
  const phi = Math.asin(Math.min(1, (r2 - r1) / c))
  return [
    {
      what: 'Wrap angle offset',
      formula: tex`\varphi = \arcsin\frac{r_2 - r_1}{C}`,
      calc: tex`\varphi = \arcsin\frac{${w(r2)} - ${w(r1)}}{${w(c)}} = ${w(phi, 4)}${u('rad')}`,
      why: 'How far the belt tilts from parallel because the pulleys are different sizes. Zero when they match. C is the center distance.',
    },
    {
      what: 'Belt pitch length',
      formula: tex`L = 2C\cos\varphi + \pi(r_1 + r_2) + 2\varphi(r_2 - r_1)`,
      calc: tex`L = 2 \times ${w(c)} \times ${w(Math.cos(phi), 4)} + \pi \times ${w(r1 + r2)} + 2 \times ${w(phi, 4)} \times ${w(r2 - r1)} = ${w(beltLength(p, z1, z2, c))}${u('mm')}`,
      why: 'Two straight spans plus the arc around each pulley. Exact, no approximation.',
    },
  ]
}

function radiiLines(p: number, z1: number, z2: number): Line {
  const { a, b, r1, r2 } = beltRadii(p, z1, z2)
  return {
    what: 'Pulley pitch radii',
    formula: tex`r = \frac{z\,p}{2\pi}`,
    calc: tex`r_1 = \frac{${a} \times ${p}}{2\pi} = ${w(r1)}${u('mm')}, \quad r_2 = \frac{${b} \times ${p}}{2\pi} = ${w(r2)}${u('mm')}`,
    why: 'z is the teeth, p the belt pitch. The pitch line runs through the belt cords, so the circumference there is teeth × pitch.',
  }
}

export function beltFindWorking(d: DriveType, z1: number, z2: number, target: number, step: number): Line[] {
  const p = d.pitch
  const len = beltLength(p, z1, z2, target)
  const ideal = len / p
  return [
    radiiLines(p, z1, z2),
    ...beltAt(p, z1, z2, target),
    { what: 'Teeth at your distance', formula: tex`n = \frac{L}{p}`, calc: tex`n = \frac{${w(len)}}{${p}} = ${w(ideal)}${u('teeth')}` },
    `Belts only come in whole teeth${step === 5 ? ', and here in steps of 5' : ''}, so the table tries the sizes around ${w(ideal, 1)}. For each one the length formula is run backwards: the center distance is narrowed down by halving until the belt length matches that belt to well under a micron.`,
  ]
}

export function beltHaveWorking(d: DriveType, z1: number, z2: number, teeth: number): Line[] {
  const p = d.pitch
  const c = centerForCount(d, z1, z2, teeth)
  const { r1, r2 } = beltRadii(p, z1, z2)
  return [
    { what: 'Belt pitch length', formula: tex`L = n\,p`, calc: tex`L = ${teeth} \times ${p} = ${w(teeth * p)}${u('mm')}` },
    radiiLines(p, z1, z2),
    c == null
      ? {
          what: 'Shortest possible',
          formula: tex`C \ge r_1 + r_2`,
          calc: tex`${w(r1)} + ${w(r2)} = ${w(r1 + r2)}${u('mm')}`,
          why: 'The belt is too short to wrap the pulleys even with them touching.',
        }
      : `There's no closed form for C, so it's found by halving: try a distance, work out the belt length there, move closer or further, 80 times. The check at the answer:`,
    ...(c == null ? [] : beltAt(p, z1, z2, c)),
  ]
}

function chainK(z1: number, z2: number) {
  return (z2 - z1) / PI2
}

export function chainFindWorking(d: DriveType, z1: number, z2: number, target: number): Line[] {
  const p = d.pitch
  const k = chainK(z1, z2)
  const links = chainLinksAt(p, z1, z2, target)
  return [
    {
      what: 'Links at your distance',
      formula: tex`N = \frac{2C}{p} + \frac{z_1 + z_2}{2} + \frac{k^2 p}{C}, \quad k = \frac{z_2 - z_1}{2\pi}`,
      calc: tex`N = \frac{2 \times ${w(target)}}{${p}} + ${(z1 + z2) / 2} + \frac{${w(k, 3)}^2 \times ${p}}{${w(target)}} = ${w(links)}${u('links')}`,
      why: 'The standard chain length formula: two spans, half of each sprocket, and a small correction when the sprockets differ.',
    },
    'Chain only comes in whole links, so the table tries the counts around that and works each one backwards to a center distance (the formula under "I have a chain").',
  ]
}

export function chainHaveWorking(d: DriveType, z1: number, z2: number, links: number): Line[] {
  const p = d.pitch
  const k = chainK(z1, z2)
  const a = links - (z1 + z2) / 2
  const disc = a * a - 8 * k * k
  const c = centerForCount(d, z1, z2, links)
  const D1 = p / Math.sin(Math.PI / z1)
  const D2 = p / Math.sin(Math.PI / z2)
  const minC = (D1 + D2) / 2
  return [
    { what: 'Links left after the sprockets', formula: tex`a = N - \frac{z_1 + z_2}{2}`, calc: tex`a = ${links} - ${(z1 + z2) / 2} = ${w(a, 1)}` },
    { what: 'Size difference term', formula: tex`k = \frac{z_2 - z_1}{2\pi}`, calc: tex`k = \frac{${z2} - ${z1}}{2\pi} = ${w(k, 3)}` },
    disc < 0
      ? { what: 'Center distance', formula: tex`a^2 - 8k^2 \ge 0`, calc: tex`a^2 - 8k^2 = ${w(disc)} < 0`, why: 'Negative: the chain is too short to wrap the sprockets.' }
      : {
          what: 'Center distance',
          formula: tex`C = \frac{p}{4}\left(a + \sqrt{a^2 - 8k^2}\right)`,
          calc: tex`C = \frac{${p}}{4}\left(${w(a, 1)} + \sqrt{${w(disc, 1)}}\right) = ${w((p / 4) * (a + Math.sqrt(disc)))}${u('mm')}`,
          why: 'The chain length formula solved for C. It is a quadratic, so this one has an exact answer.',
        },
    {
      what: 'Sprockets must not touch',
      formula: tex`C \ge \frac{D_1 + D_2}{2}, \quad D = \frac{p}{\sin(\pi / z)}`,
      calc: tex`\frac{${w(D1)} + ${w(D2)}}{2} = ${w(minC)}${u('mm')}`,
      why: c == null ? 'So this chain is too short.' : undefined,
    },
  ]
}

function moduleLine(d: DriveType): Line | null {
  if (!d.label.includes('DP')) return null
  const dp = Math.round(25.4 / d.pitch)
  return { what: 'Module from DP', formula: tex`m = \frac{25.4}{\text{DP}}`, calc: tex`m = \frac{25.4}{${dp}} = ${w(d.pitch, 4)}${u('mm per tooth')}` }
}

export function gearWorking(d: DriveType, z1: number, z2: number): Line[] {
  const m = d.pitch
  const c = gearCenter(m, z1, z2)
  const mod = moduleLine(d)
  return [
    ...(mod ? [mod] : []),
    {
      what: 'Pitch diameters',
      formula: tex`D = m\,z`,
      calc: tex`D_1 = ${w(m, 4)} \times ${z1} = ${w(m * z1)}${u('mm')}, \quad D_2 = ${w(m, 4)} \times ${z2} = ${w(m * z2)}${u('mm')}`,
    },
    { what: 'Center distance', formula: tex`C = \frac{D_1 + D_2}{2} = \frac{m(z_1 + z_2)}{2}`, calc: tex`C = \frac{${w(m, 4)} \times ${z1 + z2}}{2} = ${w(c)}${u('mm')}` },
    {
      what: 'With clearance',
      formula: tex`C + 0.003${u('in')}`,
      calc: tex`${w(c)} + ${w(GEAR_EXTRA, 4)} = ${w(c + GEAR_EXTRA)}${u('mm')}`,
      why: 'Gears at exactly the pitch distance bind once there is any error in the holes. Most FRC teams add 0.003 in.',
    },
  ]
}

export function gearFindWorking(d: DriveType, target: number, ratio: number): Line[] {
  const m = d.pitch
  const sum = Math.round((2 * target) / m)
  const r = Math.max(1, ratio)
  const lo = Math.floor(sum / (1 + r))
  const hi = Math.ceil(sum / (1 + r))
  const mod = moduleLine(d)
  return [
    ...(mod ? [mod] : []),
    { what: 'Total teeth that fit', formula: tex`z_1 + z_2 = \frac{2C}{m}`, calc: tex`\frac{2 \times ${w(target)}}{${w(m, 4)}} = ${w((2 * target) / m)} \approx ${sum}` },
    {
      what: 'Split for your ratio',
      formula: tex`z_1 = \frac{z_1 + z_2}{1 + i}, \quad z_2 = (z_1 + z_2) - z_1`,
      calc: tex`z_1 = \frac{${sum}}{1 + ${w(r)}} = ${w(sum / (1 + r))} \;\Rightarrow\; ${lo}{:}${sum - lo} \text{ or } ${hi}{:}${sum - hi}`,
      why: 'i is the ratio you want.',
    },
    'Gear center distance depends only on the total teeth, so the table tries the two totals either side as well, splits each the same way, and sorts by how close the distance lands, then the ratio.',
    { what: 'Each pair', formula: tex`C = \frac{m(z_1 + z_2)}{2}`, calc: tex`C = \frac{${w(m, 4)} \times ${sum}}{2} = ${w(gearCenter(m, 0, sum))}${u('mm')}` },
  ]
}

// ---------- Threads ----------

export function threadWorking(th: Thread, wall: number | null): Line[] {
  const out: Line[] = [
    {
      what: 'Tap at least',
      formula: tex`\text{depth} = 1.5\,d`,
      calc: tex`1.5 \times ${w(th.dia)} = ${w(threadDepth(th), 1)}${u('mm')}`,
      why: 'd is the major diameter. Past about 1.5 diameters of engagement in aluminum the screw breaks before the thread strips, so deeper adds nothing.',
    },
    th.system === 'imperial'
      ? { what: 'Pitch', formula: tex`p = \frac{25.4}{\text{TPI}}`, calc: tex`p = \frac{25.4}{${w(25.4 / th.pitch, 0)}} = ${w(th.pitch, 3)}${u('mm')}` }
      : { what: 'Pitch', calc: tex`p = ${th.pitch}${u('mm')}`, why: 'ISO coarse.' },
  ]
  if (wall != null && wall > 0) {
    out.push({
      what: 'Threads in the wall',
      formula: tex`n = \frac{\text{wall}}{p}`,
      calc: tex`n = \frac{${wall}}{${w(th.pitch, 3)}} = ${w(threadsInWall(th, wall), 1)}`,
      why: 'Under 2 threads strips under load, 2 to 3 is light duty only, 3 or more is fine.',
    })
  }
  out.push(
    th.tapDrill
      ? 'Tap and clearance drills are looked up, not calculated: the machinist chart for a 75% thread, converted to mm.'
      : 'Tap and clearance drills are looked up, not calculated: ISO coarse tap drills and ISO 273 clearance holes.',
  )
  return out
}

// ---------- Motor basics, shared by the robot tabs ----------

function motorLines(m: Motor): Line[] {
  const { kv, r, kt } = motorConsts(m)
  return [
    {
      what: 'Motor constants',
      formula: tex`${Kv} = \frac{${Nf}}{12${u('V')}}, \quad R = \frac{12${u('V')}}{${Is}}, \quad ${Kt} = \frac{${Ts}}{${Is} - ${If}}`,
      calc: tex`${Kv} = \frac{${m.freeRpm}}{${DATASHEET_V}} = ${w(kv, 1)}${u('RPM/V')}, \quad R = \frac{${DATASHEET_V}}{${m.stallCurrent}} = ${w(r, 4)}\,\Omega, \quad ${Kt} = \frac{${m.stallTorque}}{${m.stallCurrent} - ${m.freeCurrent}} = ${w(kt, 5)}${u('Nm/A')}`,
      why: `From the ${m.name} 12 V datasheet. These belong to the motor, so they don't change with the battery.`,
    },
  ]
}

// ---------- Robot budget ----------

export function budgetWorking(robot: Robot, res: RobotResult): Line[] {
  const biggestIdx = res.setDraws.indexOf(res.biggestSet)
  const set = biggestIdx >= 0 && res.biggestSet > 0 ? robot.setNames[biggestIdx] : null
  const parts: string[] = []
  if (set != null) {
    for (const x of robot.mechanisms) if (x.onRobot && x.sets[biggestIdx]) parts.push(`\\underbrace{${w(res.mechs.get(x.id)!.batteryAll ?? 0, 1)}}_{${t(x.name)}}`)
    if (robot.swerve.onRobot && robot.swerve.sets[biggestIdx]) parts.push(`\\underbrace{${w(res.swerve.driveBattery + res.swerve.steerBattery, 1)}}_{${t('swerve')}}`)
  }
  return [
    set
      ? {
          what: `Biggest set: ${set}`,
          formula: tex`I_\text{set} = \sum I_\text{battery}`,
          calc: tex`${parts.join(' + ') || '0'} = ${w(res.biggestSet, 1)}${u('A')}`,
          why: "Each set adds the battery current of every mechanism ticked into it. A mechanism's battery current is its cruising current for all its motors, from its own working below.",
        }
      : 'No set has anything in it yet.',
    {
      what: 'Budget scale factor',
      formula: tex`s = \min\left(1, \frac{I_\text{max}}{I_\text{biggest set}}\right)`,
      calc: res.biggestSet > 0 ? tex`s = \min\left(1, \frac{${robot.maxDraw}}{${w(res.biggestSet, 1)}}\right) = ${w(res.scale)}` : tex`s = 1`,
    },
    {
      what: 'Motors used',
      formula: tex`\sum \text{motors on the robot}`,
      calc: [...res.motorCounts.entries()].map(([k, n]) => `\\underbrace{${n}}_{${t(k)}}`).join(' + ') + ` = ${res.totalMotors}`,
    },
  ]
}

// ---------- One mechanism ----------

export function mechWorking(x: Mechanism, robot: Robot, r: MechResult): Line[] {
  const motor = findMotor(robot.motors, x.motor)
  const { kv, r: R, kt } = motorConsts(motor)
  const V = robot.voltage
  const o = r.op
  const lines: Line[] = []
  const load = loadTorque(x)
  const speedMult = x.rigging === 'continuous' ? 1 : x.stages
  const middleMult = x.rigging === 'continuous' ? 1 : Math.max(1, x.stages / 2)
  const outRpm = targetSpeed(x) / 6

  // What the mechanism needs.
  if (x.type === 'pivot') {
    lines.push({
      what: 'Load torque',
      formula: tex`T_\text{load} = m\,g\,d`,
      calc: tex`T_\text{load} = ${x.pivotMass} \times ${G} \times ${w(x.pivotDist / 100, 3)} = ${w(load, 3)}${u('Nm')}`,
      why: 'm is the load mass, d the distance to its centre of mass in meters. Worst case: the arm level, where gravity has the longest lever.',
    })
    lines.push({ what: 'Output speed needed', formula: tex`n_\text{out} = \frac{\omega_\text{deg/s}}{6}`, calc: tex`n_\text{out} = \frac{${w(x.pivotSpeed, 1)}}{6} = ${w(outRpm, 2)}${u('RPM')}` })
  } else if (x.type === 'linear') {
    const lifted = speedMult * x.carriageMass + middleMult * x.stageMass
    lines.push({
      what: 'Mass the cable feels',
      formula:
        x.rigging === 'continuous'
          ? tex`M = m_\text{carriage} + m_\text{stages}`
          : tex`M = s \cdot m_\text{carriage} + \max\left(1, \tfrac{s}{2}\right) m_\text{stages}`,
      calc: tex`M = ${speedMult} \times ${x.carriageMass} + ${w(middleMult, 1)} \times ${x.stageMass} = ${w(lifted)}${u('kg')}`,
      why:
        x.rigging === 'continuous'
          ? 'Continuous rigging: at worst the cable lifts carriage and stages together.'
          : 'Cascade, s stages: each stage moves one cable speed faster than the one below, so its mass counts that many times over.',
    })
    lines.push({
      what: 'Load torque',
      formula: tex`T_\text{load} = M\,g\,r`,
      calc: tex`T_\text{load} = ${w(lifted)} \times ${G} \times ${w(x.pulleyRadius / 100, 4)} = ${w(load, 3)}${u('Nm')}`,
      why: 'r is the pulley radius in meters.',
    })
    lines.push({
      what: 'Output speed needed',
      formula: tex`\omega_\text{out} = \frac{v}{s\,r}`,
      calc: tex`\omega_\text{out} = \frac{${x.linearSpeed}}{${speedMult} \times ${w(x.pulleyRadius / 100, 4)}} = ${w(x.linearSpeed / ((speedMult * x.pulleyRadius) / 100), 2)}${u('rad/s')} = ${w(outRpm, 1)}${u('RPM')}`,
    })
  } else {
    const omega = (x.wheelRpm * PI2) / 60
    const J = (x.spinMass * (x.wheelDiameter / 200) ** 2) / 2
    lines.push({
      what: 'Spinning inertia',
      formula: tex`J = \tfrac{1}{2} m r^2`,
      calc: tex`J = \tfrac{1}{2} \times ${x.spinMass} \times ${w(x.wheelDiameter / 200, 4)}^2 = ${w(J, 6)}${u('kg m²')}`,
      why: 'Treats the spinning parts as a solid disc.',
    })
    lines.push({
      what: 'Load torque',
      formula: tex`T_\text{load} = \frac{J\,\omega}{t_\text{spin-up}} + T_\text{drag}`,
      calc: tex`T_\text{load} = \frac{${w(J, 6)} \times ${w(omega, 1)}}{${x.spinUp}} + ${x.dragTorque} = ${w(load, 3)}${u('Nm')}`,
      why: 'Torque to reach full speed in the spin-up time, plus what the game piece pushes back with.',
    })
  }

  lines.push(...motorLines(motor))

  if (x.mode === 1)
    lines.push(
      `Find ratio tries ${r.sweep.length} ratios from 0.25 to 2000, spaced evenly on a log scale. For each one it runs the steps below and keeps the ratios where battery, stator and duty stay under your limits, the motor isn't stalled and the ratio is under your max. Of those, it picks the one where the motor is most efficient.`,
    )
  if (!o) {
    lines.push('No ratio passed every limit, so there are no numbers to show at a ratio.')
    return lines
  }

  const torque = load / (o.ratio * x.motors * x.efficiency)
  lines.push(
    { what: 'Motor speed', formula: tex`n = n_\text{out} \cdot i`, calc: tex`n = ${w(outRpm, 2)} \times ${w(o.ratio, 2)} = ${w(o.motorRpm, 0)}${u('RPM')}`, why: 'i is the gear ratio.' },
    {
      what: 'Torque per motor',
      formula: tex`T = \frac{T_\text{load}}{i \cdot N \cdot \eta}`,
      calc: tex`T = \frac{${w(load, 3)}}{${w(o.ratio, 2)} \times ${x.motors} \times ${x.efficiency}} = ${w(torque, 4)}${u('Nm')}`,
      why: 'N motors share the gearbox, η is the gearbox efficiency.',
    },
    {
      what: 'Stator current',
      formula: tex`I = ${If} + (${Is} - ${If})\frac{T}{${Ts}}`,
      calc: tex`I = ${motor.freeCurrent} + (${motor.stallCurrent} - ${motor.freeCurrent}) \times \frac{${w(torque, 4)}}{${motor.stallTorque}} = ${w(o.stator, 1)}${u('A')}`,
      why: 'Torque is proportional to current, on the straight line between free and stall.',
    },
    {
      what: 'Duty cycle',
      formula: tex`D = \frac{n / ${Kv} + I R}{V_\text{battery}}`,
      calc: tex`D = \frac{${w(o.motorRpm, 0)} / ${w(kv, 1)} + ${w(o.stator, 1)} \times ${w(R, 4)}}{${V}} = ${w(o.duty * 100, 1)}\%`,
      why: 'Volts the motor needs: back-EMF for the speed, plus the drop across the windings for the current.',
    },
    {
      what: 'Battery current per motor',
      formula: tex`I_\text{battery} = D \cdot I`,
      calc: tex`I_\text{battery} = ${w(o.duty, 3)} \times ${w(o.stator, 1)} = ${w(o.battery, 1)}${u('A')}`,
      why: 'The controller trades voltage for current, so the battery side only sees the duty share of it.',
    },
    { what: 'All motors in the gearbox', formula: tex`N \cdot I_\text{battery}`, calc: tex`${x.motors} \times ${w(o.battery, 1)} = ${w(r.batteryAll, 1)}${u('A')}` },
    {
      what: 'Motor efficiency',
      formula: tex`\eta_\text{motor} = \frac{T\,\omega}{V_\text{battery}\,I_\text{battery}}`,
      calc: tex`\eta_\text{motor} = \frac{${w(torque, 4)} \times ${w((o.motorRpm * PI2) / 60, 1)}}{${V} \times ${w(o.battery, 1)}} = ${w(o.efficiency * 100, 1)}\%`,
    },
  )

  const stall = stallTorqueAt(motor, V)
  lines.push(
    {
      what: 'Stall torque at this battery',
      formula: tex`${Ts}(V) = ${Kt}\left(\frac{V}{R} - ${If}\right)`,
      calc: tex`${w(kt, 5)} \times \left(\frac{${V}}{${w(R, 4)}} - ${motor.freeCurrent}\right) = ${w(stall, 2)}${u('Nm')}`,
    },
    { what: 'Load of stall', formula: tex`\frac{T}{${Ts}(V)}`, calc: tex`\frac{${w(torque, 4)}}{${w(stall, 2)}} = ${w((r.load_ ?? 0) * 100, 1)}\%` },
    {
      what: 'Stall torque at the output',
      formula: tex`${Ts}(V) \cdot N \cdot i \cdot \eta`,
      calc: tex`${w(stall, 2)} \times ${x.motors} \times ${w(o.ratio, 2)} \times ${x.efficiency} = ${w(r.stallTorqueOut, 1)}${u('Nm')}`,
    },
  )

  if (r.stallLoad != null) {
    const hold = Math.min(stall, Math.max(0, kt * (x.maxStator - motor.freeCurrent)))
    const holdOut = hold * x.motors * o.ratio * x.efficiency
    lines.push({
      what: 'Most torque it can hold',
      formula: tex`T_\text{hold} = \min\bigl(${Ts}(V),\; ${Kt}(I_\text{limit} - ${If})\bigr) \cdot N \cdot i \cdot \eta`,
      calc: tex`\min\bigl(${w(stall, 2)},\; ${w(kt, 5)} \times (${x.maxStator} - ${motor.freeCurrent})\bigr) \times ${x.motors} \times ${w(o.ratio, 2)} \times ${x.efficiency} = ${w(holdOut, 1)}${u('Nm')}`,
      why: 'Your stator limit in Phoenix caps the torque before stall does.',
    })
    lines.push(
      x.type === 'pivot'
        ? { what: 'Heaviest it can hold', formula: tex`m = \frac{T_\text{hold}}{g\,d}`, calc: tex`m = \frac{${w(holdOut, 1)}}{${G} \times ${w(x.pivotDist / 100, 3)}} = ${w(r.stallLoad, 1)}${u('kg')}` }
        : {
            what: 'Heaviest carriage',
            formula: tex`m = \frac{T_\text{hold} / (g\,r) - \max(1, \tfrac{s}{2})\,m_\text{stages}}{s}`,
            calc: tex`m = \frac{${w(holdOut / ((x.pulleyRadius / 100) * G), 1)} - ${w(middleMult * x.stageMass, 1)}}{${speedMult}} = ${w(r.stallLoad, 1)}${u('kg')}`,
          },
    )
  }

  if (x.type === 'linear' && r.carriageSpeed != null)
    lines.push({
      what: 'Carriage speed',
      formula: tex`v = \omega_\text{out}\,r\,s`,
      calc: tex`v = ${w(((r.outSpeed ?? 0) * Math.PI) / 180, 2)} \times ${w(x.pulleyRadius / 100, 4)} \times ${speedMult} = ${w(r.carriageSpeed, 2)}${u('m/s')}`,
    })
  if (x.type === 'roller' && r.surfaceSpeed != null)
    lines.push({
      what: 'Wheel surface speed',
      formula: tex`v = \frac{n_\text{wheel}\,\pi D}{60}`,
      calc: tex`v = \frac{${w(r.wheelRpm, 0)} \times \pi \times ${w(x.wheelDiameter / 100, 3)}}{60} = ${w(r.surfaceSpeed, 2)}${u('m/s')}`,
    })

  if (x.type !== 'roller') {
    const J = outputInertia(x)
    lines.push(
      {
        what: 'Inertia at the output',
        formula: x.type === 'pivot' ? tex`J = m\,d^2` : tex`J = \sum m_k\,s_k^2\,r^2`,
        calc: tex`J = ${w(J, 5)}${u('kg m²')}`,
        why: "Each moving part counts by the square of how fast it moves. The motors' own rotors are left out: no maker publishes them, so real moves are a little slower.",
      },
      `Move time is simulated, not a formula: in steps of 1 ms or less the motor gets the full ${V} V, current is held to your ${x.maxStator} A stator limit, the torque left after the load (always the worst case) speeds up the inertia, until it reaches the target speed. Slowing down mirrors speeding up. For ${w(travelOf(x), 0)} ${x.type === 'pivot' ? 'degrees' : 'cm'} that gives ${w(r.move?.time, 2)} s, with ${w(r.move?.speedUp, 2)} s spent speeding up.`,
    )
  }
  return lines
}

// ---------- Swerve ----------

export function swerveWorking(s: Swerve, motors: Motor[], V: number, row: SwerveRatio, label: string): Line[] {
  const m = findMotor(motors, s.motor)
  const { kv, r } = motorConsts(m)
  const wheelR = s.wheelDiameter / 200
  const D = s.wheelDiameter / 100
  const roll = s.rolling * s.robotMass * G
  const statorTorque = ((s.maxStator - m.freeCurrent) / (m.stallCurrent - m.freeCurrent)) * m.stallTorque
  const g = row.ratio
  return [
    `Worked for ${label}, ratio ${w(g, 2)}:1. The other columns use the same steps with their ratio. D is the wheel diameter and r its radius, in meters; N is the drive motors.`,
    ...motorLines(m),
    {
      what: 'Free speed',
      formula: tex`v_\text{free} = \frac{V\,${Kv}}{i} \cdot \frac{\pi D}{60}`,
      calc: tex`v_\text{free} = \frac{${V} \times ${w(kv, 1)}}{${w(g, 2)}} \times \frac{\pi \times ${w(D, 4)}}{60} = ${w(row.freeSpeed, 2)}${u('m/s')}`,
    },
    { what: 'Rolling resistance', formula: tex`F_\text{roll} = c_\text{rr}\,m\,g`, calc: tex`F_\text{roll} = ${s.rolling} \times ${s.robotMass} \times ${G} = ${w(roll, 1)}${u('N')}` },
    {
      what: 'Cruise torque per motor',
      formula: tex`T_\text{cruise} = \frac{F_\text{roll}\,r}{N\,i\,\eta}`,
      calc: tex`T_\text{cruise} = \frac{${w(roll, 1)} \times ${w(wheelR, 4)}}{${s.driveMotors} \times ${w(g, 2)} \times ${s.efficiency}} = ${w(row.cruiseTorque, 4)}${u('Nm')} \;\Rightarrow\; ${w(row.cruiseStator, 1)}${u('A')}`,
    },
    {
      what: 'Top speed at max duty',
      formula: tex`v_\text{top} = \frac{(D_\text{max} V - I_\text{cruise} R)\,${Kv}}{i} \cdot \frac{\pi D}{60}`,
      calc: tex`v_\text{top} = \frac{(${s.maxDuty} \times ${V} - ${w(row.cruiseStator, 1)} \times ${w(r, 4)}) \times ${w(kv, 1)}}{${w(g, 2)}} \times \frac{\pi \times ${w(D, 4)}}{60} = ${w(row.topSpeed, 2)}${u('m/s')}`,
    },
    {
      what: 'Torque at the stator limit',
      formula: tex`T_\text{limit} = \frac{I_\text{limit} - ${If}}{${Is} - ${If}}\,${Ts}`,
      calc: tex`T_\text{limit} = \frac{${s.maxStator} - ${m.freeCurrent}}{${m.stallCurrent} - ${m.freeCurrent}} \times ${m.stallTorque} = ${w(statorTorque, 3)}${u('Nm')}`,
    },
    {
      what: 'Acceleration limit, current',
      formula: tex`a_\text{current} = \frac{N\,T_\text{limit}\,i\,\eta / r - F_\text{roll}}{m}`,
      calc: tex`a_\text{current} = \frac{${s.driveMotors} \times ${w(statorTorque, 3)} \times ${w(g, 2)} \times ${s.efficiency} / ${w(wheelR, 4)} - ${w(roll, 1)}}{${s.robotMass}} = ${w(row.accelStator, 1)}${u('m/s²')}`,
    },
    { what: 'Acceleration limit, traction', formula: tex`a_\text{traction} = \mu\,g`, calc: tex`a_\text{traction} = ${s.friction} \times ${G} = ${w(row.accelTraction, 1)}${u('m/s²')}`, why: 'Past this the wheels slip.' },
    { what: 'Usable acceleration', formula: tex`a = \min(a_\text{current}, a_\text{traction})`, calc: tex`a = ${w(row.accelUsable, 1)}${u('m/s²')}` },
    `At your operating point, ${s.speed} m/s while accelerating at ${s.accel} m/s²:`,
    { what: 'Force needed', formula: tex`F = m\,a + F_\text{roll}`, calc: tex`F = ${s.robotMass} \times ${s.accel} + ${w(roll, 1)} = ${w(row.force, 1)}${u('N')}` },
    { what: 'Motor speed', formula: tex`n = \frac{60\,v}{\pi D}\,i`, calc: tex`n = \frac{60 \times ${s.speed}}{\pi \times ${w(D, 4)}} \times ${w(g, 2)} = ${w(row.motorRpm, 0)}${u('RPM')}` },
    {
      what: 'Torque per motor',
      formula: tex`T = \frac{F\,r}{N\,i\,\eta}`,
      calc: tex`T = \frac{${w(row.force, 1)} \times ${w(wheelR, 4)}}{${s.driveMotors} \times ${w(g, 2)} \times ${s.efficiency}} = ${w(row.torque, 4)}${u('Nm')}`,
    },
    {
      what: 'Stator current',
      formula: tex`I = ${If} + (${Is} - ${If})\frac{T}{${Ts}}`,
      calc: tex`I = ${m.freeCurrent} + (${m.stallCurrent} - ${m.freeCurrent}) \times \frac{${w(row.torque, 4)}}{${m.stallTorque}} = ${w(row.stator, 1)}${u('A')}`,
    },
    {
      what: 'Duty cycle',
      formula: tex`D_\text{duty} = \frac{n / ${Kv} + I R}{V}`,
      calc: tex`D_\text{duty} = \frac{${w(row.motorRpm, 0)} / ${w(kv, 1)} + ${w(row.stator, 1)} \times ${w(r, 4)}}{${V}} = ${w(row.duty * 100, 1)}\%`,
    },
    {
      what: 'Battery current',
      formula: tex`I_\text{battery} = D_\text{duty}\,I, \quad \text{all} = N\,I_\text{battery}`,
      calc: tex`${w(row.duty, 3)} \times ${w(row.stator, 1)} = ${w(row.battery, 1)}${u('A')}, \quad ${s.driveMotors} \times ${w(row.battery, 1)} = ${w(row.batteryAll, 1)}${u('A')}`,
    },
    {
      what: 'Steering allowance',
      formula: tex`N_\text{steer} \cdot I_\text{allowance}`,
      calc: tex`${s.steerMotors} \times ${s.steerAllowance} = ${w(s.steerMotors * s.steerAllowance, 1)}${u('A')}`,
      why: 'A flat budget you set, not calculated.',
    },
  ]
}

// ---------- Curves ----------

export function curvesWorking(x: Mechanism, m: Motor, V: number, ratio: number, rpm: number, duty: number): Line[] {
  const { kv, r, kt } = motorConsts(m)
  const load = loadTorque(x)
  const torque = load / (ratio * x.motors * x.efficiency)
  const stator = m.freeCurrent + torque / kt
  const volts = rpm / kv + stator * r
  const top = duty * V * kv
  return [
    ...motorLines(m),
    `The table, worked for the ${rpm} RPM row:`,
    {
      what: 'Torque per motor',
      formula: tex`T = \frac{T_\text{load}}{i\,N\,\eta}`,
      calc: tex`T = \frac{${w(load, 3)}}{${w(ratio, 2)} \times ${x.motors} \times ${x.efficiency}} = ${w(torque, 4)}${u('Nm')}`,
    },
    {
      what: 'Stator current',
      formula: tex`I = ${If} + \frac{T}{${Kt}}`,
      calc: tex`I = ${m.freeCurrent} + \frac{${w(torque, 4)}}{${w(kt, 5)}} = ${w(stator, 1)}${u('A')}`,
      why: 'The load is the same at every speed, so this is the same on every row.',
    },
    { what: 'Volts at the motor', formula: tex`V_m = \frac{n}{${Kv}} + I R`, calc: tex`V_m = \frac{${rpm}}{${w(kv, 1)}} + ${w(stator, 1)} \times ${w(r, 4)} = ${w(volts, 2)}${u('V')}` },
    { what: 'Duty', formula: tex`D = \frac{V_m}{V_\text{battery}}`, calc: tex`D = \frac{${w(volts, 2)}}{${V}} = ${w((volts / V) * 100, 1)}\%` },
    { what: 'Battery current', formula: tex`I_\text{battery} = D\,I`, calc: tex`I_\text{battery} = ${w(volts / V, 3)} \times ${w(stator, 1)} = ${w((volts / V) * stator, 1)}${u('A')}` },
    { what: 'Output speed', formula: tex`\omega_\text{out} = \frac{6\,n}{i}`, calc: tex`\omega_\text{out} = \frac{6 \times ${rpm}}{${w(ratio, 2)}} = ${w((rpm / ratio) * 6, 1)}${u('deg/s')}` },
    `The motor curve below, at ${w(duty * 100, 0)}% duty:`,
    { what: 'Top of the curve', formula: tex`n_\text{max} = D\,V\,${Kv}`, calc: tex`n_\text{max} = ${w(duty, 2)} \times ${V} \times ${w(kv, 1)} = ${w(top, 0)}${u('RPM')}` },
    {
      what: 'At each speed',
      formula: tex`I = \frac{D\,V - n / ${Kv}}{R}, \quad T = ${Kt}(I - ${If}), \quad P = \frac{2\pi\,T\,n}{60}, \quad I_\text{battery} = D\,I`,
    },
  ]
}

// ---------- Voltage map ----------

export function voltageWorking(m: Motor, sheetV: number, batV: number, v: number, minFor40: number): Line[] {
  const kv = m.freeRpm / sheetV
  const r = sheetV / m.stallCurrent
  const kt = m.stallTorque / (m.stallCurrent - m.freeCurrent)
  const stallA = v / r
  return [
    {
      what: 'Motor constants',
      formula: tex`${Kv} = \frac{${Nf}}{${sheetV}${u('V')}}, \quad R = \frac{${sheetV}${u('V')}}{${Is}}, \quad ${Kt} = \frac{${Ts}}{${Is} - ${If}}`,
      calc: tex`${Kv} = ${w(kv, 1)}${u('RPM/V')}, \quad R = ${w(r, 4)}\,\Omega, \quad ${Kt} = ${w(kt, 5)}${u('Nm/A')}`,
    },
    `The top table, worked for ${v} V at the motor:`,
    { what: 'Stall current', formula: tex`${Is}(V) = \frac{V}{R}`, calc: tex`\frac{${v}}{${w(r, 4)}} = ${w(stallA, 0)}${u('A')}` },
    {
      what: 'Stall torque',
      formula: tex`${Ts}(V) = ${Kt}\bigl(${Is}(V) - ${If}\bigr)`,
      calc: tex`${w(kt, 5)} \times (${w(stallA, 0)} - ${m.freeCurrent}) = ${w(Math.max(0, kt * (stallA - m.freeCurrent)), 2)}${u('Nm')}`,
    },
    { what: 'No-load speed', formula: tex`${Nf}(V) = V\,${Kv}`, calc: tex`${v} \times ${w(kv, 1)} = ${w(v * kv, 0)}${u('RPM')}` },
    {
      what: 'Most battery current',
      formula: tex`I_\text{battery,max} = ${Is}(V) \cdot \frac{V}{V_\text{battery}}`,
      calc: tex`${w(stallA, 0)} \times \frac{${v}}{${batV}} = ${w((stallA * v) / batV, 1)}${u('A')}`,
    },
    { what: 'Torque at a speed', formula: tex`T(n) = ${Kt}\left(\frac{V - n / ${Kv}}{R} - ${If}\right)`, why: 'The line on the chart, one per voltage.' },
    {
      what: 'Same battery current',
      formula: tex`I_\text{stator} = I_\text{battery} \cdot \frac{V_\text{battery}}{V}`,
      calc: tex`40 \times \frac{${batV}}{${v}} = ${w((40 * batV) / v, 1)}${u('A')}`,
      why: 'Worked for 40 A from the battery.',
    },
    { what: 'Lowest voltage for 40 A', formula: tex`V = \sqrt{40\,R\,V_\text{battery}}`, calc: tex`\sqrt{40 \times ${w(r, 4)} \times ${batV}} = ${w(minFor40, 2)}${u('V')}` },
  ]
}

// ---------- Stock ----------

const AREA_FORMULA: Record<Kind, string> = {
  round_tube: tex`A = \frac{\pi}{4}\left(\text{OD}^2 - \text{ID}^2\right)`,
  round_rod: tex`A = \frac{\pi}{4}\,\text{OD}^2`,
  rect_tube: tex`A = W H - (W - 2t)(H - 2t)`,
  angle: tex`A = t\,(W + H - t)`,
  flat: tex`A = W\,t`,
  hex: tex`A = \frac{\sqrt{3}}{2}\,\text{AF}^2 \;\left(- \frac{\pi}{4}\,\text{ID}^2 \text{ if hollow}\right)`,
  other: tex`\text{no formula for this shape}`,
}

function areaCalc(p: Piece): string {
  const { a, b, wall: th, inner_d: i } = p
  switch (p.kind) {
    case 'round_tube':
      return tex`\frac{\pi}{4}\left(${a}^2 - ${i}^2\right)`
    case 'round_rod':
      return tex`\frac{\pi}{4} \times ${a}^2`
    case 'rect_tube':
      return tex`${a} \times ${b} - ${w((a ?? 0) - 2 * (th ?? 0), 1)} \times ${w((b ?? 0) - 2 * (th ?? 0), 1)}`
    case 'angle':
      return tex`${th} \times (${a} + ${b} - ${th})`
    case 'flat':
      return tex`${a} \times ${th}`
    case 'hex':
      return i ? tex`\frac{\sqrt{3}}{2} \times ${a}^2 - \frac{\pi}{4} \times ${i}^2` : tex`\frac{\sqrt{3}}{2} \times ${a}^2`
    default:
      return ''
  }
}

/** Weight of one piece at a length: cross-section × density × length. */
export function weightWorking(p: Piece, densities: Map<string, number>, length = p.length): Line[] {
  const ar = area(p)
  const d = p.material ? densities.get(p.material) : undefined
  return [
    {
      what: `${KINDS[p.kind].label} cross-section`,
      formula: AREA_FORMULA[p.kind],
      calc: ar == null ? undefined : tex`A = ${areaCalc(p)} = ${w(ar, 1)}${u('mm²')}`,
      why: ar == null ? 'Missing a size, so unknown.' : undefined,
    },
    d
      ? { what: 'Density', calc: tex`\rho = ${d}${u('g/cm³')}`, why: `${p.material}, from the materials list.` }
      : { what: 'Density', why: 'Unknown material, so no weight.' },
    {
      what: 'Weight',
      formula: tex`m = \frac{A\,\rho\,L}{1000}`,
      calc: ar != null && d ? tex`m = \frac{${w(ar, 1)} \times ${d} \times ${length}}{1000} = ${w((ar * d * length) / 1000, 0)}${u('g')}` : undefined,
      why: 'L is the length in mm. mm² × g/cm³ × mm is a thousand times too big, hence the / 1000.',
    },
  ]
}

export function stockSearchWorking(q: Query, tol: number, best: Match | undefined): Line[] {
  const lines: Line[] = [
    {
      what: 'Size match',
      formula: tex`|\text{typed} - \text{piece}| \le ${tol}${u('mm')}, \quad \text{wall} \le ${Math.min(tol, 0.3)}${u('mm')}`,
      why: 'Width, height, wall and ID are checked one by one. Two sides (20x40) only match profiles and angles, either way round.',
    },
  ]
  if (q.length != null) {
    lines.push(
      {
        what: 'Length you need',
        formula: tex`L_\text{need} = L_\text{cut} + \text{kerf}`,
        calc: tex`L_\text{need} = ${q.length} + ${KERF} = ${q.length + KERF}${u('mm')}`,
        why: 'The blade turns about 3 mm into dust.',
      },
      best?.leftover != null
        ? {
            what: `Left after the cut, ${best.piece.id}`,
            formula: tex`L_\text{left} = L_\text{piece} - L_\text{need}`,
            calc: tex`L_\text{left} = ${best.piece.length} - ${q.length + KERF} = ${w(best.leftover, 0)}${u('mm')}`,
          }
        : { what: 'Left after the cut', formula: tex`L_\text{left} = L_\text{piece} - L_\text{need}` },
      'Sorted least left over first, so the shortest piece that does the job gets used and long pieces stay long. A piece exactly your length shows as a fit with nothing left.',
    )
  } else lines.push('No length typed, so sorted by size, then shortest piece first.')
  lines.push(`Close sizes: the same search at ±${w(Math.max(tol * 4, 2), 1)} mm, up to 8 pieces, shown when fewer than 3 fit exactly.`)
  return lines
}

export function cutListWorking(lengths: number[], plans: CutPlan[]): Line[] {
  const first = plans[0]
  const lines: Line[] = [
    `The cuts are placed longest first: ${[...lengths].sort((a, b) => b - a).join(', ')} mm. Each one goes into the piece already opened that would have the least left after it (best fit). Only when none has room is a new piece opened, the shortest one that fits.`,
    {
      what: 'Room for a cut',
      formula: tex`L_\text{left} \ge L_\text{cut} + ${KERF}${u('mm')} \quad\text{or}\quad L_\text{left} = L_\text{cut}`,
      why: 'The last cut that uses a piece up exactly costs no kerf.',
    },
  ]
  if (first) {
    const used = first.cuts.reduce((s, c) => s + c, 0)
    const kerfs = first.piece.length - used - first.leftover
    lines.push({
      what: `${first.piece.id}`,
      formula: tex`L_\text{left} = L_\text{piece} - \sum L_\text{cut} - \text{kerfs}`,
      calc: tex`L_\text{left} = ${first.piece.length} - (${first.cuts.join(' + ')}) - ${w(kerfs, 0)} = ${w(first.leftover, 0)}${u('mm')}`,
    })
  }
  lines.push("Best fit is fast and usually lands on the fewest pieces, but it isn't guaranteed to be the best possible plan for long lists.")
  return lines
}

export function plateFitWorking(size: number[]): Line[] {
  const [x, y, th] = size.slice().sort((a, b) => b - a)
  return [
    { what: 'Part, largest first', calc: tex`${w(x, 1)} \times ${w(y, 1)}, \quad t = ${w(th, 2)}${u('mm')}` },
    { what: 'Same thickness', formula: tex`|t_\text{plate} - t| \le 0.2${u('mm')}`, calc: tex`${w(th - 0.2, 2)} \le t_\text{plate} \le ${w(th + 0.2, 2)}${u('mm')}` },
    {
      what: 'Big enough',
      formula: tex`L_\text{plate} \ge L + 10, \quad W_\text{plate} \ge W + 10`,
      calc: tex`L_\text{plate} \ge ${w(x + 10, 0)}${u('mm')}, \quad W_\text{plate} \ge ${w(y + 10, 0)}${u('mm')}`,
      why: "5 mm each side for clamping and the cutter. Partly used plates always show, since what is left of them isn't recorded.",
    },
    'Partly used plates first so they get used up, then the smallest full plate that fits.',
  ]
}

// ---------- Motors ----------

/** What every other tab derives from the four datasheet numbers, motor by motor. */
export function motorsWorking(motors: Motor[], V: number): Line[] {
  const out: Line[] = [
    `Every other tab turns these four datasheet numbers into three motor constants, then works at your ${V} V battery. The straight-line DC motor model: torque falls evenly from stall to zero at free speed.`,
  ]
  motors.forEach((m, i) => {
    const { kv, r, kt } = motorConsts(m)
    // The reasons are the same for every motor, so only the first one says them.
    const why = (s: string) => (i === 0 ? s : undefined)
    const stall = stallTorqueAt(m, V)
    const free = kv * V
    const omega = (free * PI2) / 60
    const peak = (stall * omega) / 4
    out.push(
      { head: m.name },
      { what: 'Speed per volt', formula: tex`${Kv} = \frac{${Nf}}{12${u('V')}}`, calc: tex`${Kv} = \frac{${m.freeRpm}}{${DATASHEET_V}} = ${w(kv, 1)}${u('RPM/V')}` },
      { what: 'Winding resistance', formula: tex`R = \frac{12${u('V')}}{${Is}}`, calc: tex`R = \frac{${DATASHEET_V}}{${m.stallCurrent}} = ${w(r, 4)}\,\Omega` },
      {
        what: 'Torque per amp',
        formula: tex`${Kt} = \frac{${Ts}}{${Is} - ${If}}`,
        calc: tex`${Kt} = \frac{${m.stallTorque}}{${m.stallCurrent} - ${m.freeCurrent}} = ${w(kt, 5)}${u('Nm/A')}`,
        why: why('Free current is spent on friction inside the motor, so it makes no torque.'),
      },
      { what: `Free speed at ${V} V`, formula: tex`${Nf}(V) = ${Kv}\,V`, calc: tex`${w(kv, 1)} \times ${V} = ${w(free, 0)}${u('RPM')}` },
      {
        what: `Stall torque at ${V} V`,
        formula: tex`${Ts}(V) = ${Kt}\left(\frac{V}{R} - ${If}\right)`,
        calc: tex`${w(kt, 5)} \times \left(\frac{${V}}{${w(r, 4)}} - ${m.freeCurrent}\right) = ${w(stall, 2)}${u('Nm')}`,
      },
      {
        what: `Peak power at ${V} V`,
        formula: tex`P_\text{max} = \frac{${Ts}(V)\,\omega_\text{free}}{4}`,
        calc: tex`P_\text{max} = \frac{${w(stall, 2)} \times ${w(omega, 1)}}{4} = ${w(peak, 0)}${u('W')}`,
        why: why('Power is torque × speed, which peaks at half free speed where torque is half of stall.'),
      },
    )
  })
  return out
}
