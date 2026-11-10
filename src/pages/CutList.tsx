import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Photo } from '../components/PieceCard'
import { useToast } from '../components/ui'
import { reservePiece } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { KERF, fitsSection, parseLengths, parseQuery, planCuts, sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'
import { Working } from '../components/Working'
import { cutListWorking } from '../lib/workings'

// Every length a mechanism needs, matched to the fewest pieces in one go. The query lives in the
// URL, so a cut list can be shared with whoever is going to the saw.

export default function CutList() {
  const [params, setParams] = useSearchParams()
  const { pieces, upsertLocal } = useStore()
  const { session, userId, name, signIn } = useAuth()
  const toast = useToast()
  const [forWhat, setForWhat] = useState('')
  const [busy, setBusy] = useState(false)

  const size = params.get('size') ?? ''
  const lengthsText = params.get('len') ?? ''
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const q = useMemo(() => {
    const parsed = parseQuery(size)
    delete parsed.length
    return parsed
  }, [size])
  const lengths = useMemo(() => parseLengths(lengthsText), [lengthsText])
  const candidates = useMemo(
    () => (q.a == null ? [] : pieces.filter((p) => p.status === 'available' && fitsSection(q, p, 0.5))),
    [pieces, q],
  )
  const result = useMemo(() => planCuts(candidates, lengths), [candidates, lengths])
  const total = lengths.reduce((a, b) => a + b, 0)

  const reserveAll = async () => {
    if (!userId || !name) return
    setBusy(true)
    let ok = 0
    for (const plan of result.plans) {
      const planned = plan.cuts.reduce((a, b) => a + b, 0)
      const res = await reservePiece(plan.piece.id, { userId, name }, forWhat.trim(), planned)
      if (res.piece) {
        upsertLocal(res.piece)
        ok++
      }
    }
    setBusy(false)
    toast(ok === result.plans.length ? `${ok} pieces reserved` : `${ok} of ${result.plans.length} reserved, someone took the rest`)
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Cut list</h1>
        <Link to="/stock" className="q-btn">
          Back to stock
        </Link>
      </div>

      <div className="cut-inputs">
        <label className="ctl">
          <span className="ctl__name">Size</span>
          <input className="field field--big num" placeholder="20x40x1 or round 20/16" value={size} onChange={(e) => set('size', e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Lengths in mm, with a count if you need more than one</span>
          <input className="field field--big num" placeholder="700 x4, 350 x2, 120" value={lengthsText} onChange={(e) => set('len', e.target.value)} />
        </label>
      </div>

      {q.a != null && lengths.length > 0 && (
        <>
          <p className="finder__said soft">
            {lengths.length} cuts, {Math.round(total)} mm in total, from {candidates.length} matching pieces. Each cut takes {KERF} mm.
          </p>

          <Working id="cut-list" lines={cutListWorking(lengths, result.plans)} />

          {result.unplaced.length > 0 && (
            <p className="cut-missing">
              Not enough stock for: <strong className="num">{result.unplaced.join(', ')} mm</strong>. Order more or pick another size.
            </p>
          )}

          <div className="cut-plan">
            {result.plans.map((p) => (
              <article key={p.piece.id} className="cut-card">
                <Link to={`/stock/${p.piece.id}`} className="cut-card__photo">
                  <Photo piece={p.piece} width={240} />
                </Link>
                <div className="cut-card__body">
                  <div className="card__top">
                    <Link to={`/stock/${p.piece.id}`} className="card__id num">
                      {p.piece.id}
                    </Link>
                    <span className="soft small num">
                      {sizeLabel(p.piece)} · {p.piece.length} mm
                    </span>
                  </div>
                  {/* The piece drawn to scale: each cut, then what is left. */}
                  <div className="cut-bar" aria-label={`Cuts ${p.cuts.join(', ')} mm, ${Math.round(p.leftover)} mm left`}>
                    {p.cuts.map((c, i) => (
                      <span key={i} className="cut-bar__cut num" style={{ flexGrow: c }}>
                        {c}
                      </span>
                    ))}
                    {p.leftover > 0 && (
                      <span className="cut-bar__left num" style={{ flexGrow: p.leftover }}>
                        {p.leftover >= 60 ? Math.round(p.leftover) : ''}
                      </span>
                    )}
                  </div>
                  <span className="soft small num">
                    {p.leftover < 1 ? 'Used up exactly' : `${Math.round(p.leftover)} mm goes back to stock`}
                    {p.piece.location ? ` · ${p.piece.location}` : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {result.plans.length > 0 && (
            <div className="cut-reserve">
              {session ? (
                <>
                  <input className="field" placeholder="For which mechanism" value={forWhat} onChange={(e) => setForWhat(e.target.value)} />
                  <button type="button" className="q-btn q-btn--main" disabled={busy} onClick={reserveAll}>
                    {busy ? 'Reserving' : `Reserve these ${result.plans.length} pieces`}
                  </button>
                </>
              ) : (
                <button type="button" className="q-btn q-btn--main" onClick={() => signIn()}>
                  Sign in to reserve
                </button>
              )}
            </div>
          )}
        </>
      )}
      {q.a == null && <p className="soft">Type a size and the lengths you need. Steamhub picks the fewest, shortest pieces and shows where to cut.</p>}
    </div>
  )
}
