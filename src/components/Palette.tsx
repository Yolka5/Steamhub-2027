import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findMatches, parseQuery, queryIsEmpty, sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'
import { findThreads, looksLikeThread } from '../lib/threads'
import { handbookIndex } from '../pages/Handbook'
import { OUR_TOOLS, OUTSIDE_TOOLS } from '../pages/Tools'

// Opened constantly with Ctrl K, so that never animates. A click on the search box gets a short drop-in.

interface Item {
  key: string
  label: string
  hint?: string
  to: string
  /** Outside links open in a new tab instead of navigating. */
  external?: boolean
  /** Extra words that match, English and Hebrew. */
  keywords?: string
}

const PAGES: Item[] = [
  { key: 'p-home', label: 'Home', to: '/' },
  { key: 'p-stock', label: 'Find stock', to: '/stock' },
  { key: 'p-add', label: 'Add stock', to: '/stock/add' },
  { key: 'p-cut', label: 'Cut list: lengths for a mechanism', to: '/stock/cut' },
  { key: 'p-mech', label: 'Mechanisms: reserved stock and weight', to: '/stock/mechanisms' },
  { key: 'p-photos', label: 'Pieces that need a photo', to: '/stock/photos' },
  { key: 'p-calc', label: 'Motor and gearbox calculator', to: '/calculators' },
  { key: 'p-swerve', label: 'Swerve: compare drive ratios', to: '/calculators?tab=swerve' },
  { key: 'p-curves', label: 'Motor curves', to: '/calculators?tab=curves' },
  { key: 'p-voltage', label: 'Voltage map', to: '/calculators?tab=voltage' },
  { key: 'p-motors', label: 'Motors table', to: '/calculators?tab=motors' },
  { key: 'p-center', label: 'Center distance: belt, chain, gear', to: '/calculators?tab=center' },
  { key: 'p-center-have', label: 'Center distance for a belt or chain I have', to: '/calculators?tab=center&cd=have' },
  { key: 'p-sheet', label: 'Cheat sheet: tap drills, clearance holes, bearings, hex', to: '/calculators?tab=sheet', keywords: 'tap tapping thread הברזה הברזות קידוח מיסב' },
  { key: 'p-tools', label: 'Tools: every calculator and outside tool', to: '/tools', keywords: 'calculator כלים מחשבון' },
  { key: 'p-hand', label: 'Mechanical design handbook', to: '/handbook/design', keywords: 'המדריך למתכנן המכני' },
  { key: 'p-sources', label: 'FRC information sources', to: '/handbook/sources', keywords: 'מקורות מידע tba chief delphi' },
]

export function Palette({ open, animated, onClose }: { open: boolean; animated: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  const { pieces } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setText('')
      setSel(0)
      input.current?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  const items = useMemo<Item[]>(() => {
    const t = text.trim().toLowerCase()
    const hit = (i: Item) => i.label.toLowerCase().includes(t) || !!i.keywords?.toLowerCase().includes(t)
    const pages = PAGES.filter((p) => !t || hit(p))
    if (!t) return pages
    const seen = new Set(pages.map((p) => p.to))
    const tools: Item[] = [...OUR_TOOLS, ...OUTSIDE_TOOLS]
      .map((x) => ({ key: `t-${x.name}`, label: x.name, hint: x.href ? 'Opens in a new tab' : 'Tool', to: x.href ?? x.to!, external: !!x.href, keywords: x.keywords }))
      .filter((x) => hit(x) && !seen.has(x.to))
    // A thread like M5 or 10-32 jumps straight to its tap drill.
    const threads: Item[] = looksLikeThread(text)
      ? findThreads(text)
          .slice(0, 3)
          .map((th) => ({
            key: `th-${th.name}`,
            label: `${th.name}: tap drill ${th.tap.toFixed(2)} mm`,
            hint: `clearance ${th.free.toFixed(2)} mm`,
            to: `/calculators?tab=sheet&t=${encodeURIComponent(th.name)}`,
          }))
      : []
    const chapters: Item[] = handbookIndex()
      .filter((c) => c.title.toLowerCase().includes(t) || c.words.includes(t))
      .map((c) => ({ key: `h-${c.id}`, label: c.title, hint: c.part, to: `${c.path}#${c.id}` }))
    const q = parseQuery(text)
    const stock: Item[] = []
    if (!queryIsEmpty(q)) {
      if (!q.id) stock.push({ key: 's-all', label: `Find stock: ${text.trim()}`, to: `/stock?q=${encodeURIComponent(text.trim())}` })
      for (const m of findMatches(pieces, q, 0.5).slice(0, 6)) {
        stock.push({
          key: m.piece.id,
          label: `${m.piece.id}  ${sizeLabel(m.piece)}`,
          hint: `${m.piece.length} mm`,
          to: `/stock/${m.piece.id}`,
        })
      }
    }
    return [...threads, ...stock, ...pages, ...tools, ...chapters]
  }, [text, pieces])

  const go = (item?: Item) => {
    if (!item) return
    if (item.external) window.open(item.to, '_blank', 'noopener,noreferrer')
    else navigate(item.to)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="palette-dialog"
      data-anim={animated || undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="palette">
        <input
          ref={input}
          className="palette__input"
          placeholder="Search stock (20x40x1 700, round 20 500, TB-014) or pages"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(items.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              go(items[sel])
            }
          }}
        />
        <div className="picks picks--stack palette__list" role="listbox">
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role="option"
              className="pick"
              aria-selected={i === sel}
              onMouseMove={() => setSel(i)}
              onClick={() => go(it)}
            >
              <span className="num">{it.label}</span>
              {it.hint && <span className="pick__end num">{it.hint}</span>}
            </button>
          ))}
          {items.length === 0 && <p className="palette__empty">Nothing found</p>}
        </div>
      </div>
    </dialog>
  )
}
