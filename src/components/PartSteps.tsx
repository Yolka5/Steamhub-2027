import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { supabase } from '../lib/supabase'

// Previous and next part of the same subsystem, in the order its page lists them (in design,
// released, bought), so checking a fresh upload doesn't mean Back and open, 76 times. ← and → work too.

type Row = { id: string; part_no: number; machine: string; released_at: string | null; status: string }

// One fetch per subsystem while stepping through it.
const cache = new Map<string, Promise<string[]>>()
function orderOf(subId: string) {
  let p = cache.get(subId)
  if (!p) {
    p = Promise.resolve(
      supabase
        .from('parts')
        .select('id, part_no, machine, released_at, status')
        .eq('subsystem_id', subId)
        .neq('status', 'cancelled')
        .order('part_no'),
    ).then(({ data }) => {
      const rows = (data ?? []) as Row[]
      const rank = (r: Row) => (r.machine === 'Bought' ? 2 : r.released_at ? 1 : 0)
      return rows.sort((a, b) => rank(a) - rank(b) || a.part_no - b.part_no).map((r) => r.id)
    })
    cache.set(subId, p)
    // Uploads and releases change the list; a later visit asks again.
    window.setTimeout(() => cache.delete(subId), 60_000)
  }
  return p
}

export function PartSteps({ partId, subId }: { partId: string; subId: string }) {
  const navigate = useNavigate()
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    let live = true
    orderOf(subId).then((o) => live && setIds(o))
    return () => {
      live = false
    }
  }, [subId])

  const i = ids.indexOf(partId)
  const prev = i > 0 ? ids[i - 1] : null
  const next = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable], dialog[open]')) return
      if (e.key === 'ArrowLeft' && prev) navigate(`/manufacturing/p/${prev}`, { replace: true })
      if (e.key === 'ArrowRight' && next) navigate(`/manufacturing/p/${next}`, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, navigate])

  if (i < 0 || ids.length < 2) return null
  return (
    <nav className="part-steps" aria-label="Parts in this subsystem">
      {prev ? (
        <Link to={`/manufacturing/p/${prev}`} replace className="icon-btn" aria-label="Previous part" title="Previous part (←)">
          <Icon name="back" size={18} />
        </Link>
      ) : (
        <span className="icon-btn" aria-hidden="true" />
      )}
      <span className="soft small num">
        {i + 1} of {ids.length}
      </span>
      {next ? (
        <Link to={`/manufacturing/p/${next}`} replace className="icon-btn" aria-label="Next part" title="Next part (→)">
          <Icon name="next" size={18} />
        </Link>
      ) : (
        <span className="icon-btn" aria-hidden="true" />
      )}
    </nav>
  )
}
