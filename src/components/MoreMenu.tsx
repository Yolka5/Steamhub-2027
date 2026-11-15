import { useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export interface MoreItem {
  to: string
  label: string
  icon: IconName
  active: boolean
}

/**
 * The phone tab bar's last tab: three bars that fold into an X. The sections that don't fit in the
 * bar live behind it. It reads as selected while you're on one of them.
 */
export function MoreTab({ open, active, onToggle }: { open: boolean; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="tab tab--more"
      aria-expanded={open}
      aria-controls="more-sheet"
      aria-current={active && !open ? 'page' : undefined}
      data-open={open || undefined}
      onClick={onToggle}
    >
      <span className="burger" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      More
    </button>
  )
}

/**
 * The sheet above the tab bar: every section the bar has no room for, as tiles that pop in one
 * after another. Always mounted so it can animate out; closed, it's inert.
 */
export function MoreSheet({ open, items, onClose }: { open: boolean; items: MoreItem[]; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div className="more-backdrop" data-open={open || undefined} onClick={onClose} aria-hidden="true" />
      <nav id="more-sheet" className="more-sheet" data-open={open || undefined} aria-label="More sections" inert={!open}>
        {items.map((n, i) => (
          <Link
            key={n.to}
            to={n.to}
            className="more-sheet__item"
            style={{ '--i': i } as CSSProperties}
            aria-current={n.active ? 'page' : undefined}
            onClick={onClose}
          >
            <span className="more-sheet__icon">
              <Icon name={n.icon} size={22} />
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
