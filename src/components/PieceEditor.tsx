import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deletePiece, updatePiece } from '../lib/actions'
import { KINDS, KIND_ORDER, type Kind, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { useToast } from './ui'
import { Select } from './Select'

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const str = (n: number | null) => (n == null ? '' : String(n))

/** Fix anything about a piece: size, length, material, note. Deleting asks twice. */
export function PieceEditor({ piece, who, onDone }: { piece: Piece; who: { userId: string; name: string }; onDone: () => void }) {
  const { materials, upsertLocal, reload } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [kind, setKind] = useState<Kind>(piece.kind)
  const [dims, setDims] = useState({ a: str(piece.a), b: str(piece.b), wall: str(piece.wall), inner_d: str(piece.inner_d) })
  const [length, setLength] = useState(String(piece.length))
  const [material, setMaterial] = useState(piece.material ?? '')
  const [notes, setNotes] = useState(piece.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const fields = KINDS[kind].fields

  const save = async () => {
    const len = num(length)
    if (!len || len <= 0) return toast('Length has to be a number')
    const a = num(dims.a)
    const inner = fields.some((f) => f.key === 'inner_d') ? num(dims.inner_d) : null
    const patch: Partial<Piece> = {
      kind: kind === 'round_tube' && inner == null ? 'round_rod' : kind,
      a,
      b: fields.some((f) => f.key === 'b') ? num(dims.b) : null,
      wall: kind === 'round_tube' && a != null && inner != null ? +((a - inner) / 2).toFixed(2) : fields.some((f) => f.key === 'wall') ? num(dims.wall) : null,
      inner_d: inner,
      length: len,
      material: material || null,
      notes: notes.trim() || null,
    }
    setBusy(true)
    const res = await updatePiece(piece.id, patch, who)
    setBusy(false)
    if (res.error) return toast(res.error)
    upsertLocal(res.piece!)
    toast('Saved')
    onDone()
  }

  const remove = async () => {
    setBusy(true)
    const res = await deletePiece(piece.id)
    setBusy(false)
    if (res.error) return toast(res.error)
    await reload()
    toast(`${piece.id} deleted`)
    navigate('/stock')
  }

  return (
    <form
      className="form piece-edit"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label="Shape">
        {KIND_ORDER.filter((k) => k !== 'round_rod').map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            className="pick"
            aria-checked={kind === k || (k === 'round_tube' && kind === 'round_rod')}
            onClick={() => setKind(k)}
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
            </span>
            <input className="field num" inputMode="decimal" value={dims[f.key]} onChange={(e) => setDims((d) => ({ ...d, [f.key]: e.target.value }))} />
          </label>
        ))}
        <label className="ctl">
          <span className="ctl__name">Length (mm)</span>
          <input className="field num" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
        </label>
      </div>
      <label className="ctl">
        <span className="ctl__name">Material</span>
        <Select value={material} onChange={setMaterial} options={[{ value: '', label: 'Unknown' }, ...materials.map((m) => ({ value: m.name, label: m.name }))]} />
      </label>
      <label className="ctl">
        <span className="ctl__name">Note</span>
        <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="piece-edit__actions">
        <button type="submit" className="q-btn q-btn--main" disabled={busy}>
          Save changes
        </button>
        <button type="button" className="q-btn" onClick={onDone}>
          Cancel
        </button>
        {confirmDelete ? (
          <button type="button" className="q-btn q-btn--danger" disabled={busy} onClick={remove}>
            Delete {piece.id} for good
          </button>
        ) : (
          <button type="button" className="text-btn text-btn--danger" onClick={() => setConfirmDelete(true)}>
            Delete piece
          </button>
        )}
      </div>
    </form>
  )
}
