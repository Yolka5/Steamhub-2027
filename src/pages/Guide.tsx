import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import { Icon } from '../components/Icon'
import { CHAPTERS, type ShotName } from '../content/guide'
import SHOTS from '../content/guide-shots.json'

// How to use Steamhub, for new students. Opened from the QR code on the workshop wall, so it's
// phone first and works signed out. The words are in content/guide.tsx; the pictures and their
// marks come from scripts/guide-shots (real app, demo data). The poster is /guide/print.

interface Mark {
  n: number
  x: number
  y: number
  w: number
  h: number
  arrow?: 'left' | 'right' | 'up' | 'down'
}

interface ShotInfo {
  size: [number, number]
  marks: Mark[]
}

/**
 * Numbered rings and arrows over a screenshot, drawn here rather than baked into the picture,
 * so they stay sharp, match the theme and follow the real buttons when the shots are retaken.
 */
function Marks({ info }: { info: ShotInfo }) {
  const [w, h] = info.size
  // Laptop shots are shown smaller, so their marks are drawn bigger to look the same size.
  const k = w > 600 ? 1.7 : 1
  const r = 12 * k
  const pad = 5 * k
  const len = 46 * k
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  return (
    <svg className="guide-marks" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {info.marks.map((m) => {
        const x0 = clamp(m.x - pad, 2, w - 2)
        const y0 = clamp(m.y - pad, 2, h - 2)
        const x1 = clamp(m.x + m.w + pad, 2, w - 2)
        const y1 = clamp(m.y + m.h + pad, 2, h - 2)
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        // Where the arrow starts and where its tip touches the ring.
        let arrow: { x1: number; y1: number; x2: number; y2: number } | null = null
        if (m.arrow === 'left') arrow = { x1: x0 - len, y1: cy, x2: x0 - 3, y2: cy }
        if (m.arrow === 'right') arrow = { x1: x1 + len, y1: cy, x2: x1 + 3, y2: cy }
        if (m.arrow === 'up') arrow = { x1: cx, y1: y0 - len, x2: cx, y2: y0 - 3 }
        if (m.arrow === 'down') arrow = { x1: cx, y1: y1 + len, x2: cx, y2: y1 + 3 }
        if (arrow) {
          arrow.x1 = clamp(arrow.x1, r + 2, w - r - 2)
          arrow.y1 = clamp(arrow.y1, r + 2, h - r - 2)
        }
        // The number sits at the arrow's tail, or on the ring's top-left corner.
        const bx = arrow ? arrow.x1 : clamp(x0, r + 2, w - r - 2)
        const by = arrow ? arrow.y1 : clamp(y0, r + 2, h - r - 2)
        let head = ''
        if (arrow) {
          const a = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1)
          const s = 9 * k
          const p = (t: number) => `${arrow!.x2 - s * Math.cos(a + t)},${arrow!.y2 - s * Math.sin(a + t)}`
          head = `${arrow.x2},${arrow.y2} ${p(0.5)} ${p(-0.5)}`
        }
        return (
          <g key={m.n}>
            <rect className="guide-marks__halo" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={10 * k} />
            <rect className="guide-marks__ring" x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={10 * k} />
            {arrow && (
              <>
                <line className="guide-marks__halo" x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} />
                <line className="guide-marks__ring" x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} />
                <polygon className="guide-marks__head" points={head} />
              </>
            )}
            <circle className="guide-marks__badge" cx={bx} cy={by} r={r} />
            <text className="guide-marks__n" x={bx} y={by} fontSize={r * 1.15} dy="0.36em">
              {m.n}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** One picture with its marks, light or dark to match the app. Only the visible one loads. */
function Shot({ name, alt }: { name: ShotName; alt: string }) {
  const info = SHOTS[name] as unknown as ShotInfo
  const [w, h] = info.size
  const wide = w > 600
  return (
    <figure className={`guide-shot${wide ? ' guide-shot--wide' : ''}`} style={wide ? undefined : { maxWidth: `min(100%, ${Math.round(Math.min(w, 390) * 0.85)}px)` }}>
      <img className="guide-shot__light" src={`/guide/${name}.webp`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      <img className="guide-shot__dark" src={`/guide/${name}-dark.webp`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      {info.marks.length > 0 && <Marks info={info} />}
      {/* Laptop screens are small on a phone: open the picture full size to zoom in. */}
      {wide && (
        <a className="guide-shot__zoom" href={`/guide/${name}.webp`} target="_blank" rel="noopener">
          <Icon name="expand" size={16} /> Full size
        </a>
      )}
    </figure>
  )
}

/** The chapter being read, for the contents. Same approach as the Handbook's rail. */
function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    const io = new IntersectionObserver(
      (entries) => {
        if (atBottom()) return setActive(els[els.length - 1]?.id)
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    els.forEach((el) => io.observe(el))
    const onScroll = () => {
      if (atBottom()) setActive(els[els.length - 1]?.id)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [ids])
  return active
}

const IDS = CHAPTERS.map((c) => c.id)

export default function Guide({ signedIn = true }: { signedIn?: boolean }) {
  const active = useActive(IDS)
  const toc = useRef<HTMLElement>(null)
  const { hash } = useLocation()

  // On phones the contents are one sideways row: keep the current chapter in view.
  useEffect(() => {
    const nav = toc.current
    const a = nav?.querySelector<HTMLElement>(`[href="#${active}"]`)
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollTo({ left: a.offsetLeft - 16 })
  }, [active])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="page guide" lang="en">
      <header className="guide-head">
        <h1 className="page__title">How to use Steamhub</h1>
        <p className="guide-head__sub soft">
          Everything a step at a time. The numbers in each step match the numbers on its picture, and every link opens the real page.
        </p>
        <div className="page__actions">
          {!signedIn && (
            <Link to="/" className="q-btn q-btn--main">
              Sign in
            </Link>
          )}
          <Link to="/guide/print" className="q-btn">
            <Icon name="print" size={18} /> Print poster
          </Link>
        </div>
      </header>

      <div className="guide-body">
        <nav ref={toc} className="guide-toc" aria-label="Guide contents">
          <div className="picks picks--stack">
            <Indicator selector='[aria-current="true"]' />
            {CHAPTERS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="pick" aria-current={active === c.id ? 'true' : undefined}>
                {c.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="guide-text">
          {CHAPTERS.map((c) => (
            <section key={c.id} id={c.id} className="guide-ch" aria-labelledby={`${c.id}-title`}>
              <h2 id={`${c.id}-title`} className="section__title">
                {c.title}
              </h2>
              {c.intro && <p className="guide-ch__intro soft">{c.intro}</p>}
              <div className="guide-steps">
                {c.steps.map((s) => (
                  <article key={s.title} className={`guide-step${s.shot ? '' : ' guide-step--text'}`}>
                    <div className="guide-step__text">
                      <h3 className="guide-step__title">{s.title}</h3>
                      {s.body && <p>{s.body}</p>}
                      {s.how && (
                        <ol className="guide-how">
                          {s.how.map((h, i) => (
                            <li key={i}>
                              <span className="guide-how__n" aria-hidden="true">
                                {i + 1}
                              </span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {s.tip && <p className="guide-tip">{s.tip}</p>}
                    </div>
                    {s.shot && <Shot name={s.shot.name} alt={s.shot.alt} />}
                  </article>
                ))}
              </div>
            </section>
          ))}
          <p className="guide-end soft small">
            Pictures show demo data. Something here doesn’t match what you see? Tell the person who looks after Steamhub.
          </p>
        </div>
      </div>
    </div>
  )
}
