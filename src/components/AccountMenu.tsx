import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Your name opens a small menu; signing out is a deliberate second click, never a side effect
 * of tapping your own avatar. `placement` sets which way the menu grows from its trigger.
 */
export function AccountMenu({ placement, compact = false }: { placement: 'up' | 'down'; compact?: boolean }) {
  const { session, name, signOut, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!session) return null
  const email = session.user.email

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className={compact ? 'icon-btn' : 'pick'}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? 'Account' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar">{name?.[0]?.toUpperCase()}</span>
        {!compact && <span className="rail__label">{name}</span>}
      </button>
      {open && (
        <div className={`menu account__menu account__menu--${placement}`} role="menu">
          <div className="account__who">
            <span className="strong">{name}</span>
            {email && <span className="soft small">{email}</span>}
          </div>
          {isAdmin && (
            <Link to="/people" role="menuitem" className="pick" onClick={() => setOpen(false)}>
              People and bans
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="pick account__out"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
