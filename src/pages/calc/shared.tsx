import { Help } from '../../components/Help'
import type { Robot } from '../../lib/calc'

// Bits shared by the calculator tabs.

export type Update = (fn: (r: Robot) => Robot) => void

/** Fixed decimals for display. Results never animate; they just change. */
export const f = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d))
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`)

export function StatusTag({ status }: { status: string }) {
  if (status === 'OFF') return <span className="tag">Off robot</span>
  const cls = status === 'OK' ? 'tag--ok' : status === 'HIGH LOAD' || status === 'TIGHT' ? 'tag--reserved' : 'tag--bad'
  const label = status === 'OK' ? 'OK' : status.charAt(0) + status.slice(1).toLowerCase()
  return <span className={`tag ${cls}`}>{label}</span>
}

export function Stat({ label, value, unit, help }: { label: string; value: string; unit?: string; help?: string }) {
  return (
    <div className="stat">
      <span className="stat__l">{label}</span>
      <span className="stat__v num">
        {value}
        {unit && value !== '—' && <span className="stat__u"> {unit}</span>}
      </span>
      <Help text={help} />
    </div>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="picks picks--seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" className="pick" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
