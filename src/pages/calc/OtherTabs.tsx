import { useMemo, useState } from 'react'
import { LineChart } from '../../components/LineChart'
import { NumField } from '../../components/NumField'
import { computeMechanism, computeSwerve, findMotor, mechanismAtRpm, motorCurve, voltageMap, type Motor, type Robot, type Swerve } from '../../lib/calc'
import { f, pct, Seg, StatusTag, type Update } from './shared'

// ---------- Swerve ----------

export function SwerveTab({ robot, update }: { robot: Robot; update: Update }) {
  const s = robot.swerve
  const res = useMemo(() => computeSwerve(s, robot.motors, robot.voltage), [s, robot.motors, robot.voltage])
  const edit = (p: Partial<Swerve>) => update((r) => ({ ...r, swerve: { ...r.swerve, ...p } }))
  const setRatio = (i: number, v: number) => edit({ ratios: s.ratios.map((x, j) => (j === i ? v : x)) as Swerve['ratios'] })

  const rows: { label: string; unit?: string; get: (i: number) => string }[] = [
    { label: 'Theoretical free speed', unit: 'm/s', get: (i) => f(res.ratios[i].freeSpeed, 2) },
    { label: 'Top speed at max duty', unit: 'm/s', get: (i) => f(res.ratios[i].topSpeed, 2) },
    { label: 'Acceleration limit, current', unit: 'm/s²', get: (i) => f(res.ratios[i].accelStator) },
    { label: 'Acceleration limit, traction', unit: 'm/s²', get: (i) => f(res.ratios[i].accelTraction) },
    { label: 'Usable acceleration', unit: 'm/s²', get: (i) => f(res.ratios[i].accelUsable) },
    { label: 'Motor speed at your speed', unit: 'RPM', get: (i) => f(res.ratios[i].motorRpm, 0) },
    { label: 'Torque per motor', unit: 'Nm', get: (i) => f(res.ratios[i].torque, 3) },
    { label: 'Stator current per motor', unit: 'A', get: (i) => f(res.ratios[i].stator) },
    { label: 'Duty cycle', get: (i) => pct(res.ratios[i].duty) },
    { label: 'Battery current per motor', unit: 'A', get: (i) => f(res.ratios[i].battery) },
    { label: 'Battery current, all drive motors', unit: 'A', get: (i) => f(res.ratios[i].batteryAll) },
  ]

  return (
    <div className="calc-two">
      <div className="fields-col">
        <div className="fields" role="group">
          <h3 className="fields__title">Robot</h3>
          <NumField label="Robot mass" unit="kg" value={s.robotMass} min={1} step={1} onChange={(v) => edit({ robotMass: v })} />
          <NumField label="Wheel diameter" unit="cm" value={s.wheelDiameter} min={1} step={0.1} onChange={(v) => edit({ wheelDiameter: v })} />
          <label className="num-field">
            <span className="num-field__label">Drive motor</span>
            <select className="field" value={s.motor} onChange={(e) => edit({ motor: e.target.value })}>
              {robot.motors.map((m) => (
                <option key={m.name}>{m.name}</option>
              ))}
            </select>
          </label>
          <NumField label="Drive motors" value={s.driveMotors} min={1} step={1} onChange={(v) => edit({ driveMotors: v })} />
          <NumField label="Drivetrain efficiency" value={s.efficiency} min={0.05} step={0.05} onChange={(v) => edit({ efficiency: Math.min(1, v) })} />
          <NumField label="Rolling resistance" hint="Share of the robot's weight" value={s.rolling} min={0} step={0.01} onChange={(v) => edit({ rolling: v })} />
          <NumField label="Tire friction" value={s.friction} min={0} step={0.1} onChange={(v) => edit({ friction: v })} />
          <NumField label="Max stator current" unit="A" value={s.maxStator} min={0} step={5} onChange={(v) => edit({ maxStator: v })} />
          <NumField label="Max duty cycle" value={s.maxDuty} min={0.05} step={0.05} onChange={(v) => edit({ maxDuty: Math.min(1, v) })} />
        </div>
        <div className="fields" role="group">
          <h3 className="fields__title">Operating point</h3>
          <NumField label="Speed" unit="m/s" value={s.speed} min={0} step={0.5} onChange={(v) => edit({ speed: v })} />
          <NumField label="Acceleration" unit="m/s²" value={s.accel} min={0} step={0.5} onChange={(v) => edit({ accel: v })} />
        </div>
        <div className="fields" role="group">
          <h3 className="fields__title">Steering</h3>
          <NumField label="Steer motors" value={s.steerMotors} min={0} step={1} onChange={(v) => edit({ steerMotors: v })} />
          <NumField label="Battery allowance" unit="A/motor" value={s.steerAllowance} min={0} step={0.5} onChange={(v) => edit({ steerAllowance: v })} />
          <p className="soft small">Steering ratio {f(s.steerRatio, 2)}:1, Kraken X44.</p>
        </div>
      </div>

      <div>
        <div className="swerve-head">
          <h2 className="section__title">Compare the three ratios</h2>
          <Seg
            label="Ratio used by the robot"
            value={s.selected}
            onChange={(selected) => edit({ selected })}
            options={[0, 1, 2].map((i) => ({ value: i as 0 | 1 | 2, label: `Use R${i + 1}` }))}
          />
        </div>
        <div className="table-wrap">
          <table className="ctable num">
            <thead>
              <tr>
                <th />
                {[0, 1, 2].map((i) => (
                  <th key={i} className={s.selected === i ? 'is-sel' : ''}>
                    R{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Gear ratio, check on the SDS spec</td>
                {[0, 1, 2].map((i) => (
                  <td key={i} className={s.selected === i ? 'is-sel' : ''}>
                    <NumField label={`R${i + 1}`} value={s.ratios[i]} min={0.1} step={0.01} onChange={(v) => setRatio(i, v)} />
                  </td>
                ))}
              </tr>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td>
                    {row.label}
                    {row.unit && <span className="soft"> ({row.unit})</span>}
                  </td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className={s.selected === i ? 'is-sel' : ''}>
                      {row.get(i)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td>Status</td>
                {[0, 1, 2].map((i) => (
                  <td key={i} className={s.selected === i ? 'is-sel' : ''}>
                    <StatusTag status={res.ratios[i].status} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="calc-note soft">
          The robot tab gets {f(res.driveBattery)} A for driving and {f(res.steerBattery)} A for steering. The MK5n ratios are placeholders until checked on the SDS spec.
        </p>
      </div>
    </div>
  )
}

// ---------- Curves ----------

export function CurvesTab({ robot, initial }: { robot: Robot; initial?: string | null }) {
  const [id, setId] = useState(initial && robot.mechanisms.some((m) => m.id === initial) ? initial : robot.mechanisms[0]?.id)
  const mech = robot.mechanisms.find((m) => m.id === id) ?? robot.mechanisms[0]
  const res = mech ? computeMechanism(mech, robot.motors, robot.voltage) : null
  const [ratio, setRatio] = useState<number | null>(null)
  const [duty, setDuty] = useState(1)
  if (!mech || !res) return <p className="soft">Add a mechanism on the Robot tab first.</p>
  const r = ratio ?? +(res.op?.ratio ?? 40).toFixed(1)
  const motor = findMotor(robot.motors, mech.motor)
  const rpms = Array.from({ length: 12 }, (_, i) => 500 * (i + 1)).filter((x) => x <= motor.freeRpm * 1.05)
  const table = mechanismAtRpm(mech, motor, robot.voltage, r, rpms)
  const curve = motorCurve(motor, robot.voltage, duty)

  return (
    <div className="curves">
      <div className="curves__pick">
        <label className="num-field">
          <span className="num-field__label">Mechanism</span>
          <select
            className="field"
            value={mech.id}
            onChange={(e) => {
              setId(e.target.value)
              setRatio(null)
            }}
          >
            {robot.mechanisms.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <NumField label="Gear ratio to test" unit=":1" value={r} min={0.1} step={1} onChange={setRatio} />
        <NumField label="Voltage for the motor curve" hint="1 = full battery voltage, like a dyno" value={duty} min={0.05} step={0.05} onChange={(v) => setDuty(Math.min(1, v))} />
      </div>
      <p className="calc-note soft">
        {mech.name}: {motor.name}, {mech.motors} motor{mech.motors > 1 ? 's' : ''}, {f(res.load, 2)} Nm at the output. The load is the same at every speed, so stator current
        stays flat at {f(table[0]?.stator)} A and battery current grows with speed.
      </p>

      <div className="charts-2">
        <LineChart
          title="Your mechanism: battery current, all motors"
          series={[{ name: 'Battery A', slot: 1, points: table.map((t) => [t.rpm, t.batteryAll]) }]}
          xLabel="Motor RPM"
          yLabel="Amps"
        />
        <LineChart
          title="Your mechanism: motor efficiency"
          series={[{ name: 'Efficiency', slot: 3, points: table.map((t) => [t.rpm, t.efficiency * 100]) }]}
          xLabel="Motor RPM"
          yLabel="Efficiency %"
          fmtY={(n) => `${Math.round(n)}`}
        />
      </div>

      <div className="table-wrap">
        <table className="ctable num">
          <thead>
            <tr>
              <th>Motor RPM</th>
              <th>Output deg/s</th>
              <th>Duty</th>
              <th>Stator A</th>
              <th>Battery A per motor</th>
              <th>Battery A all</th>
              <th>Efficiency</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {table.map((t) => (
              <tr key={t.rpm}>
                <td>{t.rpm}</td>
                <td>{f(t.outSpeed)}</td>
                <td>{pct(t.duty)}</td>
                <td>{f(t.stator)}</td>
                <td>{f(t.battery)}</td>
                <td>{f(t.batteryAll)}</td>
                <td>{pct(t.efficiency)}</td>
                <td>
                  <StatusTag status={t.check} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section__title">{motor.name} motor curve</h2>
      <div className="charts-2">
        <LineChart title="Torque" series={[{ name: 'Torque', slot: 1, points: curve.map((c) => [c.rpm, c.torque]) }]} xLabel="Motor RPM" yLabel="Nm" />
        <LineChart
          title="Current"
          series={[
            { name: 'Stator', slot: 1, points: curve.map((c) => [c.rpm, c.stator]) },
            { name: 'Battery', slot: 2, points: curve.map((c) => [c.rpm, c.battery]) },
          ]}
          xLabel="Motor RPM"
          yLabel="Amps"
        />
        <LineChart title="Mechanical power" series={[{ name: 'Power', slot: 3, points: curve.map((c) => [c.rpm, c.power]) }]} xLabel="Motor RPM" yLabel="Watts" />
        <LineChart
          title="Efficiency"
          series={[{ name: 'Efficiency', slot: 6, points: curve.map((c) => [c.rpm, c.efficiency * 100]) }]}
          xLabel="Motor RPM"
          yLabel="%"
          fmtY={(n) => `${Math.round(n)}`}
        />
      </div>
    </div>
  )
}

// ---------- Voltage map ----------

const CURRENTS = Array.from({ length: 40 }, (_, i) => i + 1)

export function VoltageTab({ robot }: { robot: Robot }) {
  const [motorName, setMotorName] = useState(robot.motors[0]?.name)
  const [volts, setVolts] = useState([5, 6, 7, 8, 10, 12])
  const [sheetV, setSheetV] = useState(12)
  const [batV, setBatV] = useState(robot.voltage)
  const motor = findMotor(robot.motors, motorName)
  const map = voltageMap(motor, sheetV, batV, volts, CURRENTS)
  const series = (pick: (c: { stator: number; torque: number; rpm: number }) => number) =>
    volts.map((v, i) => ({
      name: `${v} V`,
      slot: i + 1,
      points: map.rows.map((row) => [row.battery, row.cells[i] ? pick(row.cells[i]!) : NaN] as [number, number]),
    }))

  return (
    <div className="curves">
      <div className="curves__pick">
        <label className="num-field">
          <span className="num-field__label">Motor</span>
          <select className="field" value={motor.name} onChange={(e) => setMotorName(e.target.value)}>
            {robot.motors.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        <NumField label="Datasheet voltage" unit="V" value={sheetV} min={1} step={0.5} onChange={setSheetV} />
        <NumField label="Battery voltage" unit="V" value={batV} min={1} step={0.5} onChange={setBatV} />
        {volts.map((v, i) => (
          <NumField key={i} label={`Voltage ${i + 1}`} unit="V" value={v} min={0.5} step={0.5} onChange={(n) => setVolts((vs) => vs.map((x, j) => (j === i ? n : x)))} />
        ))}
      </div>
      <p className="calc-note soft">
        Stator current is battery current times battery voltage divided by the voltage at the motor. A dash means that voltage can't pull that much current. Below{' '}
        {f(map.minVoltFor40)} V the motor can't reach 40 A from the battery.
      </p>

      <div className="table-wrap">
        <table className="ctable num">
          <thead>
            <tr>
              <th>At the motor</th>
              {map.perVoltage.map((p) => (
                <th key={p.volts}>{p.volts} V</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Stall torque (Nm)</td>
              {map.perVoltage.map((p) => (
                <td key={p.volts}>{f(p.stallTorque, 2)}</td>
              ))}
            </tr>
            <tr>
              <td>Stall current (A)</td>
              {map.perVoltage.map((p) => (
                <td key={p.volts}>{f(p.stallCurrent, 0)}</td>
              ))}
            </tr>
            <tr>
              <td>No-load speed (RPM)</td>
              {map.perVoltage.map((p) => (
                <td key={p.volts}>{f(p.freeRpm, 0)}</td>
              ))}
            </tr>
            <tr>
              <td>Most battery current (A)</td>
              {map.perVoltage.map((p) => (
                <td key={p.volts}>{f(p.maxBattery)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="charts-2">
        <LineChart title="Stator current" series={series((c) => c.stator)} xLabel="Battery current (A)" yLabel="Stator A" />
        <LineChart title="Torque" series={series((c) => c.torque)} xLabel="Battery current (A)" yLabel="Nm" />
        <LineChart title="Motor speed" series={series((c) => c.rpm)} xLabel="Battery current (A)" yLabel="RPM" />
      </div>
    </div>
  )
}

// ---------- Motors ----------

export function MotorsTab({ robot, update }: { robot: Robot; update: Update }) {
  const used = new Set([...robot.mechanisms.map((m) => m.motor), robot.swerve.motor])
  const edit = (i: number, p: Partial<Motor>) => update((r) => ({ ...r, motors: r.motors.map((m, j) => (j === i ? { ...m, ...p } : m)) }))
  return (
    <div>
      <p className="calc-note soft">Datasheet numbers at 12 V. Torque in Nm, current in A. Check them against the WCP docs for the exact motor version.</p>
      <div className="table-wrap">
        <table className="ctable num">
          <thead>
            <tr>
              <th>Motor</th>
              <th>Free speed (RPM)</th>
              <th>Stall torque (Nm)</th>
              <th>Stall current (A)</th>
              <th>Free current (A)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {robot.motors.map((m, i) => (
              <tr key={i}>
                <td>
                  <input className="field" value={m.name} aria-label="Motor name" disabled={used.has(m.name)} onChange={(e) => edit(i, { name: e.target.value })} />
                </td>
                <td>
                  <NumField label="Free speed" value={m.freeRpm} min={1} onChange={(v) => edit(i, { freeRpm: v })} />
                </td>
                <td>
                  <NumField label="Stall torque" value={m.stallTorque} min={0.01} onChange={(v) => edit(i, { stallTorque: v })} />
                </td>
                <td>
                  <NumField label="Stall current" value={m.stallCurrent} min={1} onChange={(v) => edit(i, { stallCurrent: v })} />
                </td>
                <td>
                  <NumField label="Free current" value={m.freeCurrent} min={0} onChange={(v) => edit(i, { freeCurrent: v })} />
                </td>
                <td>
                  {!used.has(m.name) && (
                    <button type="button" className="text-btn text-btn--danger" onClick={() => update((r) => ({ ...r, motors: r.motors.filter((_, j) => j !== i) }))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="q-btn"
        onClick={() =>
          update((r) => ({
            ...r,
            motors: [...r.motors, { name: `Custom motor ${r.motors.length - 2}`, freeRpm: 6000, stallTorque: 7.09, stallCurrent: 366, freeCurrent: 2, source: 'Custom' }],
          }))
        }
      >
        Add custom motor
      </button>
      <p className="soft small">Motors in use can't be renamed or removed.</p>
    </div>
  )
}

