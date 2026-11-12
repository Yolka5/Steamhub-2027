import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Qr } from '../components/Qr'

// The workshop wall poster: one A4 page, read from about 1.5 m, with a QR code to /guide.
// The same steps as the guide, cut to a line each. Print it from this page (Ctrl P works too).

const GUIDE_URL = 'https://steamhub2027.vercel.app/guide'

const STEPS: { title: string; how: ReactNode }[] = [
  { title: 'Sign in', how: <>steamhub2027.vercel.app → Sign in with Google</> },
  { title: 'Find stock', how: <>Stock → type <code>20x40x1 700</code> → Reserve</> },
  { title: 'Add stock', how: <>Add → shape, sizes, length → Save. Write the ID on the piece</> },
  { title: 'Make a part', how: <>Make → Start → Done. Tap the part for its drawing</> },
  { title: 'Test a prototype', how: <>Record a test → film → values → Save test</> },
  { title: 'Search anything', how: <>Ctrl K or the magnifier: <code>3004</code>, <code>M5</code>, a page</> },
  { title: 'Plan your work', how: <>Calendar → + Task. Leads: Send today’s update</> },
  { title: 'Tools and Handbook', how: <>Tiles on Home: calculators, tap drills, the Handbook</> },
]

export default function GuidePoster() {
  useEffect(() => {
    const t = document.title
    document.title = 'Steamhub poster'
    return () => {
      document.title = t
    }
  }, [])

  return (
    <div className="poster-view">
      <div className="poster-bar">
        <Link to="/guide" className="q-btn">
          Back to the guide
        </Link>
        <p className="soft small">A4, portrait, no margins needed.</p>
        <button type="button" className="q-btn q-btn--main" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <article className="poster" lang="en" aria-label="Steamhub wall poster">
        <header className="poster__head">
          <div className="poster__brand">
            <span className="poster__logo" aria-hidden="true" />
            <div>
              <h1 className="poster__title">Steamhub</h1>
              <p className="poster__sub">How to use it</p>
            </div>
          </div>
          <figure className="poster__qr">
            <Qr value={GUIDE_URL} label={`QR code to ${GUIDE_URL}`} />
            <figcaption>Scan for the full guide</figcaption>
          </figure>
        </header>

        <ol className="poster__steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="poster__step">
              <span className="poster__n">{i + 1}</span>
              <div>
                <h2 className="poster__step-title">{s.title}</h2>
                <p className="poster__how">{s.how}</p>
              </div>
            </li>
          ))}
        </ol>

        <footer className="poster__foot">steamhub2027.vercel.app/guide</footer>
      </article>
    </div>
  )
}
