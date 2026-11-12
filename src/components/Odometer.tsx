import type { CSSProperties } from 'react'

// The big rolling numbers of the Home countdown, shared with the season card that takes its place.

/**
 * Digits roll like an odometer when they change. A transition, not a keyframe, so a change that
 * lands mid-roll just retargets instead of restarting.
 */
export function Rolling({ value, digits = 2 }: { value: number; digits?: number }) {
  const text = String(Math.max(0, Math.round(value))).padStart(digits, '0')
  return (
    <span className="roll num" aria-hidden="true">
      {[...text].map((d, i) => (
        <span key={text.length - i} className="roll__col">
          <span className="roll__strip" style={{ '--d': Number(d) } as CSSProperties}>
            {'0123456789'.split('').map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

export function Unit({ value, label, digits }: { value: number; label: string; digits?: number }) {
  return (
    <div className="countdown__unit">
      <Rolling value={value} digits={digits ?? (value > 99 ? 3 : 2)} />
      <span className="countdown__label">{label}</span>
    </div>
  )
}
