import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { Sheet, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { hardwareRows, JOINT_WORD, resToSvg, saveHardwareStock, useHardwareStock, type JointRow, type Stock } from '../../lib/guide'
import { ago, fileSafe, fmtMm, saveFile } from '../../lib/mfg'
import { useAnalysis, useHardwareState } from '../../lib/useAnalysis'

// Every place holes line up across parts, what fastener goes there, and what to collect.
// Found from the assembly at upload; a joint's type can be changed and everything updates.

export default function Bolts() {
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
  const H = useMemo(() => (analysis && stock ? hardwareRows(analysis.joints, types, stock) : null), [analysis, types, stock])

  if (!sub || !robot || state === 'loading' || !stock) return <div className="page">{<p className="soft">Loading</p>}</div>

  const main = H?.rows.filter((r) => r.j.type !== 'open' && r.j.type !== 'tapOpen') ?? []
  const open = H?.rows.filter((r) => r.j.type === 'open' || r.j.type === 'tapOpen') ?? []
  const count = (rs: JointRow[]) => rs.reduce((s, r) => s + r.j.count, 0)

  const csv = () => {
    if (!H) return
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Item', 'Needed', 'Take (+10%)', 'Collected by'],
      ...H.list.map((x) => [x.name, x.qty, x.take, (values[`item:${x.name}`]?.by as string) ?? '']),
      [],
      ['Joint', 'Qty', 'Through', 'Stack (mm)', 'Hardware', 'Note'],
      ...H.rows.filter((r) => r.type !== 'none').map((r) => [JOINT_WORD[r.type], r.j.count, r.j.parts.map((p) => `${p.partNo} (Ø${fmtMm(p.d)}, ${fmtMm(p.len)} mm)`).join(' + '), r.j.type === 'shaft' ? '' : fmtMm(r.j.grip), r.hw.text, r.j.note ?? '']),
    ]
    saveFile(`${fileSafe(`${robot.name} ${sub.number} ${sub.name} bolts`)}.csv`, lines.map((l) => l.map(q).join(',')).join('\r\n'), 'text/csv')
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Bolts</h1>
          <p className="soft sub-meta">
            <Link to={`/manufacturing/s/${sub.id}`}>
              {sub.number} {sub.name}
            </Link>{' '}
            · {robot.name}
            {file ? ` · from ${file.name}, ${ago(file.at)}` : ''}
          </p>
        </div>
        <div className="page__actions">
          <Link to={`/manufacturing/s/${sub.id}/guide`} className="q-btn">
            Assembly guide
          </Link>
          <button type="button" className="q-btn" onClick={() => setEditing(true)}>
            Hardware we stock
          </button>
          {H && (
            <button type="button" className="q-btn" onClick={csv}>
              <Icon name="download" size={18} /> CSV
            </button>
          )}
        </div>
      </div>

      {state !== 'ready' || !H ? (
        <div className="mfg-help">
          <p>
            {state === 'error'
              ? "The bolt table couldn't be loaded. Drop the assembly STEP again on the subsystem page."
              : 'No bolt table yet. It needs the whole assembly as one STEP file, which has every part in its place. A folder of separate part files has no positions.'}
          </p>
        </div>
      ) : (
        <>
          {file && !file.latest && <p className="mfg-note mfg-note--warn">This is from an older upload. The latest one was separate part files, which have no bolt positions.</p>}

          <section className="section">
            <div className="mfg-bar-head">
              <h2 className="section__title">
                What to collect <span className="soft num">{H.list.length}</span>
              </h2>
            </div>
            <p className="soft small sp-hint">Totals for every joint below, plus 10% spare.</p>
            <ul className="rows">
              {H.list.map((x) => {
                const st = values[`item:${x.name}`] as { done?: boolean; by?: string } | undefined
                return (
                  <li key={x.name} className="row hw-item" data-done={st?.done || undefined}>
                    <span className="row__main">
                      <span className="strong">{x.name}</span>
                      <span className="soft small num">
                        {x.qty} needed, take {x.take}
                        {st?.done && st.by ? ` · collected by ${st.by}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={`q-btn q-btn--small${st?.done ? ' hw-item__got' : ''}`}
                      onClick={async () => {
                        if (!who) return
                        const err = await set(`item:${x.name}`, st?.done ? { done: false } : { done: true, by: who.name }, who.name)
                        if (err) toast(err)
                      }}
                    >
                      {st?.done ? (
                        <>
                          <Icon name="check" size={16} /> Got it
                        </>
                      ) : (
                        'Got it'
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="section">
            <h2 className="section__title">
              Joints <span className="soft num">{count(main)}</span>
            </h2>
            <p className="soft small sp-hint">Holes that line up across parts. Orange in the picture is the parts, blue dots are where the bolts go. Change a type if it's wrong.</p>
            <ul className="joints">
              {main.map((r) => (
                <JointItem key={`${r.j.type}|${r.j.key}`} r={r} onType={(t) => who && set(`type:${r.j.type}|${r.j.key}`, { type: t }, who.name)} />
              ))}
            </ul>
          </section>

          {open.length > 0 && (
            <details className="more mfg-archived">
              <summary>
                Holes with nothing on the other side ({count(open)}): usually where it bolts to the robot or to a part outside this STEP
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
      <p className="soft small">Bolt lengths are picked from these. Empty means the usual set (6 to 120 mm, 1/4" to 4").</p>
      <label className="ctl">
        <span className="ctl__name">Metric bolt lengths (mm)</span>
        <input className="field num" data-autofocus value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="8, 10, 12, 16, 20, 25, 30, 35, 40" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Inch bolt lengths (inches)</span>
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
        <span className="ctl__name">Bolt heads and sizes we use</span>
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
