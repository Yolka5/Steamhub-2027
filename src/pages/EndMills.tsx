import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadError, Sheet, useBusy, useToast } from '../components/ui'
import { useAutoSync, useEndMills, useSheetSetting, type EndMill } from '../lib/plates'
import { supabase } from '../lib/supabase'

// The CNC team's end mills, by flutes and diameter. The plate sheet's end mills tab and this page
// are both kept: a sync applies only what changed in the sheet, so a count changed here stays.

export default function EndMills() {
  const { mills, loading, error, setMills, reload } = useEndMills()
  const { setting } = useSheetSetting()
  useAutoSync(setting, reload)
  const pending = mills.filter((m) => m.sheet_qty != null && m.sheet_qty !== m.qty)
  const toast = useToast()
  const groups = [...new Set(mills.map((m) => m.flutes))].sort((a, b) => a - b)
  const [adding, setAdding] = useState(false)

  // Counts from the latest tap, not the render the button was drawn in, so quick taps add up.
  const latest = useRef(mills)
  latest.current = mills
  const bump = async (m: EndMill, d: number) => {
    const qty = Math.max(0, (latest.current.find((x) => x.id === m.id)?.qty ?? m.qty) + d)
    latest.current = latest.current.map((x) => (x.id === m.id ? { ...x, qty } : x))
    setMills(latest.current)
    const { error } = await supabase.from('end_mills').update({ qty }).eq('id', m.id)
    if (error) {
      toast(error.message)
      reload()
    }
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">End mills</h1>
        <div className="page__actions">
          <Link to="/stock/plates" className="q-btn">
            Plates
          </Link>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            Add end mill
          </button>
        </div>
      </div>
      <p className="soft small">
        {setting?.url ? "From the plate sheet's end mills tab, read each time this page opens. Counts you change here are kept." : 'Count them here, or attach the plate sheet on the Plates page.'}
      </p>
      {pending.length > 0 && (
        <section className="sheet-pending">
          <h2 className="section__title">Not in the sheet yet</h2>
          <p className="small num">
            {pending.map((m) => `${m.flutes} flute Ø${m.diameter}: ${m.qty} here, ${m.sheet_qty} in the sheet`).join(' · ')}
          </p>
          <p className="soft small">They leave this list on their own once the sheet has the same count.</p>
        </section>
      )}
      {error && !mills.length ? (
        <LoadError onRetry={reload} />
      ) : loading ? (
        <p className="soft">Loading</p>
      ) : mills.length === 0 ? (
        <p className="soft">None yet. Add them as you count them.</p>
      ) : (
        groups.map((f) => (
          <section key={f} className="section">
            <h2 className="section__title">
              {f} {f === 1 ? 'flute' : 'flutes'}
            </h2>
            <ul className="rows">
              {mills
                .filter((m) => m.flutes === f)
                .map((m) => (
                  <li key={m.id} className="row">
                    <span className="strong num">Ø{m.diameter} mm</span>
                    <span className="row__end mill-qty">
                      <button type="button" className="q-btn q-btn--small" aria-label={`One less Ø${m.diameter}`} onClick={() => bump(m, -1)}>
                        −
                      </button>
                      <span className="num strong mill-qty__n" data-zero={m.qty === 0 || undefined}>
                        {m.qty}
                      </span>
                      <button type="button" className="q-btn q-btn--small" aria-label={`One more Ø${m.diameter}`} onClick={() => bump(m, 1)}>
                        +
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add end mill">
        <AddMill
          mills={mills}
          onDone={() => {
            setAdding(false)
            reload()
          }}
        />
      </Sheet>
    </div>
  )
}

/** A size that's already listed gets the count added to it; a new one is created. */
function AddMill({ mills, onDone }: { mills: EndMill[]; onDone: () => void }) {
  const toast = useToast()
  const [flutes, setFlutes] = useState(2)
  const [diameter, setDiameter] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      const d = Number(diameter.replace(',', '.'))
      const n = Math.max(0, Math.round(Number(qty) || 0))
      if (!d || d <= 0) return toast('Type the diameter')
      const have = mills.find((m) => m.flutes === flutes && m.diameter === d)
      const { error } = have
        ? await supabase.from('end_mills').update({ qty: have.qty + n }).eq('id', have.id)
        : await supabase.from('end_mills').insert({ flutes, diameter: d, qty: n })
      if (error) return toast(error.message)
      toast(have ? `Ø${d} ${flutes} flute: now ${have.qty + n}` : `Ø${d} ${flutes} flute added`)
      onDone()
    })
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="picks picks--seg" role="radiogroup" aria-label="Flutes">
        {[1, 2, 3, 4].map((f) => (
          <button key={f} type="button" role="radio" className="pick" aria-checked={flutes === f} onClick={() => setFlutes(f)}>
            {f} {f === 1 ? 'flute' : 'flutes'}
          </button>
        ))}
      </div>
      <div className="dims">
        <label className="ctl">
          <span className="ctl__name">Diameter (mm)</span>
          <input className="field num" inputMode="decimal" data-autofocus value={diameter} onChange={(e) => setDiameter(e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">How many</span>
          <input className="field num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="q-btn q-btn--main q-btn--wide" disabled={busy}>
        {busy ? 'Adding' : 'Add'}
      </button>
    </form>
  )
}
