import { useMemo, useState } from 'react'
import { reservePiece } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { sizeLabel, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { Sheet, useToast } from './ui'

export function ReserveSheet({
  piece,
  plannedLength,
  onClose,
}: {
  piece: Piece | null
  plannedLength: number | null
  onClose: () => void
}) {
  const { session, userId, name, signIn } = useAuth()
  const { pieces, upsertLocal } = useStore()
  const toast = useToast()
  const [forWhat, setForWhat] = useState(() => {
    try {
      return localStorage.getItem('reserve-for') ?? ''
    } catch {
      return ''
    }
  })
  const [len, setLen] = useState(plannedLength ? String(plannedLength) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mechanisms people already reserve for, so the name is one tap away.
  const recent = useMemo(
    () => [...new Set(pieces.map((p) => p.reserved_for).filter(Boolean) as string[])].slice(0, 12),
    [pieces],
  )

  const submit = async () => {
    if (!piece || !userId || !name) return
    setBusy(true)
    setError(null)
    const res = await reservePiece(piece.id, { userId, name }, forWhat.trim(), len ? Number(len) : null)
    setBusy(false)
    if (res.error) return setError(res.error)
    try {
      localStorage.setItem('reserve-for', forWhat.trim())
    } catch {
      /* ignore */
    }
    upsertLocal(res.piece!)
    toast(`${piece.id} reserved`)
    onClose()
  }

  return (
    <Sheet open={!!piece} onClose={onClose} title={piece ? `Reserve ${piece.id}` : ''}>
      {piece && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="soft num">
            {sizeLabel(piece)} · {piece.length} mm · {piece.material}
          </p>
          {!session ? (
            <>
              <p>Sign in with your Google account to reserve. You stay signed in after that.</p>
              <button type="button" className="q-btn q-btn--main q-btn--wide" onClick={() => signIn()}>
                Sign in with Google
              </button>
            </>
          ) : (
            <>
              <label className="ctl">
                <span className="ctl__name">For which mechanism</span>
                <input
                  className="field"
                  list="reserve-for-list"
                  value={forWhat}
                  onChange={(e) => setForWhat(e.target.value)}
                  placeholder="Elevator, intake, arm..."
                  data-autofocus
                />
                <datalist id="reserve-for-list">
                  {recent.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </label>
              <label className="ctl">
                <span className="ctl__name">Planned length (mm), optional</span>
                <input className="field num" inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} />
              </label>
              <p className="soft small">The final length comes from the drawing when the part is made.</p>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="q-btn q-btn--main q-btn--wide" disabled={busy}>
                {busy ? 'Reserving' : `Reserve ${piece.id}`}
              </button>
            </>
          )}
        </form>
      )}
    </Sheet>
  )
}
