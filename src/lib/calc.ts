// Motor and gearbox calculator engine, ported from robot_design_calculator.xlsx.
// Every formula matches a cell in the workbook, named in the comment so the two can be
// checked against each other. One deliberate difference: motor constants, see motorConsts.
// Units follow the sheet: cm for lengths, kg, deg/s.

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
  stages: number // moving stages including the carriage, 1 = direct drive
  /** Cascade: each stage moves faster than the one below. Continuous: carriage moves at cable speed. Missing means cascade, as the sheet does. */
  rigging?: 'cascade' | 'continuous'
  pulleyRadius: number // cm
  linearSpeed: number // m/s
  // Roller
  wheelDiameter: number // cm
  spinMass: number // kg
  dragTorque: number // Nm
  spinUp: number // s
  wheelRpm: number
  /** Pivot: degrees one move covers. Linear: carriage travel in cm. Missing means 90 degrees or 100 cm. */
  travel?: number
  // Mode 2
  ratio: number
  /** From the sheet's Check mode. Unused now: Check runs the typed ratio at the target speed. */
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

/** Voltage the motor datasheets are measured at. Every motor in the table is a 12 V spec. */
export const DATASHEET_V = 12

/**
 * Robot!C88:C89, with one fix. The sheet divided by the battery voltage, which made Kv and
 * resistance change with the battery, so a sagging battery still showed full free speed and
 * full stall current. Kv and resistance belong to the motor, so they come from the 12 V
 * datasheet; the battery voltage then sets how much of that the motor can use.
 */
export function motorConsts(m: Motor) {
  return { kv: m.freeRpm / DATASHEET_V, r: DATASHEET_V / m.stallCurrent, kt: m.stallTorque / (m.stallCurrent - m.freeCurrent) }
}

/** Stall torque at a voltage. Equals the datasheet stall torque at 12 V. */
export const stallTorqueAt = (m: Motor, voltage: number) => {
  const { r, kt } = motorConsts(m)
  return Math.max(0, kt * (voltage / r - m.freeCurrent))
}

/**
 * Elevator gearing from the rigging. Cascade: the drive moves the first stage, and every stage
 * moves one cable speed faster than the one below, so the carriage moves `stages` times cable
 * speed and each kilogram counts as many times as its speed multiple. Continuous: the carriage
 * moves at cable speed and, at worst, the cable lifts carriage and stages together.
 */
const speedMult = (x: Mechanism) => (x.rigging === 'continuous' ? 1 : x.stages)
/** Cascade middle stages move at 1, 2 ... stages-1 times cable speed: on average stages / 2. Exact for two stages. */
const middleMult = (x: Mechanism) => (x.rigging === 'continuous' ? 1 : Math.max(1, x.stages / 2))
const liftedMass = (x: Mechanism) => speedMult(x) * x.carriageMass + middleMult(x) * x.stageMass

/** Stator current for a torque, Robot!C74. */
const statorFor = (m: Motor, torque: number) => m.freeCurrent + ((m.stallCurrent - m.freeCurrent) * torque) / m.stallTorque

// ---------- Mechanisms ----------

/** Robot!C63: torque at the output shaft. */
export function loadTorque(x: Mechanism): number {
  if (x.type === 'pivot') return (x.pivotMass * 9.81 * x.pivotDist) / 100
  if (x.type === 'linear') return (9.81 * liftedMass(x) * x.pulleyRadius) / 100
  const omega = (x.wheelRpm * 2 * Math.PI) / 60
  return ((x.spinMass * (x.wheelDiameter / 200) ** 2) / 2) * (omega / x.spinUp) + x.dragTorque
}

/** Robot!C64: output speed the mechanism needs, deg/s. */
export function targetSpeed(x: Mechanism): number {
  if (x.type === 'pivot') return x.pivotSpeed
  if (x.type === 'linear') return ((x.linearSpeed / ((speedMult(x) * x.pulleyRadius) / 100)) * 180) / Math.PI
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
  const { kv, r } = motorConsts(motor)
  const torque = loadTorque(x) / (ratio * x.motors * x.efficiency)
  const stator = statorFor(motor, torque)
  const duty = (motorRpm / kv + stator * r) / voltage
  const battery = duty * stator
  const efficiency = battery > 0 ? (torque * motorRpm * 2 * Math.PI) / 60 / (voltage * battery) : 0
  return { ratio, motorRpm, torque, stator, duty, battery, efficiency }
}

/**
 * Sweep!A2:A201 is 200 ratios on a log scale from 1 to 2000. The same spacing continues down to
 * 0.25 so step-ups (a shooter wheel faster than the motor) can be found too; the sheet's 200
 * points are unchanged.
 */
const SWEEP_STEP = 2000 ** (1 / 199)
const BELOW_ONE = Math.floor(Math.log(4) / Math.log(SWEEP_STEP))
export const SWEEP_MIN = SWEEP_STEP ** -BELOW_ONE
export const SWEEP_RATIOS = Array.from({ length: 200 + BELOW_ONE }, (_, i) => SWEEP_STEP ** (i - BELOW_ONE))

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
      o.torque < stallTorqueAt(motor, voltage) &&
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
  time90: number | null // pivot, s, at full speed with no speed-up
  move: Move | null // pivot and linear
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
  // Both modes run at the target speed. The sheet's Check mode took a separate motor speed,
  // which let the result ignore the speed typed above it.
  const op = ratio == null ? null : operate(x, motor, voltage, ratio, (target / 6) * ratio)
  const out = op ? (op.motorRpm / op.ratio) * 6 : null // Robot!C68
  // Robot!C79:C80, at the battery voltage rather than the 12 V datasheet.
  const stall = stallTorqueAt(motor, voltage)
  const loadFrac = op ? op.torque / stall : null
  const stallOut = op ? stall * x.motors * op.ratio * x.efficiency : null
  // Robot!C81, with one change: the sheet used full stall torque, but the stator limit you set
  // in Phoenix caps the torque, so the heaviest load it can hold comes from the smaller of the two.
  const { kt } = motorConsts(motor)
  const holdOut = op ? Math.min(stall, Math.max(0, kt * (x.maxStator - motor.freeCurrent))) * x.motors * op.ratio * x.efficiency : null
  let stallLoad: number | null = null
  if (holdOut != null && x.type === 'pivot') stallLoad = holdOut / ((x.pivotDist / 100) * 9.81)
  if (holdOut != null && x.type === 'linear') {
    // Heaviest carriage, with the middle stages' own weight taken off first.
    const total = holdOut / ((x.pulleyRadius / 100) * 9.81)
    stallLoad = Math.max(0, (total - middleMult(x) * x.stageMass) / speedMult(x))
  }

  // Robot!C82. One change from the sheet: a speed the motor can't reach even at full
  // voltage is reported as that, before the battery check, since its battery number is not real.
  let status: Status = 'OK'
  if (!x.onRobot) status = 'OFF'
  else if (!op) status = 'NO RATIO FITS'
  else if (loadFrac! >= 1) status = 'STALLED'
  else if (op.duty > 1) status = 'NO VOLTAGE'
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
    move: op && x.type !== 'roller' ? simulateMove(x, motor, voltage, op.ratio) : null,
    carriageSpeed: x.type === 'linear' && out != null ? ((out * Math.PI) / 180) * (x.pulleyRadius / 100) * speedMult(x) : null,
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

// ---------- Moves with speed-up ----------

export const travelOf = (x: Mechanism) => x.travel ?? (x.type === 'pivot' ? 90 : 100)

/**
 * Inertia the motors have to spin up, at the output shaft (kg m^2). Pivot: the mass sits at its
 * centre of mass. Linear: each moving part counts by the square of its speed multiple, at the
 * pulley radius. The motors' own rotors are left out: no maker publishes them.
 */
export function outputInertia(x: Mechanism): number {
  if (x.type === 'pivot') return x.pivotMass * (x.pivotDist / 100) ** 2
  const n = x.stages
  // Cascade middle stages move at 1 ... n-1 times cable speed, mass shared evenly: sum k^2 / (n - 1).
  const stageMult = x.rigging === 'continuous' || n <= 1 ? 1 : (n * (2 * n - 1)) / 6
  const mass = speedMult(x) ** 2 * x.carriageMass + stageMult * x.stageMass
  return mass * (x.pulleyRadius / 100) ** 2
}

export interface Move {
  time: number // s, start to stop over the travel
  speedUp: number // s from rest to the target speed (or to the top of a short move)
  peakBattery: number // A per motor while speeding up
  short: boolean // the move is too short to reach the target speed
}

/**
 * One move from rest to rest over the travel, at the given ratio. The motor gets the full
 * battery voltage, held to the stator limit, against the worst-case load the whole way
 * (arm level, everything lifted). Slowing down is taken to mirror speeding up. Returns null if
 * the motor can't start the load moving.
 */
export function simulateMove(x: Mechanism, motor: Motor, voltage: number, ratio: number): Move | null {
  const { kv, r, kt } = motorConsts(motor)
  const kvRad = (kv * 2 * Math.PI) / 60 // rad/s per volt
  const J = outputInertia(x)
  const load = loadTorque(x)
  const target = (targetSpeed(x) * Math.PI) / 180 // rad/s at the output
  // Output-shaft angle for the whole travel.
  const travel = x.type === 'pivot' ? (travelOf(x) * Math.PI) / 180 : travelOf(x) / 100 / ((speedMult(x) * x.pulleyRadius) / 100)
  if (!(J > 0) || !(target > 0) || !(travel > 0) || !(ratio > 0)) return null

  const step = (w: number) => {
    const wm = w * ratio
    const amps = Math.min(x.maxStator, (voltage - wm / kvRad) / r)
    const torque = kt * (amps - motor.freeCurrent) * x.motors * ratio * x.efficiency
    const applied = wm / kvRad + amps * r
    return { accel: (torque - load) / J, battery: Math.max(0, (applied / voltage) * amps) }
  }
  if (step(0).accel <= 0) return null

  // Small steps against the time it would take at the starting acceleration.
  const dt = Math.min(1e-3, target / step(0).accel / 2000)
  let t = 0
  let w = 0
  let angle = 0
  let peak = 0
  for (let i = 0; i < 2e6; i++) {
    const s = step(w)
    peak = Math.max(peak, s.battery)
    if (s.accel <= 1e-9) break // the motor tops out below the target speed
    const next = Math.min(target, w + s.accel * dt)
    const used = next < target ? dt : (target - w) / s.accel
    const d = ((w + next) / 2) * used
    if (angle + d >= travel / 2) {
      // Short move: the top of the speed-up is the middle of the travel.
      const frac = (travel / 2 - angle) / d
      return { time: 2 * (t + used * frac), speedUp: t + used * frac, peakBattery: peak, short: true }
    }
    angle += d
    t += used
    w = next
    if (w >= target) break
  }
  if (w <= 0) return null
  return { time: 2 * t + (travel - 2 * angle) / w, speedUp: t, peakBattery: peak, short: false }
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
  const { kv, r } = motorConsts(m)
  const wheelR = s.wheelDiameter / 200 // m
  const rollForce = s.rolling * s.robotMass * 9.81
  const ratios = s.ratios.map((g): SwerveRatio => {
    const freeSpeed = ((voltage * kv) / g) * Math.PI * (s.wheelDiameter / 100) / 60 // C37, at the battery voltage
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
  const { kv, r, kt } = motorConsts(m)
  return Array.from({ length: points }, (_, i) => {
    const rpm = duty * voltage * kv * (i / (points - 1))
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
  const { kv, r, kt } = motorConsts(m)
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
 * Torque at a speed with `volts` at the motor: T = Kt x ((V - RPM / Kv) / R - free current).
 * Negative past free speed. Lowering the voltage lowers torque at every speed by the same amount.
 */
export function torqueAtSpeed(m: Motor, datasheetV: number, volts: number, rpm: number) {
  const kv = m.freeRpm / datasheetV
  const r = datasheetV / m.stallCurrent
  const kt = m.stallTorque / (m.stallCurrent - m.freeCurrent)
  return kt * ((volts - rpm / kv) / r - m.freeCurrent)
}

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
