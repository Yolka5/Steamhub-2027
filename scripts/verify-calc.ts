// Checks the web calculator engine against the numbers the spreadsheet calculated and saved.
import { computeRobot, mechanismAtRpm, motorCurve, voltageMap, findMotor } from '../src/lib/calc'
import { DEFAULT_ROBOT } from '../src/lib/calcDefaults'

let fails = 0
function check(label: string, got: number | string | null | undefined, want: number | string, tol = 0) {
  let ok: boolean
  if (typeof want === 'string') ok = got === want
  else ok = typeof got === 'number' && Math.abs(got - want) <= tol
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${typeof got === 'number' ? +got.toFixed(4) : got}, sheet ${want}`)
}

const r = computeRobot(DEFAULT_ROBOT)

// Robot tab, rows 63-82 and 93, cached values as the sheet displays them (rounded).
const sheet: Record<string, [number, number, number, number, number, number, number, number, number, number, number, number, number | null, string]> = {
  //               load    target   ratio  rpm   torque stator duty   batt  battAll eff    load%  stallT  stallKg  status
  elevator:        [5.43, 1400.6, 12.9, 3017, 0.247, 14.7, 0.543, 8.0, 15.9, 0.816, 0.035, 155.8, 352.9, 'OK'],
  arm:             [32.23, 170.0, 90.7, 2569, 0.222, 13.4, 0.465, 6.2, 12.5, 0.799, 0.031, 1028.4, 233.0, 'OK'],
  'ee-pivot':      [5.06, 340.0, 40.6, 2303, 0.147, 12.8, 0.343, 4.4, 4.4, 0.669, 0.036, 142.0, 120.6, 'OK'],
  'intake-pivot':  [19.62, 150.0, 101.7, 2542, 0.227, 13.7, 0.461, 6.3, 6.3, 0.800, 0.032, 612.7, 249.8, 'OK'],
  'intake-roller': [0.71, 9000.0, 2.7, 4049, 0.290, 16.9, 0.721, 12.2, 12.2, 0.842, 0.041, 17.2, null, 'OK'],
  'ee-roller':     [0.26, 13500.0, 1.6, 3558, 0.185, 15.5, 0.514, 7.9, 7.9, 0.725, 0.045, 5.8, null, 'OK'],
}
for (const [id, w] of Object.entries(sheet)) {
  const m = r.mechs.get(id)!
  const o = m.op!
  check(`${id} load torque`, m.load, w[0], 0.006)
  check(`${id} target deg/s`, m.target, w[1], 0.06)
  check(`${id} ratio`, o.ratio, w[2], 0.06)
  check(`${id} motor rpm`, o.motorRpm, w[3], 0.6)
  check(`${id} torque/motor`, o.torque, w[4], 0.0006)
  check(`${id} stator`, o.stator, w[5], 0.06)
  check(`${id} duty`, o.duty, w[6], 0.0006)
  check(`${id} battery/motor`, o.battery, w[7], 0.06)
  check(`${id} battery all`, m.batteryAll, w[8], 0.06)
  check(`${id} efficiency`, o.efficiency, w[9], 0.0006)
  check(`${id} load %`, m.load_, w[10], 0.0006)
  check(`${id} stall torque out`, m.stallTorqueOut, w[11], 0.06)
  if (w[12] != null) check(`${id} stall load kg`, m.stallLoad, w[12], 0.06)
  check(`${id} status`, m.status, w[13])
}

// Swerve tab D column (R2) and C/E free and top speeds.
const sw = r.swerve.ratios
check('swerve R1 free speed', sw[0].freeSpeed, 4.54, 0.006)
check('swerve R2 free speed', sw[1].freeSpeed, 5.29, 0.006)
check('swerve R3 free speed', sw[2].freeSpeed, 6.06, 0.006)
check('swerve R1 cruise torque', sw[0].cruiseTorque, 0.041, 0.0006)
check('swerve R2 cruise stator', sw[1].cruiseStator, 4.5, 0.06)
check('swerve R1 top speed', sw[0].topSpeed, 4.26, 0.006)
check('swerve R2 top speed', sw[1].topSpeed, 4.96, 0.006)
check('swerve R3 top speed', sw[2].topSpeed, 5.67, 0.006)
check('swerve R1 accel stator', sw[0].accelStator, 7.7, 0.06)
check('swerve R2 accel stator', sw[1].accelStator, 6.6, 0.06)
check('swerve R3 accel stator', sw[2].accelStator, 5.7, 0.06)
check('swerve traction', sw[0].accelTraction, 11.8, 0.06)
check('swerve force', sw[1].force, 161, 0.6)
check('swerve R1 motor rpm', sw[0].motorRpm, 3964, 0.6)
check('swerve R2 motor rpm', sw[1].motorRpm, 3401, 0.6)
check('swerve R2 torque', sw[1].torque, 0.376, 0.0006)
check('swerve R1 stator', sw[0].stator, 18.6, 0.06)
check('swerve R2 stator', sw[1].stator, 21.3, 0.06)
check('swerve R3 stator', sw[2].stator, 24.1, 0.06)
check('swerve R1 duty', sw[0].duty, 0.711, 0.0006)
check('swerve R2 duty', sw[1].duty, 0.625, 0.0006)
check('swerve R3 duty', sw[2].duty, 0.561, 0.0006)
check('swerve R1 battery', sw[0].battery, 13.2, 0.06)
check('swerve R2 battery all', sw[1].batteryAll, 53.2, 0.06)
check('swerve R3 battery all', sw[2].batteryAll, 54.0, 0.06)
check('swerve R2 status', sw[1].status, 'OK')
check('steer battery', r.swerve.steerBattery, 10.0, 0.01)

// Robot budget, rows 9-23.
check('set 1 draw', r.setDraws[0], 81.7, 0.06)
check('set 2 draw', r.setDraws[1], 104.0, 0.06)
check('set 3 draw', r.setDraws[2], 102.3, 0.06)
check('set 4 draw', r.setDraws[3], 0, 0)
check('biggest set', r.biggestSet, 104.0, 0.06)
check('scale factor', r.scale, 0.96, 0.006)
check('everything at once', r.everything, 122.5, 0.06)
check('Kraken X60 count', r.motorCounts.get('Kraken X60'), 10)
check('Kraken X44 count', r.motorCounts.get('Kraken X44'), 6)
check('total motors', r.totalMotors, 16)

// Curves tab: arm pivot at ratio 40, duty 1.
const arm = DEFAULT_ROBOT.mechanisms.find((m) => m.id === 'arm')!
const x60 = findMotor(DEFAULT_ROBOT.motors, arm.motor)
const curve = motorCurve(x60, 12, 1)
check('curve 300 rpm stator', curve[1].stator, 347.7, 0.06)
check('curve 300 rpm torque', curve[1].torque, 6.73, 0.006)
check('curve 300 rpm power', curve[1].power, 212, 0.6)
check('curve 3000 rpm efficiency', curve[10].efficiency, 0.5045, 0.006)
const b = mechanismAtRpm(arm, x60, 12, 40, [500, 1000, 1500, 5500])
check('table B 500 volts', b[0].volts, 1.91, 0.006)
check('table B 500 stator', b[0].stator, 27.9, 0.06)
check('table B 500 battery', b[0].battery, 4.4, 0.06)
check('table B 1000 efficiency', b[1].efficiency, 0.65, 0.0006)
check('table B 1500 battery all', b[2].batteryAll, 18.2, 0.06)
check('table B 5500 check', b[3].check, 'OVER DUTY LIMIT')

// Voltage map: Kraken X60 non-FOC at 5..12 V.
const vm = voltageMap(x60, 12, 12, [5, 6, 7, 8, 10, 12], [3, 7, 40])
check('vmap stall torque 5V', vm.perVoltage[0].stallTorque, 2.93, 0.006)
check('vmap free rpm 10V', vm.perVoltage[4].freeRpm, 5000, 0.5)
check('vmap max battery 7V', vm.perVoltage[2].maxBattery, 124.5, 0.06)
check('vmap 3A @5V stator', vm.rows[0].cells[0]!.stator, 7.2, 0.06)
check('vmap 7A @6V torque', vm.rows[1].cells[1]!.torque, 0.234, 0.0006)
check('vmap 40A @12V stator', vm.rows[2].cells[5]!.stator, 40, 0.06)
check('min volts for 40A', vm.minVoltFor40, 4.0, 0.06)

console.log(fails ? `\n${fails} FAILED` : '\nAll checks match the spreadsheet.')
process.exit(fails ? 1 : 0)
