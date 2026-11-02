import { useMemo, useRef, useState } from 'react'

// Small SVG line chart for the calculator. One y axis only, hairline grid, 2px lines,
// a legend for two or more series, labels at line ends, and a crosshair tooltip on hover.
// Charts never animate when inputs change: people adjust these constantly.

export interface Series {
  name: string
  /** 1-6, picks the categorical colour slot. */
  slot: number
  points: [number, number][]
  dashed?: boolean
}

interface Props {
  series: Series[]
  xLabel: string
  yLabel: string
  xLog?: boolean
  height?: number
  fmtX?: (n: number) => string
  fmtY?: (n: number) => string
  /** A vertical marker, like the chosen gear ratio. */
  markerX?: number
  markerLabel?: string
  /** A shaded x-range, like the ratios that fit every limit. */
  band?: [number, number] | null
  yMin?: number
  title?: string
}

const W = 640
const PAD = { l: 52, r: 96, t: 14, b: 38 }

function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1
  const step0 = span / n
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10))
  return { ticks: out, lo: Math.min(lo, start), hi: Math.max(hi, out[out.length - 1] ?? hi) }
}

const logTicks = (lo: number, hi: number) => {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e
      if (v >= lo && v <= hi) out.push(v)
    }
  return out
}

const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1000) return `${+(n / 1000).toFixed(1)}K`
  if (a >= 100) return String(Math.round(n))
  if (a >= 10) return String(+n.toFixed(1))
  return String(+n.toFixed(2))
}

export function LineChart({ series, xLabel, yLabel, xLog, height = 260, fmtX = compact, fmtY = compact, markerX, markerLabel, band, yMin, title }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const H = height

  const geo = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p[0])).filter((x) => !xLog || x > 0)
    const ys = series.flatMap((s) => s.points.map((p) => p[1])).filter(Number.isFinite)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const yt = niceTicks(yMin ?? Math.min(0, ...ys), Math.max(...ys, 1e-9))
    const fx = xLog
      ? (x: number) => PAD.l + ((Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0) || 1)) * (W - PAD.l - PAD.r)
      : (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r)
    const fy = (y: number) => H - PAD.b - ((y - yt.lo) / (yt.hi - yt.lo || 1)) * (H - PAD.t - PAD.b)
    const xTicks = xLog ? logTicks(x0, x1) : niceTicks(x0, x1, 6).ticks.filter((t) => t >= x0 && t <= x1)
    return { x0, x1, fx, fy, yTicks: yt.ticks, xTicks }
  }, [series, xLog, H, yMin])

  // Hover snaps to the nearest x of the first series; every series is read at that index.
  const base = series[0]?.points ?? []
  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current
    if (!svg || base.length === 0) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0
    let bestD = Infinity
    base.forEach((p, i) => {
      const d = Math.abs(geo.fx(p[0]) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }

  const path = (pts: [number, number][]) =>
    pts
      .filter((p) => Number.isFinite(p[1]) && (!xLog || p[0] > 0))
      .map((p, i) => `${i ? 'L' : 'M'}${geo.fx(p[0]).toFixed(1)} ${geo.fy(p[1]).toFixed(1)}`)
      .join('')

  const hx = hover != null ? base[hover]?.[0] : null

  return (
    <figure className="chart">
      {title && <figcaption className="chart__title">{title}</figcaption>}
      {series.length > 1 && (
        <ul className="chart__legend">
          {series.map((s) => (
            <li key={s.name}>
              <span className="chart__key" style={{ background: `var(--series-${s.slot})` }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div className="chart__plot">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="chart__svg"
          role="img"
          aria-label={`${yLabel} against ${xLabel}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {band && (
            <rect
              className="chart__band"
              x={geo.fx(Math.max(band[0], geo.x0))}
              y={PAD.t}
              width={Math.max(0, geo.fx(Math.min(band[1], geo.x1)) - geo.fx(Math.max(band[0], geo.x0)))}
              height={H - PAD.t - PAD.b}
            />
          )}
          {geo.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className="chart__grid" x1={PAD.l} x2={W - PAD.r} y1={geo.fy(t)} y2={geo.fy(t)} />
              <text className="chart__tick" x={PAD.l - 8} y={geo.fy(t)} textAnchor="end" dominantBaseline="middle">
                {fmtY(t)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text key={`x${t}`} className="chart__tick" x={geo.fx(t)} y={H - PAD.b + 16} textAnchor="middle">
              {fmtX(t)}
            </text>
          ))}
          <text className="chart__axis" x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle">
            {xLabel}
          </text>
          <text className="chart__axis" x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
            {yLabel}
          </text>

          {markerX != null && markerX >= geo.x0 && markerX <= geo.x1 && (
            <g>
              <line className="chart__marker" x1={geo.fx(markerX)} x2={geo.fx(markerX)} y1={PAD.t} y2={H - PAD.b} />
              {markerLabel && (
                <text className="chart__tick chart__tick--strong" x={geo.fx(markerX) + 6} y={PAD.t + 10}>
                  {markerLabel}
                </text>
              )}
            </g>
          )}

          {series.map((s) => (
            <path
              key={s.name}
              d={path(s.points)}
              fill="none"
              stroke={`var(--series-${s.slot})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 5' : undefined}
            />
          ))}

          {/* End labels. Up to four series, so labels stay attached to their lines. */}
          {series.length <= 4 &&
            series.map((s) => {
              const last = [...s.points].reverse().find((p) => Number.isFinite(p[1]))
              if (!last) return null
              return (
                <text key={`l${s.name}`} className="chart__tick" x={geo.fx(last[0]) + 8} y={geo.fy(last[1])} dominantBaseline="middle">
                  {s.name}
                </text>
              )
            })}

          {hx != null && (
            <g>
              <line className="chart__cross" x1={geo.fx(hx)} x2={geo.fx(hx)} y1={PAD.t} y2={H - PAD.b} />
              {series.map((s) => {
                const p = s.points[hover!]
                if (!p || !Number.isFinite(p[1])) return null
                return <circle key={`d${s.name}`} className="chart__dot" cx={geo.fx(p[0])} cy={geo.fy(p[1])} r={4.5} fill={`var(--series-${s.slot})`} />
              })}
            </g>
          )}
        </svg>
        {hx != null && (
          <div className="chart__tip" style={{ left: `${(geo.fx(hx) / W) * 100}%` }}>
            <div className="chart__tip-x num">
              {xLabel}: {fmtX(hx)}
            </div>
            {series.map((s) => {
              const p = s.points[hover!]
              if (!p || !Number.isFinite(p[1])) return null
              return (
                <div key={s.name} className="chart__tip-row num">
                  <span className="chart__key" style={{ background: `var(--series-${s.slot})` }} />
                  {series.length > 1 ? `${s.name}: ` : ''}
                  {fmtY(p[1])}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </figure>
  )
}
