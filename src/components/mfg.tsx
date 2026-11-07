import { Link, useLocation } from 'react-router-dom'
import { partNo, statusWord, type Part } from '../lib/mfg'

// Small shared parts of the Manufacturing pages.

/** Workshop | Robots | Wishlist, at the top of the Manufacturing pages. */
export function MfgTabs() {
  const { pathname } = useLocation()
  const tab = pathname.startsWith('/manufacturing/r') ? 'robots' : pathname === '/manufacturing/wishlist' ? 'wish' : 'workshop'
  return (
    <nav className="picks picks--seg mfg-tabs" aria-label="Manufacturing">
      <Link to="/manufacturing" className="pick" aria-current={tab === 'workshop' ? 'page' : undefined}>
        Workshop
      </Link>
      <Link to="/manufacturing/robots" className="pick" aria-current={tab === 'robots' ? 'page' : undefined}>
        Robots
      </Link>
      <Link to="/manufacturing/wishlist" className="pick" aria-current={tab === 'wish' ? 'page' : undefined}>
        Wishlist
      </Link>
    </nav>
  )
}

const TAG: Record<Part['status'], string> = {
  todo: 'tag',
  doing: 'tag tag--reserved',
  done: 'tag tag--ok',
  cancelled: 'tag tag--gone',
  missing: 'tag tag--bad',
}

export function PartStatusTag({ part }: { part: Pick<Part, 'status' | 'machine' | 'released_at'> }) {
  if (!part.released_at && part.status === 'todo' && part.machine !== 'Bought') return <span className="tag tag--design">In design</span>
  return <span className={TAG[part.status]}>{statusWord(part)}</span>
}

export function UrgentTag() {
  return <span className="tag tag--bad">Urgent</span>
}

/** One part in a list: number, name, what and who. The whole row opens the part. */
export function PartRow({ part, showMaker = true }: { part: Part; showMaker?: boolean }) {
  return (
    <Link to={`/manufacturing/p/${part.id}`} className="row mfg-row">
      <span className="mfg-row__no num">{partNo(part)}</span>
      <span className="row__main">
        <span className="mfg-row__name">{part.name}</span>
        <span className="soft small num">
          {[part.machine, part.material, `×${part.qty}`].filter(Boolean).join(' · ')}
          {showMaker && part.maker_name ? ` · ${part.maker_name}` : ''}
        </span>
      </span>
      <span className="mfg-row__tags">
        {part.changed && <span className="tag tag--reserved">Changed</span>}
        {part.urgent && part.status !== 'done' && <UrgentTag />}
        <PartStatusTag part={part} />
      </span>
    </Link>
  )
}
