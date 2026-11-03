import { useState } from 'react'
import { NumField } from '../../components/NumField'
import { Copy } from '../../components/ui'
import {
  DRIVES,
  GEAR_EXTRA,
  gearCenter,
  gearPitchDiameter,
  optionsNear,
  pulleyPitchDiameter,
  sprocketPitchDiameter,
  type DriveType,
} from '../../lib/centers'
import { f, Seg } from './shared'

// ---------- Center distance ----------

const mm = (n: number) => n.toFixed(2)
const inch = (n: number) => (n / 25.4).toFixed(3)

export function CenterTab() {
  const [driveId, setDriveId] = useState('htd5')
  const [z1, setZ1] = useState(18)
  const [z2, setZ2] = useState(36)
  const [target, setTarget] = useState(150)
  const [step, setStep] = useState<1 | 5>(1)
  const drive = DRIVES.find((d) => d.id === driveId)!
  const a = Math.round(z1)
  const b = Math.round(z2)

  return (
    <div className="calc-two">
      <div className="fields-col">
        <div className="fields" role="group">
          <h3 className="fields__title">Drive</h3>
          <label className="num-field">
            <span className="num-field__label">Type</span>
            <select className="field" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
              {DRIVES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <NumField label={drive.kind === 'gear' ? 'Gear 1 teeth' : drive.kind === 'chain' ? 'Sprocket 1 teeth' : 'Pulley 1 teeth'} value={z1} min={6} step={1} onChange={setZ1} />
          <NumField label={drive.kind === 'gear' ? 'Gear 2 teeth' : drive.kind === 'chain' ? 'Sprocket 2 teeth' : 'Pulley 2 teeth'} value={z2} min={6} step={1} onChange={setZ2} />
          {drive.kind !== 'gear' && <NumField label="Center distance you want" unit="mm" value={target} min={1} step={1} onChange={setTarget} />}
          {drive.kind === 'belt' && (
            <div className="num-field">
              <span className="num-field__label">Belt sizes</span>
              <Seg
                label="Belt sizes"
                value={step}
                onChange={setStep}
                options={[
                  { value: 1, label: 'Any' },
                  { value: 5, label: 'Steps of 5' },
                ]}
              />
            </div>
          )}
          <p className="soft small">
            Ratio {f(Math.max(a, b) / Math.min(a, b), 3)}:1. Pitch diameters {f(pitchDia(drive, a), 2)} and {f(pitchDia(drive, b), 2)} mm.
          </p>
        </div>
      </div>

      <div>{drive.kind === 'gear' ? <GearResult drive={drive} a={a} b={b} /> : <BeltChainResult drive={drive} a={a} b={b} target={target} step={drive.kind === 'belt' ? step : 1} />}</div>
    </div>
  )
}

function pitchDia(d: DriveType, z: number) {
  if (d.kind === 'belt') return pulleyPitchDiameter(d.pitch, z)
  if (d.kind === 'chain') return sprocketPitchDiameter(d.pitch, z)
  return gearPitchDiameter(d.pitch, z)
}

function BeltChainResult({ drive, a, b, target, step }: { drive: DriveType; a: number; b: number; target: number; step: number }) {
  const opts = optionsNear(drive, a, b, target, step)
  const best = opts.reduce<number | null>((bi, o, i) => (bi == null || Math.abs(o.delta) < Math.abs(opts[bi].delta) ? i : bi), null)
  const unit = drive.kind === 'belt' ? 'teeth' : 'links'

  return (
    <>
      <h2 className="section__title">{drive.kind === 'belt' ? 'Belts' : 'Chains'} near {f(target, 1)} mm</h2>
      {opts.length === 0 ? (
        <p className="soft">Too close: the {drive.kind === 'belt' ? 'pulleys' : 'sprockets'} would overlap. Move them further apart.</p>
      ) : (
        <div className="table-wrap">
          <table className="ctable num">
            <thead>
              <tr>
                <th>{drive.kind === 'belt' ? 'Belt' : 'Chain'}</th>
                <th>Center distance (mm)</th>
                <th>(in)</th>
                <th>Off by (mm)</th>
              </tr>
            </thead>
            <tbody>
              {opts.map((o, i) => (
                <tr key={o.count} className={i === best ? 'is-sel' : ''}>
                  <td>
                    {o.count} {unit}
                    {drive.kind === 'chain' && o.count % 2 === 1 && <span className="tag tag--reserved"> Half link</span>}
                  </td>
                  <td className={i === best ? 'is-sel' : ''}>
                    <Copy value={mm(o.center)} />
                  </td>
                  <td className={i === best ? 'is-sel' : ''}>{inch(o.center)}</td>
                  <td className={i === best ? 'is-sel' : ''}>
                    {o.delta >= 0 ? '+' : ''}
                    {f(o.delta, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="calc-note soft">
        {drive.kind === 'belt'
          ? 'Exact pitch-line math, no added stretch. Click a distance to copy it into Onshape.'
          : 'Standard chain length formula. Odd link counts need a half link, so pick an even one when you can. Leave room for a tensioner.'}
      </p>
    </>
  )
}

function GearResult({ drive, a, b }: { drive: DriveType; a: number; b: number }) {
  const c = gearCenter(drive.pitch, a, b)
  return (
    <>
      <h2 className="section__title">Center distance</h2>
      <div className="table-wrap">
        <table className="ctable num">
          <thead>
            <tr>
              <th />
              <th>mm</th>
              <th>in</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Exact</td>
              <td>
                <Copy value={mm(c)} />
              </td>
              <td>{inch(c)}</td>
            </tr>
            <tr className="is-sel">
              <td>With 0.003 in clearance</td>
              <td className="is-sel">
                <Copy value={mm(c + GEAR_EXTRA)} />
              </td>
              <td className="is-sel">{inch(c + GEAR_EXTRA)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="calc-note soft">Most FRC teams add 0.003 in so the gears don't bind. Click a distance to copy it.</p>
    </>
  )
}

// ---------- Cheat sheets ----------

type Row = (string | number)[]

function SheetTable({ title, head, rows, note }: { title: string; head: string[]; rows: Row[]; note?: string }) {
  return (
    <section>
      <h2 className="section__title">{title}</h2>
      <div className="table-wrap">
        <table className="ctable num">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])}>
                {r.map((c, i) => (
                  <td key={i}>{i === 0 || typeof c === 'string' ? c : <Copy value={c} />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="calc-note soft">{note}</p>}
    </section>
  )
}

// ISO 273 clearance (close / normal) and ISO coarse tap drills.
const METRIC: Row[] = [
  ['M2', 1.6, 2.2, 2.4],
  ['M2.5', 2.05, 2.7, 2.9],
  ['M3', 2.5, 3.2, 3.4],
  ['M4', 3.3, 4.3, 4.5],
  ['M5', 4.2, 5.3, 5.5],
  ['M6', 5.0, 6.4, 6.6],
  ['M8', 6.8, 8.4, 9.0],
  ['M10', 8.5, 10.5, 11.0],
]

// Machinery's Handbook drill sizes, converted to mm.
const IMPERIAL: Row[] = [
  ['#4-40', '2.26 (#43)', '2.87 (#33)', '2.95 (#32)'],
  ['#6-32', '2.71 (#36)', '3.57 (#28)', '3.80 (#25)'],
  ['#8-32', '3.45 (#29)', '4.22 (#19)', '4.50 (#16)'],
  ['#10-24', '3.80 (#25)', '4.85 (#11)', '5.11 (#7)'],
  ['#10-32', '4.04 (#21)', '4.85 (#11)', '5.11 (#7)'],
  ['1/4-20', '5.11 (#7)', '6.53 (F)', '6.76 (H)'],
  ['1/4-28', '5.41 (#3)', '6.53 (F)', '6.76 (H)'],
]

const BEARINGS: Row[] = [
  ['R6-2RS / FR6-2RS', 9.525, 22.225, 7.142],
  ['R8-2RS / FR8-2RS', 12.7, 28.575, 7.938],
  ['608', 8, 22, 7],
  ['6800', 10, 19, 5],
  ['6801', 12, 21, 5],
  ['6802', 15, 24, 5],
  ['6803', 17, 26, 5],
  ['6804', 20, 32, 7],
  ['6805', 25, 37, 7],
  ['6806', 30, 42, 7],
  ['6000', 10, 26, 8],
  ['6001', 12, 28, 8],
  ['6002', 15, 32, 9],
  ['6003', 17, 35, 10],
  ['6004', 20, 42, 12],
]

const HEX: Row[] = [
  ['3/8 in hex', 9.525, 11.0, 22.23],
  ['1/2 in hex', 12.7, 14.66, 28.58],
]

export function SheetTab() {
  return (
    <div className="sheet-grid">
      <SheetTable title="Metric screws" head={['Thread', 'Tap drill (mm)', 'Close fit (mm)', 'Normal fit (mm)']} rows={METRIC} note="Clearance from ISO 273. Use normal fit unless the part locates on the screw." />
      <SheetTable title="Imperial screws" head={['Thread', 'Tap drill (mm)', 'Close fit (mm)', 'Free fit (mm)']} rows={IMPERIAL} note="Drill size in brackets. #10-32 and 1/4-20 are most of what goes on the robot." />
      <SheetTable title="Bearings" head={['Bearing', 'ID (mm)', 'OD (mm)', 'Width (mm)']} rows={BEARINGS} note="R6 and R8 widths are for sealed bearings (open ones are thinner). Flanged versions add a flange, so check the vendor drawing for the flange size before cutting a pocket." />
      <SheetTable title="Hex shaft" head={['Shaft', 'Across flats (mm)', 'Across corners (mm)', 'Hex bearing OD (mm)']} rows={HEX} note="Hex bearing ODs are 7/8 in and 1.125 in (same as R8). Width changes by vendor, so check the drawing." />
    </div>
  )
}
