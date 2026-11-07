import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MfgTabs } from '../../components/mfg'
import { Sheet, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { ago, saveFile } from '../../lib/mfg'
import { supabase } from '../../lib/supabase'
import { useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'

// What's missing, for Uri's buy list. Bought parts marked Missing land here on their own; anyone
// can add an item by hand. Uri starts a new Google Sheet each time: Copy pastes straight into it.

interface Wish {
  id: string
  item: string
  qty: number
  vendor: string | null
  link: string | null
  price: number | null
  subsystem_id: string | null
  part_id: string | null
  asked_by_name: string | null
  status: 'open' | 'bought'
  created_at: string
}

const COLUMNS = ['Item', 'Qty', 'Vendor', 'Link', 'Price', 'Subsystem', 'Asked by']

export default function Wishlist() {
  const [list, setList] = useState<Wish[]>([])
  const [loading, setLoading] = useState(true)
  const { robots, subs } = useRobots()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const show = params.get('show') === 'bought' ? 'bought' : 'open'
  const [adding, setAdding] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('wishlist').select('*').order('created_at', { ascending: false })
    setList((data as Wish[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => {
    reload()
    const channel = supabase
      .channel('wishlist')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  const subName = useCallback(
    (id: string | null) => {
      const s = subs.find((x) => x.id === id)
      if (!s) return ''
      const r = robots.find((x) => x.id === s.robot_id)
      return `${s.number} ${s.name}${r && robots.filter((x) => !x.archived).length > 1 ? ` (${r.name})` : ''}`
    },
    [subs, robots],
  )

  const shown = list.filter((w) => w.status === show)
  const open = list.filter((w) => w.status === 'open')
  const rows = useMemo(() => open.map((w) => [w.item, String(w.qty), w.vendor ?? '', w.link ?? '', w.price != null ? String(w.price) : '', subName(w.subsystem_id), w.asked_by_name ?? '']), [open, subName])

  const copy = async () => {
    if (!rows.length) return toast('Nothing open to copy')
    // Tabs between cells and no quotes: Google Sheets splits it into columns on paste.
    const clean = (c: string) => c.replace(/[\t\n\r]+/g, ' ')
    await navigator.clipboard.writeText([COLUMNS, ...rows].map((r) => r.map(clean).join('\t')).join('\n'))
    toast(`Copied ${rows.length} ${rows.length === 1 ? 'item' : 'items'}. Paste into the first cell of a new sheet.`)
  }

  const csv = () => {
    if (!rows.length) return toast('Nothing open to export')
    const q = (c: string) => `"${c.replace(/"/g, '""')}"`
    saveFile(`Wishlist ${new Date().toISOString().slice(0, 10)}.csv`, [COLUMNS, ...rows].map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv')
  }

  const setStatus = async (w: Wish, status: Wish['status']) => {
    setList((cur) => cur.map((x) => (x.id === w.id ? { ...x, status } : x)))
    const { error } = await supabase.from('wishlist').update({ status }).eq('id', w.id)
    if (error) toast(error.message)
  }

  const remove = async (w: Wish) => {
    if (armed !== w.id) return setArmed(w.id)
    setArmed(null)
    setList((cur) => cur.filter((x) => x.id !== w.id))
    const { error } = await supabase.from('wishlist').delete().eq('id', w.id)
    if (error) toast(error.message)
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Manufacturing</h1>
        <MfgTabs />
      </div>
      <div className="mfg-bar-head">
        <h2 className="section__title">Wishlist</h2>
        <div className="page__actions">
          <button type="button" className="q-btn" onClick={copy}>
            <Icon name="copy" size={18} /> Copy for Google Sheets
          </button>
          <button type="button" className="q-btn" onClick={csv}>
            <Icon name="download" size={18} /> CSV
          </button>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            Add item
          </button>
        </div>
      </div>
      <p className="soft small">Bought parts marked Missing land here on their own. Copy pastes the open items into Uri's new buy sheet.</p>

      <div className="picks picks--seg wish-show" role="radiogroup" aria-label="Show">
        {(['open', 'bought'] as const).map((s) => (
          <button key={s} type="button" role="radio" className="pick" aria-checked={show === s} onClick={() => setParams(s === 'open' ? {} : { show: s }, { replace: true })}>
            {s === 'open' ? `Open (${open.length})` : 'Bought'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="soft">Loading</p>
      ) : shown.length === 0 ? (
        <p className="soft">{show === 'open' ? 'Nothing missing. Mark a bought part Missing, or add an item by hand.' : 'Nothing bought yet.'}</p>
      ) : (
        <ul className="rows">
          {shown.map((w) => (
            <li key={w.id} className="row wish-row">
              <span className="row__main">
                <span className="strong">
                  {w.part_id ? <Link to={`/manufacturing/p/${w.part_id}`}>{w.item}</Link> : w.item}
                  {w.link && (
                    <a className="wish-row__link" href={w.link} target="_blank" rel="noopener noreferrer" aria-label="Open the store page">
                      <Icon name="external" size={16} />
                    </a>
                  )}
                </span>
                <span className="soft small num">
                  {[`×${w.qty}`, w.vendor, w.price != null ? `${w.price}` : null, subName(w.subsystem_id), w.asked_by_name, ago(w.created_at)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="row__end wish-row__btns">
                {w.status === 'open' ? (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setStatus(w, 'bought')}>
                    Bought
                  </button>
                ) : (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setStatus(w, 'open')}>
                    Back to open
                  </button>
                )}
                <button type="button" className={`q-btn q-btn--small${armed === w.id ? ' q-btn--danger' : ''}`} onClick={() => remove(w)}>
                  {armed === w.id ? 'Remove it' : 'Remove'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to the wishlist">
        <AddWish
          subs={subs.filter((s) => robots.some((r) => r.id === s.robot_id && !r.archived))}
          subName={subName}
          onDone={() => {
            setAdding(false)
            reload()
          }}
        />
      </Sheet>
    </div>
  )
}

function AddWish({ subs, subName, onDone }: { subs: { id: string }[]; subName: (id: string | null) => string; onDone: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('1')
  const [vendor, setVendor] = useState('')
  const [link, setLink] = useState('')
  const [price, setPrice] = useState('')
  const [sub, setSub] = useState('')

  const save = async () => {
    if (!item.trim()) return toast('Write what to buy first')
    const { error } = await supabase.from('wishlist').insert({
      item: item.trim(),
      qty: Math.max(1, Number(qty) || 1),
      vendor: vendor.trim() || null,
      link: link.trim() || null,
      price: price ? Number(price.replace(',', '.')) || null : null,
      subsystem_id: sub || null,
      asked_by: who?.userId,
      asked_by_name: who?.name,
    })
    if (error) return toast(error.message)
    toast('Added')
    onDone()
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Item</span>
        <input className="field" data-autofocus value={item} onChange={(e) => setItem(e.target.value)} placeholder="1/2 in hex bore bearing" />
      </label>
      <div className="dims">
        <label className="ctl">
          <span className="ctl__name">Qty</span>
          <input className="field num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Price</span>
          <input className="field num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <label className="ctl">
        <span className="ctl__name">Vendor</span>
        <input className="field" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="WCP, REV, AndyMark" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Link</span>
        <input className="field" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} />
      </label>
      <label className="ctl">
        <span className="ctl__name">For which subsystem</span>
        <Select value={sub} onChange={setSub} options={[{ value: '', label: 'General' }, ...subs.map((s) => ({ value: s.id, label: subName(s.id) }))]} />
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        Add to the wishlist
      </button>
    </form>
  )
}
