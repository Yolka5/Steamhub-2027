import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findMatches, parseQuery, queryIsEmpty, sizeLabel } from '../lib/stock'
import { useStore } from '../lib/store'
import { findThreads, looksLikeThread } from '../lib/threads'
import { handbookIndex } from '../pages/Handbook'
import { OUR_TOOLS, OUTSIDE_TOOLS } from '../pages/Tools'
import { selectAll, supabase } from '../lib/supabase'
import { partName, type Part } from '../lib/mfg'

/** A part as Ctrl K needs it: enough to find it by number or name and say where it belongs. */
type FoundPart = Pick<Part, 'id' | 'part_no' | 'name' | 'cls' | 'size' | 'machine' | 'status'> & {
  sub: { number: number; name: string; robot: { name: string; archived: boolean } | null } | null
}

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
  { key: 'p-photos', label: 'Stock photos: shoot or copy from Drive', to: '/stock/photos', keywords: 'photo picture camera drive needs' },
  { key: 'p-make', label: 'Manufacturing: what to make', to: '/manufacturing', keywords: 'workshop make parts drawings cnc lathe print' },
  { key: 'p-robots', label: 'Robots and subsystems', to: '/manufacturing/robots', keywords: 'step upload bom subsystem mechanism' },
  { key: 'p-plates', label: 'Plates: CNC plate stock', to: '/stock/plates', keywords: 'plate sheet aluminum polycarb cnc' },
  { key: 'p-mills', label: 'End mills', to: '/stock/end-mills', keywords: 'end mill cutter flute cnc' },
  { key: 'p-wish', label: 'Wishlist: parts to buy', to: '/manufacturing/wishlist', keywords: 'buy order missing uri' },
  { key: 'p-proto', label: 'Prototypes', to: '/prototypes', keywords: 'prototype test video parameters אב טיפוס' },
  { key: 'p-record', label: 'Record a prototype test', to: '/prototypes/record', keywords: 'film video test camera' },
  { key: 'p-notes', label: 'Notifications', to: '/notifications' },
  { key: 'p-calc', label: 'Motor and gearbox calculator', to: '/calculators' },
  { key: 'p-swerve', label: 'Swerve: compare drive ratios', to: '/calculators?tab=swerve' },
  { key: 'p-curves', label: 'Motor curves', to: '/calculators?tab=curves' },
  { key: 'p-voltage', label: 'Voltage map', to: '/calculators?tab=voltage' },
  { key: 'p-motors', label: 'Motors table', to: '/calculators?tab=motors' },
  { key: 'p-center', label: 'Center distance: belt, chain, gear', to: '/tools/center-distance' },
  { key: 'p-center-have', label: 'Center distance for a belt or chain I have', to: '/tools/center-distance?cd=have' },
  { key: 'p-sheet', label: 'Cheat sheet: tap drills, clearance holes, bearings, hex', to: '/tools/tap-drills', keywords: 'tap tapping thread הברזה הברזות קידוח מיסב' },
  { key: 'p-tools', label: 'Tools: every calculator and outside tool', to: '/tools', keywords: 'calculator כלים מחשבון' },
  { key: 'p-hand', label: 'Mechanical design handbook', to: '/handbook/design', keywords: 'המדריך למתכנן המכני' },
  { key: 'p-sources', label: 'FRC information sources', to: '/handbook/sources', keywords: 'מקורות מידע tba chief delphi' },
]

export function Palette({ open, animated, initial = '', onClose }: { open: boolean; animated: boolean; initial?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  // Arrow keys move the highlight; the list follows it so it never goes off the bottom.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  const { pieces } = useStore()
  const navigate = useNavigate()
  const [parts, setParts] = useState<FoundPart[]>([])
  const [protos, setProtos] = useState<{ id: string; name: string; concept: string; season: number; subsystem_number: number | null }[]>([])
  useEffect(() => {
    if (!open) return
    supabase
      .from('prototypes')
      .select('id, name, concept, season, subsystem_number')
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setProtos(data ?? []))
    // Parts of the robots being built, so "3004" or "side plate" jumps to the part and its drawing.
    selectAll<FoundPart>(() =>
      supabase
        .from('parts')
        .select('id, part_no, name, cls, size, machine, status, sub:subsystems(number, name, robot:robots(name, archived))')
        .neq('status', 'cancelled')
        .order('part_no')
        .order('id'),
    ).then(({ data }) => setParts((data ?? []).filter((p) => !p.sub?.robot?.archived)))
  }, [open])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setText(initial)
      setSel(0)
      input.current?.focus()
    }
    if (!open && d.open) d.close()
  }, [open, initial])

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
            to: `/tools/tap-drills?t=${encodeURIComponent(th.name)}`,
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
    const prototypes: Item[] = protos
      .filter((p) => p.name.toLowerCase().includes(t) || p.concept.toLowerCase().includes(t) || (p.subsystem_number != null && String(p.subsystem_number) === t))
      .slice(0, 6)
      .map((p) => ({ key: `pr-${p.id}`, label: p.name, hint: `Prototype${p.subsystem_number != null ? `, subsystem ${p.subsystem_number}` : ''}`, to: `/prototypes/${p.id}` }))
    // A part number matches from its start (30 finds 3001-3099); names match anywhere, from 3 letters.
    const isNo = /^\d{2,5}$/.test(t)
    const robots = new Set(parts.map((p) => p.sub?.robot?.name))
    const found: Item[] = parts
      .filter((p) => (isNo ? String(p.part_no).startsWith(t) : t.length >= 3 && (partName(p).toLowerCase().includes(t) || p.name.toLowerCase().includes(t))))
      .slice(0, 8)
      .map((p) => ({
        key: `pt-${p.id}`,
        label: `${p.part_no}  ${partName(p)}`,
        hint: [p.sub ? `${p.sub.number} ${p.sub.name}` : '', robots.size > 1 ? p.sub?.robot?.name : '', p.machine].filter(Boolean).join(' · '),
        to: `/manufacturing/p/${p.id}`,
      }))
    // A typed number is far more likely a part than a stock length, so parts go first then.
    if (isNo) return [...found, ...threads, ...stock, ...prototypes, ...pages, ...tools, ...chapters]
    return [...threads, ...stock, ...found, ...prototypes, ...pages, ...tools, ...chapters]
  }, [text, pieces, protos, parts])

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
          placeholder="Stock (20x40x1 700), part number (3004), M5, or a page"
          aria-label="Search Steamhub"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={items[sel] ? `palette-${sel}` : undefined}
          enterKeyHint="go"
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
        <div ref={list} id="palette-list" className="picks picks--stack palette__list" role="listbox" aria-label="Results">
          {items.map((it, i) => (
            <button
              key={it.key}
              id={`palette-${i}`}
              data-i={i}
              tabIndex={-1}
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
