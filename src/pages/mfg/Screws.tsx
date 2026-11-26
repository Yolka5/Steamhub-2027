import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Sheet, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { hardwareRows, JOINT_WORD, resToSvg, saveHardwareStock, useHardwareStock, type JointRow, type Stock } from '../../lib/guide'
import { ago, fileSafe, fmtMm, saveFile, type CadScrew } from '../../lib/mfg'
import { useAnalysis, useHardwareState } from '../../lib/useAnalysis'

// A subsystem's screws, in two parts:
//  - In the CAD: every screw, nut, washer and rivet the assembly STEP has drawn. The import puts
//    them here instead of in the bought parts (upload.ts, saveScrews), so they're counted and
//    collected in one place.
//  - From the holes: places where holes line up across parts with no screw drawn in them, and what
//    goes there. Only a single assembly file has positions for this. A joint's type can be changed
//    and everything updates.

/** Ten percent spare, for screws that roll under the bench. */
const take = (qty: number) => Math.ceil(qty * 1.1)

export default function Screws() {
  const { id = '' } = useParams()
  const { sub, robot, analysis, file, state } = useAnalysis(id)
  const { values, set } = useHardwareState(id)
  const { stock, reload: reloadStock } = useHardwareStock()
  const who = useWho()
  const toast = useToast()
  const [editing, setEditing] = useState(false)

  const types = useMemo(() => {
    const t: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) if (k.startsWith('type:')) t[k.slice(5)] = String(v.type)
    return t
  }, [values])
  const cad = useMemo(
    () =>
      Object.entries(values)
        .filter(([k]) => k.startsWith('screw:'))
        .map(([, v]) => v as unknown as CadScrew)
        .filter((x) => x && typeof x.name === 'string')
        .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })),
    [values],
  )
  const H = useMemo(() => (analysis && stock ? hardwareRows(analysis.joints, types, stock) : null), [analysis, types, stock])

  if (!sub || !robot || state === 'loading' || !stock) return <div className="page">{<p className="soft">Loading</p>}</div>

  const main = H?.rows.filter((r) => r.j.type !== 'open' && r.j.type !== 'tapOpen') ?? []
  const open = H?.rows.filter((r) => r.j.type === 'open' || r.j.type === 'tapOpen') ?? []
  const count = (rs: JointRow[]) => rs.reduce((s, r) => s + r.j.count, 0)
  const holes = state === 'ready' && !!H
  const cadTotal = cad.reduce((n, x) => n + x.qty, 0)

  const toggle = async (key: string) => {
    if (!who) return
    const st = values[key] as { done?: boolean } | undefined
    const err = await set(key, st?.done ? { done: false } : { done: true, by: who.name }, who.name)
    if (err) toast(err)
  }

  const csv = () => {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const by = (key: string) => (values[key] as { done?: boolean; by?: string } | undefined)?.done ? ((values[key]?.by as string) ?? 'yes') : ''
    const lines: unknown[][] = [['Screw', 'In the CAD', 'Take (+10%)', 'Collected by'], ...cad.map((x) => [x.name, x.qty, take(x.qty), by(`item:cad:${x.name}`)])]
    if (H)
      lines.push(
        [],
        ['From the holes', 'Needed', 'Take (+10%)', 'Collected by'],
        ...H.list.map((x) => [x.name, x.qty, x.take, by(`item:${x.name}`)]),
        [],
        ['Joint', 'Qty', 'Through', 'Stack (mm)', 'Hardware', 'Note'],
        ...H.rows.filter((r) => r.type !== 'none').map((r) => [JOINT_WORD[r.type], r.j.count, r.j.parts.map((p) => `${p.partNo} (Ø${fmtMm(p.d)}, ${fmtMm(p.len)} mm)`).join(' + '), r.j.type === 'shaft' ? '' : fmtMm(r.j.grip), r.hw.text, r.j.note ?? '']),
      )
    saveFile(`${fileSafe(`${robot.name} ${sub.number} ${sub.name} screws`)}.csv`, lines.map((l) => l.map(q).join(',')).join('\r\n'), 'text/csv')
  }

  const item = (key: string, name: string, line: string) => {
    const st = values[key] as { done?: boolean; by?: string } | undefined
    return (
      <li key={key} className="row hw-item" data-done={st?.done || undefined}>
        <span className="row__main">
          <span className="strong">{name}</span>
          <span className="soft small num">
            {line}
            {st?.done && st.by ? ` · collected by ${st.by}` : ''}
          </span>
        </span>
        <button type="button" className={`q-btn q-btn--small${st?.done ? ' hw-item__got' : ''}`} onClick={() => toggle(key)}>
          {st?.done && <Icon name="check" size={16} />} Got it
        </button>
      </li>
    )
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Screws</h1>
          <p className="soft sub-meta">
            <Link to={`/manufacturing/s/${sub.id}`}>
              {sub.number} {sub.name}
            </Link>{' '}
            · {robot.name}
            {file ? ` · from ${file.name}, ${ago(file.at)}` : ''}
          </p>
        </div>
        <div className="page__actions">
          <button type="button" className="q-btn" onClick={() => setEditing(true)}>
            Hardware we stock
          </button>
          {(cad.length > 0 || H) && (
            <button type="button" className="q-btn" onClick={csv}>
              <Icon name="download" size={18} /> CSV
            </button>
          )}
        </div>
      </div>

      {!cad.length && !holes && (
        <div className="mfg-help">
          <p>
            {state === 'error'
              ? "The screw table couldn't be loaded. Drop the assembly STEP again on the subsystem page."
              : 'No screws yet. They come in with the assembly STEP on the subsystem page: screws, nuts and washers drawn in the CAD are listed here instead of with the bought parts.'}
          </p>
          <p className="soft small">One assembly file also finds holes that line up with no screw in them, and says what goes there. A folder of separate part files has no positions for that.</p>
          <Link to={`/manufacturing/s/${sub.id}`} className="q-btn">
            {sub.number} {sub.name}
          </Link>
        </div>
      )}

      {cad.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            In the CAD <span className="soft num">{cadTotal}</span>
          </h2>
          <p className="soft small sp-hint">Every screw, nut and washer drawn in the assembly, with 10% spare to take.</p>
          <ul className="rows">{cad.map((x) => item(`item:cad:${x.name}`, x.name, `${x.qty} in the CAD, take ${take(x.qty)}`))}</ul>
        </section>
      )}

      {holes && H && (
        <>
          {file && !file.latest && <p className="mfg-note mfg-note--warn">The holes below are from an older upload. The latest one was separate part files, which have no positions.</p>}

          {H.list.length > 0 && (
            <section className="section">
              <h2 className="section__title">
                From the holes <span className="soft num">{H.list.length}</span>
              </h2>
              <p className="soft small sp-hint">What the joints below need, plus 10% spare. Skip what's already in the CAD list above.</p>
              <ul className="rows">{H.list.map((x) => item(`item:${x.name}`, x.name, `${x.qty} needed, take ${x.take}`))}</ul>
            </section>
          )}

          <section className="section">
            <h2 className="section__title">
              Joints <span className="soft num">{count(main)}</span>
            </h2>
            <p className="soft small sp-hint">Holes that line up across parts. Orange in the picture is the parts, blue dots are where the screws go. Change a type if it's wrong.</p>
            <ul className="joints">
              {main.map((r) => (
                <JointItem key={`${r.j.type}|${r.j.key}`} r={r} onType={(t) => who && set(`type:${r.j.type}|${r.j.key}`, { type: t }, who.name)} />
              ))}
            </ul>
          </section>

          {open.length > 0 && (
            <details className="more mfg-archived">
              <summary>
                Holes with nothing on the other side ({count(open)}): usually where it fastens to the robot or to a part outside this STEP
              </summary>
              <ul className="joints">
                {open.map((r) => (
                  <JointItem key={`${r.j.type}|${r.j.key}`} r={r} onType={(t) => who && set(`type:${r.j.type}|${r.j.key}`, { type: t }, who.name)} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Hardware we stock">
        <StockForm
          stock={stock}
          onDone={() => {
            setEditing(false)
            reloadStock()
          }}
        />
      </Sheet>
    </div>
  )
}

function JointItem({ r, onType }: { r: JointRow; onType: (t: string) => void }) {
  const opts = r.j.type === 'shaft' ? ['shaft', 'none'] : ['nut', 'tap', 'rivet', 'none']
  return (
    <li className="joint" data-none={r.type === 'none' || undefined}>
      <div className="joint__pic" dangerouslySetInnerHTML={{ __html: resToSvg(r.j.thumb, 160, 110) }} />
      <div className="joint__body">
        <div className="joint__top">
          <span className="joint__hw" data-bad={!r.hw.ok || undefined}>
            <span className="num">{r.j.count}×</span> {r.hw.text}
          </span>
          <div className="joint__type">
            <Select className="field--inline" label="Joint type" value={r.type} onChange={onType} options={opts.map((o) => ({ value: o, label: JOINT_WORD[o] }))} />
          </div>
        </div>
        <p className="soft small num joint__parts">
          {r.j.parts.map((p, i) => (
            <span key={i}>
              {i > 0 && ' + '}
              <strong>{p.partNo}</strong> Ø{fmtMm(p.d)}, {fmtMm(p.len)} mm
            </span>
          ))}
          {r.j.type !== 'shaft' && r.j.parts.length > 1 ? ` · stack ${fmtMm(r.j.grip)} mm` : ''}
        </p>
        {r.j.note && <p className="soft small joint__note">{r.j.note}</p>}
      </div>
    </li>
  )
}

const list = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      // 1/2, 1-1/4 or 0.5 for inches
      const m = x.match(/^(\d+)-(\d+)\/(\d+)$/)
      if (m) return +m[1] + +m[2] / +m[3]
      const f = x.match(/^(\d+)\/(\d+)$/)
      if (f) return +f[1] / +f[2]
      return Number(x)
    })
    .filter((v) => v > 0)

function StockForm({ stock, onDone }: { stock: Stock; onDone: () => void }) {
  const toast = useToast()
  const [metric, setMetric] = useState((stock.metric ?? []).join(', '))
  const [inch, setInch] = useState((stock.inch ?? []).join(', '))
  const [nut, setNut] = useState<'nylock' | 'plain'>(stock.nut ?? 'nylock')
  const [heads, setHeads] = useState(stock.heads ?? '')
  const [rivets, setRivets] = useState(stock.rivets ?? '')
  const [notes, setNotes] = useState(stock.notes ?? '')

  const save = async () => {
    const res = await saveHardwareStock({ metric: list(metric), inch: list(inch), nut, heads: heads.trim(), rivets: rivets.trim(), notes: notes.trim() })
    if (res.error) return toast(res.error)
    toast('Saved. New uploads and this table use it.')
    onDone()
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <p className="soft small">Screw lengths for the joints are picked from these. Empty means the usual set (6 to 120 mm, 1/4" to 4").</p>
      <label className="ctl">
        <span className="ctl__name">Metric screw lengths (mm)</span>
        <input className="field num" data-autofocus value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="8, 10, 12, 16, 20, 25, 30, 35, 40" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Inch screw lengths (inches)</span>
        <input className="field num" value={inch} onChange={(e) => setInch(e.target.value)} placeholder="3/8, 1/2, 3/4, 1, 1-1/4, 1-1/2" />
      </label>
      <div className="ctl">
        <span className="ctl__name">Nuts</span>
        <div className="picks picks--seg" role="radiogroup" aria-label="Nuts">
          {(['nylock', 'plain'] as const).map((k) => (
            <button key={k} type="button" role="radio" className="pick" aria-checked={nut === k} onClick={() => setNut(k)}>
              {k === 'nylock' ? 'Nylock' : 'Plain'}
            </button>
          ))}
        </div>
      </div>
      <label className="ctl">
        <span className="ctl__name">Screw heads and sizes we use</span>
        <input className="field" value={heads} onChange={(e) => setHeads(e.target.value)} placeholder="Socket cap M3-M6, button head M5, #10-32, 1/4-20" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Rivets</span>
        <input className="field" value={rivets} onChange={(e) => setRivets(e.target.value)} placeholder="4.8 mm, grips 3.2-4.8 and 4.8-6.4" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Anything else</span>
        <textarea className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        Save
      </button>
    </form>
  )
}
