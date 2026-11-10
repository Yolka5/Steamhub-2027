import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NumField } from '../../components/NumField'
import { Copy } from '../../components/ui'
import {
  DRIVES,
  GEAR_EXTRA,
  centerForCount,
  gearCenter,
  gearPairsNear,
  gearPitchDiameter,
  optionsNear,
  pulleyPitchDiameter,
  sprocketPitchDiameter,
  type DriveType,
} from '../../lib/centers'
import { COMMON_ORDER, THREADS, findThreads, threadDepth, threadsInWall, type Thread } from '../../lib/threads'
import { f, Seg } from './shared'
import { Working } from '../../components/Working'
import { beltFindWorking, beltHaveWorking, chainFindWorking, chainHaveWorking, gearFindWorking, gearWorking, threadWorking } from '../../lib/workings'
import { Select } from '../../components/Select'

// ---------- Center distance ----------

const mm = (n: number) => n.toFixed(2)
const inch = (n: number) => (n / 25.4).toFixed(3)

type CdMode = 'find' | 'have'

const MODE_LABELS: Record<DriveType['kind'], [string, string]> = {
  belt: ['Find a belt', 'I have a belt'],
  chain: ['Find a chain', 'I have a chain'],
  gear: ['Find gears', 'I have gears'],
}

export function CenterTab() {
  const [params, setParams] = useSearchParams()
  const [driveId, setDriveId] = useState('htd5')
  const [z1, setZ1] = useState(18)
  const [z2, setZ2] = useState(36)
  const [target, setTarget] = useState(150)
  const [step, setStep] = useState<1 | 5>(1)
  const [count, setCount] = useState(100)
  const [beltBy, setBeltBy] = useState<'teeth' | 'mm'>('teeth')
  const [beltMm, setBeltMm] = useState(500)
  const [gearTarget, setGearTarget] = useState(47)
  const [ratio, setRatio] = useState(4)
  const [minTeeth, setMinTeeth] = useState(12)
  const drive = DRIVES.find((d) => d.id === driveId)!
  const a = Math.round(z1)
  const b = Math.round(z2)
  // The mode lives in the link, so "I have a belt" can be sent to someone.
  const mode: CdMode = params.get('cd') === 'have' ? 'have' : 'find'
  const setMode = (m: CdMode) => {
    const next = new URLSearchParams(params)
    if (m === 'have') next.set('cd', 'have')
    else next.delete('cd')
    setParams(next, { replace: true })
  }
  const gearFind = drive.kind === 'gear' && mode === 'find'
  const part = drive.kind === 'gear' ? 'Gear' : drive.kind === 'chain' ? 'Sprocket' : 'Pulley'
  // A belt's printed length is its pitch length, so it is a whole number of teeth.
  const beltTeeth = beltBy === 'mm' ? Math.round(beltMm / drive.pitch) : Math.round(count)
  const lengthOff = drive.kind === 'belt' && mode === 'have' && beltBy === 'mm' && Math.abs(beltMm / drive.pitch - beltTeeth) > 0.01

  return (
    <div className="calc-two">
      <div className="fields-col">
        <div className="fields" role="group">
          <h3 className="fields__title">Drive</h3>
          <label className="num-field">
            <span className="num-field__label">Type</span>
            <Select value={driveId} onChange={setDriveId} options={DRIVES.map((d) => ({ value: d.id, label: d.label }))} />
          </label>
          <div className="num-field num-field--wide">
            <span className="num-field__label">What you know</span>
            <Seg label="What you know" value={mode} onChange={setMode} options={[{ value: 'find', label: MODE_LABELS[drive.kind][0] }, { value: 'have', label: MODE_LABELS[drive.kind][1] }]} />
          </div>
          {gearFind ? (
            <>
              <NumField label="Center distance you have" unit="mm" value={gearTarget} min={1} step={0.5} onChange={setGearTarget} />
              <NumField label="Ratio you want" unit=":1" value={ratio} min={1} step={0.5} onChange={setRatio} />
              <NumField label="Smallest gear" unit="teeth" value={minTeeth} min={6} step={1} onChange={setMinTeeth} />
            </>
          ) : (
            <>
              <NumField label={`${part} 1 teeth`} value={z1} min={6} step={1} onChange={setZ1} />
              <NumField label={`${part} 2 teeth`} value={z2} min={6} step={1} onChange={setZ2} />
            </>
          )}
          {drive.kind !== 'gear' && mode === 'find' && <NumField label="Center distance you want" unit="mm" value={target} min={1} step={1} onChange={setTarget} />}
          {drive.kind === 'belt' && mode === 'find' && (
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
          {drive.kind === 'belt' && mode === 'have' && (
            <>
              <div className="num-field num-field--wide">
                <span className="num-field__label">Belt size by</span>
                <Seg
                  label="Belt size by"
                  value={beltBy}
                  onChange={setBeltBy}
                  options={[
                    { value: 'teeth', label: 'Teeth' },
                    { value: 'mm', label: 'Printed length' },
                  ]}
                />
              </div>
              {beltBy === 'teeth' ? (
                <NumField label="Belt teeth" value={count} min={10} step={1} onChange={setCount} />
              ) : (
                <NumField label="Length on the belt" hint={`Like 500 in "500-5M-15". That's ${beltTeeth} teeth.`} unit="mm" value={beltMm} min={10} step={drive.pitch} onChange={setBeltMm} />
              )}
            </>
          )}
          {drive.kind === 'chain' && mode === 'have' && <NumField label="Chain links" value={count} min={10} step={1} onChange={setCount} />}
          {!gearFind && (
            <p className="soft small">
              Ratio {f(Math.max(a, b) / Math.min(a, b), 3)}:1. Pitch diameters {f(pitchDia(drive, a), 2)} and {f(pitchDia(drive, b), 2)} mm.
            </p>
          )}
          {lengthOff && <p className="error small">That length isn't a whole number of {drive.pitch} mm teeth. Check the label: the first number is the pitch length.</p>}
        </div>
      </div>

      <div>
        {drive.kind === 'gear' ? (
          mode === 'find' ? (
            <GearFindResult drive={drive} target={gearTarget} ratio={ratio} minTeeth={Math.round(minTeeth)} />
          ) : (
            <GearResult drive={drive} a={a} b={b} />
          )
        ) : mode === 'find' ? (
          <BeltChainResult drive={drive} a={a} b={b} target={target} step={drive.kind === 'belt' ? step : 1} />
        ) : (
          <HaveResult drive={drive} a={a} b={b} count={drive.kind === 'belt' ? beltTeeth : Math.round(count)} />
        )}
      </div>
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
      <Working id="cd-find" lines={drive.kind === 'belt' ? beltFindWorking(drive, a, b, target, step) : chainFindWorking(drive, a, b, target)} />
    </>
  )
}

/** You already have the belt or chain: where to put the shafts. */
function HaveResult({ drive, a, b, count }: { drive: DriveType; a: number; b: number; count: number }) {
  const center = centerForCount(drive, a, b, count)
  const belt = drive.kind === 'belt'
  const unit = belt ? 'teeth' : 'links'
  const near = [-2, -1, 1, 2]
    .map((d) => count + d)
    .filter((n) => n > 0)
    .map((n) => ({ n, c: centerForCount(drive, a, b, n) }))
    .filter((x): x is { n: number; c: number } => x.c != null)

  return (
    <>
      <h2 className="section__title">
        Your {count} {belt ? 'tooth belt' : 'link chain'}
      </h2>
      {center == null ? (
        <p className="soft">
          Too short: a {count} {belt ? 'tooth belt' : 'link chain'} can't wrap both {belt ? 'pulleys' : 'sprockets'} without them overlapping. You need a longer one or smaller{' '}
          {belt ? 'pulleys' : 'sprockets'}.
        </p>
      ) : (
        <>
          <p className="have__big num">
            <Copy value={mm(center)}>{mm(center)}</Copy> <span className="have__unit">mm</span>
          </p>
          <p className="soft num">
            {inch(center)} in center to center
            {belt ? ` · pitch length ${f(count * drive.pitch, 0)} mm` : ''}
            {!belt && count % 2 === 1 && <span className="tag tag--reserved"> Half link</span>}
          </p>
          {near.length > 0 && (
            <div className="table-wrap">
              <table className="ctable num">
                <thead>
                  <tr>
                    <th>If you had instead</th>
                    <th>Center distance (mm)</th>
                    <th>(in)</th>
                    <th>Change (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {near.map(({ n, c }) => (
                    <tr key={n}>
                      <td>
                        {n} {unit}
                        {!belt && n % 2 === 1 && <span className="tag tag--reserved"> Half link</span>}
                      </td>
                      <td>
                        <Copy value={mm(c)} />
                      </td>
                      <td>{inch(c)}</td>
                      <td>
                        {c - center >= 0 ? '+' : ''}
                        {f(c - center, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="calc-note soft">
        {belt
          ? 'Exact pitch-line math, no added stretch. Click the distance to copy it into Onshape.'
          : 'Standard chain length formula. Leave room for a tensioner. Click the distance to copy it.'}
      </p>
      <Working id="cd-have" lines={belt ? beltHaveWorking(drive, a, b, count) : chainHaveWorking(drive, a, b, count)} />
    </>
  )
}

/** You have a center distance: which gears fit it, nearest the ratio you want. */
function GearFindResult({ drive, target, ratio, minTeeth }: { drive: DriveType; target: number; ratio: number; minTeeth: number }) {
  const pairs = gearPairsNear(drive.pitch, target, ratio, minTeeth).slice(0, 8)
  return (
    <>
      <h2 className="section__title">
        Gears for {f(target, 1)} mm, near {f(ratio, 2)}:1
      </h2>
      {pairs.length === 0 ? (
        <p className="soft">No pair fits. Try a smaller smallest gear, a different ratio or a bigger distance.</p>
      ) : (
        <div className="table-wrap">
          <table className="ctable num">
            <thead>
              <tr>
                <th>Gears</th>
                <th>Ratio</th>
                <th>Exact (mm)</th>
                <th>+0.003 in (mm)</th>
                <th>Off by (mm)</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={`${p.z1}-${p.z2}`} className={i === 0 ? 'is-sel' : ''}>
                  <td className="nowrap">
                    {p.z1}T : {p.z2}T
                  </td>
                  <td className={i === 0 ? 'is-sel' : ''}>{f(p.ratio, 3)}:1</td>
                  <td className={i === 0 ? 'is-sel' : ''}>
                    <Copy value={mm(p.center)} />
                  </td>
                  <td className={i === 0 ? 'is-sel' : ''}>
                    <Copy value={mm(p.center + GEAR_EXTRA)} />
                  </td>
                  <td className={i === 0 ? 'is-sel' : ''}>
                    {p.delta >= 0 ? '+' : ''}
                    {f(p.delta, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="calc-note soft">
        Gear center distance only depends on the total teeth, so only a few totals land near your distance. Sorted by closest distance, then closest ratio. Most FRC teams add 0.003
        in so the gears don't bind.
      </p>
      <Working id="cd-gear-find" lines={gearFindWorking(drive, target, ratio)} />
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
      <Working id="cd-gear" lines={gearWorking(drive, a, b)} />
    </>
  )
}

// ---------- Cheat sheets ----------

type Row = (string | number)[]

function SheetTable({ title, head, rows, note, highlight }: { title: string; head: string[]; rows: Row[]; note?: string; highlight?: Set<string> }) {
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
              <tr key={String(r[0])} className={highlight?.has(String(r[0])) ? 'is-sel' : undefined}>
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

const withDrill = (mmv: number, drill?: string): string | number => (drill ? `${mmv.toFixed(2)} (${drill})` : mmv)
const threadRow = (t: Thread): Row => [t.name, `${+t.pitch.toFixed(3)}`, withDrill(t.tap, t.tapDrill), withDrill(t.close, t.closeDrill), withDrill(t.free, t.freeDrill)]

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

/** Type a thread, get the holes. The answer is the biggest thing on the screen. */
function TapLookup({ text, setText, matches }: { text: string; setText: (s: string) => void; matches: Thread[] }) {
  const [wall, setWall] = useState('')
  const [pick, setPick] = useState(0)
  const t = matches.length ? matches[Math.min(pick, matches.length - 1)] : undefined
  const wallMm = Number(wall.replace(',', '.'))
  const fits = t && wall.trim() && wallMm > 0 ? threadsInWall(t, wallMm) : null

  return (
    <section className="tap">
      <div className="tap__inputs">
        <label className="ctl tap__thread">
          <span className="ctl__name">Thread</span>
          <input
            className="field field--big num"
            placeholder="10-32, M5, 1/4-20"
            value={text}
            autoFocus={window.matchMedia('(pointer: fine)').matches}
            onChange={(e) => {
              setText(e.target.value)
              setPick(0)
            }}
          />
        </label>
        <label className="ctl tap__wall">
          <span className="ctl__name">Wall thickness, optional</span>
          <span className="num-field__box">
            <input className="num-field__input num" inputMode="decimal" placeholder="1.6" value={wall} onChange={(e) => setWall(e.target.value)} />
            <span className="num-field__unit">mm</span>
          </span>
        </label>
      </div>
      <div className="chips">
        {COMMON_ORDER.map((n) => (
          <button
            key={n}
            type="button"
            className="chip num"
            aria-pressed={t?.name === n}
            onClick={() => {
              setText(n)
              setPick(0)
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {text.trim() && !t && <p className="soft">No thread called "{text.trim()}". Try 10-32, 1/4-20 or M5.</p>}

      {t && (
        <div className="tap__card">
          <div className="tap__head">
            <span className="tap__name num">{t.name}</span>
            <span className="soft small num">
              {t.system === 'metric' ? 'Metric coarse' : 'Imperial'}, pitch {+t.pitch.toFixed(3)} mm
            </span>
            {matches.length > 1 && (
              <span className="tap__others small">
                Also:
                {matches.map((m, i) =>
                  m === t ? null : (
                    <button key={m.name} type="button" className="text-btn num" onClick={() => setPick(i)}>
                      {m.name}
                    </button>
                  ),
                )}
              </span>
            )}
          </div>
          <div className="tap__stats">
            <div className="tap__stat">
              <span className="stat__l">Tap drill</span>
              <span className="tap__value num">
                <Copy value={t.tap}>{t.tap.toFixed(2)}</Copy>
                <span className="stat__u"> mm</span>
              </span>
              <span className="soft small num">{t.tapDrill ? `${t.tapDrill} drill, 75% thread` : 'ISO coarse'}</span>
            </div>
            <div className="tap__stat">
              <span className="stat__l">Clearance hole</span>
              <span className="tap__value tap__value--sm num">
                <Copy value={t.free}>{t.free.toFixed(2)}</Copy>
                <span className="stat__u"> mm free fit</span>
              </span>
              <span className="soft small num">
                close fit {t.close.toFixed(2)} mm{t.closeDrill ? ` (${t.closeDrill})` : ''}
                {t.freeDrill ? `, free is ${t.freeDrill}` : ''}
              </span>
            </div>
            <div className="tap__stat">
              <span className="stat__l">Tap at least</span>
              <span className="tap__value tap__value--sm num">
                <Copy value={+threadDepth(t).toFixed(1)}>{threadDepth(t).toFixed(1)}</Copy>
                <span className="stat__u"> mm deep</span>
              </span>
              <span className="soft small">1.5 × diameter, full strength in aluminum</span>
            </div>
          </div>
          {fits != null && (
            <p className={`tap__wall-note ${fits < 2 ? 'is-bad' : fits < 3 ? 'is-warn' : 'is-ok'}`}>
              {fits < 2
                ? `Too thin to tap: only ${fits.toFixed(1)} threads fit in ${wallMm} mm. Use a rivnut, a threaded insert, or a through bolt with a nut.`
                : fits < 3
                  ? `On the edge: ${fits.toFixed(1)} threads fit in ${wallMm} mm. Fine for light loads; use a rivnut or a through bolt for anything that carries load.`
                  : `Fits ${Math.floor(fits)} threads in ${wallMm} mm.`}
            </p>
          )}
          <Working id="tap" lines={threadWorking(t, fits != null ? wallMm : null)} />
        </div>
      )}
    </section>
  )
}

export function SheetTab() {
  const [params, setParams] = useSearchParams()
  const text = params.get('t') ?? ''
  const setText = (v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set('t', v)
    else next.delete('t')
    setParams(next, { replace: true })
  }
  const matches = findThreads(text)
  const highlight = new Set(matches.map((m) => m.name))
  const head = ['Thread', 'Pitch (mm)', 'Tap drill (mm)', 'Close fit (mm)', 'Free fit (mm)']

  return (
    <>
      <TapLookup text={text} setText={setText} matches={matches} />
      <div className="sheet-threads">
      <SheetTable
        title="Imperial screws"
        head={head}
        rows={THREADS.filter((t) => t.system === 'imperial').map(threadRow)}
        highlight={highlight}
        note="Drill size in brackets. Tap drills for 75% thread, clearance from the machinist chart. #10-32 and 1/4-20 are most of what goes on the robot."
      />
      <SheetTable
        title="Metric screws"
        head={head}
        rows={THREADS.filter((t) => t.system === 'metric').map(threadRow)}
        highlight={highlight}
        note="ISO coarse threads. Clearance from ISO 273: close is the fine series, free the medium series."
      />
      </div>
      <div className="sheet-grid">
      <SheetTable title="Bearings" head={['Bearing', 'ID (mm)', 'OD (mm)', 'Width (mm)']} rows={BEARINGS} note="R6 and R8 widths are for sealed bearings (open ones are thinner). Flanged versions add a flange, so check the vendor drawing for the flange size before cutting a pocket." />
      <SheetTable title="Hex shaft" head={['Shaft', 'Across flats (mm)', 'Across corners (mm)', 'Hex bearing OD (mm)']} rows={HEX} note="Hex bearing ODs are 7/8 in and 1.125 in (same as R8). Width changes by vendor, so check the drawing." />
      </div>
    </>
  )
}
