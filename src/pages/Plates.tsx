import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadError, Sheet, useBusy, useToast } from '../components/ui'
import { useAuth, useWho } from '../lib/auth'
import { ago } from '../lib/mfg'
import {
  notInSheet,
  plateArea,
  saveSheetSetting,
  setPlateState,
  STATE_WORD,
  syncSheet,
  tText,
  useAutoSync,
  usePlates,
  useSheetSetting,
  type Plate,
  type PlateState,
  type SheetSetting,
} from '../lib/plates'
import { supabase } from '../lib/supabase'

// CNC plate stock, found by thickness and size. The CNC team taps Partly used or Gone after a cut.

const STATES: PlateState[] = ['available', 'partly_used', 'gone']

export default function Plates() {
  const { plates, loading, error, setPlates, reload } = usePlates()
  const { setting, reload: reloadSetting } = useSheetSetting()
  const { isAdmin } = useAuth()
  const who = useWho()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const t = params.get('t')
  const material = params.get('mat')
  const showGone = params.get('gone') === '1'
  const [syncing, setSyncing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const materials = useMemo(() => [...new Set(plates.map((p) => p.material))].sort(), [plates])
  const inMaterial = plates.filter((p) => !material || p.material === material)

  // One card per thickness: how many usable plates and how much area.
  const sums = useMemo(() => {
    const by = new Map<number, { t: number; n: number; partly: number; m2: number }>()
    for (const p of inMaterial) {
      if (p.state === 'gone') continue
      const s = by.get(p.thickness) ?? { t: p.thickness, n: 0, partly: 0, m2: 0 }
      s.n++
      if (p.state === 'partly_used') s.partly++
      // A partly used plate counts for half: there's some left, nobody knows how much.
      s.m2 += plateArea(p) * (p.state === 'partly_used' ? 0.5 : 1)
      by.set(p.thickness, s)
    }
    return [...by.values()].sort((a, b) => a.t - b.t)
  }, [inMaterial])

  const list = inMaterial
    .filter((p) => !t || p.thickness === Number(t))
    .filter((p) => showGone || p.state !== 'gone')
    .sort((a, b) => a.thickness - b.thickness || plateArea(a) - plateArea(b))

  const low = setting?.low_m2 ?? 0.5

  // The sheet and Steamhub are both kept: read the sheet on open, and list what it's missing.
  useAutoSync(setting, () => {
    reload()
    reloadSetting()
  })
  const pending = notInSheet(plates)

  const sync = async () => {
    if (syncing) return
    setSyncing(true)
    const res = await syncSheet()
    setSyncing(false)
    if (res.error) return toast(res.error)
    reloadSetting()
    reload()
    toast(`Synced: ${res.plates} plates in the sheet, ${res.added} added, ${res.removed} removed${res.mills ? `, ${res.mills} end mill sizes` : ''}`)
  }

  const change = async (p: Plate, state: PlateState) => {
    if (!who || p.state === state) return
    const res = await setPlateState(p.id, state, who)
    if (res.error) return toast(res.error)
    setPlates((cur) => cur.map((x) => (x.id === p.id ? { ...res.data!, thickness: x.thickness, length: x.length, width: x.width } : x)))
    // A plate marked Gone leaves the list, so a slip needs a way back.
    toast(`${Number(p.length)} × ${Number(p.width)} marked ${STATE_WORD[state].toLowerCase()}`, { undo: () => change({ ...p, state }, p.state) })
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Plates</h1>
        <div className="page__actions">
          <Link to="/stock/end-mills" className="q-btn">
            End mills
          </Link>
          <button type="button" className="q-btn" onClick={sync}>
            {syncing ? 'Syncing' : 'Sync from sheet'}
          </button>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            Add plate
          </button>
        </div>
      </div>

      <p className="soft small">
        {setting?.synced_at ? `Synced from the plate sheet ${ago(setting.synced_at)}${setting.synced_by ? ` by ${setting.synced_by}` : ''}.` : 'Not synced from the plate sheet yet.'} Opening this page
        reads the sheet; plates marked here are never overwritten.{' '}
        {isAdmin && (
          <button type="button" className="text-btn" onClick={() => setEditing(true)}>
            Sheet settings
          </button>
        )}
      </p>

      {materials.length > 1 && (
        <div className="picks picks--seg plates-mat" role="radiogroup" aria-label="Material">
          {[null, ...materials].map((m) => (
            <button key={m ?? 'all'} type="button" role="radio" className="pick" aria-checked={material === m} onClick={() => set('mat', m)}>
              {m ?? 'All'}
            </button>
          ))}
        </div>
      )}

      {error && !plates.length ? (
        <LoadError onRetry={reload} />
      ) : loading ? (
        <p className="soft">Loading</p>
      ) : plates.length === 0 ? (
        <div className="mfg-empty">
          <p className="empty">No plates yet.</p>
          <p className="soft">Sync from the plate sheet to bring in what's on the shelves, or add a plate by hand.</p>
        </div>
      ) : (
        <>
          <div className="plate-sums">
            {sums.map((s) => (
              <button
                key={s.t}
                type="button"
                className="plate-sum"
                aria-pressed={t === String(s.t)}
                onClick={() => set('t', t === String(s.t) ? null : String(s.t))}
              >
                <span className="plate-sum__t num">{tText(s.t)} mm</span>
                <span className="soft small num">
                  {s.n} {s.n === 1 ? 'plate' : 'plates'}
                  {s.partly ? `, ${s.partly} partly used` : ''}
                </span>
                <span className="plate-sum__m2 num">{s.m2.toFixed(2)} m²</span>
                {s.m2 < low && <span className="tag tag--reserved">Low stock</span>}
              </button>
            ))}
          </div>

          <SheetPending remove={pending.remove} add={pending.add} />

          <div className="mfg-bar-head plates-head">
            <h2 className="section__title">{t ? `${tText(Number(t))} mm` : 'All plates'}</h2>
            <label className="check">
              <input type="checkbox" checked={showGone} onChange={(e) => set('gone', e.target.checked ? '1' : null)} />
              Show gone
            </label>
          </div>
          <ul className="rows">
            {list.map((p) => (
              <li key={p.id} className="row plate-row" data-state={p.state}>
                <span className="plate-row__size num">
                  <strong>
                    {Number(p.length)} × {Number(p.width)}
                  </strong>
                  <span className="soft small">
                    {tText(p.thickness)} mm {p.material} · {plateArea(p).toFixed(2)} m²
                    {p.state !== 'available' && p.updated_by_name ? ` · ${p.updated_by_name}, ${ago(p.updated_at)}` : ''}
                  </span>
                </span>
                <span className="picks picks--seg row__end" role="radiogroup" aria-label="State">
                  {STATES.map((s) => (
                    <button key={s} type="button" role="radio" className="pick" aria-checked={p.state === s} onClick={() => change(p, s)}>
                      {STATE_WORD[s]}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add plates">
        <AddPlate
          onDone={() => {
            setAdding(false)
            reload()
          }}
        />
      </Sheet>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Plate sheet">
        {setting && (
          <SheetSettings
            setting={setting}
            onDone={() => {
              setEditing(false)
              reloadSetting()
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

/** Grouped by size: "6.35 mm  1000 × 600  ×2". */
function bySize(list: Plate[]) {
  const m = new Map<string, { p: Plate; n: number }>()
  for (const p of list) {
    const k = `${p.thickness}|${p.length}|${p.width}`
    m.set(k, { p, n: (m.get(k)?.n ?? 0) + 1 })
  }
  return [...m.values()]
}

/** What changed here and still has to go into the sheet, with a copy for the people who keep it. */
function SheetPending({ remove, add }: { remove: Plate[]; add: Plate[] }) {
  const toast = useToast()
  if (!remove.length && !add.length) return null
  const gone = bySize(remove)
  const added = bySize(add)
  const line = ({ p, n }: { p: Plate; n: number }) => `${tText(p.thickness)} mm  ${Number(p.length)} × ${Number(p.width)}${n > 1 ? `  ×${n}` : ''}`
  const copy = async () => {
    const text = [
      // Tab-separated, so the added rows paste straight into the sheet's columns.
      ...(added.length ? ['Add to the sheet (thickness, length, width, qty):', ...added.map(({ p, n }) => [tText(p.thickness), Number(p.length), Number(p.width), n].join('\t'))] : []),
      ...(gone.length ? ['Take off the sheet (used up):', ...gone.map(line)] : []),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('Copied. Paste it to whoever keeps the sheet.')
    } catch {
      toast("Couldn't copy on this device")
    }
  }
  return (
    <section className="sheet-pending">
      <div className="mfg-bar-head">
        <h2 className="section__title">Not in the sheet yet</h2>
        <button type="button" className="q-btn q-btn--small" onClick={copy}>
          Copy
        </button>
      </div>
      {added.length > 0 && (
        <p className="small">
          <span className="soft">Added here: </span>
          <span className="num">{added.map(line).join(', ')}</span>
        </p>
      )}
      {gone.length > 0 && (
        <p className="small">
          <span className="soft">Gone here, still in the sheet: </span>
          <span className="num">{gone.map(line).join(', ')}</span>
        </p>
      )}
      <p className="soft small">They leave this list on their own once the sheet has them.</p>
    </section>
  )
}

function AddPlate({ onDone }: { onDone: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [material, setMaterial] = useState('Aluminum')
  const [thickness, setThickness] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, run] = useBusy()

  const save = () => run(saveNow)
  const saveNow = async () => {
    const [th, l, w, n] = [thickness, length, width, qty].map((v) => Number(v.replace(',', '.')))
    if (!th || !l || !w) return toast('Fill in thickness, length and width')
    const rows = Array.from({ length: Math.max(1, Math.min(50, n || 1)) }, () => ({
      material,
      thickness: th,
      length: Math.max(l, w),
      width: Math.min(l, w),
      source: 'manual',
      updated_by: who?.userId,
      updated_by_name: who?.name,
    }))
    const { error } = await supabase.from('plates').insert(rows)
    if (error) return toast(error.message)
    toast(`${rows.length} ${rows.length === 1 ? 'plate' : 'plates'} added`)
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
      <div className="picks picks--seg" role="radiogroup" aria-label="Material">
        {['Aluminum', 'Polycarb'].map((m) => (
          <button key={m} type="button" role="radio" className="pick" aria-checked={material === m} onClick={() => setMaterial(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="dims">
        <label className="ctl">
          <span className="ctl__name">Thickness (mm)</span>
          <input className="field num" inputMode="decimal" data-autofocus value={thickness} onChange={(e) => setThickness(e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Length</span>
          <input className="field num" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Width</span>
          <input className="field num" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">How many</span>
          <input className="field num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
      </div>
      <p className="soft small">Plates added here stay when the sheet syncs.</p>
      <button type="submit" className="q-btn q-btn--main q-btn--wide" disabled={busy}>
        {busy ? 'Adding' : 'Add'}
      </button>
    </form>
  )
}

function SheetSettings({ setting, onDone }: { setting: SheetSetting; onDone: () => void }) {
  const toast = useToast()
  const [url, setUrl] = useState(setting.url)
  const [tab, setTab] = useState(setting.endmill_tab)
  const [low, setLow] = useState(String(setting.low_m2))

  const save = async () => {
    if (!/docs\.google\.com\/spreadsheets\/d\//.test(url)) return toast('Paste the link of a Google Sheet')
    const res = await saveSheetSetting({ ...setting, url: url.trim(), endmill_tab: tab.trim(), low_m2: Number(low) || 0.5 })
    if (res.error) return toast(res.error)
    toast('Saved. Press Sync from sheet to read it.')
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
      <label className="ctl">
        <span className="ctl__name">Google Sheet link</span>
        <input className="field" data-autofocus value={url} onChange={(e) => setUrl(e.target.value)} />
        <span className="soft small">Share it as "Anyone with the link can view". The first tab is the plates: thickness, length, width, quantity.</span>
      </label>
      <label className="ctl">
        <span className="ctl__name">End mills tab name</span>
        <input className="field" dir="auto" value={tab} onChange={(e) => setTab(e.target.value)} />
      </label>
      <label className="ctl">
        <span className="ctl__name">Low stock below (m² per thickness)</span>
        <input className="field num" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        Save
      </button>
    </form>
  )
}
