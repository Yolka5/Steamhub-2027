import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { LoadError, Sheet, useToast } from '../components/ui'
import { uploadPhoto } from '../lib/actions'
import { useWho } from '../lib/auth'
import { ago } from '../lib/mfg'
import {
  addPlate,
  codeMatches,
  codeQuery,
  localNextCode,
  MATERIALS,
  plateArea,
  setPlatePhoto,
  setPlateState,
  STATE_WORD,
  tText,
  usePlates,
  useSheetSetting,
  type Plate,
  type PlateState,
} from '../lib/plates'

// CNC plate stock. Every plate has a number written on it (AL-007, PC-002, WD-013), given when it's
// added, like tube stock. Found by number, or by material, thickness and size. The CNC team taps
// Partly used or Gone after a cut. A photo of each plate is optional, taken straight from the camera.

const STATES: PlateState[] = ['available', 'partly_used', 'gone']

export default function Plates() {
  const { plates, loading, error, setPlates, reload } = usePlates()
  const { setting } = useSheetSetting()
  const who = useWho()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const t = params.get('t')
  const material = params.get('mat')
  const showGone = params.get('gone') === '1'
  const search = params.get('q') ?? ''
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<Plate | null>(null)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const materials = useMemo(() => [...new Set(plates.map((p) => p.material))].sort(), [plates])
  const inMaterial = plates.filter((p) => !material || p.material === material)

  // One card per material and thickness: how many usable plates and how much area.
  const sums = useMemo(() => {
    const by = new Map<string, { mat: string; t: number; n: number; partly: number; m2: number }>()
    for (const p of inMaterial) {
      if (p.state === 'gone') continue
      const k = `${p.material}|${p.thickness}`
      const s = by.get(k) ?? { mat: p.material, t: p.thickness, n: 0, partly: 0, m2: 0 }
      s.n++
      if (p.state === 'partly_used') s.partly++
      // A partly used plate counts for half: there's some left, nobody knows how much.
      s.m2 += plateArea(p) * (p.state === 'partly_used' ? 0.5 : 1)
      by.set(k, s)
    }
    return [...by.values()].sort((a, b) => MATERIALS.indexOf(a.mat as never) - MATERIALS.indexOf(b.mat as never) || a.t - b.t)
  }, [inMaterial])

  // A number typed in the search finds that plate wherever it is, gone ones too.
  const cq = codeQuery(search)
  const list = cq
    ? plates.filter((p) => codeMatches(p.code, cq))
    : inMaterial
        .filter((p) => !t || p.thickness === Number(t))
        .filter((p) => showGone || p.state !== 'gone')
        .sort((a, b) => a.thickness - b.thickness || plateArea(a) - plateArea(b) || (a.code ?? '').localeCompare(b.code ?? ''))

  const low = setting?.low_m2 ?? 0.5

  const shoot = async (p: Plate, file: File | undefined) => {
    if (!file || !who) return
    toast('Uploading photo')
    const res = await setPlatePhoto(p.id, file, who)
    if (res.error) return toast(`Photo failed: ${res.error}`)
    setPlates((cur) => cur.map((x) => (x.id === p.id ? { ...x, photo_url: res.data!.photo_url } : x)))
    toast('Photo saved')
  }

  const change = async (p: Plate, state: PlateState) => {
    if (!who || p.state === state) return
    const res = await setPlateState(p.id, state, who)
    if (res.error) return toast(res.error)
    setPlates((cur) => cur.map((x) => (x.id === p.id ? { ...res.data!, thickness: x.thickness, length: x.length, width: x.width } : x)))
    // A plate marked Gone leaves the list, so a slip needs a way back.
    toast(`${p.code ?? `${Number(p.length)} × ${Number(p.width)}`} marked ${STATE_WORD[state].toLowerCase()}`, { undo: () => change({ ...p, state }, p.state) })
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Plates</h1>
        <div className="page__actions">
          <Link to="/stock/end-mills" className="q-btn">
            End mills
          </Link>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            Add plate
          </button>
        </div>
      </div>

      {plates.length > 0 && (
        <input
          className="field plates-search num"
          type="search"
          enterKeyHint="search"
          placeholder="Plate number, like AL-7"
          aria-label="Find a plate by its number"
          value={search}
          onChange={(e) => set('q', e.target.value)}
        />
      )}

      {!cq && materials.length > 1 && (
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
          <p className="soft">Add plates as you count them. Each gets a number to write on it; a photo is optional.</p>
        </div>
      ) : (
        <>
          {!cq && (
            <div className="plate-sums">
              {sums.map((s) => (
                <button
                  key={`${s.mat}|${s.t}`}
                  type="button"
                  className="plate-sum"
                  aria-pressed={t === String(s.t) && (!material || material === s.mat)}
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    if (t === String(s.t)) next.delete('t')
                    else {
                      next.set('t', String(s.t))
                      if (materials.length > 1) next.set('mat', s.mat)
                    }
                    setParams(next, { replace: true })
                  }}
                >
                  <span className="plate-sum__t num">{tText(s.t)} mm</span>
                  {!material && materials.length > 1 && <span className="small strong">{s.mat}</span>}
                  <span className="soft small num">
                    {s.n} {s.n === 1 ? 'plate' : 'plates'}
                    {s.partly ? `, ${s.partly} partly used` : ''}
                  </span>
                  <span className="plate-sum__m2 num">{s.m2.toFixed(2)} m²</span>
                  {s.m2 < low && <span className="tag tag--reserved">Low stock</span>}
                </button>
              ))}
            </div>
          )}

          <div className="mfg-bar-head plates-head">
            <h2 className="section__title">
              {cq ? 'Found' : t ? `${tText(Number(t))} mm${material ? ` ${material}` : ''}` : material ? `All ${material.toLowerCase()}` : 'All plates'}
            </h2>
            {!cq && (
              <label className="check">
                <input type="checkbox" checked={showGone} onChange={(e) => set('gone', e.target.checked ? '1' : null)} />
                Show gone
              </label>
            )}
          </div>
          {cq && list.length === 0 && <p className="empty">No plate with that number.</p>}
          <ul className="rows">
            {list.map((p) => (
              <li key={p.id} className="row plate-row" data-state={p.state}>
                {p.photo_url ? (
                  <button type="button" className="plate-row__photo" aria-label="See photo" onClick={() => setViewing(p)}>
                    <img src={p.photo_url} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  </button>
                ) : (
                  <label className="plate-row__photo plate-row__photo--add" aria-label="Take a photo">
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => shoot(p, e.target.files?.[0])} />
                    <Icon name="camera" size={18} />
                  </label>
                )}
                <span className="plate-row__size num">
                  <strong>
                    {p.code && <span className="plate-row__code">{p.code}</span>}
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
        {adding && (
          <AddPlate
            plates={plates}
            start={material && MATERIALS.includes(material as never) ? material : 'Aluminum'}
            onSaved={(p) => setPlates((cur) => [...cur.filter((x) => x.id !== p.id), p])}
            onDone={() => setAdding(false)}
          />
        )}
      </Sheet>
      <Sheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.code ? `${viewing.code} · ` : ''}${Number(viewing.length)} × ${Number(viewing.width)} · ${tText(viewing.thickness)} mm ${viewing.material}` : ''}
      >
        {viewing?.photo_url && (
          <div className="form">
            <img className="plate-photo" src={viewing.photo_url} alt="" />
            <label className="photo-btn">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={async (e) => {
                  await shoot(viewing, e.target.files?.[0])
                  setViewing(null)
                }}
              />
              <Icon name="camera" size={22} />
              <span>New photo</span>
            </label>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/**
 * One plate at a time, like Add stock: the button shows the number it will get, and after saving
 * the number to write on the plate stays up. Material, thickness and new/used carry over to the next
 * plate; size and photo start empty.
 */
function AddPlate({ plates, start, onSaved, onDone }: { plates: Plate[]; start: string; onSaved: (p: Plate) => void; onDone: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [material, setMaterial] = useState(start)
  const [used, setUsed] = useState(false)
  const [thickness, setThickness] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Plate[]>([])

  const code = localNextCode(plates, material)
  const [th, l, w] = [thickness, length, width].map((v) => Number(v.replace(',', '.')))
  const problem = !(th > 0) ? 'Type the thickness' : !(l > 0) ? 'Type the length' : !(w > 0) ? 'Type the width' : null

  const save = async () => {
    if (problem) return toast(problem)
    if (busy || !who) return
    setBusy(true)
    try {
      let photo_url: string | null = null
      if (photo) {
        const up = await uploadPhoto(`plate-${code}`, photo).catch((e) => ({ url: undefined, error: e instanceof Error ? e.message : String(e) }))
        if (up.url) photo_url = up.url
        else toast(`The photo failed (${up.error}), saving without it`)
      }
      const res = await addPlate(
        {
          material,
          thickness: th,
          length: Math.max(l, w),
          width: Math.min(l, w),
          state: used ? 'partly_used' : 'available',
          source: 'manual',
          photo_url,
          updated_by: who.userId,
          updated_by_name: who.name,
        } as Partial<Plate>,
        code,
      )
      if (res.error || !res.plate) return toast(res.error ?? 'Could not save')
      onSaved(res.plate)
      setSaved((cur) => [res.plate!, ...cur])
      setLength('')
      setWidth('')
      setPhoto(null)
      toast(`${res.plate.code} saved`)
    } finally {
      setBusy(false)
    }
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
        {MATERIALS.map((m) => (
          <button key={m} type="button" role="radio" className="pick" aria-checked={material === m} onClick={() => setMaterial(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="picks picks--seg" role="radiogroup" aria-label="New or used">
        {[false, true].map((u) => (
          <button key={String(u)} type="button" role="radio" className="pick" aria-checked={used === u} onClick={() => setUsed(u)}>
            {u ? 'Already used' : 'New'}
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
      </div>
      <label className="photo-btn">
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        {photoUrl ? <img src={photoUrl} alt="New plate" className="photo-btn__preview" /> : <Icon name="camera" size={22} />}
        <span>
          {photo ? 'Retake photo' : 'Add a photo'} <span className="soft">optional</span>
        </span>
      </label>

      {saved[0] && (
        <div className="written">
          <span className="soft">Write on the plate</span>
          <span className="written__id num">
            {saved[0].code} · {Number(saved[0].length)} × {Number(saved[0].width)}
          </span>
        </div>
      )}
      <button type="submit" className="q-btn q-btn--main q-btn--wide q-btn--big" data-waiting={problem ? true : undefined} disabled={busy}>
        {busy ? 'Saving' : `Save as ${code}`}
      </button>
      {saved.length > 0 && (
        <button type="button" className="q-btn q-btn--wide" onClick={onDone}>
          Done
        </button>
      )}
      {saved.length > 1 && (
        <section className="section">
          <h2 className="section__title">Added just now</h2>
          <ul className="rows">
            {saved.slice(1).map((p) => (
              <li key={p.id} className="row">
                <span className="num strong">{p.code}</span>
                <span className="num soft">
                  {tText(p.thickness)} mm {p.material}
                </span>
                <span className="num row__end">
                  {Number(p.length)} × {Number(p.width)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  )
}
