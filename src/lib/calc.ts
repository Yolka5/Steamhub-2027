// Motor and gearbox calculator engine, ported from robot_design_calculator.xlsx.
// Every formula matches a cell in the workbook; the cell is named in the comment so the
// two can be checked against each other. Units follow the sheet: cm for lengths, kg, deg/s.

export interface Motor {
  name: string
  freeRpm: number
  stallTorque: number // Nm
  stallCurrent: number // A
  freeCurrent: number // A
  source?: string
}

export type MechType = 'pivot' | 'linear' | 'roller'

export interface Mechanism {
  id: string
  name: string
  onRobot: boolean
  sets: boolean[] // one per set
  type: MechType
  mode: 1 | 2 // 1 finds the ratio, 2 checks a ratio you type
  motor: string
  motors: number // per gearbox
  efficiency: number
  maxBattery: number // A per motor
  maxStator: number // A per motor
  maxDuty: number
  maxRatio: number
  // Pivot
  pivotMass: number // kg
  pivotDist: number // cm
  pivotSpeed: number // deg/s
  // Linear
  carriageMass: number // kg
  stageMass: number // kg
  stages: number // 1 direct, 2 continuous cascade
  pulleyRadius: number // cm
  linearSpeed: number // m/s
  // Roller
  wheelDiameter: number // cm
  spinMass: number // kg
  dragTorque: number // Nm
  spinUp: number // s
  wheelRpm: number
  // Mode 2
  ratio: number
  motorRpm: number
}

export interface Swerve {
  robotMass: number // kg
  wheelDiameter: number // cm
  motor: string
  driveMotors: number
  efficiency: number
  rolling: number // fraction of weight
  friction: number // tire coefficient
  maxStator: number
  maxDuty: number
  speed: number // m/s at the operating point
  accel: number // m/s^2 at the operating point
  ratios: [number, number, number] // R1, R2, R3
  selected: 0 | 1 | 2
  steerMotors: number
  steerRatio: number
  steerAllowance: number // A per steer motor
  onRobot: boolean
  sets: boolean[]
}

export interface Robot {
  maxDraw: number // A
  maxMotors: number
  voltage: number // V
  setNames: string[]
  mechanisms: Mechanism[]
  swerve: Swerve
  motors: Motor[]
}

// ---------- Motor helpers ----------

export const findMotor = (motors: Motor[], name: string) => motors.find((m) => m.name === name) ?? motors[0]

/** Robot!C88:C89. Kv uses battery voltage, as the sheet does. */
export function motorConsts(m: Motor, voltage: number) {
  return { kv: m.freeRpm / voltage, r: voltage / m.stallCurrent, kt: m.stallTorque / (m.stallCurrent - m.freeCurrent) }
}

/** Stator current for a torque, Robot!C74. */
const statorFor = (m: Motor, torque: number) => m.freeCurrent + ((m.stallCurrent - m.freeCurrent) * torque) / m.stallTorque

// ---------- Mechanisms ----------

/** Robot!C63: torque at the output shaft. */
export function loadTorque(x: Mechanism): number {
  if (x.type === 'pivot') return (x.pivotMass * 9.81 * x.pivotDist) / 100
  if (x.type === 'linear') return (9.81 * (x.stages * x.carriageMass + x.stageMass) * x.pulleyRadius) / 100
  const omega = (x.wheelRpm * 2 * Math.PI) / 60
  return ((x.spinMass * (x.wheelDiameter / 200) ** 2) / 2) * (omega / x.spinUp) + x.dragTorque
}

/** Robot!C64: output speed the mechanism needs, deg/s. */
export function targetSpeed(x: Mechanism): number {
  if (x.type === 'pivot') return x.pivotSpeed
  if (x.type === 'linear') return ((x.linearSpeed / ((x.stages * x.pulleyRadius) / 100)) * 180) / Math.PI
  return x.wheelRpm * 6
}

export interface Operating {
  ratio: number
  motorRpm: number
  torque: number // per motor
  stator: number
  duty: number
  battery: number // per motor
  efficiency: number
}

/** One gear ratio at one motor speed: the Sweep tab row, also Robot!C73:C78. */
export function operate(x: Mechanism, motor: Motor, voltage: number, ratio: number, motorRpm: number): Operating {
  const { kv, r } = motorConsts(motor, voltage)
  const torque = loadTorque(x) / (ratio * x.motors * x.efficiency)
  const stator = statorFor(motor, torque)
  const duty = (motorRpm / kv + stator * r) / voltage
  const battery = duty * stator
  const efficiency = battery > 0 ? (torque * motorRpm * 2 * Math.PI) / 60 / (voltage * battery) : 0
  return { ratio, motorRpm, torque, stator, duty, battery, efficiency }
}

/** Sweep!A2:A201: 200 ratios spread evenly on a log scale from 1 to 2000. */
export const SWEEP_RATIOS = Array.from({ length: 200 }, (_, i) => 2000 ** (i / 199))

export interface SweepPoint extends Operating {
  feasible: boolean
}

/** Sweep tab: every ratio, and whether it fits all the limits (Sweep!H). */
export function sweep(x: Mechanism, motor: Motor, voltage: number): SweepPoint[] {
  const out = targetSpeed(x) / 6
  return SWEEP_RATIOS.map((ratio) => {
    const o = operate(x, motor, voltage, ratio, out * ratio)
    const feasible =
      o.battery <= x.maxBattery &&
      o.duty <= x.maxDuty &&
      o.stator <= x.maxStator &&
      o.torque < motor.stallTorque &&
      ratio <= x.maxRatio
    return { ...o, feasible }
  })
}

/** Robot!C93: the feasible ratio with the best efficiency, first one on a tie (MATCH). */
export function bestRatio(points: SweepPoint[]): number | null {
  let best: SweepPoint | null = null
  for (const p of points) if (p.feasible && (!best || p.efficiency > best.efficiency)) best = p
  return best ? best.ratio : null
}

export type Status = 'OK' | 'HIGH LOAD' | 'STALLED' | 'OVER BATTERY' | 'OVER STATOR' | 'NO VOLTAGE' | 'NO RATIO FITS' | 'OFF'

export interface MechResult {
  load: number
  target: number // deg/s
  op: Operating | null
  outSpeed: number | null // deg/s
  time90: number | null // pivot, s
  carriageSpeed: number | null // linear, m/s
  wheelRpm: number | null // roller
  surfaceSpeed: number | null // roller, m/s
  batteryAll: number | null // all motors in the gearbox
  load_: number | null // fraction of stall torque
  stallTorqueOut: number | null
  stallLoad: number | null // kg
  status: Status
  sweep: SweepPoint[]
}

export function computeMechanism(x: Mechanism, motors: Motor[], voltage: number): MechResult {
  const motor = findMotor(motors, x.motor)
  const load = loadTorque(x)
  const target = targetSpeed(x)
  const points = sweep(x, motor, voltage)
  const ratio = x.mode === 1 ? bestRatio(points) : x.ratio // Robot!C66
  const op = ratio == null ? null : operate(x, motor, voltage, ratio, x.mode === 1 ? (target / 6) * ratio : x.motorRpm)
  const out = op ? (op.motorRpm / op.ratio) * 6 : null // Robot!C68
  const loadFrac = op ? op.torque / motor.stallTorque : null // Robot!C79
  const stallOut = op ? motor.stallTorque * x.motors * op.ratio * x.efficiency : null // Robot!C80
  let stallLoad: number | null = null // Robot!C81
  if (stallOut != null && x.type === 'pivot') stallLoad = stallOut / ((x.pivotDist / 100) * 9.81)
  if (stallOut != null && x.type === 'linear') stallLoad = stallOut / ((x.pulleyRadius / 100) * 9.81 * x.stages)

  // Robot!C82, checks in the same order as the sheet.
  let status: Status = 'OK'
  if (!x.onRobot) status = 'OFF'
  else if (!op) status = 'NO RATIO FITS'
  else if (loadFrac! >= 1) status = 'STALLED'
  else if (op.battery > x.maxBattery) status = 'OVER BATTERY'
  else if (op.stator > x.maxStator) status = 'OVER STATOR'
  else if (op.duty > x.maxDuty) status = 'NO VOLTAGE'
  else if (loadFrac! >= 0.8) status = 'HIGH LOAD'

  return {
    load,
    target,
    op,
    outSpeed: out,
    time90: x.type === 'pivot' && out ? 90 / out : null,
    carriageSpeed: x.type === 'linear' && out != null ? ((out * Math.PI) / 180) * (x.pulleyRadius / 100) * x.stages : null,
    wheelRpm: x.type === 'roller' && out != null ? out / 6 : null,
    surfaceSpeed: x.type === 'roller' && out != null ? ((out / 6) * Math.PI * x.wheelDiameter) / 100 / 60 : null,
    batteryAll: op ? op.battery * x.motors : null,
    load_: loadFrac,
    stallTorqueOut: stallOut,
    stallLoad,
    status,
    sweep: points,
  }
}

// ---------- Swerve ----------

export type SwerveStatus = 'OK' | 'TIGHT' | 'TOO FAST' | 'ACCEL TOO HIGH' | 'OVER STATOR'

export interface SwerveRatio {
  ratio: number
  freeSpeed: number // m/s, Swerve!C37
  cruiseTorque: number // C38
  cruiseStator: number // C39
  topSpeed: number // m/s at max duty, C40
  accelStator: number // C41
  accelTraction: number // C42
  accelUsable: number // C43
  force: number // N, C44
  motorRpm: number // C45
  torque: number // C46
  stator: number // C47
  duty: number // C48
  battery: number // per motor, C49
  batteryAll: number // C50
  status: SwerveStatus // C51
}

export function computeSwerve(s: Swerve, motors: Motor[], voltage: number): { ratios: SwerveRatio[]; driveBattery: number; steerBattery: number } {
  const m = findMotor(motors, s.motor)
  const { kv, r } = motorConsts(m, voltage)
  const wheelR = s.wheelDiameter / 200 // m
  const rollForce = s.rolling * s.robotMass * 9.81
  const ratios = s.ratios.map((g): SwerveRatio => {
    const freeSpeed = ((m.freeRpm / g) * Math.PI * (s.wheelDiameter / 100)) / 60
    const cruiseTorque = (rollForce * wheelR) / (s.driveMotors * g * s.efficiency)
    const cruiseStator = statorFor(m, cruiseTorque)
    const topSpeed = ((((s.maxDuty * voltage - cruiseStator * r) * kv) / g) * Math.PI * (s.wheelDiameter / 100)) / 60
    const statorTorque = ((s.maxStator - m.freeCurrent) / (m.stallCurrent - m.freeCurrent)) * m.stallTorque
    const accelStator = ((s.driveMotors * statorTorque * g * s.efficiency) / wheelR - rollForce) / s.robotMass
    const accelTraction = s.friction * 9.81
    const accelUsable = Math.min(accelStator, accelTraction)
    const force = s.robotMass * s.accel + rollForce
    const motorRpm = (s.speed / (Math.PI * (s.wheelDiameter / 100))) * 60 * g
    const torque = (force * wheelR) / (s.driveMotors * g * s.efficiency)
    const stator = statorFor(m, torque)
    const duty = (motorRpm / kv + stator * r) / voltage
    const battery = duty * stator
    let status: SwerveStatus = 'OK'
    if (s.accel > accelUsable) status = 'ACCEL TOO HIGH'
    else if (duty > 1) status = 'TOO FAST'
    else if (duty > s.maxDuty) status = 'TIGHT'
    else if (stator > s.maxStator) status = 'OVER STATOR'
    return {
      ratio: g,
      freeSpeed,
      cruiseTorque,
      cruiseStator,
      topSpeed,
      accelStator,
      accelTraction,
      accelUsable,
      force,
      motorRpm,
      torque,
      stator,
      duty,
      battery,
      batteryAll: battery * s.driveMotors,
      status,
    }
  })
  return { ratios, driveBattery: ratios[s.selected].batteryAll, steerBattery: s.steerMotors * s.steerAllowance }
}

// ---------- Whole robot ----------

export interface RobotResult {
  mechs: Map<string, MechResult>
  swerve: ReturnType<typeof computeSwerve>
  setDraws: number[] // Robot!C17:C21
  biggestSet: number // C12
  scale: number // C13
  everything: number // C23
  motorCounts: Map<string, number> // C9:C10, by motor family
  totalMotors: number
}

/** "Kraken X60 FOC" and "Kraken X60 (non-FOC)" both count as Kraken X60, as the sheet does. */
export const motorFamily = (name: string) => name.slice(0, 10)

export function computeRobot(robot: Robot): RobotResult {
  const mechs = new Map(robot.mechanisms.map((x) => [x.id, computeMechanism(x, robot.motors, robot.voltage)]))
  const swerve = computeSwerve(robot.swerve, robot.motors, robot.voltage)

  const setDraws = robot.setNames.map((_, i) => {
    let sum = 0
    for (const x of robot.mechanisms) if (x.onRobot && x.sets[i]) sum += mechs.get(x.id)!.batteryAll ?? 0
    if (robot.swerve.onRobot && robot.swerve.sets[i]) sum += swerve.driveBattery + swerve.steerBattery
    return sum
  })
  const biggestSet = Math.max(0, ...setDraws)
  let everything = 0
  for (const x of robot.mechanisms) if (x.onRobot) everything += mechs.get(x.id)!.batteryAll ?? 0
  if (robot.swerve.onRobot) everything += swerve.driveBattery + swerve.steerBattery

  const motorCounts = new Map<string, number>()
  const count = (name: string, n: number) => motorCounts.set(motorFamily(name), (motorCounts.get(motorFamily(name)) ?? 0) + n)
  for (const x of robot.mechanisms) if (x.onRobot) count(x.motor, x.motors)
  if (robot.swerve.onRobot) {
    count(robot.swerve.motor, robot.swerve.driveMotors)
    count('Kraken X44', robot.swerve.steerMotors)
  }
  const totalMotors = [...motorCounts.values()].reduce((a, b) => a + b, 0)

  return {
    mechs,
    swerve,
    setDraws,
    biggestSet,
    scale: biggestSet > 0 ? Math.min(1, robot.maxDraw / biggestSet) : 1,
    everything,
    motorCounts,
    totalMotors,
  }
}

// ---------- Curves tab ----------

/** Curves table A: the motor's dyno curve at a share of battery voltage, 21 points to free speed. */
export function motorCurve(m: Motor, voltage: number, duty: number, points = 21) {
  const { kv, r, kt } = motorConsts(m, voltage)
  return Array.from({ length: points }, (_, i) => {
    const rpm = m.freeRpm * duty * (i / (points - 1))
    const backEmf = rpm / kv
    const stator = Math.max(0, (duty * voltage - backEmf) / r)
    const battery = duty * stator
    const torque = Math.max(0, kt * (stator - m.freeCurrent))
    const power = (torque * rpm * 2 * Math.PI) / 60
    const input = voltage * battery
    return { rpm, stator, battery, torque, power, efficiency: input > 0 ? power / input : 0 }
  })
}

export type CurveCheck = 'OK' | 'CANNOT REACH' | 'OVER DUTY LIMIT' | 'OVER BATTERY LIMIT' | 'OVER STATOR LIMIT'

/** Curves table B: one mechanism at a fixed ratio across motor speeds. Load is constant, so stator is flat. */
export function mechanismAtRpm(x: Mechanism, m: Motor, voltage: number, ratio: number, rpms: number[]) {
  const { kv, r, kt } = motorConsts(m, voltage)
  const torque = loadTorque(x) / (ratio * x.motors * x.efficiency)
  const stator = m.freeCurrent + torque / kt
  return rpms.map((rpm) => {
    const volts = rpm / kv + stator * r
    const duty = volts / voltage
    const battery = duty * stator
    let check: CurveCheck = 'OK'
    if (duty > 1) check = 'CANNOT REACH'
    else if (duty > x.maxDuty) check = 'OVER DUTY LIMIT'
    else if (battery > x.maxBattery) check = 'OVER BATTERY LIMIT'
    else if (stator > x.maxStator) check = 'OVER STATOR LIMIT'
    return {
      rpm,
      outSpeed: (rpm / ratio) * 6,
      volts,
      duty,
      stator,
      battery,
      batteryAll: battery * x.motors,
      efficiency: battery > 0 ? (torque * rpm * 2 * Math.PI) / 60 / (voltage * battery) : 0,
      check,
    }
  })
}

// ---------- Voltage map tab ----------

/**
 * One motor at several applied voltages. For each battery current, the stator current is
 * battery x battery voltage / applied voltage, capped by what the motor can draw at that voltage.
 */
export function voltageMap(m: Motor, datasheetV: number, batteryV: number, volts: number[], currents: number[]) {
  const kv = m.freeRpm / datasheetV
  const r = datasheetV / m.stallCurrent
  const kt = m.stallTorque / (m.stallCurrent - m.freeCurrent)
  const perVoltage = volts.map((v) => ({
    volts: v,
    stallCurrent: v / r,
    stallTorque: Math.max(0, kt * (v / r - m.freeCurrent)),
    freeRpm: v * kv,
    maxBattery: ((v / r) * v) / batteryV,
  }))
  const rows = currents.map((bat) => ({
    battery: bat,
    cells: volts.map((v) => {
      const stator = (bat * batteryV) / v
      if (stator > v / r) return null
      const torque = Math.max(0, kt * (stator - m.freeCurrent))
      const rpm = Math.max(0, (v - stator * r) * kv)
      return { stator, torque, rpm }
    }),
  }))
  return { perVoltage, rows, minVoltFor40: Math.sqrt(40 * r * batteryV) }
}
