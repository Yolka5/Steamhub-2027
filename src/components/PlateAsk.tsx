import { useCallback, useRef, useState } from 'react'
import { useWho } from '../lib/auth'
import { plateThickness, type Part } from '../lib/mfg'
import { cutFromPlate, fitGroups, plateArea, platesAt, tText, type Plate, type PlateState } from '../lib/plates'
import { Sheet, useToast } from './ui'

// Done on a CNC part asks which plate it came from, so Plates stays right without anyone
// remembering to open it. Only when a plate in stock fits and the part has none recorded yet.
// Skip is always fine: the part is already done.

export function usePlateAsk() {
  const who = useWho()
  const toast = useToast()
  const [asking, setAsking] = useState<{ part: Part; fits: { plate: Plate; n: number }[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const onPart = useRef<((p: Part) => void) | null>(null)

  /** Call after a part is saved as done. `put` gets the part once it remembers its plate. */
  const after = useCallback(async (part: Part, put?: (p: Part) => void) => {
    if (part.machine !== 'CNC' || part.plate_id || part.status !== 'done' || !part.size?.length) return
    const size = part.size.map(Number)
    const fits = fitGroups(await platesAt(plateThickness(size)), size)
    if (!fits.length) return
    onPart.current = put ?? null
    setAsking({ part, fits })
  }, [])

  const close = () => {
    setAsking(null)
    setBusy(false)
  }

  const pick = async (plate: Plate, state: PlateState) => {
    if (!asking || !who || busy) return
    setBusy(true)
    const res = await cutFromPlate(asking.part, plate, state, who)
    close()
    if (res.error) return toast(res.error)
    if (res.part) onPart.current?.(res.part)
    const put = onPart.current
    toast(state === 'gone' ? `Plate ${plate.length} × ${plate.width} marked gone` : `Plate ${plate.length} × ${plate.width} marked partly used`, {
      undo: async () => {
        const back = await res.undo!()
        if (back) put?.(back)
      },
    })
  }

  const t = asking ? tText(plateThickness(asking.part.size.map(Number))) : ''
  const sheet = (
    <Sheet open={!!asking} onClose={close} title={asking ? `Which plate was ${asking.part.part_no} cut from?` : ''}>
      {asking && (
        <div className="plate-ask">
          <p className="soft small num">
            {t} mm plates that fit, partly used first. Tap what's left of it, so Plates stays right.
          </p>
          <ul className="plate-ask__list">
            {asking.fits.map(({ plate: pl, n }) => (
              <li key={pl.id} className="stock-pick__row">
                <span className="num">
                  <strong>
                    {pl.length} × {pl.width}
                  </strong>{' '}
                  <span className="soft">
                    {pl.state === 'partly_used' ? 'partly used' : `${plateArea(pl).toFixed(2)} m²`}
                    {n > 1 ? ` · ${n} like it` : ''}
                  </span>
                </span>
                <span className="stock-pick__btns">
                  <button type="button" className="q-btn q-btn--small" onClick={() => pick(pl, 'partly_used')}>
                    Some left
                  </button>
                  <button type="button" className="q-btn q-btn--small" onClick={() => pick(pl, 'gone')}>
                    Used up
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="q-btn plate-ask__skip" onClick={close}>
            Skip, not from these
          </button>
        </div>
      )}
    </Sheet>
  )

  return { after, sheet }
}
