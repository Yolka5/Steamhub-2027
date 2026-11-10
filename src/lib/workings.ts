// The "How it's worked out" lines for every calculation in Steamhub. Each builder takes the
// same inputs as the result on screen and returns the steps with those numbers in them, so the
// explanation can never drift from the answer: it is computed from the same functions.

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

/** Number for a worked line: fixed decimals, so the steps line up. */
const w = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d))

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
      formula: 'φ = asin((r2 − r1) / C)',
      calc: `φ = asin((${w(r2)} − ${w(r1)}) / ${w(c)}) = ${w(phi, 4)} rad`,
      why: 'How far the belt tilts from parallel because the pulleys are different sizes. Zero when they match.',
    },
    {
      what: 'Belt pitch length',
      formula: 'L = 2C·cos φ + π(r1 + r2) + 2φ(r2 − r1)',
      calc: `L = 2 × ${w(c)} × ${w(Math.cos(phi), 4)} + π × ${w(r1 + r2)} + 2 × ${w(phi, 4)} × ${w(r2 - r1)} = ${w(beltLength(p, z1, z2, c))} mm`,
      why: 'Two straight spans plus the arc around each pulley. Exact, no approximation.',
    },
  ]
}

function radiiLines(p: number, z1: number, z2: number): Line {
  const { a, b, r1, r2 } = beltRadii(p, z1, z2)
  return {
    what: 'Pulley pitch radii',
    formula: 'r = z × p / 2π',
    calc: `r1 = ${a} × ${p} / 2π = ${w(r1)} mm, r2 = ${b} × ${p} / 2π = ${w(r2)} mm`,
    why: 'The pitch line runs through the belt cords, so the circumference there is teeth × pitch.',
  }
}

export function beltFindWorking(d: DriveType, z1: number, z2: number, target: number, step: number): Line[] {
  const p = d.pitch
  const ideal = beltLength(p, z1, z2, target) / p
  return [
    radiiLines(p, z1, z2),
    ...beltAt(p, z1, z2, target),
    { what: 'Teeth at your distance', formula: 'teeth = L / p', calc: `${w(beltLength(p, z1, z2, target))} / ${p} = ${w(ideal)} teeth` },
    `Belts only come in whole teeth${step === 5 ? ', and here in steps of 5' : ''}, so the table tries the sizes around ${w(ideal, 1)}. For each one the length formula is run backwards: the center distance is narrowed down by halving until the belt length matches that belt to well under a micron.`,
  ]
}

export function beltHaveWorking(d: DriveType, z1: number, z2: number, teeth: number): Line[] {
  const p = d.pitch
  const c = centerForCount(d, z1, z2, teeth)
  const { r1, r2 } = beltRadii(p, z1, z2)
  return [
    { what: 'Belt pitch length', formula: 'L = teeth × p', calc: `${teeth} × ${p} = ${w(teeth * p)} mm` },
    radiiLines(p, z1, z2),
    c == null
      ? { what: 'Shortest possible', formula: 'C ≥ r1 + r2', calc: `${w(r1)} + ${w(r2)} = ${w(r1 + r2)} mm, and the belt is too short even there` }
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
      formula: 'N = 2C / p + (z1 + z2) / 2 + k²·p / C,  k = (z2 − z1) / 2π',
      calc: `N = 2 × ${w(target)} / ${p} + ${(z1 + z2) / 2} + ${w(k, 3)}² × ${p} / ${w(target)} = ${w(links)} links`,
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
  const minC = (p / Math.sin(Math.PI / z1) + p / Math.sin(Math.PI / z2)) / 2
  return [
    { what: 'Links left after the sprockets', formula: 'a = N − (z1 + z2) / 2', calc: `a = ${links} − ${(z1 + z2) / 2} = ${w(a, 1)}` },
    { what: 'Size difference term', formula: 'k = (z2 − z1) / 2π', calc: `k = (${z2} − ${z1}) / 2π = ${w(k, 3)}` },
    {
      what: 'Center distance',
      formula: 'C = p/4 × (a + √(a² − 8k²))',
      calc: disc < 0 ? `a² − 8k² = ${w(disc)} is negative: too short to wrap` : `C = ${p}/4 × (${w(a, 1)} + √${w(disc, 1)}) = ${w((p / 4) * (a + Math.sqrt(disc)))} mm`,
      why: 'The chain length formula solved for C. It is a quadratic, so this one has an exact answer.',
    },
    {
      what: 'Sprockets must not touch',
      formula: 'C ≥ (D1 + D2) / 2,  D = p / sin(π / z)',
      calc: `(${w(p / Math.sin(Math.PI / z1))} + ${w(p / Math.sin(Math.PI / z2))}) / 2 = ${w(minC)} mm${c == null ? ', so this chain is too short' : ''}`,
    },
  ]
}

function moduleLine(d: DriveType): Line | null {
  if (!d.label.includes('DP')) return null
  const dp = Math.round(25.4 / d.pitch)
  return { what: 'Module from DP', formula: 'm = 25.4 / DP', calc: `25.4 / ${dp} = ${w(d.pitch, 4)} mm per tooth` }
}

export function gearWorking(d: DriveType, z1: number, z2: number): Line[] {
  const m = d.pitch
  const c = gearCenter(m, z1, z2)
  const mod = moduleLine(d)
  return [
    ...(mod ? [mod] : []),
    { what: 'Pitch diameters', formula: 'D = m × z', calc: `${w(m, 4)} × ${z1} = ${w(m * z1)} mm, ${w(m, 4)} × ${z2} = ${w(m * z2)} mm` },
    { what: 'Center distance', formula: 'C = (D1 + D2) / 2 = m × (z1 + z2) / 2', calc: `${w(m, 4)} × ${z1 + z2} / 2 = ${w(c)} mm` },
    {
      what: 'With clearance',
      formula: 'C + 0.003 in',
      calc: `${w(c)} + ${w(GEAR_EXTRA, 4)} = ${w(c + GEAR_EXTRA)} mm`,
      why: 'Gears at exactly the pitch distance bind once there is any error in the holes. Most FRC teams add 0.003 in.',
    },
  ]
}

export function gearFindWorking(d: DriveType, target: number, ratio: number): Line[] {
  const m = d.pitch
  const sum = Math.round((2 * target) / m)
  const r = Math.max(1, ratio)
  const mod = moduleLine(d)
  return [
    ...(mod ? [mod] : []),
    { what: 'Total teeth that fit', formula: 'z1 + z2 = 2C / m', calc: `2 × ${w(target)} / ${w(m, 4)} = ${w((2 * target) / m)}, nearest whole ${sum}` },
    {
      what: 'Split for your ratio',
      formula: 'z1 = total / (1 + ratio),  z2 = total − z1',
      calc: `${sum} / (1 + ${w(r)}) = ${w(sum / (1 + r))}, so ${Math.floor(sum / (1 + r))}:${sum - Math.floor(sum / (1 + r))} or ${Math.ceil(sum / (1 + r))}:${sum - Math.ceil(sum / (1 + r))}`,
    },
    'Gear center distance depends only on the total teeth, so the table tries the two totals either side as well, splits each the same way, and sorts by how close the distance lands, then the ratio.',
    { what: 'Each pair', formula: 'C = m × (z1 + z2) / 2', calc: `${w(m, 4)} × ${sum} / 2 = ${w(gearCenter(m, 0, sum))} mm for a ${sum}-tooth total` },
  ]
}

// ---------- Threads ----------

export function threadWorking(t: Thread, wall: number | null): Line[] {
  const out: Line[] = [
    {
      what: 'Tap at least',
      formula: 'depth = 1.5 × major diameter',
      calc: `1.5 × ${w(t.dia)} = ${w(threadDepth(t), 1)} mm`,
      why: 'Past about 1.5 diameters of engagement in aluminum the screw breaks before the thread strips, so deeper adds nothing.',
    },
    t.system === 'imperial'
      ? { what: 'Pitch', formula: 'p = 25.4 / threads per inch', calc: `25.4 / ${w(25.4 / t.pitch, 0)} = ${w(t.pitch, 3)} mm` }
      : { what: 'Pitch', calc: `${t.pitch} mm, ISO coarse` },
  ]
  if (wall != null && wall > 0) {
    out.push({
      what: 'Threads in the wall',
      formula: 'n = wall / pitch',
      calc: `${wall} / ${w(t.pitch, 3)} = ${w(threadsInWall(t, wall), 1)} threads`,
      why: 'Under 2 threads strips under load, 2 to 3 is light duty only, 3 or more is fine.',
    })
  }
  out.push(
    t.tapDrill
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
      formula: 'Kv = free RPM / 12 V,  R = 12 V / stall A,  Kt = stall Nm / (stall A − free A)',
      calc: `Kv = ${m.freeRpm} / ${DATASHEET_V} = ${w(kv, 1)} RPM/V,  R = ${DATASHEET_V} / ${m.stallCurrent} = ${w(r, 4)} Ω,  Kt = ${m.stallTorque} / (${m.stallCurrent} − ${m.freeCurrent}) = ${w(kt, 5)} Nm/A`,
      why: `From the ${m.name} 12 V datasheet. These belong to the motor, so they don't change with the battery.`,
    },
  ]
}

// ---------- Robot budget ----------

export function budgetWorking(robot: Robot, res: RobotResult): Line[] {
  const biggestIdx = res.setDraws.indexOf(res.biggestSet)
  const set = biggestIdx >= 0 ? robot.setNames[biggestIdx] : null
  const parts: string[] = []
  if (biggestIdx >= 0) {
    for (const x of robot.mechanisms) if (x.onRobot && x.sets[biggestIdx]) parts.push(`${x.name} ${w(res.mechs.get(x.id)!.batteryAll ?? 0, 1)}`)
    if (robot.swerve.onRobot && robot.swerve.sets[biggestIdx]) parts.push(`swerve ${w(res.swerve.driveBattery + res.swerve.steerBattery, 1)}`)
  }
  return [
    {
      what: 'Each set',
      formula: 'set draw = Σ battery A of every mechanism ticked into it',
      calc: set ? `${set}: ${parts.join(' + ') || '0'} = ${w(res.biggestSet, 1)} A` : 'No set has anything in it yet.',
      why: "A mechanism's battery A is its cruising current for all its motors, from its own working below.",
    },
    { what: 'Biggest set draw', formula: 'max of the set draws', calc: `${w(res.biggestSet, 1)} A` },
    {
      what: 'Budget scale factor',
      formula: 'scale = min(1, max draw / biggest set)',
      calc: res.biggestSet > 0 ? `min(1, ${robot.maxDraw} / ${w(res.biggestSet, 1)}) = ${w(res.scale)}` : '1.00, nothing draws current',
    },
    {
      what: 'Motors used',
      formula: 'Σ motors on every mechanism on the robot, + swerve drive and steer',
      calc: `${[...res.motorCounts.entries()].map(([k, n]) => `${k} ${n}`).join(' + ')} = ${res.totalMotors}`,
    },
  ]
}

// ---------- One mechanism ----------

const G = 9.81

export function mechWorking(x: Mechanism, robot: Robot, r: MechResult): Line[] {
  const motor = findMotor(robot.motors, x.motor)
  const { kv, r: R, kt } = motorConsts(motor)
  const V = robot.voltage
  const o = r.op
  const lines: Line[] = []
  const load = loadTorque(x)
  const speedMult = x.rigging === 'continuous' ? 1 : x.stages
  const middleMult = x.rigging === 'continuous' ? 1 : Math.max(1, x.stages / 2)

  // What the mechanism needs.
  if (x.type === 'pivot') {
    lines.push({
      what: 'Load torque',
      formula: 'T = m × g × d',
      calc: `${x.pivotMass} × ${G} × ${w(x.pivotDist / 100, 3)} m = ${w(load, 3)} Nm`,
      why: 'Worst case: the arm level, where gravity has the longest lever.',
    })
    lines.push({ what: 'Output speed needed', calc: `${w(x.pivotSpeed, 1)} deg/s = ${w(x.pivotSpeed / 6, 2)} RPM`, formula: 'RPM = deg/s ÷ 6' })
  } else if (x.type === 'linear') {
    const lifted = speedMult * x.carriageMass + middleMult * x.stageMass
    lines.push({
      what: 'Mass the cable feels',
      formula: x.rigging === 'continuous' ? 'M = carriage + stages' : 'M = stages × carriage + max(1, stages / 2) × middle stages',
      calc: `${speedMult} × ${x.carriageMass} + ${w(middleMult, 1)} × ${x.stageMass} = ${w(lifted)} kg`,
      why:
        x.rigging === 'continuous'
          ? 'Continuous rigging: at worst the cable lifts carriage and stages together.'
          : 'Cascade: each stage moves one cable speed faster than the one below, so its mass counts that many times over.',
    })
    lines.push({ what: 'Load torque', formula: 'T = M × g × r', calc: `${w(lifted)} × ${G} × ${w(x.pulleyRadius / 100, 4)} m = ${w(load, 3)} Nm` })
    lines.push({
      what: 'Output speed needed',
      formula: 'ω = v / (speed multiple × r)',
      calc: `${x.linearSpeed} / (${speedMult} × ${w(x.pulleyRadius / 100, 4)}) = ${w(x.linearSpeed / ((speedMult * x.pulleyRadius) / 100), 2)} rad/s = ${w(targetSpeed(x) / 6, 1)} RPM`,
    })
  } else {
    const omega = (x.wheelRpm * PI2) / 60
    const J = (x.spinMass * (x.wheelDiameter / 200) ** 2) / 2
    lines.push({
      what: 'Spinning inertia',
      formula: 'J = m × r² / 2',
      calc: `${x.spinMass} × ${w(x.wheelDiameter / 200, 4)}² / 2 = ${w(J, 6)} kg m²`,
      why: 'Treats the spinning parts as a solid disc.',
    })
    lines.push({
      what: 'Load torque',
      formula: 'T = J × ω / spin-up time + drag',
      calc: `${w(J, 6)} × ${w(omega, 1)} / ${x.spinUp} + ${x.dragTorque} = ${w(load, 3)} Nm`,
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
    { what: 'Motor speed', formula: 'RPM = output RPM × ratio', calc: `${w(targetSpeed(x) / 6, 2)} × ${w(o.ratio, 2)} = ${w(o.motorRpm, 0)} RPM` },
    {
      what: 'Torque per motor',
      formula: 'T = load / (ratio × motors × efficiency)',
      calc: `${w(load, 3)} / (${w(o.ratio, 2)} × ${x.motors} × ${x.efficiency}) = ${w(torque, 4)} Nm`,
    },
    {
      what: 'Stator current',
      formula: 'I = free A + (stall A − free A) × T / stall Nm',
      calc: `${motor.freeCurrent} + (${motor.stallCurrent} − ${motor.freeCurrent}) × ${w(torque, 4)} / ${motor.stallTorque} = ${w(o.stator, 1)} A`,
      why: 'Torque is proportional to current, on the straight line between free and stall.',
    },
    {
      what: 'Duty cycle',
      formula: 'duty = (RPM / Kv + I × R) / battery V',
      calc: `(${w(o.motorRpm, 0)} / ${w(kv, 1)} + ${w(o.stator, 1)} × ${w(R, 4)}) / ${V} = ${w(o.duty * 100, 1)}%`,
      why: 'Volts the motor needs: back-EMF for the speed, plus the drop across the windings for the current.',
    },
    {
      what: 'Battery current per motor',
      formula: 'battery A = duty × stator A',
      calc: `${w(o.duty, 3)} × ${w(o.stator, 1)} = ${w(o.battery, 1)} A`,
      why: 'The controller trades voltage for current, so the battery side only sees the duty share of it.',
    },
    { what: 'All motors in the gearbox', formula: 'battery A × motors', calc: `${w(o.battery, 1)} × ${x.motors} = ${w(r.batteryAll, 1)} A` },
    {
      what: 'Motor efficiency',
      formula: 'η = T × ω / (V × battery A)',
      calc: `${w(torque, 4)} × ${w((o.motorRpm * PI2) / 60, 1)} / (${V} × ${w(o.battery, 1)}) = ${w(o.efficiency * 100, 1)}%`,
    },
  )

  const stall = stallTorqueAt(motor, V)
  lines.push(
    {
      what: 'Stall torque at this battery',
      formula: 'Kt × (V / R − free A)',
      calc: `${w(kt, 5)} × (${V} / ${w(R, 4)} − ${motor.freeCurrent}) = ${w(stall, 2)} Nm`,
    },
    { what: 'Load of stall', formula: 'T per motor / stall Nm', calc: `${w(torque, 4)} / ${w(stall, 2)} = ${w((r.load_ ?? 0) * 100, 1)}%` },
    {
      what: 'Stall torque at the output',
      formula: 'stall Nm × motors × ratio × efficiency',
      calc: `${w(stall, 2)} × ${x.motors} × ${w(o.ratio, 2)} × ${x.efficiency} = ${w(r.stallTorqueOut, 1)} Nm`,
    },
  )

  if (r.stallLoad != null) {
    const hold = Math.min(stall, Math.max(0, kt * (x.maxStator - motor.freeCurrent)))
    const holdOut = hold * x.motors * o.ratio * x.efficiency
    lines.push({
      what: 'Most torque it can hold',
      formula: 'min(stall Nm, Kt × (stator limit − free A)) × motors × ratio × efficiency',
      calc: `min(${w(stall, 2)}, ${w(kt, 5)} × (${x.maxStator} − ${motor.freeCurrent})) × ${x.motors} × ${w(o.ratio, 2)} × ${x.efficiency} = ${w(holdOut, 1)} Nm`,
      why: 'Your stator limit in Phoenix caps the torque before stall does.',
    })
    lines.push(
      x.type === 'pivot'
        ? { what: 'Heaviest it can hold', formula: 'm = T / (g × d)', calc: `${w(holdOut, 1)} / (${G} × ${w(x.pivotDist / 100, 3)}) = ${w(r.stallLoad, 1)} kg` }
        : {
            what: 'Heaviest carriage',
            formula: '(T / (g × r) − middle stages part) / speed multiple',
            calc: `(${w(holdOut / ((x.pulleyRadius / 100) * G), 1)} − ${w(middleMult * x.stageMass, 1)}) / ${speedMult} = ${w(r.stallLoad, 1)} kg`,
          },
    )
  }

  if (x.type === 'linear' && r.carriageSpeed != null)
    lines.push({
      what: 'Carriage speed',
      formula: 'v = ω × r × speed multiple',
      calc: `${w(((r.outSpeed ?? 0) * Math.PI) / 180, 2)} rad/s × ${w(x.pulleyRadius / 100, 4)} × ${speedMult} = ${w(r.carriageSpeed, 2)} m/s`,
    })
  if (x.type === 'roller' && r.surfaceSpeed != null)
    lines.push({
      what: 'Wheel surface speed',
      formula: 'v = RPM × π × D / 60',
      calc: `${w(r.wheelRpm, 0)} × π × ${w(x.wheelDiameter / 100, 3)} / 60 = ${w(r.surfaceSpeed, 2)} m/s`,
    })

  if (x.type !== 'roller') {
    const J = outputInertia(x)
    lines.push(
      {
        what: 'Inertia at the output',
        formula: x.type === 'pivot' ? 'J = m × d²' : 'J = Σ mass × (speed multiple)² × r²',
        calc: `${w(J, 5)} kg m²`,
        why: "The motors' own rotors are left out: no maker publishes them, so real moves are a little slower.",
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
  const circ = Math.PI * (s.wheelDiameter / 100)
  const roll = s.rolling * s.robotMass * G
  const statorTorque = ((s.maxStator - m.freeCurrent) / (m.stallCurrent - m.freeCurrent)) * m.stallTorque
  const g = row.ratio
  return [
    `Worked for ${label}, ratio ${w(g, 2)}:1. The other columns use the same steps with their ratio.`,
    ...motorLines(m),
    { what: 'Free speed', formula: 'v = V × Kv / ratio × π D / 60', calc: `${V} × ${w(kv, 1)} / ${w(g, 2)} × ${w(circ, 4)} / 60 = ${w(row.freeSpeed, 2)} m/s` },
    { what: 'Rolling resistance', formula: 'F = rolling × mass × g', calc: `${s.rolling} × ${s.robotMass} × ${G} = ${w(roll, 1)} N` },
    {
      what: 'Cruise torque per motor',
      formula: 'T = F × r / (motors × ratio × efficiency)',
      calc: `${w(roll, 1)} × ${w(wheelR, 4)} / (${s.driveMotors} × ${w(g, 2)} × ${s.efficiency}) = ${w(row.cruiseTorque, 4)} Nm, ${w(row.cruiseStator, 1)} A stator`,
    },
    {
      what: 'Top speed at max duty',
      formula: 'v = (duty × V − I × R) × Kv / ratio × π D / 60',
      calc: `(${s.maxDuty} × ${V} − ${w(row.cruiseStator, 1)} × ${w(r, 4)}) × ${w(kv, 1)} / ${w(g, 2)} × ${w(circ, 4)} / 60 = ${w(row.topSpeed, 2)} m/s`,
    },
    {
      what: 'Torque at the stator limit',
      formula: 'T = (limit − free A) / (stall A − free A) × stall Nm',
      calc: `(${s.maxStator} − ${m.freeCurrent}) / (${m.stallCurrent} − ${m.freeCurrent}) × ${m.stallTorque} = ${w(statorTorque, 3)} Nm`,
    },
    {
      what: 'Acceleration limit, current',
      formula: 'a = (motors × T × ratio × efficiency / r − F roll) / mass',
      calc: `(${s.driveMotors} × ${w(statorTorque, 3)} × ${w(g, 2)} × ${s.efficiency} / ${w(wheelR, 4)} − ${w(roll, 1)}) / ${s.robotMass} = ${w(row.accelStator, 1)} m/s²`,
    },
    { what: 'Acceleration limit, traction', formula: 'a = μ × g', calc: `${s.friction} × ${G} = ${w(row.accelTraction, 1)} m/s²`, why: 'Past this the wheels slip.' },
    { what: 'Usable acceleration', formula: 'the smaller of the two', calc: `${w(row.accelUsable, 1)} m/s²` },
    `At your operating point, ${s.speed} m/s while accelerating at ${s.accel} m/s²:`,
    { what: 'Force needed', formula: 'F = mass × a + F roll', calc: `${s.robotMass} × ${s.accel} + ${w(roll, 1)} = ${w(row.force, 1)} N` },
    { what: 'Motor speed', formula: 'RPM = v / (π D) × 60 × ratio', calc: `${s.speed} / ${w(circ, 4)} × 60 × ${w(g, 2)} = ${w(row.motorRpm, 0)} RPM` },
    {
      what: 'Torque per motor',
      formula: 'T = F × r / (motors × ratio × efficiency)',
      calc: `${w(row.force, 1)} × ${w(wheelR, 4)} / (${s.driveMotors} × ${w(g, 2)} × ${s.efficiency}) = ${w(row.torque, 4)} Nm`,
    },
    {
      what: 'Stator current',
      formula: 'I = free A + (stall A − free A) × T / stall Nm',
      calc: `${m.freeCurrent} + (${m.stallCurrent} − ${m.freeCurrent}) × ${w(row.torque, 4)} / ${m.stallTorque} = ${w(row.stator, 1)} A`,
    },
    { what: 'Duty cycle', formula: 'duty = (RPM / Kv + I × R) / V', calc: `(${w(row.motorRpm, 0)} / ${w(kv, 1)} + ${w(row.stator, 1)} × ${w(r, 4)}) / ${V} = ${w(row.duty * 100, 1)}%` },
    { what: 'Battery current', formula: 'duty × stator A, × drive motors', calc: `${w(row.duty, 3)} × ${w(row.stator, 1)} = ${w(row.battery, 1)} A, × ${s.driveMotors} = ${w(row.batteryAll, 1)} A` },
    { what: 'Steering allowance', formula: 'steer motors × allowance', calc: `${s.steerMotors} × ${s.steerAllowance} = ${w(s.steerMotors * s.steerAllowance, 1)} A, a flat budget, not calculated` },
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
    { what: 'Torque per motor', formula: 'T = load / (ratio × motors × efficiency)', calc: `${w(load, 3)} / (${w(ratio, 2)} × ${x.motors} × ${x.efficiency}) = ${w(torque, 4)} Nm` },
    { what: 'Stator current', formula: 'I = free A + T / Kt', calc: `${m.freeCurrent} + ${w(torque, 4)} / ${w(kt, 5)} = ${w(stator, 1)} A`, why: 'The load is the same at every speed, so this is the same on every row.' },
    { what: 'Volts at the motor', formula: 'V = RPM / Kv + I × R', calc: `${rpm} / ${w(kv, 1)} + ${w(stator, 1)} × ${w(r, 4)} = ${w(volts, 2)} V` },
    { what: 'Duty', formula: 'volts / battery V', calc: `${w(volts, 2)} / ${V} = ${w((volts / V) * 100, 1)}%` },
    { what: 'Battery current', formula: 'duty × stator A', calc: `${w(volts / V, 3)} × ${w(stator, 1)} = ${w((volts / V) * stator, 1)} A per motor` },
    { what: 'Output speed', formula: 'deg/s = RPM / ratio × 6', calc: `${rpm} / ${w(ratio, 2)} × 6 = ${w((rpm / ratio) * 6, 1)} deg/s` },
    `The motor curve below, at ${w(duty * 100, 0)}% duty: speed runs from 0 to duty × V × Kv = ${w(top, 0)} RPM. At each speed, stator A = (duty × V − RPM / Kv) / R, torque = Kt × (stator A − free A), power = torque × RPM × 2π / 60, and battery A = duty × stator A.`,
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
      formula: `Kv = free RPM / ${sheetV} V,  R = ${sheetV} V / stall A,  Kt = stall Nm / (stall A − free A)`,
      calc: `Kv = ${w(kv, 1)} RPM/V,  R = ${w(r, 4)} Ω,  Kt = ${w(kt, 5)} Nm/A`,
    },
    `The top table, worked for ${v} V at the motor:`,
    { what: 'Stall current', formula: 'V / R', calc: `${v} / ${w(r, 4)} = ${w(stallA, 0)} A` },
    { what: 'Stall torque', formula: 'Kt × (stall A − free A)', calc: `${w(kt, 5)} × (${w(stallA, 0)} − ${m.freeCurrent}) = ${w(Math.max(0, kt * (stallA - m.freeCurrent)), 2)} Nm` },
    { what: 'No-load speed', formula: 'V × Kv', calc: `${v} × ${w(kv, 1)} = ${w(v * kv, 0)} RPM` },
    { what: 'Most battery current', formula: 'stall A × V / battery V', calc: `${w(stallA, 0)} × ${v} / ${batV} = ${w((stallA * v) / batV, 1)} A` },
    { what: 'Torque at a speed', formula: 'T = Kt × ((V − RPM / Kv) / R − free A)', calc: 'The line on the chart, one per voltage.' },
    { what: 'Same battery current', formula: 'stator A = battery A × battery V / motor V', calc: `For 40 A: 40 × ${batV} / ${v} = ${w((40 * batV) / v, 1)} A stator` },
    { what: 'Lowest voltage for 40 A', formula: 'V = √(40 × R × battery V)', calc: `√(40 × ${w(r, 4)} × ${batV}) = ${w(minFor40, 2)} V` },
  ]
}

// ---------- Stock ----------

const AREA_FORMULA: Record<Kind, string> = {
  round_tube: 'A = π/4 × (OD² − ID²)',
  round_rod: 'A = π/4 × OD²',
  rect_tube: 'A = W × H − (W − 2t) × (H − 2t)',
  angle: 'A = t × (W + H − t)',
  flat: 'A = W × t',
  hex: 'A = √3/2 × AF² (− π/4 × ID² if hollow)',
  other: 'no formula for this shape',
}

function areaCalc(p: Piece): string {
  const { a, b, wall: t, inner_d: i } = p
  switch (p.kind) {
    case 'round_tube':
      return `π/4 × (${a}² − ${i}²)`
    case 'round_rod':
      return `π/4 × ${a}²`
    case 'rect_tube':
      return `${a} × ${b} − ${w((a ?? 0) - 2 * (t ?? 0), 1)} × ${w((b ?? 0) - 2 * (t ?? 0), 1)}`
    case 'angle':
      return `${t} × (${a} + ${b} − ${t})`
    case 'flat':
      return `${a} × ${t}`
    case 'hex':
      return i ? `√3/2 × ${a}² − π/4 × ${i}²` : `√3/2 × ${a}²`
    default:
      return ''
  }
}

/** Weight of one piece at a length: cross-section × density × length. */
export function weightWorking(p: Piece, densities: Map<string, number>, length = p.length): Line[] {
  const ar = area(p)
  const d = p.material ? densities.get(p.material) : undefined
  return [
    { what: `${KINDS[p.kind].label} cross-section`, formula: AREA_FORMULA[p.kind], calc: ar == null ? 'Missing a size, so unknown' : `${areaCalc(p)} = ${w(ar, 1)} mm²` },
    { what: 'Density', calc: d ? `${p.material}: ${d} g/cm³, from the materials list` : 'Unknown material, so no weight' },
    {
      what: 'Weight',
      formula: 'mass = A × density × length / 1000',
      calc: ar != null && d ? `${w(ar, 1)} × ${d} × ${length} / 1000 = ${w((ar * d * length) / 1000, 0)} g` : '—',
      why: 'mm² × g/cm³ × mm is a thousand times too big, hence the / 1000.',
    },
  ]
}

export function stockSearchWorking(q: Query, tol: number, best: Match | undefined): Line[] {
  const lines: Line[] = [
    {
      what: 'Size match',
      formula: `each size you typed within ±${tol} mm, wall within ±${Math.min(tol, 0.3)} mm`,
      calc: 'Width, height, wall and ID are checked one by one. Profiles and angles match either way round.',
    },
  ]
  if (q.length != null) {
    lines.push(
      { what: 'Length you need', formula: 'cut + saw kerf', calc: `${q.length} + ${KERF} = ${q.length + KERF} mm`, why: 'The blade turns about 3 mm into dust.' },
      best?.leftover != null
        ? { what: 'Left after the cut', formula: 'piece − (cut + kerf)', calc: `${best.piece.length} − ${q.length + KERF} = ${w(best.leftover, 0)} mm for ${best.piece.id}` }
        : { what: 'Left after the cut', formula: 'piece − (cut + kerf)' },
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
    { what: 'Room for a cut', formula: `left ≥ cut + ${KERF} mm kerf, or left = cut exactly`, why: 'The last cut that uses a piece up exactly costs no kerf.' },
  ]
  if (first) {
    const used = first.cuts.reduce((s, c) => s + c, 0)
    const kerfs = first.piece.length - used - first.leftover
    lines.push({
      what: `${first.piece.id}`,
      formula: 'left = length − Σ cuts − kerf per cut',
      calc: `${first.piece.length} − (${first.cuts.join(' + ')}) − ${w(kerfs, 0)} = ${w(first.leftover, 0)} mm`,
    })
  }
  lines.push("Best fit is fast and usually lands on the fewest pieces, but it isn't guaranteed to be the best possible plan for long lists.")
  return lines
}

export function plateFitWorking(size: number[]): Line[] {
  const [x, y, t] = size.slice().sort((a, b) => b - a)
  return [
    { what: 'Part, largest first', calc: `${w(x, 1)} × ${w(y, 1)}, ${w(t, 2)} mm thick` },
    { what: 'Same thickness', formula: 'plate thickness within ±0.2 mm', calc: `${w(t - 0.2, 2)} to ${w(t + 0.2, 2)} mm` },
    {
      what: 'Big enough',
      formula: 'plate length ≥ part length + 10,  plate width ≥ part width + 10',
      calc: `≥ ${w(x + 10, 0)} × ${w(y + 10, 0)} mm`,
      why: '5 mm each side for clamping and the cutter. Partly used plates always show, since what is left of them isn\'t recorded.',
    },
    'Partly used plates first so they get used up, then the smallest full plate that fits.',
  ]
}
