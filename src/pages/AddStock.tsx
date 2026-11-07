import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Indicator } from '../components/Indicator'
import { LocationsEditor } from '../components/LocationsEditor'
import { useToast } from '../components/ui'
import { addPiece, nextId, updatePiece, uploadPhoto } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { KINDS, KIND_ORDER, sizeLabel, type Kind, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { Select } from '../components/Select'

// Built for a phone in one hand and a caliper in the other: big fields, numeric keyboards,
// the cross-section stays filled in between pieces so a batch is length, photo, save.

type Dims = { a: string; b: string; wall: string; inner_d: string }
const EMPTY: Dims = { a: '', b: '', wall: '', inner_d: '' }

function localNextId(pieces: Piece[], prefix: string) {
  let max = 0
  for (const p of pieces) {
    if (p.id.startsWith(prefix + '-')) max = Math.max(max, Number(p.id.slice(prefix.length + 1)) || 0)
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

export default function AddStock() {
  const { session, userId, name, signIn } = useAuth()
  const { pieces, materials, locations, upsertLocal } = useStore()
  const toast = useToast()
  const lengthRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<Kind>('round_tube')
  const [dims, setDims] = useState<Dims>(EMPTY)
  const [length, setLength] = useState('')
  const [material, setMaterial] = useState('Aluminum 6061-T6')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Piece[]>([])
  const [editingPlaces, setEditingPlaces] = useState(false)

  const prefix = KINDS[kind].prefix
  const id = localNextId(pieces, prefix)

  // Cross-sections added most recently, one chip each.
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Piece[] = []
    for (const p of [...pieces].sort((x, y) => y.created_at.localeCompare(x.created_at) || y.id.localeCompare(x.id))) {
      const key = `${p.kind}|${p.a}|${p.b}|${p.wall}|${p.inner_d}|${p.material}`
      if (seen.has(key) || p.a == null) continue
      seen.add(key)
      out.push(p)
      if (out.length === 6) break
    }
    return out
  }, [pieces])

  const pickRecent = (p: Piece) => {
    setKind(p.kind)
    setDims({
      a: p.a?.toString() ?? '',
      b: p.b?.toString() ?? '',
      wall: p.kind === 'round_tube' ? '' : (p.wall?.toString() ?? ''),
      inner_d: p.inner_d?.toString() ?? '',
    })
    if (p.material) setMaterial(p.material)
    lengthRef.current?.focus()
  }

  const fields = KINDS[kind].fields
  const ready = num(length) != null && num(length)! > 0 && fields.every((f) => f.key === 'inner_d' || num(dims[f.key]) != null)

  const save = async () => {
    if (!userId || !name || !ready) return
    setBusy(true)
    setError(null)
    const a = num(dims.a)
    const inner = fields.some((f) => f.key === 'inner_d') ? num(dims.inner_d) : null
    const row = {
      kind: kind === 'round_tube' && inner == null ? ('round_rod' as Kind) : kind,
      material,
      a,
      b: fields.some((f) => f.key === 'b') ? num(dims.b) : null,
      wall: kind === 'round_tube' && a != null && inner != null ? +((a - inner) / 2).toFixed(2) : num(dims.wall),
      inner_d: inner,
      length: num(length)!,
      location: location || null,
      notes: notes.trim() || null,
    }
    let newId = id
    let res = await addPiece({ ...row, id: newId }, { userId, name })
    if (res.error === 'duplicate') {
      // Someone else saved the same ID a moment ago.
      newId = await nextId(prefix)
      res = await addPiece({ ...row, id: newId }, { userId, name })
    }
    if (res.error || !res.piece) {
      setBusy(false)
      return setError(res.error ?? 'Could not save')
    }
    let piece = res.piece
    if (photo) {
      const up = await uploadPhoto(newId, photo)
      const withPhoto = up.url ? await updatePiece(newId, { photo_url: up.url }, { userId, name }) : null
      if (withPhoto?.piece) piece = withPhoto.piece
      else toast(`Saved, but the photo failed: ${up.error ?? withPhoto?.error}`)
    }
    upsertLocal(piece)
    setSaved((s) => [piece, ...s].slice(0, 5))
    setBusy(false)
    setLength('')
    setNotes('')
    setPhoto(null)
    toast(`${newId} saved`)
    lengthRef.current?.focus()
  }

  if (!session) {
    return (
      <div className="page page--narrow">
        <h1 className="page__title">Add stock</h1>
        <div className="shell">
          <p>Sign in with your Google account to add stock. You stay signed in after that.</p>
          <button type="button" className="q-btn q-btn--main q-btn--wide" onClick={() => signIn()}>
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Add stock</h1>
        <Link to="/stock" className="q-btn">
          Done
        </Link>
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {recent.length > 0 && (
          <div className="ctl">
            <span className="ctl__name">Recent sizes</span>
            <div className="chips">
              {recent.map((p) => (
                <button key={p.id} type="button" className="chip num" onClick={() => pickRecent(p)}>
                  {sizeLabel(p)}
                  <span className="soft"> {p.material?.replace('Aluminum ', '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label="Shape">
          <Indicator />
          {KIND_ORDER.filter((k) => k !== 'round_rod').map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              className="pick"
              aria-checked={kind === k || (k === 'round_tube' && kind === 'round_rod')}
              onClick={() => {
                setKind(k)
                setDims(EMPTY)
              }}
            >
              {k === 'round_tube' ? 'Round' : KINDS[k].label}
            </button>
          ))}
        </div>

        <div className="dims">
          {fields.map((f) => (
            <label key={f.key} className="ctl">
              <span className="ctl__name">
                {f.label} (mm){f.key === 'inner_d' && kind !== 'hex' ? ', empty if solid' : ''}
                {f.key === 'inner_d' && kind === 'hex' ? ', optional' : ''}
              </span>
              <input
                className="field field--big num"
                inputMode="decimal"
                value={dims[f.key]}
                onChange={(e) => setDims((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>

        <label className="ctl">
          <span className="ctl__name">Length (mm)</span>
          <input
            ref={lengthRef}
            className="field field--big num"
            inputMode="decimal"
            enterKeyHint="done"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </label>

        <label className="photo-btn">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          {photo ? (
            <img src={URL.createObjectURL(photo)} alt="New piece" className="photo-btn__preview" />
          ) : (
            <Icon name="camera" size={22} />
          )}
          <span>{photo ? 'Retake photo' : 'Take photo'}</span>
        </label>

        <details className="more">
          <summary>
            {material}
            {location ? ` · ${location}` : ''}
            {notes ? ' · note' : ''}
          </summary>
          <label className="ctl">
            <span className="ctl__name">Material</span>
            <Select value={material} onChange={setMaterial} options={materials.map((m) => ({ value: m.name, label: m.name }))} />
          </label>
          <div className="ctl">
            <span className="ctl__name ctl__row">
              Location
              <button type="button" className="text-btn" onClick={() => setEditingPlaces((v) => !v)}>
                {editingPlaces ? 'Done' : 'Edit places'}
              </button>
            </span>
            {editingPlaces && <LocationsEditor />}
            <div className="picks picks--seg picks--wrap">
              <Indicator />
              {['', ...locations].map((l) => (
                <button key={l || 'none'} type="button" className="pick" aria-checked={location === l} onClick={() => setLocation(l)}>
                  {l || 'Not set'}
                </button>
              ))}
            </div>
          </div>
          <label className="ctl">
            <span className="ctl__name">Note</span>
            <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </details>

        {saved[0] && (
          <div className="written">
            <span className="soft">Write on the piece</span>
            <span className="written__id num">
              {saved[0].id} · {saved[0].length}
            </span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="q-btn q-btn--main q-btn--wide q-btn--big" disabled={!ready || busy}>
          {busy ? 'Saving' : `Save as ${id}`}
        </button>
      </form>

      {saved.length > 1 && (
        <section className="section">
          <h2 className="section__title">Added just now</h2>
          <ul className="rows">
            {saved.slice(1).map((p) => (
              <li key={p.id}>
                <Link to={`/stock/${p.id}`} className="row">
                  <span className="num">{p.id}</span>
                  <span className="num soft">{sizeLabel(p)}</span>
                  <span className="num row__end">{p.length} mm</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
