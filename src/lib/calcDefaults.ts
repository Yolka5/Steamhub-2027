import type { Mechanism, Motor, Robot } from './calc'

// Starting robot, copied from robot_design_calculator.xlsx so the web version opens on the same numbers.

export const MOTORS: Motor[] = [
  { name: 'Kraken X60 (non-FOC)', freeRpm: 6000, stallTorque: 7.09, stallCurrent: 366, freeCurrent: 2, source: 'WCP docs' },
  { name: 'Kraken X60 FOC', freeRpm: 5800, stallTorque: 9.37, stallCurrent: 483, freeCurrent: 2, source: 'WCP docs' },
  { name: 'Kraken X44', freeRpm: 7758, stallTorque: 4.11, stallCurrent: 279, freeCurrent: 3, source: 'WCP docs (listed performance)' },
]

const BASE: Omit<Mechanism, 'id' | 'name' | 'type' | 'sets'> = {
  onRobot: true,
  mode: 1,
  motor: 'Kraken X60 (non-FOC)',
  motors: 1,
  efficiency: 0.85,
  maxBattery: 10,
  maxStator: 60,
  maxDuty: 0.9,
  maxRatio: 200,
  pivotMass: 5,
  pivotDist: 20,
  pivotSpeed: 120,
  carriageMass: 10,
  stageMass: 0,
  stages: 2,
  pulleyRadius: 2.25,
  linearSpeed: 1,
  wheelDiameter: 5.08,
  spinMass: 0.3,
  dragTorque: 0.15,
  spinUp: 0.2,
  wheelRpm: 2000,
  ratio: 100,
  motorRpm: 2100,
}

const sets = (...on: number[]) => [0, 1, 2, 3, 4].map((i) => on.includes(i + 1))

export function newMechanism(id: string, name = 'New mechanism'): Mechanism {
  return { ...BASE, id, name, type: 'pivot', sets: sets() }
}

export const DEFAULT_ROBOT: Robot = {
  maxDraw: 100,
  maxMotors: 20,
  voltage: 12,
  setNames: ['Driving and intaking', 'Scoring', 'Everything at once', 'Set 4', 'Set 5'],
  motors: MOTORS,
  mechanisms: [
    { ...BASE, id: 'elevator', name: 'Elevator', type: 'linear', sets: sets(2, 3), motors: 2, carriageMass: 10.3, stageMass: 4, linearSpeed: 1.1 },
    { ...BASE, id: 'arm', name: 'Arm pivot', type: 'pivot', sets: sets(2, 3), motors: 2, efficiency: 0.8, pivotMass: 7.3, pivotDist: 45, pivotSpeed: 170 },
    { ...BASE, id: 'ee-pivot', name: 'End effector pivot', type: 'pivot', sets: sets(2, 3), motor: 'Kraken X44', pivotMass: 4.3, pivotDist: 12, pivotSpeed: 340 },
    { ...BASE, id: 'intake-pivot', name: 'Intake pivot', type: 'pivot', sets: sets(1, 3), pivotMass: 8, pivotDist: 25, pivotSpeed: 150 },
    {
      ...BASE,
      id: 'intake-roller',
      name: 'Intake roller',
      type: 'roller',
      sets: sets(1),
      efficiency: 0.9,
      maxBattery: 20,
      maxRatio: 10,
      wheelDiameter: 10.16,
      spinMass: 0.6,
      dragTorque: 0.3,
      spinUp: 0.3,
      wheelRpm: 1500,
    },
    {
      ...BASE,
      id: 'ee-roller',
      name: 'End effector roller',
      type: 'roller',
      sets: sets(2),
      motor: 'Kraken X44',
      efficiency: 0.9,
      maxBattery: 20,
      maxRatio: 10,
      wheelRpm: 2250,
    },
  ],
  swerve: {
    robotMass: 70,
    wheelDiameter: 10.16,
    motor: 'Kraken X60 (non-FOC)',
    driveMotors: 4,
    efficiency: 0.9,
    rolling: 0.03,
    friction: 1.2,
    maxStator: 60,
    maxDuty: 0.95,
    speed: 3,
    accel: 2,
    ratios: [7.03, 6.03, 5.27],
    selected: 1,
    steerMotors: 4,
    steerRatio: 287 / 11,
    steerAllowance: 2.5,
    onRobot: true,
    sets: sets(1, 2, 3),
  },
}
