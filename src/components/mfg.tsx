import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PartThumb } from './PartThumb'
import { partName, partNo, statusWord, type Part } from '../lib/mfg'

// Small shared parts of the Manufacturing pages.

/** Workshop | Robots | Wishlist, at the top of the Manufacturing pages. */
export function MfgTabs() {
  const { pathname } = useLocation()
  const tab = pathname.startsWith('/manufacturing/r') ? 'robots' : pathname === '/manufacturing/wishlist' ? 'wish' : pathname.startsWith('/manufacturing/board') ? 'board' : 'workshop'
  return (
    <nav className="picks picks--seg mfg-tabs" aria-label="Manufacturing">
      <Link to="/manufacturing" className="pick" aria-current={tab === 'workshop' ? 'page' : undefined}>
        List
      </Link>
      <Link to="/manufacturing/board" className="pick" aria-current={tab === 'board' ? 'page' : undefined}>
        Board
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

/**
 * One part in a list: number, name, what and who. The row opens the part. With an action (the
 * workshop's Start / Done), the button sits at the end of the row, outside the link.
 */
export function PartRow({ part, showMaker = true, showStatus = true, action, assignee }: { part: Part; showMaker?: boolean; showStatus?: boolean; action?: ReactNode; assignee?: string | null }) {
  const body = <PartRowBody part={part} showMaker={showMaker} showStatus={showStatus} assignee={assignee} />
  if (!action) {
    return (
      <Link to={`/manufacturing/p/${part.id}`} className="row mfg-row">
        {body}
      </Link>
    )
  }
  return (
    <div className="row mfg-row mfg-row--act">
      <Link to={`/manufacturing/p/${part.id}`} className="mfg-row__link">
        {body}
      </Link>
      {action}
    </div>
  )
}

function PartRowBody({ part, showMaker, showStatus, assignee }: { part: Part; showMaker: boolean; showStatus: boolean; assignee?: string | null }) {
  return (
    <>
      <PartThumb part={part} />
      <span className="mfg-row__no num">{partNo(part)}</span>
      <span className="row__main">
        <span className="mfg-row__name">{partName(part)}</span>
        <span className="soft small num">
          {[part.machine, part.material, `×${part.qty}`].filter(Boolean).join(' · ')}
          {showMaker && part.maker_name ? ` · ${part.maker_name}` : ''}
        </span>
      </span>
      <span className="mfg-row__tags">
        {part.changed && <span className="tag tag--reserved">Changed</span>}
        {part.rejected_note && !part.released_at && <span className="tag tag--bad">Rejected</span>}
        {part.asking && part.status !== 'done' && <span className="tag tag--warn">Waiting for an answer</span>}
        {part.made_differently && part.status === 'done' && <span className="tag tag--warn">Made differently</span>}
        {part.urgent && part.status !== 'done' && <UrgentTag />}
        {assignee && <span className="tag tag--who">→ {assignee.split(' ')[0]}</span>}
        {showStatus && <PartStatusTag part={part} />}
      </span>
    </>
  )
}
