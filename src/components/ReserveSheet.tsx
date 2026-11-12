import { useMemo, useState } from 'react'
import { reservePiece } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { sizeLabel, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { matchStock } from '../lib/stockLinks'
import { useRobots } from '../lib/useMfg'
import { Sheet, useBusy, useToast } from './ui'
import { Combo, Select } from './Select'

export function ReserveSheet({
  piece,
  plannedLength,
  onClose,
}: {
  piece: Piece | null
  plannedLength: number | null
  onClose: () => void
}) {
  const { userId, name } = useAuth()
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
  // The subsystem comes from Manufacturing's list, so stock, weight and parts all agree on names.
  const { robots, subs } = useRobots()
  const active = robots.filter((r) => !r.archived)
  const [subId, setSubId] = useState(() => {
    try {
      return localStorage.getItem('reserve-sub') ?? ''
    } catch {
      return ''
    }
  })
  const sub = subs.find((s) => s.id === subId && active.some((r) => r.id === s.robot_id))
  const [busy, run] = useBusy()
  const [error, setError] = useState<string | null>(null)

  // Mechanisms people already reserve for, so the name is one tap away.
  const recent = useMemo(
    () => [...new Set(pieces.map((p) => p.reserved_for).filter(Boolean) as string[])].slice(0, 12),
    [pieces],
  )

  const submit = () => run(() => reserve())
  const reserve = async () => {
    if (!piece || !userId || !name) return
    setError(null)
    const label = sub ? `${sub.number} ${sub.name}` : forWhat.trim()
    const planned = len ? Number(len.replace(',', '.')) : null
    const res = await reservePiece(piece.id, { userId, name }, label, planned != null && Number.isFinite(planned) && planned > 0 ? planned : null, sub?.id ?? null)
    if (res.error) return setError(res.error)
    try {
      localStorage.setItem('reserve-for', forWhat.trim())
      localStorage.setItem('reserve-sub', sub?.id ?? '')
    } catch {
      /* ignore */
    }
    upsertLocal(res.piece!)
    onClose()
    // Parts already uploaded for the subsystem pick it up now, not at the next upload.
    if (sub) {
      const m = await matchStock(sub, { userId, name }).catch(() => null)
      if (m?.linked) return toast(`${piece.id} reserved and linked to ${m.linked} ${m.linked === 1 ? 'part' : 'parts'} in ${sub.number} ${sub.name}`)
    }
    toast(`${piece.id} reserved`)
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
          {active.length > 0 && (
            <label className="ctl">
              <span className="ctl__name">For which subsystem</span>
              <Select
                value={sub ? sub.id : ''}
                onChange={setSubId}
                autoFocus
                options={[
                  { value: '', label: 'Something else' },
                  ...active.flatMap((r) => subs.filter((s) => s.robot_id === r.id).map((s) => ({ value: s.id, label: `${s.number} ${s.name}`, group: r.name }))),
                ]}
              />
            </label>
          )}
          {!sub && (
            <label className="ctl">
              <span className="ctl__name">{active.length ? 'What for' : 'For which mechanism'}</span>
              <Combo value={forWhat} onChange={setForWhat} options={recent} placeholder="Elevator, intake, arm..." />
            </label>
          )}
          <label className="ctl">
            <span className="ctl__name">Planned length (mm), optional</span>
            <input className="field num" inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} />
          </label>
          <p className="soft small">The final length comes from the drawing when the part is made.</p>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="q-btn q-btn--main q-btn--wide" disabled={busy}>
            {busy ? 'Reserving' : `Reserve ${piece.id}`}
          </button>
        </form>
      )}
    </Sheet>
  )
}
