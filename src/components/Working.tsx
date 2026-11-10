import { useEffect, useState, type ReactNode } from 'react'
import { loadKatex, type Render } from '../lib/katex'

// "How it's worked out" under a calculated result: each step as the formula, then the same
// formula with this screen's numbers in it, so anyone can check the answer by hand.
// Formulas are LaTeX, typeset by KaTeX, which loads in the background after start (lib/katex).
// Open or closed is remembered per panel.

export interface Step {
  /** What this step finds, in words. */
  what: string
  /** The formula, in LaTeX: "C = \\frac{m(z_1 + z_2)}{2}". */
  formula?: string
  /** The same formula in LaTeX with the numbers on screen, ending in the answer. */
  calc?: string
  /** One line of plain text on why, or what a symbol means. */
  why?: string
}

/** A step, a plain sentence between steps, or a small heading that groups the steps after it. */
export type Line = Step | string | { head: string }

function Tex({ latex, render, className }: { latex: string; render: Render | null; className: string }) {
  // Until KaTeX arrives, keep the line's height so the panel doesn't jump.
  if (!render) return <span className={`${className} working__pending`} />
  return <span className={className} dangerouslySetInnerHTML={{ __html: render(latex) }} />
}

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
  const [render, setRender] = useState<Render | null>(null)

  useEffect(() => {
    if (!open || render) return
    let stop = false
    loadKatex().then((r) => !stop && setRender(() => r))
    return () => {
      stop = true
    }
  }, [open, render])

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
      {open && (
        <div className="working__body">
          {lines.map((l, i) =>
            typeof l === 'object' && 'head' in l ? (
              <h4 key={i} className="working__group">
                {l.head}
              </h4>
            ) : typeof l === 'string' ? (
              <p key={i} className="working__say">
                {l}
              </p>
            ) : (
              <div key={i} className="working__step">
                <span className="working__what">{l.what}</span>
                <span className="working__math">
                  {l.formula && <Tex latex={l.formula} render={render} className="working__f" />}
                  {l.calc && <Tex latex={l.calc} render={render} className="working__c" />}
                </span>
                {l.why && <span className="working__why soft small">{l.why}</span>}
              </div>
            ),
          )}
          {children}
        </div>
      )}
    </details>
  )
}
