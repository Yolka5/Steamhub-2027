import { Link } from 'react-router-dom'
import { useToast } from '../components/ui'
import { useEndMills, type EndMill } from '../lib/plates'
import { supabase } from '../lib/supabase'

// The CNC team's end mills, by flutes and diameter. Counts come from the plate sheet's end mills
// tab; a change here holds until the next sync.

export default function EndMills() {
  const { mills, loading, setMills } = useEndMills()
  const toast = useToast()
  const groups = [...new Set(mills.map((m) => m.flutes))]

  const bump = async (m: EndMill, d: number) => {
    const qty = Math.max(0, m.qty + d)
    setMills((cur) => cur.map((x) => (x.id === m.id ? { ...x, qty } : x)))
    const { error } = await supabase.from('end_mills').update({ qty }).eq('id', m.id)
    if (error) toast(error.message)
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">End mills</h1>
        <Link to="/stock/plates" className="q-btn">
          Plates
        </Link>
      </div>
      <p className="soft small">From the plate sheet's end mills tab. Counts you change here last until the next sync.</p>
      {loading ? (
        <p className="soft">Loading</p>
      ) : mills.length === 0 ? (
        <p className="soft">Nothing yet. Sync from the sheet on the Plates page.</p>
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
    </div>
  )
}
