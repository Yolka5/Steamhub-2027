import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { partName, partNo, stockLength } from '../lib/mfg'
import { KERF, sizeLabel, type Piece } from '../lib/stock'
import { cutByHand } from '../lib/stockLinks'
import { useStore } from '../lib/store'
import type { PieceUser } from '../pages/Piece'
import { Select } from './Select'
import { Sheet, useBusy, useToast } from './ui'

// The part is made. The final length comes from the drawing, never from the reservation,
// so the field starts empty. Afterwards the new length is shown big so it gets rewritten on the piece.
// A piece linked to Manufacturing parts asks which part the cut is for; while other parts still
// need it, the leftover stays reserved for them.

export function CutSheet({ piece, users = [], onClose }: { piece: Piece | null; users?: PieceUser[]; onClose: () => void }) {
  const { userId, name } = useAuth()
  const { upsertLocal } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, run] = useBusy()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; leftover: number; kept: boolean } | null>(null)
  const [forId, setForId] = useState('')
  const forPart = users.find((u) => u.id === forId) ?? null

  const final = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(final) && final > 0 && piece != null && final <= piece.length
  const leftover = piece && valid ? Math.max(0, Math.round((piece.length - final - KERF) * 10) / 10) : null

  const close = () => {
    setText('')
    setError(null)
    setDone(null)
    setForId('')
    onClose()
  }

  const submit = () =>
    run(async () => {
      if (!piece || !valid || !userId || !name) return
      setError(null)
      const res = await cutByHand(piece, final, forPart, users, { userId, name })
      if (res.error) return setError(res.error)
      upsertLocal(res.piece!)
      toast(`${piece.id} cut`)
      setDone({ id: piece.id, leftover: res.leftover!, kept: res.piece!.status === 'reserved' })
    })

  return (
    <Sheet open={!!piece} onClose={close} title={done ? `${done.id} is cut` : piece ? `Cut ${piece.id}` : ''}>
      {done ? (
        <div className="form">
          {done.leftover > 0 ? (
            <>
              <p>Cross out the old length and write this on the piece:</p>
              <p className="cut__big num">
                {done.id} · {done.leftover} mm
              </p>
              <p className="soft small">{done.kept ? 'It stays reserved for the parts still to be cut from it.' : "It's back in stock as Available."}</p>
            </>
          ) : (
            <p>Nothing left over, so {done.id} is marked used.</p>
          )}
          <button type="button" className="q-btn q-btn--main q-btn--wide" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        piece && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <p className="soft num">
              {sizeLabel(piece)} · {piece.length} mm{piece.reserved_for ? ` · for ${piece.reserved_for}` : ''}
            </p>
            {users.length > 0 && (
              <label className="ctl">
                <span className="ctl__name">For which part</span>
                <Select
                  value={forId}
                  onChange={(v) => {
                    setForId(v)
                    const u = users.find((x) => x.id === v)
                    if (u) setText(String(stockLength(u)))
                  }}
                  options={[{ value: '', label: 'Something else' }, ...users.map((u) => ({ value: u.id, label: `${partNo(u)} ${partName(u)}, ${stockLength(u)} mm` }))]}
                />
              </label>
            )}
            <label className="ctl">
              <span className="ctl__name">Final length from the drawing (mm)</span>
              <input
                className="field num"
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={piece.planned_length ? `Planned ${piece.planned_length}` : undefined}
                data-autofocus
              />
            </label>
            <p className="soft small">
              {leftover == null
                ? `${KERF} mm is taken off for the saw cut.`
                : leftover > 0
                  ? users.some((u) => u.id !== forId)
                    ? `${leftover} mm stays reserved as ${piece.id} for the other parts (after ${KERF} mm for the saw cut).`
                    : `${leftover} mm goes back to stock as ${piece.id} (after ${KERF} mm for the saw cut).`
                  : 'Nothing left over, so the piece is marked used.'}
            </p>
            {text.trim() !== '' && !valid && <p className="error">That's longer than the piece.</p>}
            {error && <p className="error">{error}</p>}
            <button type="submit" className="q-btn q-btn--main q-btn--wide" disabled={busy || !valid}>
              {busy ? 'Saving' : 'Cut it'}
            </button>
          </form>
        )
      )}
    </Sheet>
  )
}
