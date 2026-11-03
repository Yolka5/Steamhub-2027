import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Indicator } from '../components/Indicator'
import handbook from '../content/handbook.json'

// The handbook, in Hebrew: the design book and the FRC sources, each its own page. Read mode in
// the same calm language as the rest of Steamhub: a plain title, one reading column, a contents
// rail that follows you, and colour only where it means something (pros and cons).

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

interface Group {
  name: string
  ids: string[]
}

export type PartId = 'design' | 'sources'

interface Part {
  path: string
  title: string
  sub: string
  source: string
  chips: string[]
  searchLabel: string
  groups: Group[]
}

/** The handbook is two things: the design book, and the list of FRC information sources. */
export const PARTS: Record<PartId, Part> = {
  design: {
    path: '/handbook/design',
    title: 'המדריך למתכנן המכני',
    sub: 'מה שלמדנו על תכנון מכלולים, כדי שלא נחזור על אותן טעויות.',
    source: handbook.source,
    chips: ['טיפוס', 'דריבלר', 'מעלית', 'סלאפ דאון', 'זיוות', 'חוט', 'ברגים', 'צ’ק ליסט'],
    searchLabel: 'חיפוש במדריך',
    groups: [
      { name: 'פתיחה', ids: ['s1', 's2'] },
      { name: 'טיפוס', ids: ['s3', 's4', 's5'] },
      { name: 'מכלולים', ids: ['s6', 's7', 's8'] },
      { name: 'תהליך', ids: ['s9', 's10'] },
    ],
  },
  sources: {
    path: '/handbook/sources',
    title: 'מקורות מידע FRC',
    sub: 'איפה להתעדכן, ממי ללמוד ואיפה למצוא שרטוטים, תמונות ורעיונות.',
    source: 'https://docs.google.com/document/d/1ldRky1iBNBNYaJcKOrZJt3OyTUTHN-enqyGK3UnQYRU/edit?usp=sharing',
    chips: ['TBA', 'Chief Delphi', '254', 'CAD', 'בלוג', 'יוטיוב', 'גלריה', 'מחשבון'],
    searchLabel: 'חיפוש במקורות',
    groups: [
      { name: 'קהילה ותחרויות', ids: ['s12', 's18'] },
      { name: 'תכנון ושרטוטים', ids: ['s11', 's13', 's14', 's15'] },
      { name: 'ללמוד מאחרים', ids: ['s16', 's17', 's19'] },
    ],
  },
}

const ALL = handbook.sections as Section[]
const byId = new Map(ALL.map((s) => [s.id, s]))
const GROUP_OF = new Map<string, Group>()
const PART_OF = new Map<string, PartId>()
for (const [pid, p] of Object.entries(PARTS) as [PartId, Part][])
  for (const g of p.groups)
    for (const id of g.ids) {
      GROUP_OF.set(id, g)
      PART_OF.set(id, pid)
    }

/** A part's chapters, in the order of its groups. */
export const sectionsOf = (pid: PartId) => PARTS[pid].groups.flatMap((g) => g.ids.map((id) => byId.get(id)).filter(Boolean) as Section[])

const CHECK_KEY = 'handbook-checklist'

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

/** For Ctrl K: each chapter with the words it should be found by (tags, link names, topic). */
export function handbookIndex() {
  return ALL.filter((s) => PART_OF.has(s.id)).map((s) => {
    const part = PARTS[PART_OF.get(s.id)!]
    return {
      id: s.id,
      title: s.title,
      path: part.path,
      part: part.title,
      words: [part.title, GROUP_OF.get(s.id)?.name ?? '', ...s.blocks.flatMap((b) => [b.title, ...b.tags, ...(b.links ?? []).map((l) => l.title)])]
        .join(' ')
        .toLowerCase(),
    }
  })
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
          <span className="hb-link__icon" aria-hidden="true">
            <img src={`https://www.google.com/s2/favicons?domain=${host(l.href)}&sz=64`} alt="" width="20" height="20" loading="lazy" />
          </span>
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

// ---------- Page ----------

export default function Handbook({ part: pid }: { part: PartId }) {
  const part = PARTS[pid]
  const SECTIONS = useMemo(() => sectionsOf(pid), [pid])
  const [q, setQ] = useState('')
  const [active, setActive] = useState(SECTIONS[0]?.id)
  const { hash } = useLocation()

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
  }, [query, SECTIONS])

  // The contents rail follows the chapter being read.
  useEffect(() => {
    const els = visible.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        if (atBottom()) return setActive(els[els.length - 1]?.id)
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
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
  }, [visible])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="page page--wide hb" dir="rtl" lang="he">
      <header className="hb-head">
        <h1 className="hb-title">{part.title}</h1>
        <p className="hb-sub soft">
          {part.sub}{' '}
          <a href={part.source} target="_blank" rel="noopener noreferrer">
            המסמך המקורי
          </a>
        </p>
        <input className="field field--big hb-search" type="search" placeholder="חיפוש: מילה, נושא או שנה" value={q} onChange={(e) => setQ(e.target.value)} aria-label={part.searchLabel} />
        <div className="chips">
          {part.chips.map((t) => (
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
            {visible.map((s, i) => {
              const group = GROUP_OF.get(s.id)
              const newGroup = i === 0 || GROUP_OF.get(visible[i - 1].id) !== group
              return (
                <div key={s.id} className="hb-toc__item">
                  {newGroup && <span className="hb-toc__group">{group?.name}</span>}
                  <a href={`#${s.id}`} className="pick" aria-current={active === s.id ? 'true' : undefined}>
                    {s.title}
                  </a>
                </div>
              )
            })}
          </div>
        </nav>

        <article className="hb-text">
          {visible.length === 0 && <p className="soft">לא נמצאו תוצאות. נסו מילה אחרת או אחד מהנושאים למעלה.</p>}
          {visible.map((s) => (
            <section key={s.id} id={s.id} className="hb-sec">
              <h2 className="hb-sec__title">{s.title}</h2>
              {s.blocks.map((b, i) => (
                <div key={i} className="hb-block">
                  {b.title !== s.title && <h3 className="hb-block__title">{b.title}</h3>}
                  {b.html && <div className="hb-prose" dangerouslySetInnerHTML={{ __html: b.html }} />}
                  {b.checklist && <Checklist items={b.checklist} />}
                  {b.links && <Links links={b.links} />}
                </div>
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
