import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import handbook from '../content/handbook.json'

// The mechanical design handbook, in Hebrew. Read mode: a cover, one calm reading column, and
// colour that means something. Each topic owns one colour, and the chapter openers, the
// contents rail and the reading progress bar all wear the colour of the part you are in.

interface Link {
  title: string
  href: string
  note: string
}
interface Block {
  title: string
  tags: string[]
  html: string
  checklist?: string[]
  links?: Link[]
}
interface Section {
  id: string
  title: string
  blocks: Block[]
}

type Topic = 'intro' | 'climb' | 'mech' | 'process'

/** Which topic each chapter belongs to. Up to three meaning colours, plus neutral for the intro. */
const TOPIC_OF: Record<string, Topic> = {
  s1: 'intro',
  s2: 'intro',
  s3: 'climb',
  s4: 'climb',
  s5: 'climb',
  s6: 'mech',
  s7: 'mech',
  s8: 'mech',
  s9: 'process',
  s10: 'process',
  s11: 'process',
}

const TOPIC_NAME: Record<Topic, string> = { intro: 'פתיחה', climb: 'טיפוס', mech: 'מכלולים', process: 'תהליך ומקורות' }

const SECTIONS = handbook.sections as Section[]
const CHECK_KEY = 'handbook-checklist'
const TOPICS = ['טיפוס', 'דריבלר', 'מעלית', 'סלאפ דאון', 'זיוות', 'חוט', 'ברגים', 'צ’ק ליסט']

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ')
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** The last chapter is too short to reach the top of the screen, so the bottom of the page selects it. */
const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4

export function handbookIndex() {
  return SECTIONS.map((s) => ({ id: s.id, title: s.title }))
}

// ---------- Parts ----------

function Checklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHECK_KEY) ?? '[]') as boolean[]
      return items.map((_, i) => !!saved[i])
    } catch {
      return items.map(() => false)
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(done))
    } catch {
      /* storage blocked */
    }
  }, [done])
  const count = done.filter(Boolean).length
  const complete = count === items.length

  return (
    <div className={`hb-check ${complete ? 'is-complete' : ''}`}>
      <div className="hb-check__head">
        <span className="hb-check__count num">
          {count}
          <span className="soft"> / {items.length}</span>
        </span>
        <span className="hb-check__bar" aria-hidden="true">
          <span style={{ width: `${(count / items.length) * 100}%` }} />
        </span>
        <button type="button" className="text-btn" onClick={() => setDone(items.map(() => false))} disabled={count === 0}>
          איפוס
        </button>
      </div>
      {complete && <p className="hb-check__done">כל הבדיקות עברו. המכלול מוכן לאישור מנטור.</p>}
      <ul className="hb-check__list">
        {items.map((html, i) => (
          <li key={i}>
            <label className={done[i] ? 'is-done' : ''}>
              <input type="checkbox" checked={done[i]} onChange={(e) => setDone((d) => d.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span dangerouslySetInnerHTML={{ __html: html }} />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Links({ links }: { links: Link[] }) {
  return (
    <div className="hb-links">
      {links.map((l) => (
        <a key={l.href} className="hb-link" href={l.href} target="_blank" rel="noopener noreferrer">
          <span className="hb-link__title" dir="auto">
            {l.title}
          </span>
          {l.note && <span className="hb-link__note">{l.note}</span>}
          <span className="hb-link__host" dir="ltr">
            {host(l.href)} ↗
          </span>
        </a>
      ))}
    </div>
  )
}

/** Fades content up the first time it scrolls into view. Content is visible without JS. */
function useReveal(deps: unknown[]) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.hb [data-reveal]:not([data-in])')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).dataset.in = 'true'
            io.unobserve(e.target)
          }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ---------- Page ----------

export default function Handbook() {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(SECTIONS[0]?.id)
  const { hash } = useLocation()
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  const query = q.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!query) return SECTIONS
    return SECTIONS.map((s) => ({
      ...s,
      blocks: s.blocks.filter((b) =>
        [s.title, b.title, ...b.tags, plain(b.html), ...(b.checklist ?? []).map(plain), ...(b.links ?? []).map((l) => `${l.title} ${l.note}`)].some((t) =>
          t.toLowerCase().includes(query),
        ),
      ),
    })).filter((s) => s.blocks.length > 0)
  }, [query])

  const blockCount = SECTIONS.reduce((n, s) => n + s.blocks.length, 0)
  const checkCount = SECTIONS.flatMap((s) => s.blocks).find((b) => b.checklist)?.checklist?.length ?? 0

  // The contents rail and the colour follow the chapter being read.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        if (atBottom()) return setActive(els[els.length - 1]?.id)
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [visible])

  // Reading progress and the cover's blueprint drift, both from one scroll listener.
  useEffect(() => {
    let queued = false
    const paint = () => {
      queued = false
      const el = root.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0
      bar.current?.style.setProperty('transform', `scaleX(${p.toFixed(4)})`)
      el.style.setProperty('--drift', `${Math.min(window.scrollY, 600) * 0.25}px`)
      if (atBottom()) {
        const last = el.querySelector<HTMLElement>('.hb-sec:last-of-type')
        if (last) setActive(last.id)
      }
    }
    const onScroll = () => {
      if (!queued) {
        queued = true
        requestAnimationFrame(paint)
      }
    }
    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useReveal([visible])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  const activeTopic = TOPIC_OF[active ?? 's1'] ?? 'intro'

  return (
    <div ref={root} className="page page--wide hb" dir="rtl" lang="he" data-topic={activeTopic}>
      <div className="hb-progress" aria-hidden="true">
        <div ref={bar} className="hb-progress__bar" />
      </div>

      <header className="hb-cover">
        <div className="hb-cover__grid" aria-hidden="true" />
        <img className="hb-cover__logo" src="/logo-dark-256.png" alt="Steampunk 1577" width="112" height="112" />
        <div className="hb-cover__text">
          <h1 className="hb-title">המדריך למתכנן המכני</h1>
          <p className="hb-cover__sub">
            מה שלמדנו על תכנון מכלולים, כדי שלא נחזור על אותן טעויות.{' '}
            <a href={handbook.source} target="_blank" rel="noopener noreferrer">
              המסמך המקורי
            </a>
          </p>
          <p className="hb-cover__facts num">
            {SECTIONS.length} פרקים · {blockCount} נושאים · צ’ק ליסט של {checkCount} בדיקות
          </p>
        </div>
        <div className="hb-cover__search">
          <input className="hb-search" type="search" placeholder="חיפוש: מילה, נושא או שנה" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש במדריך" />
          <div className="hb-cover__chips">
            {TOPICS.map((t) => (
              <button key={t} type="button" className="hb-chip" aria-pressed={q === t} onClick={() => setQ(q === t ? '' : t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="hb-body">
        <nav className="hb-toc" aria-label="תוכן עניינים">
          <div className="picks picks--stack">
            <Indicator selector='[aria-current="true"]' />
            {visible.map((s, i) => {
              const topic = TOPIC_OF[s.id] ?? 'intro'
              const newGroup = i === 0 || TOPIC_OF[visible[i - 1].id] !== topic
              return (
                <div key={s.id} className="hb-toc__item">
                  {newGroup && <span className="hb-toc__group">{TOPIC_NAME[topic]}</span>}
                  <a href={`#${s.id}`} className="pick" data-topic={topic} aria-current={active === s.id ? 'true' : undefined}>
                    <span className="hb-dot" aria-hidden="true" />
                    {s.title}
                  </a>
                </div>
              )
            })}
          </div>
        </nav>

        <article className="hb-text">
          {visible.length === 0 && <p className="soft">לא נמצאו תוצאות. נסו מילה אחרת או אחד מהנושאים למעלה.</p>}
          {visible.map((s) => {
            const topic = TOPIC_OF[s.id] ?? 'intro'
            return (
              <section key={s.id} id={s.id} className="hb-sec" data-topic={topic}>
                <header className="hb-sec__head" data-reveal>
                  <h2>{s.title}</h2>
                  <span className="hb-sec__meta num">
                    {TOPIC_NAME[topic]}
                    {s.blocks.length > 1 ? ` · ${s.blocks.length} נושאים` : ''}
                  </span>
                </header>
                {s.blocks.map((b, i) => (
                  <div key={i} className="hb-block" data-reveal style={{ '--i': i } as CSSProperties}>
                    {b.title !== s.title && <h3 className="hb-block__title">{b.title}</h3>}
                    {b.html && <div className="hb-prose" dangerouslySetInnerHTML={{ __html: b.html }} />}
                    {b.checklist && <Checklist items={b.checklist} />}
                    {b.links && <Links links={b.links} />}
                  </div>
                ))}
              </section>
            )
          })}
        </article>
      </div>
    </div>
  )
}
