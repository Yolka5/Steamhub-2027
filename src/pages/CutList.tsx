import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Photo } from '../components/PieceCard'
import { useBusy, useToast } from '../components/ui'
import { reservePiece } from '../lib/actions'
import { useWho } from '../lib/auth'
import { KERF, fitsSection, parseLengths, parseQuery, planCuts, sizeLabel, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { useRobots } from '../lib/useMfg'
import { Combo, Select } from '../components/Select'
import { Working } from '../components/Working'
import { cutListWorking } from '../lib/workings'

// Every length a mechanism needs, matched to the fewest pieces in one go. The query lives in the
// URL, so a cut list can be shared with whoever is going to the saw.

export default function CutList() {
  const [params, setParams] = useSearchParams()
  const { pieces, upsertLocal } = useStore()
  const who = useWho()
  const toast = useToast()
  const [busy, run] = useBusy()
  // After Reserve, the list shows what was reserved, so a second tap can't take a second set.
  const [reserved, setReserved] = useState<{ pieces: Piece[]; plans: number[][]; for: string } | null>(null)

  const size = params.get('size') ?? ''
  const lengthsText = params.get('len') ?? ''
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setReserved(null)
  }

  // This field is only ever a size, so a single number ("12", "25.4") is the size, not a length.
  const q = useMemo(() => {
    const parsed = parseQuery(size)
    if (parsed.a == null && parsed.length != null) parsed.a = parsed.length
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

  const reserveAll = (forWhat: string, subId: string | null) => run(() => reserveNow(forWhat, subId))
  const reserveNow = async (forWhat: string, subId: string | null) => {
    if (!who) return
    const got: Piece[] = []
    const cuts: number[][] = []
    for (const plan of result.plans) {
      const planned = plan.cuts.reduce((a, b) => a + b, 0) + KERF * Math.max(0, plan.cuts.length - 1)
      const res = await reservePiece(plan.piece.id, who, forWhat, planned, subId)
      if (res.piece) {
        upsertLocal(res.piece)
        got.push(res.piece)
        cuts.push(plan.cuts)
      }
    }
    setReserved({ pieces: got, plans: cuts, for: forWhat })
    if (got.length < result.plans.length) toast(`${got.length} of ${result.plans.length} reserved. Someone took the rest.`)
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
          <input className="field field--big num" placeholder="20x40x1, round 20/16 or rod 12" value={size} onChange={(e) => set('size', e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Lengths in mm, with a count if you need more than one</span>
          <input className="field field--big num" placeholder="700 x4, 350 x2, 120" value={lengthsText} onChange={(e) => set('len', e.target.value)} />
        </label>
      </div>

      {reserved ? (
        <section className="section">
          <h2 className="section__title">
            Reserved {reserved.pieces.length} {reserved.pieces.length === 1 ? 'piece' : 'pieces'}
            {reserved.for ? ` for ${reserved.for}` : ''}
          </h2>
          <ul className="rows">
            {reserved.pieces.map((p, i) => (
              <li key={p.id}>
                <Link to={`/stock/${p.id}`} className="row">
                  <span className="num strong">{p.id}</span>
                  <span className="num soft">
                    {sizeLabel(p)} · {p.length} mm{p.location ? ` · ${p.location}` : ''}
                  </span>
                  <span className="row__end num">Cut {reserved.plans[i].join(', ')}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="soft small">Each piece gets cut on its own page, or from its part in Manufacturing.</p>
          <button type="button" className="q-btn" onClick={() => setReserved(null)}>
            Plan another cut list
          </button>
        </section>
      ) : (
        q.a != null &&
        lengths.length > 0 && (
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
                  {p.piece.photo_url && (
                    <Link to={`/stock/${p.piece.id}`} className="cut-card__photo">
                      <Photo piece={p.piece} width={240} />
                    </Link>
                  )}
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
                    <div className="cut-bar" role="img" aria-label={`Cuts ${p.cuts.join(', ')} mm, ${Math.round(p.leftover)} mm left`}>
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

            {result.plans.length > 0 && <ReserveAll count={result.plans.length} busy={busy} onReserve={reserveAll} />}
          </>
        )
      )}
      {q.a == null && !reserved && <p className="soft">Type a size and the lengths you need. Steamhub picks the fewest, shortest pieces and shows where to cut.</p>}
    </div>
  )
}

/** The same subsystem list as Reserve, so the weight and the parts line up with Manufacturing. */
function ReserveAll({ count, busy, onReserve }: { count: number; busy: boolean; onReserve: (forWhat: string, subId: string | null) => void }) {
  const { robots, subs } = useRobots()
  const { pieces } = useStore()
  const active = robots.filter((r) => !r.archived)
  const [subId, setSubId] = useState('')
  const [forWhat, setForWhat] = useState('')
  const sub = subs.find((s) => s.id === subId)
  const recent = useMemo(() => [...new Set(pieces.map((p) => p.reserved_for).filter(Boolean) as string[])].slice(0, 12), [pieces])
  return (
    <div className="cut-reserve">
      {active.length > 0 && (
        <Select
          label="For which subsystem"
          value={subId}
          onChange={setSubId}
          options={[
            { value: '', label: 'Something else' },
            ...active.flatMap((r) => subs.filter((s) => s.robot_id === r.id).map((s) => ({ value: s.id, label: `${s.number} ${s.name}`, group: r.name }))),
          ]}
        />
      )}
      {!sub && <Combo label="What for" value={forWhat} onChange={setForWhat} options={recent} placeholder="For which mechanism" />}
      <button type="button" className="q-btn q-btn--main" disabled={busy} onClick={() => onReserve(sub ? `${sub.number} ${sub.name}` : forWhat.trim(), sub?.id ?? null)}>
        {busy ? 'Reserving' : `Reserve these ${count} pieces`}
      </button>
    </div>
  )
}
