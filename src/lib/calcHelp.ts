// The explanations from the robot design calculator workbook, one per field, so the web
// calculator explains itself the way the spreadsheet did. Shown when "Explain" is on.

export const HELP = {
  // Robot budget
  maxDraw: 'Your battery current budget for the whole robot. Each set below is checked against it.',
  maxMotors: 'The most motors you may use on the robot.',
  voltage: 'Battery voltage under load, used in every calculation. Motor specs are 12 V datasheet values, so a lower voltage here lowers top speed and stall torque.',
  biggestSet: 'The highest total draw of any set below. This is the worst case for your battery.',
  scale: "1.00 means you fit. Below 1.00 means every motor's current limit must shrink by this much to fit.",
  motorsUsed: 'Counted automatically from every mechanism that is on the robot. Turns red if over the limit.',
  everything: 'For reference only. Real robots rarely run everything together.',
  sets: 'Each row is one group of mechanisms that move at the same time. Tick a mechanism into a set with "Runs in" on the mechanism.',

  // Mechanism
  name: 'Type any name you like. It also appears in the Motor curves tab.',
  onRobot: 'On = this mechanism exists on the robot. Off = ignore it completely (also not counted as motors).',
  runsIn: 'Tick every set where this mechanism moves at the same time as the others in that set.',
  type: 'Pivot swings around an axis. Linear slides on a pulley. Roller spins a wheel.',
  mode: 'Find ratio = the calculator tries every ratio and picks the most efficient one that fits every limit. Check a ratio = you type a ratio and it is tested at your target speed.',
  motor: 'Which Kraken motor drives this mechanism. Edit values on the Motors tab.',
  motors: 'How many motors share this gearbox. They split the load equally.',
  efficiency: 'Share of power that survives the gearbox. 0.85 means 15% is lost to friction.',
  maxBattery: 'The most current each motor may take from the battery. Find ratio only picks ratios under it.',
  maxStator: 'The most torque-producing current each motor may use. Set the same value in Phoenix.',
  maxDuty: 'The most battery voltage share a motor may use. 0.90 leaves room for control.',
  maxRatio: 'Largest gear ratio you are willing to build. Find ratio will not suggest more.',
  pivotMass: 'Weight of the thing that swings, in kg.',
  pivotDist: 'Distance from the axis to the middle of that weight.',
  pivotSpeed: 'How fast it should rotate, in degrees per second.',
  carriageMass: 'Mass of the carriage and everything on it.',
  stageMass: 'Total mass of the middle stages that also move (0 if there are none).',
  stages: 'Moving stages, counting the carriage. 1 = the carriage rides one fixed stage, 2 = one middle stage plus the carriage.',
  rigging: 'Cascade: each stage moves faster than the one below, so the carriage is fast but the cable pulls harder. Continuous: the carriage moves at cable speed and lifts the stages with it at the top.',
  pulleyRadius: 'Radius of the pulley or spool the cable wraps on. Use the pitch radius.',
  linearSpeed: 'How fast the carriage should move, in meters per second.',
  wheelDiameter: 'Diameter of the wheel.',
  spinMass: 'Total mass that spins (wheel, shaft, pulleys).',
  dragTorque: 'Torque the game piece adds as it is squeezed.',
  spinUp: 'How quickly you want to reach full speed.',
  wheelRpm: 'The wheel speed you want, in RPM.',
  ratio: 'The gear ratio you want to test. It is run at the target speed above.',
  travelPivot: 'How far one move swings, in degrees. Used for the move time below.',
  travelLinear: 'How far the carriage goes in one move, in cm. Used for the move time below.',

  // Mechanism results
  heroRatio: 'The gear ratio the results are based on. Find ratio = suggested. Check a ratio = yours.',
  moveTime: 'Fastest one move can go, standing still to standing still: full voltage, your stator limit, worst-case load. Leaves out the motors’ own spinning parts.',
  speedUp: 'Time from standing still to the target speed.',
  peakBattery: 'All motors in this gearbox, for a fraction of a second. The set budget uses the cruising current instead.',
  carriageSpeed: 'Carriage speed in meters per second.',
  surfaceSpeed: "Speed of the wheel's outer surface in meters per second.",
  load: 'Torque the mechanism needs at its output shaft, worked out from the inputs above.',
  torque: 'Torque each motor must make after the gearbox.',
  stator: 'Current inside the motor that makes torque. Always at least the battery current.',
  duty: 'Share of battery voltage the motor needs. Above 100% means it cannot reach that speed.',
  battery: 'Current each motor pulls from the battery. This is what you budget.',
  motorEff: 'Power out of the motor divided by power from the battery. Higher is better.',
  loadPct: 'How hard the motor is working. 100% is stalled. Keep it under about 80%.',
  stallOut: 'Torque at the output if the motor is stalled. Shows the most it could ever push.',
  stallLoad: 'The heaviest load (kg) it can hold still with the motors at your stator limit, or at stall if that is lower. Pivot: at your distance. Linear: at the carriage.',

  // Swerve
  robotMass: 'Total weight of the robot with battery and bumpers. More mass means more force to accelerate.',
  swWheel: 'Diameter of the drive wheel. A bigger wheel gives more top speed but less pushing force.',
  driveMotor: 'The motor used in every swerve drive module.',
  driveMotors: 'One drive motor per module. A normal swerve robot has 4.',
  swEff: 'How much motor power reaches the floor. 0.90 means 10% is lost in gears and bearings.',
  rolling: "Rolling friction as a share of the robot's weight. 0.03 means 3% of the weight resists motion.",
  friction: 'How grippy the tires are. This limits how hard the robot can accelerate before the wheels slip.',
  swStator: 'Safety limit on motor torque current. Set it equal to your stator limit in Phoenix.',
  swDuty: 'Highest share of battery voltage a motor may use. 0.95 keeps a little in reserve for control.',
  speed: 'The speed you want to check the draw at. Use the speed you drive at most often.',
  accel: 'How hard the robot is pushing while at that speed. More acceleration means more current.',
  selected: 'Which of the three gear ratios feeds the Robot tab.',
  steerMotors: 'How many steering motors there are (one per module).',
  steerAllowance: 'Steering uses little current. Type an allowance per motor, and it is added to the budget.',
  swRatio: 'Gear reduction from motor to wheel. These are placeholders: check them against the SDS spec table.',
  freeSpeed: 'Fastest the robot could go with no load at your full battery voltage.',
  topSpeed: 'Real top speed, after friction and your duty limit.',
  accelStator: 'Hardest acceleration the motors can give from a standstill at your stator current limit. At speed, voltage runs out first and it is lower.',
  accelTraction: 'Hardest acceleration the tires can grip. Past this the wheels spin.',
  accelUsable: 'The smaller of the two limits above. You cannot accelerate harder than this.',
  swMotorRpm: 'How fast each drive motor spins at your chosen speed.',
  swTorque: 'Torque each motor must make.',
  swStatorOut: 'Motor (stator) current needed for that torque.',
  swDutyOut: 'Share of battery voltage needed. Above 100% means the motor cannot reach that speed.',
  swBattery: 'Current each motor takes from the battery. This is what counts against your budget.',
  swBatteryAll: 'All drive motors together. This number goes to the Robot tab.',
  swStatus: 'OK, Tight, Too fast, Accel too high or Over stator.',

  // Curves
  curvesIntro: "Pick a mechanism and a gear ratio. See the motor's dyno-style curve and what your mechanism draws at every motor speed.",
  curveMech: 'Pick one of the mechanisms on the Robot tab. Its motor, load and limits are used.',
  curveRatio: 'Type the total gear ratio you want to look at. The table and the charts use it.',
  curveDuty: 'Share of battery voltage given to the motor, 0 to 1. 1 is full voltage. A lower value lowers the stall torque and the free speed together.',
  curveTable:
    'The load is the same at every RPM, so the stator current stays flat. As you raise the RPM, the motor needs more voltage, so the duty cycle and the battery current rise in a straight line.',
  curveMotor:
    'This is one curve for this motor at the chosen voltage. Each RPM is just a point on the curve. Torque and current fall in a straight line as speed rises. Power is a hill that peaks at half the free speed. Efficiency climbs with speed, peaks close to free speed, then drops to zero.',

  // Voltage map
  voltIntro: 'One motor at several voltages at the motor. Torque at each speed is the usual motor curve: a lower voltage gives less torque everywhere. Same battery current shows what a battery current limit allows at each voltage.',
  voltMotor: 'Pick a motor. Its datasheet numbers come from the Motors tab.',
  sheetV: 'The voltage used for the datasheet free speed and stall values.',
  batV: 'Stator current = battery current x battery voltage / applied voltage.',
  volts: 'The voltage applied to the motor (battery voltage x duty cycle) to compare.',

  // Motors
  motorsIntro: 'Edit the values or add a motor. Torque in Nm, current in A, speed in RPM.',
} as const

export type HelpKey = keyof typeof HELP

/** What each status word means, and what to do about it. */
export const STATUS_HELP: Record<string, string> = {
  OK: 'Every check passes.',
  'HIGH LOAD': 'The motor is above 80% of its stall torque. Use a bigger ratio or add a motor.',
  STALLED: 'The motor cannot move the load.',
  'OVER BATTERY': 'More battery current than your limit.',
  'OVER STATOR': 'More stator current than your limit.',
  'NO VOLTAGE': 'The motor cannot reach that speed within your duty limit.',
  'NO RATIO FITS': 'Find ratio found no ratio inside your limits. Relax a limit, lower the speed or add a motor.',
  TIGHT: 'Over your duty cycle limit at this speed, but the motor can still reach it.',
  'TOO FAST': 'The motor cannot reach that speed even at full voltage.',
  'ACCEL TOO HIGH': 'You asked for more acceleration than the motors or the tires can give.',
}
