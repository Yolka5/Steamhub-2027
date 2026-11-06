import { STATUS_HELP } from '../../lib/calcHelp'

// The workbook's Guide tab, reworded where it talked about spreadsheet cells and tabs.

type Rows = [string, string][]

function Table({ head, rows }: { head: [string, string]; rows: Rows }) {
  return (
    <div className="table-wrap">
      <table className="ctable ctable--text">
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th>{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const START: Rows = [
  ['1. Set your limits', 'At the top of the Robot tab, type the max battery draw for the whole robot (A), the max number of motors, and the battery voltage.'],
  ['2. Pick a mechanism', 'Pick one from the list or press Add mechanism. Type a name and tick On the robot.'],
  ['3. Choose its type', 'Pivot (an arm), Linear (an elevator with a pulley) or Roller (a wheel). Only the fields for that type are shown.'],
  ['4. Choose a mode', 'Find ratio: the calculator finds the best gear ratio and motor speed. Check a ratio: you type a ratio and see what happens at your target speed.'],
  ['5. Choose its sets', 'Under Runs in, tick each set where it moves at the same time as other mechanisms.'],
  ['6. Read the result', 'A green OK is good. The bars under Sets that run together show each set’s total draw against your budget.'],
]

const TABS: Rows = [
  ['Robot', 'The main tab: the budget, five sets, and every mechanism.'],
  ['Swerve', 'The SDS MK5n drive. It compares the three gear ratios and feeds the Robot tab.'],
  ['Motor curves', 'One mechanism: what the motor does at every RPM, plus a table to compare gear ratios.'],
  ['Voltage map', 'One motor at several voltages: torque at every speed, and what a battery current from 1 to 40 A gives at each voltage.'],
  ['Motors', 'Motor datasheet numbers. Edit them or add a motor.'],
  ['Center distance', 'Belts, chain and gears: the center distance for real belt and chain sizes.'],
  ['Cheat sheet', 'Tap drills, clearance holes, bearings and hex shaft.'],
]

const IDEAS: Rows = [
  ['Stator vs battery current', 'Stator current is what makes torque. Battery current is what you take from the battery: stator current x duty cycle. You budget the battery current. Phoenix has a separate limit for each.'],
  ['Duty cycle', 'The share of battery voltage the motor gets, on average. The controller switches the full battery voltage on and off thousands of times per second, so 50% duty looks like a steady 6 V to the motor. Less voltage means slower, and a lower stall torque.'],
  ['Gear ratio', 'A bigger ratio gives more torque and less speed at the output, and the motor spins faster for the same output speed. More motors share the load, so each makes less torque and heats less.'],
  ['Torque and current', 'Torque is proportional to stator current (about 0.0195 Nm per amp for the X60) at any speed.'],
  ['Sets', 'A set is a group of mechanisms that move at the same time. The calculator adds up the battery current of each set and compares it with your budget. There are 5 sets.'],
]

const MODES: Rows = [
  ['Find ratio', 'Tests ratios from 0.25 (a step-up) to 2000 and keeps the ones inside your limits (battery current, stator current, duty cycle, max ratio). It picks the most efficient one and gives the motor speed.'],
  ['Check a ratio', 'You type a ratio and it runs at your target speed. Use it to test a real gearbox, such as 5:1 x 5:1 x 4:1 = 100:1.'],
]

const INPUTS: Rows = [
  ['Pivot', 'Load mass (kg), distance to its center of mass (cm), target speed (deg/s).'],
  ['Linear', 'Rigging (cascade or continuous), carriage mass, middle stage mass, stages, pulley radius (cm), target speed (m/s).'],
  ['Roller', 'Wheel diameter, spinning mass, drag torque, spin-up time, target speed (RPM).'],
]

const STATUSES: Rows = [
  ...(['OK', 'HIGH LOAD', 'STALLED', 'OVER BATTERY', 'OVER STATOR', 'NO VOLTAGE', 'NO RATIO FITS'] as const).map(
    (k) => [k === 'OK' ? 'OK' : k.charAt(0) + k.slice(1).toLowerCase(), STATUS_HELP[k]] as [string, string],
  ),
  ['A dash', 'An input is missing or the row does not apply.'],
]

const FORMULAS: Rows = [
  ['Load torque', 'Pivot: mass x 9.81 x distance. Linear, cascade: 9.81 x (stages x carriage mass + middle mass) x pulley radius, with 3 or more stages counting the middle mass at stages / 2. Linear, continuous: 9.81 x (carriage + middle mass) x pulley radius. Roller: inertia x acceleration + drag.'],
  ['Motor torque', 'Load torque / (gear ratio x motors x efficiency).'],
  ['Stator current', 'Free current + (stall current - free current) x motor torque / stall torque.'],
  ['Duty cycle', '(Motor RPM / Kv + stator current x resistance) / battery voltage. Kv = free speed / 12 V. Resistance = 12 V / stall current. Both come from the 12 V datasheet, so they stay the same whatever the battery voltage.'],
  ['Battery current', 'Duty cycle x stator current.'],
  ['Efficiency', 'Mechanical power out / (battery voltage x battery current).'],
  ['Move time', 'Pivots and elevators only. Steps through one move from standing still: full battery voltage, current held to the stator limit, worst-case load the whole way, then cruise at the target speed and slow down as fast as it sped up. Inertia: pivot mass x distance squared; elevator: each moving part times the square of its speed multiple, x pulley radius squared. Motor rotors are left out.'],
  ['Against ReCalc', 'Checked with the same inputs typed into reca.lc. Holding load: same formula; ReCalc uses CTRE dyno motor data, about 2.5% stronger than the WCP data here. Elevator move: within 1%. Arm move: ReCalc times until the arm hits its stop at full power, with no slowing down, so its time is about 10% shorter. Run the same way, the two agree within 2%.'],
]

export function GuideTab() {
  return (
    <div className="guide">
      <section>
        <h2 className="section__title">What this is for</h2>
        <p>
          It helps you choose the gear ratio and motor speed for every mechanism on your robot, and checks that the battery can handle everything that moves at the same
          time.
        </p>
        <p>
          You type what a mechanism has to do (lift a weight, swing an arm, spin a wheel). The calculator gives you the gear ratio, the motor speed, the current it draws, and
          whether it is safe. Everything updates as you type.
        </p>
        <p className="soft">
          Explain shows what every field means. Your changes are a private draft until you press Save to team robot, so trying things out never breaks the team’s numbers.
        </p>
      </section>

      <section>
        <h2 className="section__title">Quick start</h2>
        <Table head={['Step', 'What to do']} rows={START} />
      </section>

      <section>
        <h2 className="section__title">The tabs</h2>
        <Table head={['Tab', 'What it is for']} rows={TABS} />
      </section>

      <section>
        <h2 className="section__title">Five ideas that explain it</h2>
        <Table head={['Idea', 'What it means']} rows={IDEAS} />
      </section>

      <section>
        <h2 className="section__title">Find ratio and Check a ratio</h2>
        <Table head={['Mode', 'What it does']} rows={MODES} />
      </section>

      <section>
        <h2 className="section__title">What you enter for each type</h2>
        <Table head={['Type', 'Inputs']} rows={INPUTS} />
      </section>

      <section>
        <h2 className="section__title">What the status words mean</h2>
        <Table head={['Status', 'Meaning']} rows={STATUSES} />
      </section>

      <section>
        <h2 className="section__title">How the main numbers are worked out</h2>
        <Table head={['Number', 'Formula']} rows={FORMULAS} />
      </section>

      <section>
        <h2 className="section__title">Good to know</h2>
        <ul className="guide__list">
          <li>
            This is a planning tool. It ignores friction, battery sag, heat, the small extra heating from the switching ripple, and the inertia of heavy arms. Check the real
            current in the Phoenix logs.
          </li>
          <li>The worst case is used: the load sticks straight out sideways.</li>
          <li>The MK5n drive ratios (7.03, 6.03, 5.27) are placeholders. Check them against the SDS table before relying on them.</li>
          <li>
            Motor numbers come from the WCP docs. Check the exact version of your motor. The 40 A rule applies to the battery side current that the breaker sees, not to the
            stator current. Check the current game manual.
          </li>
        </ul>
      </section>
    </div>
  )
}
