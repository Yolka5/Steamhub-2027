import { useEffect, useMemo, useRef, useState } from 'react'
import { StockRender } from '../components/StockRender'
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
// the cross-section stays filled in between pieces so a batch is length, save. A photo is
// optional: every piece is drawn from its profile and length.

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

/**
 * Why this piece can't be saved yet, or null when it can. Typing is never blocked; the save
 * button says what's missing, so a slip like an ID bigger than the OD never reaches the list.
 */
function checkPiece(kind: Kind, dims: Dims, length: string): string | null {
  const fields = KINDS[kind].fields
  for (const f of fields) {
    const v = num(dims[f.key])
    if (v == null) {
      if (f.key === 'inner_d') continue
      return `Type the ${f.label.toLowerCase()}`
    }
    if (!Number.isFinite(v) || v <= 0) return `${f.label} has to be a number above 0`
  }
  const a = num(dims.a)!
  const inner = num(dims.inner_d)
  const wall = num(dims.wall)
  if (inner != null && inner >= a) return `${kind === 'hex' ? 'Bore' : 'ID'} has to be smaller than ${kind === 'hex' ? 'across flats' : 'OD'}`
  if ((kind === 'rect_tube' || kind === 'angle') && wall != null) {
    const b = num(dims.b)!
    if (kind === 'rect_tube' && wall * 2 >= Math.min(a, b)) return 'Wall is too thick for that profile'
    if (kind === 'angle' && wall >= Math.min(a, b)) return 'Thickness has to be less than the legs'
  }
  if (kind === 'flat' && wall != null && wall > a) return 'Thickness is more than the width'
  const len = num(length)
  if (len == null) return 'Type the length'
  if (!Number.isFinite(len) || len <= 0) return 'Length has to be a number above 0'
  return null
}

export default function AddStock() {
  const { userId, name } = useAuth()
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
  // One preview URL per photo, freed when the photo changes, not a new one on every keystroke.
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])
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
  const problem = checkPiece(kind, dims, length)
  const ready = problem == null

  /** The piece as typed so far. Used for the save and for the drawing preview. */
  const rowOf = () => {
    const a = num(dims.a)
    const inner = fields.some((f) => f.key === 'inner_d') ? num(dims.inner_d) : null
    return {
      kind: kind === 'round_tube' && inner == null ? ('round_rod' as Kind) : kind,
      material,
      a,
      b: fields.some((f) => f.key === 'b') ? num(dims.b) : null,
      wall: kind === 'round_tube' && a != null && inner != null ? +((a - inner) / 2).toFixed(2) : num(dims.wall),
      inner_d: inner,
      length: num(length) ?? 0,
      location: location || null,
      notes: notes.trim() || null,
    }
  }

  // The drawing checks the profile as you type it, so a photo isn't needed to tell pieces apart.
  const draft = rowOf()
  const preview: Piece | null =
    draft.a != null && draft.a > 0
      ? ({ ...draft, id, length: draft.length > 0 ? draft.length : 500, status: 'available', photo_url: null } as unknown as Piece)
      : null

  // A ref, not the busy state: a double tap lands before the button re-renders as disabled, and
  // used to save the same piece twice under two IDs.
  const saving = useRef(false)
  const save = async () => {
    if (!userId || !name || !ready || saving.current) return
    saving.current = true
    try {
      await saveNow(userId, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const saveNow = async (userId: string, name: string) => {
    setBusy(true)
    setError(null)
    const row = rowOf()
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
      const up = await uploadPhoto(newId, photo).catch((e) => ({ url: undefined, error: e instanceof Error ? e.message : String(e) }))
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

        {preview && (
          <div className="add-preview" aria-live="polite">
            <StockRender piece={preview} />
            <span className="soft small num">
              {sizeLabel(preview)}
              {num(length) ? ` · ${num(length)} mm` : ' · type the length'}
            </span>
          </div>
        )}

        <label className="photo-btn">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          {photoUrl ? (
            <img src={photoUrl} alt="New piece" className="photo-btn__preview" />
          ) : (
            <Icon name="camera" size={22} />
          )}
          <span>
            {photo ? 'Retake photo' : 'Add a photo'} <span className="soft">optional</span>
          </span>
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
            <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label="Location">
              <Indicator />
              {['', ...locations].map((l) => (
                <button key={l || 'none'} type="button" role="radio" className="pick" aria-checked={location === l} onClick={() => setLocation(l)}>
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
        {/* Only once something is typed: an empty form doesn't need telling it's empty. */}
        {problem && (dims.a || length) && <p className="soft small" aria-live="polite">{problem}</p>}
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
