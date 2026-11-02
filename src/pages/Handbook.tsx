import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import handbook from '../content/handbook.json'

// The mechanical design handbook, in Hebrew. Read mode: one column of prose, a contents rail
// that follows the reader, search over titles, tags and text, and a working approval checklist.

interface Block {
  title: string
  tags: string[]
  html: string
  checklist?: string[]
}
interface Section {
  id: string
  title: string
  blocks: Block[]
}

const SECTIONS = handbook.sections as Section[]
const CHECK_KEY = 'handbook-checklist'

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ')

/** Words people search for most, from the tags. Hebrew first, a short row. */
const TOPICS = ['טיפוס', 'דריבלר', 'מעלית', 'סלאפ דאון', 'זיוות', 'חוט', 'ברגים', 'צ’ק ליסט']

export function handbookIndex() {
  return SECTIONS.map((s) => ({ id: s.id, title: s.title }))
}

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

  return (
    <div className="hb-check">
      <div className="hb-check__head">
        <span className="num">
          {count} מתוך {items.length}
        </span>
        <span className="hb-check__bar" aria-hidden="true">
          <span style={{ width: `${(count / items.length) * 100}%` }} />
        </span>
        <button type="button" className="text-btn" onClick={() => setDone(items.map(() => false))} disabled={count === 0}>
          איפוס
        </button>
      </div>
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

export default function Handbook() {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(SECTIONS[0]?.id)
  const { hash } = useLocation()

  const query = q.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!query) return SECTIONS
    return SECTIONS.map((s) => ({
      ...s,
      blocks: s.blocks.filter((b) =>
        [s.title, b.title, ...b.tags, plain(b.html), ...(b.checklist ?? []).map(plain)].some((t) => t.toLowerCase().includes(query)),
      ),
    })).filter((s) => s.blocks.length > 0)
  }, [query])

  // Contents rail follows the section being read.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="page page--wide hb" dir="rtl" lang="he">
      <header className="hb-head">
        <h1 className="hb-title">המדריך למתכנן המכני</h1>
        <p className="hb-sub">
          Steampunk 1577 · הספר מתעדכן עם הזמן ועם הלמידה שלנו ·{' '}
          <a href={handbook.source} target="_blank" rel="noopener noreferrer">
            המסמך המקורי
          </a>
        </p>
        <input className="field field--big hb-search" type="search" placeholder="חיפוש: מילה, נושא או שנה" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש במדריך" />
        <div className="chips">
          {TOPICS.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={q === t} onClick={() => setQ(q === t ? '' : t)}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="hb-body">
        <nav className="hb-toc" aria-label="תוכן עניינים">
          <div className="picks picks--stack">
            <Indicator selector='[aria-current="true"]' />
            {visible.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="pick" aria-current={active === s.id ? 'true' : undefined}>
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <article className="hb-text">
          {visible.length === 0 && <p className="soft">לא נמצאו תוצאות. נסו מילה אחרת או אחד מהנושאים למעלה.</p>}
          {visible.map((s) => (
            <section key={s.id} id={s.id} className="hb-sec">
              <h2>{s.title}</h2>
              {s.blocks.map((b, i) => (
                <div key={i} className="hb-block">
                  {b.title !== s.title && <h3 className="hb-block__title">{b.title}</h3>}
                  <div className="hb-prose" dangerouslySetInnerHTML={{ __html: b.html }} />
                  {b.checklist && <Checklist items={b.checklist} />}
                </div>
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
