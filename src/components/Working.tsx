import { useState, type ReactNode } from 'react'

// "How it's worked out" under a calculated result: each step as the formula, then the same
// formula with this screen's numbers in it, so anyone can check the answer by hand.
// Open or closed is remembered per panel on this device.

export interface Step {
  /** What this step finds, in words. */
  what: string
  /** The formula in symbols, like "C = m × (z1 + z2) / 2". */
  formula?: string
  /** The same formula with the numbers on screen, ending in the answer. */
  calc?: string
  /** One line on why, when the formula alone doesn't say it. */
  why?: string
}

/** A step, or a plain sentence between steps. */
export type Line = Step | string

const KEY = 'working:'

function remembered(id: string) {
  try {
    return localStorage.getItem(KEY + id) === '1'
  } catch {
    return false
  }
}

export function Working({ id, lines, title = "How it's worked out", children }: { id: string; lines: Line[]; title?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(() => remembered(id))
  return (
    <details
      className="working"
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try {
          localStorage.setItem(KEY + id, now ? '1' : '0')
        } catch {
          /* ignore */
        }
      }}
    >
      <summary className="working__head">{title}</summary>
      <div className="working__body">
        {lines.map((l, i) =>
          typeof l === 'string' ? (
            <p key={i} className="working__say">
              {l}
            </p>
          ) : (
            <div key={i} className="working__step">
              <span className="working__what">{l.what}</span>
              <span className="working__math num">
                {l.formula && <span className="working__f">{l.formula}</span>}
                {l.calc && <span className="working__c">{l.calc}</span>}
              </span>
              {l.why && <span className="working__why soft small">{l.why}</span>}
            </div>
          ),
        )}
        {children}
      </div>
    </details>
  )
}

