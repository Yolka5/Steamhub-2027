import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Indicator } from '../../components/Indicator'
import { LineChart, type Series } from '../../components/LineChart'
import { Help } from '../../components/Help'
import { NumField } from '../../components/NumField'
import { HELP, STATUS_HELP } from '../../lib/calcHelp'
import { Copy } from '../../components/ui'
import { computeRobot, findMotor, travelOf, type Mechanism, type SweepPoint, type MechType, type Robot, type RobotResult } from '../../lib/calc'
import { newMechanism } from '../../lib/calcDefaults'
import { f, pct, Seg, Stat, StatusTag, type Update } from './shared'
import { Select } from '../../components/Select'
import { Working } from '../../components/Working'
import { budgetWorking, mechWorking } from '../../lib/workings'

const whole = (n: number) => String(Math.round(n))

/**
 * Lines for the ratio chart. Ratios the motor can't run at all (stalled, or needing more than
 * the full battery) are left out, so the axes stay on the ratios worth reading.
 */
function sweepSeries(points: SweepPoint[], motors: number, stallCurrent: number): Series[] {
  const runs = (p: SweepPoint) => p.duty <= 1 && p.stator < stallCurrent
  const line = (pick: (p: SweepPoint) => number) => points.map((p): [number, number] => [p.ratio, runs(p) ? pick(p) : NaN])
  return [
    { name: 'Efficiency', slot: 1, unit: '%', fmt: whole, points: line((p) => p.efficiency * 100) },
    { name: 'Duty cycle', slot: 4, unit: '%', fmt: whole, off: true, points: line((p) => p.duty * 100) },
    { name: motors > 1 ? 'Battery A, all motors' : 'Battery A', slot: 2, unit: 'A', off: true, points: line((p) => p.battery * motors) },
    { name: 'Stator A per motor', slot: 3, unit: 'A', off: true, points: line((p) => p.stator) },
  ]
}

const TYPE_LABEL: Record<MechType, string> = { pivot: 'Pivot', linear: 'Linear', roller: 'Roller' }

export function RobotTab({ robot, update }: { robot: Robot; update: Update }) {
  const res = useMemo(() => computeRobot(robot), [robot])
  const [selected, setSelected] = useState<string>(robot.mechanisms[0]?.id ?? 'swerve')

  const editMech = (id: string, patch: Partial<Mechanism>) =>
    update((r) => ({ ...r, mechanisms: r.mechanisms.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))

  const mech = robot.mechanisms.find((m) => m.id === selected)

  return (
    <div className="calc-robot">
      <Budget robot={robot} res={res} update={update} />

      <section className="calc-section">
        <h2 className="section__title">Mechanisms</h2>
        <div className="mechs">
          <div className="mechs__list picks picks--stack" role="listbox" aria-label="Mechanisms">
            <Indicator selector='[aria-selected="true"]' />
            {robot.mechanisms.map((m) => {
              const r = res.mechs.get(m.id)!
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={selected === m.id}
                  className="pick mech-row"
                  onClick={() => setSelected(m.id)}
                >
                  <span className="mech-row__name">
                    {m.name}
                    <span className="soft small"> {TYPE_LABEL[m.type]}</span>
                  </span>
                  <span className="mech-row__ratio num">{r.op ? `${f(r.op.ratio)}:1` : '—'}</span>
                  <span className="mech-row__amps num soft">{r.batteryAll != null ? `${f(r.batteryAll)} A` : ''}</span>
                  <StatusTag status={r.status} />
                </button>
              )
            })}
            <button type="button" role="option" aria-selected={selected === 'swerve'} className="pick mech-row" onClick={() => setSelected('swerve')}>
              <span className="mech-row__name">
                Swerve drive
                <span className="soft small"> R{robot.swerve.selected + 1}</span>
              </span>
              <span className="mech-row__ratio num">{f(robot.swerve.ratios[robot.swerve.selected], 2)}:1</span>
              <span className="mech-row__amps num soft">{f(res.swerve.driveBattery + res.swerve.steerBattery)} A</span>
              <StatusTag status={robot.swerve.onRobot ? res.swerve.ratios[robot.swerve.selected].status : 'OFF'} />
            </button>
            <button
              type="button"
              className="q-btn mechs__add"
              onClick={() => {
                const id = crypto.randomUUID().slice(0, 8)
                update((r) => ({ ...r, mechanisms: [...r.mechanisms, newMechanism(id)] }))
                setSelected(id)
              }}
            >
              Add mechanism
            </button>
          </div>

          <div className="mechs__editor">
            {mech ? (
              <MechEditor
                key={mech.id}
                mech={mech}
                robot={robot}
                res={res}
                edit={(p) => editMech(mech.id, p)}
                remove={() => {
                  update((r) => ({ ...r, mechanisms: r.mechanisms.filter((m) => m.id !== mech.id) }))
                  setSelected(robot.mechanisms.find((m) => m.id !== mech.id)?.id ?? 'swerve')
                }}
              />
            ) : (
              <SwerveSummary robot={robot} res={res} update={update} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function Budget({ robot, res, update }: { robot: Robot; res: RobotResult; update: Update }) {
  const over = res.totalMotors > robot.maxMotors
  return (
    <section className="calc-section budget">
      <div className="budget__inputs">
        <NumField help={HELP.maxDraw} label="Max battery draw" unit="A" value={robot.maxDraw} min={1} step={5} onChange={(v) => update((r) => ({ ...r, maxDraw: v }))} />
        <NumField help={HELP.maxMotors} label="Max motors" value={robot.maxMotors} min={1} whole step={1} onChange={(v) => update((r) => ({ ...r, maxMotors: v }))} />
        <NumField help={HELP.voltage} label="Battery voltage" unit="V" value={robot.voltage} min={6} max={13.5} step={0.5} onChange={(v) => update((r) => ({ ...r, voltage: v }))} />
      </div>

      <div className="stats budget__stats">
        <Stat help={HELP.biggestSet} label="Biggest set draw" value={f(res.biggestSet)} unit="A" />
        <Stat help={HELP.scale} label="Budget scale factor" value={f(res.scale, 2)} />
        <div className="stat">
          <span className="stat__l">Motors used</span>
          <span className={`stat__v num ${over ? 'is-bad' : ''}`}>
            {res.totalMotors} <span className="stat__u">of {robot.maxMotors}</span>
          </span>
          <span className="soft small">
            {[...res.motorCounts.entries()].map(([k, n]) => `${k} ${n}`).join(' · ')}
          </span>
          <Help text={HELP.motorsUsed} />
        </div>
        <Stat help={HELP.everything} label="Everything at once" value={f(res.everything)} unit="A" />
      </div>
      {res.scale < 1 && (
        <p className="calc-note">
          Over budget. Every motor's supply current limit has to shrink to {f(res.scale * 100, 0)}% to fit, or move a mechanism to a different set.
        </p>
      )}

      <h2 className="section__title">Sets that run together</h2>
      <Help text={HELP.sets} className="help--block" />
      <ul className="sets">
        {robot.setNames.map((name, i) => {
          const draw = res.setDraws[i]
          const empty = draw === 0
          const ok = draw <= robot.maxDraw
          // The bar runs to 130% of budget so an overshoot is visible past the budget line.
          const scaleMax = robot.maxDraw * 1.3
          return (
            <li key={i} className="set">
              <input
                className="set__name"
                value={name}
                aria-label={`Set ${i + 1} name`}
                onChange={(e) => update((r) => ({ ...r, setNames: r.setNames.map((n, j) => (j === i ? e.target.value : n)) }))}
              />
              <div className="set__bar" aria-hidden="true">
                <span className={`set__fill ${ok ? '' : 'is-bad'}`} style={{ width: `${Math.min(100, (draw / scaleMax) * 100)}%` }} />
                <span className="set__budget" style={{ left: `${(robot.maxDraw / scaleMax) * 100}%` }} />
              </div>
              <span className="set__value num">{f(draw)} A</span>
              <span className={`set__state small ${empty ? 'soft' : ok ? 'is-ok' : 'is-bad'}`}>
                {empty ? 'Empty' : ok ? `${f(robot.maxDraw - draw)} A spare` : `${f(draw - robot.maxDraw)} A over`}
              </span>
            </li>
          )
        })}
      </ul>
      <Working id="budget" lines={budgetWorking(robot, res)} />
    </section>
  )
}

function MechEditor({
  mech: m,
  robot,
  res,
  edit,
  remove,
}: {
  mech: Mechanism
  robot: Robot
  res: RobotResult
  edit: (p: Partial<Mechanism>) => void
  remove: () => void
}) {
  const r = res.mechs.get(m.id)!
  const o = r.op
  const feasible = r.sweep.filter((p) => p.feasible).map((p) => p.ratio)
  const band: [number, number] | null = feasible.length ? [Math.min(...feasible), Math.max(...feasible)] : null

  return (
    <div className="mech">
      <div className="mech__head">
        <input className="mech__name" value={m.name} aria-label="Mechanism name" onChange={(e) => edit({ name: e.target.value })} />
        <label className="check">
          <input type="checkbox" checked={m.onRobot} onChange={(e) => edit({ onRobot: e.target.checked })} />
          On the robot
        </label>
      </div>

      <div className="mech__hero">
        <div>
          <span className="mech__ratio num">{o ? <Copy value={+o.ratio.toFixed(2)}>{f(o.ratio)}:1</Copy> : 'No ratio'}</span>
          <span className="soft small">{m.mode === 1 ? 'Best ratio that fits every limit' : 'Your ratio'}</span>
        </div>
        <StatusTag status={r.status} />
      </div>
      {r.status !== 'OK' && r.status !== 'OFF' && STATUS_HELP[r.status] && <p className="calc-note status-help">{STATUS_HELP[r.status]}</p>}
      <p className="calc-note soft">
        {o
          ? `Motor at ${f(o.motorRpm, 0)} RPM, ${f(r.batteryAll)} A from the battery for all ${m.motors} motor${m.motors > 1 ? 's' : ''}. `
          : 'No ratio from 0.25 to 2000 fits your limits. Relax a limit, lower the speed or add a motor. '}
        Assumes {robot.voltage} V and {f(m.efficiency * 100, 0)}% gearbox efficiency.
      </p>

      <div className="mech__controls">
        <Seg label="Type" value={m.type} onChange={(type) => edit({ type })} options={[{ value: 'pivot', label: 'Pivot' }, { value: 'linear', label: 'Linear' }, { value: 'roller', label: 'Roller' }]} />
        <Seg label="Mode" value={m.mode} onChange={(mode) => edit({ mode })} options={[{ value: 1, label: 'Find ratio' }, { value: 2, label: 'Check a ratio' }]} />
      </div>
      <Help text={`${HELP.type} ${HELP.mode}`} className="help--block" />

      <div className="mech__grid">
        <div className="fields" role="group">
          <h3 className="fields__title">{m.type === 'pivot' ? 'Arm' : m.type === 'linear' ? 'Elevator' : 'Roller'}</h3>
          {m.type === 'pivot' && (
            <>
              <NumField help={HELP.pivotMass} label="Load mass" unit="kg" value={m.pivotMass} min={0} step={0.1} onChange={(v) => edit({ pivotMass: v })} />
              <NumField help={HELP.pivotDist} label="Distance to centre of mass" unit="cm" value={m.pivotDist} min={0} step={1} onChange={(v) => edit({ pivotDist: v })} />
              <NumField help={HELP.pivotSpeed} label="Target speed" unit="deg/s" value={m.pivotSpeed} min={0} step={10} onChange={(v) => edit({ pivotSpeed: v })} />
              <NumField help={HELP.travelPivot} label="Angle of one move" unit="deg" value={travelOf(m)} min={1} step={5} onChange={(v) => edit({ travel: v })} />
            </>
          )}
          {m.type === 'linear' && (
            <>
              <NumField help={HELP.carriageMass} label="Carriage mass" unit="kg" value={m.carriageMass} min={0} step={0.1} onChange={(v) => edit({ carriageMass: v })} />
              <NumField help={HELP.stageMass} label="Middle stage mass" unit="kg" value={m.stageMass} min={0} step={0.1} onChange={(v) => edit({ stageMass: v })} />
              <div className="num-field">
                <span className="num-field__label">Rigging</span>
                <Seg
                  label="Rigging"
                  value={m.rigging ?? 'cascade'}
                  onChange={(rigging) => edit({ rigging })}
                  options={[
                    { value: 'cascade', label: 'Cascade' },
                    { value: 'continuous', label: 'Continuous' },
                  ]}
                />
                <Help text={HELP.rigging} />
              </div>
              <NumField help={HELP.stages} label="Stages" value={m.stages} min={1} max={6} whole step={1} onChange={(v) => edit({ stages: v })} />
              <NumField help={HELP.pulleyRadius} label="Pulley radius" unit="cm" value={m.pulleyRadius} min={0.1} step={0.05} onChange={(v) => edit({ pulleyRadius: v })} />
              <NumField help={HELP.linearSpeed} label="Target speed" unit="m/s" value={m.linearSpeed} min={0} step={0.1} onChange={(v) => edit({ linearSpeed: v })} />
              <NumField help={HELP.travelLinear} label="Carriage travel" unit="cm" value={travelOf(m)} min={1} step={5} onChange={(v) => edit({ travel: v })} />
            </>
          )}
          {m.type === 'roller' && (
            <>
              <NumField help={HELP.wheelDiameter} label="Wheel diameter" unit="cm" value={m.wheelDiameter} min={0.1} step={0.1} onChange={(v) => edit({ wheelDiameter: v })} />
              <NumField help={HELP.spinMass} label="Spinning mass" unit="kg" value={m.spinMass} min={0} step={0.05} onChange={(v) => edit({ spinMass: v })} />
              <NumField help={HELP.dragTorque} label="Drag from game piece" unit="Nm" value={m.dragTorque} min={0} step={0.05} onChange={(v) => edit({ dragTorque: v })} />
              <NumField help={HELP.spinUp} label="Spin-up time" unit="s" value={m.spinUp} min={0.01} step={0.05} onChange={(v) => edit({ spinUp: v })} />
              <NumField help={HELP.wheelRpm} label="Target wheel speed" unit="RPM" value={m.wheelRpm} min={0} step={100} onChange={(v) => edit({ wheelRpm: v })} />
            </>
          )}
          {m.mode === 2 && <NumField help={HELP.ratio} label="Gear ratio" unit=":1" value={m.ratio} min={0.01} step={1} onChange={(v) => edit({ ratio: v })} />}
        </div>

        <div className="fields" role="group">
          <h3 className="fields__title">Motor and limits</h3>
          <label className="num-field">
            <span className="num-field__label">Motor</span>
            <Select value={m.motor} onChange={(v) => edit({ motor: v })} options={robot.motors.map((x) => ({ value: x.name, label: x.name }))} />
            <Help text={HELP.motor} />
          </label>
          <NumField help={HELP.motors} label="Motors in the gearbox" value={m.motors} min={1} max={8} whole step={1} onChange={(v) => edit({ motors: v })} />
          <NumField help={HELP.efficiency} label="Gearbox efficiency" value={m.efficiency} min={0.05} max={1} step={0.05} onChange={(v) => edit({ efficiency: v })} />
          <NumField help={HELP.maxBattery} label="Max battery current" unit="A/motor" value={m.maxBattery} min={0} step={1} onChange={(v) => edit({ maxBattery: v })} />
          <NumField help={HELP.maxStator} label="Max stator current" unit="A/motor" value={m.maxStator} min={0} step={5} onChange={(v) => edit({ maxStator: v })} />
          <NumField help={HELP.maxDuty} label="Max duty cycle" value={m.maxDuty} min={0.05} max={1} step={0.05} onChange={(v) => edit({ maxDuty: v })} />
          {m.mode === 1 && <NumField help={HELP.maxRatio} label="Max gear ratio" unit=":1" value={m.maxRatio} min={1} step={10} onChange={(v) => edit({ maxRatio: v })} />}
        </div>
      </div>

      <Help text={HELP.runsIn} className="help--block" />
      <div className="mech__sets">
        <span className="soft small">Runs in</span>
        {robot.setNames.map((name, i) => (
          <label key={i} className="chip chip--check">
            <input
              type="checkbox"
              checked={m.sets[i] ?? false}
              onChange={(e) => edit({ sets: robot.setNames.map((_, j) => (j === i ? e.target.checked : (m.sets[j] ?? false))) })}
            />
            {name}
          </label>
        ))}
      </div>

      <div className="stats mech__results">
        {m.type !== 'roller' && (
          <Stat
            help={HELP.moveTime}
            label={m.type === 'pivot' ? `Time to move ${f(travelOf(m), 0)}°` : `Time to travel ${f(travelOf(m), 0)} cm`}
            value={f(r.move?.time, 2)}
            unit="s"
          />
        )}
        {m.type !== 'roller' && <Stat help={HELP.speedUp} label="Speed-up time" value={f(r.move?.speedUp, 2)} unit="s" />}
        {m.type !== 'roller' && <Stat help={HELP.peakBattery} label="Peak battery while speeding up" value={r.move ? f(r.move.peakBattery * m.motors) : '—'} unit="A" />}
        {m.type === 'linear' && <Stat help={HELP.carriageSpeed} label="Carriage speed" value={f(r.carriageSpeed, 2)} unit="m/s" />}
        {m.type === 'roller' && <Stat help={HELP.surfaceSpeed} label="Wheel surface speed" value={f(r.surfaceSpeed, 2)} unit="m/s" />}
        <Stat help={HELP.load} label="Load torque" value={f(r.load, 2)} unit="Nm" />
        <Stat help={HELP.torque} label="Torque per motor" value={f(o?.torque, 3)} unit="Nm" />
        <Stat help={HELP.stator} label="Stator current" value={f(o?.stator)} unit="A" />
        <Stat help={HELP.duty} label="Duty cycle" value={pct(o?.duty)} />
        <Stat help={HELP.battery} label="Battery per motor" value={f(o?.battery)} unit="A" />
        <Stat help={HELP.motorEff} label="Motor efficiency" value={pct(o?.efficiency)} />
        <Stat help={HELP.loadPct} label="Load of stall" value={pct(r.load_)} />
        <Stat help={HELP.stallOut} label="Stall torque at output" value={f(r.stallTorqueOut)} unit="Nm" />
        {r.stallLoad != null && <Stat help={HELP.stallLoad} label="Heaviest it can hold" value={f(r.stallLoad)} unit="kg" />}
      </div>

      {r.move?.short && (
        <p className="calc-note soft">This move is too short to reach the target speed. It speeds up for the first half and slows down for the second.</p>
      )}

      <Working id="mech" lines={mechWorking(m, robot, r)} />

      <LineChart
        title="Every gear ratio. Shaded: ratios that fit every limit."
        series={sweepSeries(r.sweep, m.motors, findMotor(robot.motors, m.motor).stallCurrent)}
        xLabel="Gear ratio"
        xLog
        band={band}
        markerX={o?.ratio}
        markerLabel={o ? `${f(o.ratio)}:1` : undefined}
        empty="No ratio from 0.25 to 2000 can move this load at this speed."
      />

      <div className="mech__foot">
        <Link to={`/calculators?tab=curves&m=${m.id}`} className="text-btn">
          Open motor curves for {m.name}
        </Link>
        <button type="button" className="text-btn text-btn--danger" onClick={remove}>
          Remove mechanism
        </button>
      </div>
    </div>
  )
}

function SwerveSummary({ robot, res, update }: { robot: Robot; res: RobotResult; update: Update }) {
  const s = robot.swerve
  const sel = res.swerve.ratios[s.selected]
  const edit = (p: Partial<Robot['swerve']>) => update((r) => ({ ...r, swerve: { ...r.swerve, ...p } }))
  return (
    <div className="mech">
      <div className="mech__head">
        <span className="mech__name">Swerve drive</span>
        <label className="check">
          <input type="checkbox" checked={s.onRobot} onChange={(e) => edit({ onRobot: e.target.checked })} />
          On the robot
        </label>
      </div>
      <div className="mech__hero">
        <div>
          <span className="mech__ratio num">
            <Copy value={s.ratios[s.selected]}>{f(s.ratios[s.selected], 2)}:1</Copy>
          </span>
          <span className="soft small">Drive ratio R{s.selected + 1}, set on the Swerve tab</span>
        </div>
        <StatusTag status={sel.status} />
      </div>
      <div className="stats mech__results">
        <Stat help={HELP.swBatteryAll} label="Drive battery, all modules" value={f(res.swerve.driveBattery)} unit="A" />
        <Stat help={HELP.steerAllowance} label="Steer allowance" value={f(res.swerve.steerBattery)} unit="A" />
        <Stat help={HELP.topSpeed} label="Top speed" value={f(sel.topSpeed, 2)} unit="m/s" />
        <Stat help={HELP.accelUsable} label="Usable acceleration" value={f(sel.accelUsable)} unit="m/s²" />
      </div>
      <div className="mech__sets">
        <span className="soft small">Runs in</span>
        {robot.setNames.map((name, i) => (
          <label key={i} className="chip chip--check">
            <input type="checkbox" checked={s.sets[i] ?? false} onChange={(e) => edit({ sets: robot.setNames.map((_, j) => (j === i ? e.target.checked : (s.sets[j] ?? false))) })} />
            {name}
          </label>
        ))}
      </div>
      <div className="mech__foot">
        <Link to="/calculators?tab=swerve" className="text-btn">
          Open the Swerve tab
        </Link>
      </div>
    </div>
  )
}
