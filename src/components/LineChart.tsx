import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// One chart window for the calculator. Every line has a toggle in the legend, so related
// graphs share one window instead of a stack of small charts.
// Axes follow the units of the lines that are on: one unit gets one axis, two units get a
// left and a right axis, three or more draw each line as a share of its own peak and the
// tooltip keeps the real values.
// Charts never animate when inputs change: people adjust these constantly.

export interface Series {
  name: string
  /** 1-6, picks the categorical colour slot. */
  slot: number
  points: [number, number][]
  /** Axis title for this line, like "Amps" or "Nm". Lines with the same unit share an axis. */
  unit: string
  /** Formats a value of this line for ticks and the tooltip. */
  fmt?: (n: number) => string
  /** Starts hidden. The legend can turn it on. */
  off?: boolean
  dashed?: boolean
}

interface Props {
  series: Series[]
  xLabel: string
  xLog?: boolean
  height?: number
  fmtX?: (n: number) => string
  /** A vertical marker, like the chosen gear ratio. */
  markerX?: number
  markerLabel?: string
  /** A shaded x-range, like the ratios that fit every limit. */
  band?: [number, number] | null
  title?: string
  /** Extra controls in the chart header, like a metric switch. */
  controls?: ReactNode
  /** Shown when no line has any point to draw. */
  empty?: string
}

/** A tick step from 1, 2, 2.5 and 5 times a power of ten, at least `raw`. */
function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw * (1 - 1e-9)) ?? 10 * mag
}

/** Ticks that start and end on a step, so the axis runs exactly from the first tick to the last. */
function niceTicks(lo: number, hi: number, n = 5) {
  if (hi - lo < 1e-9) hi = lo + 1
  const step = niceStep((hi - lo) / n)
  const start = Math.floor(lo / step + 1e-9) * step
  const end = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step * 1e-6; v += step) ticks.push(+v.toFixed(10))
  return ticks
}

/** Right-axis ticks that land on the left axis gridlines: same count, own nice step. */
function alignedTicks(lo: number, hi: number, intervals: number) {
  if (hi - lo < 1e-9) hi = lo + 1
  let step = niceStep((hi - lo) / intervals)
  for (let i = 0; i < 8; i++) {
    const start = Math.floor(lo / step + 1e-9) * step
    if (start + intervals * step >= hi - 1e-9) return Array.from({ length: intervals + 1 }, (_, k) => +(start + k * step).toFixed(10))
    step = niceStep(step * 1.01)
  }
  return niceTicks(lo, hi, intervals)
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

const finite = (p: [number, number], xLog?: boolean) => Number.isFinite(p[1]) && Number.isFinite(p[0]) && (!xLog || p[0] > 0)

interface Axis {
  unit: string
  ticks: number[]
  fmt: (n: number) => string
  fy: (y: number) => number
}

export function LineChart({ series, xLabel, xLog, height = 320, fmtX = compact, markerX, markerLabel, band, title, controls, empty }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  // Toggles are kept by line name, so a line keeps its state while inputs change.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const isOn = (s: Series) => toggled[s.name] ?? !s.off
  const shown = series.filter(isOn)
  const hasPlot = shown.some((s) => s.points.some((p) => finite(p, xLog)))
  // Drawn at the real pixel width, so the height stays fixed and text stays 11px on any screen.
  const [W, setW] = useState(640)
  useLayoutEffect(() => {
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasPlot])
  const H = Math.round(Math.min(height, Math.max(220, W * 0.62)))

  const geo = (() => {
    const units = [...new Set(shown.map((s) => s.unit))]
    const mode: 'one' | 'two' | 'share' = units.length <= 1 ? 'one' : units.length === 2 ? 'two' : 'share'
    const pad = { l: 56, r: mode === 'two' ? 56 : shown.length <= 4 ? 104 : 20, t: 22, b: 40 }

    // In share mode every line becomes a percent of its own largest value.
    const peak = new Map(shown.map((s) => [s.name, Math.max(1e-12, ...s.points.filter((p) => finite(p, xLog)).map((p) => Math.abs(p[1])))]))
    const yOf = (s: Series, y: number) => (mode === 'share' ? (y / peak.get(s.name)!) * 100 : y)

    const pts = shown.flatMap((s) => s.points.filter((p) => finite(p, xLog)))
    if (pts.length === 0) return null
    const x0 = Math.min(...pts.map((p) => p[0]))
    const x1 = Math.max(...pts.map((p) => p[0]))
    const fx = xLog
      ? (x: number) => pad.l + ((Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0) || 1)) * (W - pad.l - pad.r)
      : (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)

    const range = (group: Series[]) => {
      const ys = group.flatMap((s) => s.points.filter((p) => finite(p, xLog)).map((p) => yOf(s, p[1])))
      return [Math.min(0, ...ys), Math.max(...ys, 1e-9)] as const
    }
    const makeAxis = (unit: string, ticks: number[], fmt: (n: number) => string): Axis => {
      const lo = ticks[0]
      const hi = ticks[ticks.length - 1]
      return { unit, ticks, fmt, fy: (y) => H - pad.b - ((y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b) }
    }

    const axes: Axis[] = []
    if (mode === 'share') {
      axes.push(makeAxis('% of peak', niceTicks(...range(shown)), (n) => `${Math.round(n)}%`))
    } else {
      const left = shown.filter((s) => s.unit === units[0])
      const lt = niceTicks(...range(left))
      axes.push(makeAxis(units[0] ?? '', lt, left[0]?.fmt ?? compact))
      if (mode === 'two') {
        const right = shown.filter((s) => s.unit === units[1])
        axes.push(makeAxis(units[1], alignedTicks(...range(right), lt.length - 1), right[0]?.fmt ?? compact))
      }
    }
    const axisOf = (s: Series) => (mode === 'two' && s.unit === units[1] ? axes[1] : axes[0])
    const xTicks = xLog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(3, Math.min(8, Math.round(W / 110)))).filter((t) => t >= x0 - 1e-9 && t <= x1 + 1e-9)
    return { mode, pad, x0, x1, fx, axes, axisOf, yOf, xTicks }
  })()

  // Hover snaps to the nearest drawn x of the first line that is on; lines share their x values.
  const base = shown[0]?.points ?? []
  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current
    if (!svg || !geo) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best: number | null = null
    let bestD = Infinity
    base.forEach((p, i) => {
      if (!shown.some((s) => s.points[i] && finite(s.points[i], xLog))) return
      const d = Math.abs(geo.fx(p[0]) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }

  const legend = series.length > 1 && (
    <div className="chart__legend" role="group" aria-label="Lines to show">
      {series.map((s) => (
        <button
          key={s.name}
          type="button"
          className="chart__toggle"
          aria-pressed={isOn(s)}
          onClick={() => setToggled((t) => ({ ...t, [s.name]: !isOn(s) }))}
        >
          <span className="chart__key" style={{ ['--key' as string]: `var(--series-${s.slot})` }} data-dashed={s.dashed || undefined} />
          {s.name}
        </button>
      ))}
    </div>
  )

  const head = (title || controls || legend) && (
    <div className="chart__head">
      {title && <figcaption className="chart__title">{title}</figcaption>}
      {controls}
      {legend}
    </div>
  )

  if (!geo) {
    return (
      <figure className="chart">
        {head}
        <p className="chart__empty soft">{shown.length === 0 ? 'Every line is off. Turn one on above.' : (empty ?? 'Nothing to draw for these inputs.')}</p>
      </figure>
    )
  }

  const { pad, fx, axes, axisOf, yOf } = geo
  const path = (s: Series) => {
    let d = ''
    let pen = false
    for (const p of s.points) {
      if (!finite(p, xLog)) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${fx(p[0]).toFixed(1)} ${axisOf(s).fy(yOf(s, p[1])).toFixed(1)}`
      pen = true
    }
    return d
  }
  const hx = hover != null ? base[hover]?.[0] : null

  // Names at the line ends, pushed apart so lines that end together stay readable.
  const endLabels = shown
    .map((s) => {
      const last = [...s.points].reverse().find((p) => finite(p, xLog))
      return last && { name: s.name, x: fx(last[0]) + 8, y: axisOf(s).fy(yOf(s, last[1])) }
    })
    .filter((l): l is { name: string; x: number; y: number } => !!l)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < endLabels.length; i++) endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + 13)
  const overflow = endLabels.length ? endLabels[endLabels.length - 1].y - (H - pad.b + 4) : 0
  if (overflow > 0) for (const l of endLabels) l.y -= overflow
  for (let i = endLabels.length - 2; i >= 0; i--) endLabels[i].y = Math.min(endLabels[i].y, endLabels[i + 1].y - 13)

  const left = axes[0]
  const right = axes[1]
  const plotB = H - pad.b

  return (
    <figure className="chart">
      {head}
      <div className="chart__plot" ref={plotRef}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="chart__svg"
          role="img"
          aria-label={`${shown.map((s) => s.name).join(', ')} against ${xLabel}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {band && band[1] >= geo.x0 && band[0] <= geo.x1 && (
            <rect
              className="chart__band"
              x={fx(Math.max(band[0], geo.x0))}
              y={pad.t}
              width={Math.max(0, fx(Math.min(band[1], geo.x1)) - fx(Math.max(band[0], geo.x0)))}
              height={plotB - pad.t}
            />
          )}
          {left.ticks.map((t, i) => (
            <g key={`y${t}`}>
              <line className="chart__grid" x1={pad.l} x2={W - pad.r} y1={left.fy(t)} y2={left.fy(t)} />
              <text className="chart__tick" x={pad.l - 8} y={left.fy(t)} textAnchor="end" dominantBaseline="middle">
                {left.fmt(t)}
              </text>
              {right && (
                <text className="chart__tick" x={W - pad.r + 8} y={left.fy(t)} dominantBaseline="middle">
                  {right.fmt(right.ticks[i])}
                </text>
              )}
            </g>
          ))}
          <text className="chart__axis" x={pad.l - 8} y={pad.t - 10} textAnchor="end">
            {left.unit}
          </text>
          {right && (
            <text className="chart__axis" x={W - pad.r + 8} y={pad.t - 10}>
              {right.unit}
            </text>
          )}
          {geo.xTicks.map((t) => (
            <text key={`x${t}`} className="chart__tick" x={fx(t)} y={plotB + 16} textAnchor="middle">
              {fmtX(t)}
            </text>
          ))}
          <text className="chart__axis" x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle">
            {xLabel}
          </text>

          {markerX != null && markerX >= geo.x0 && markerX <= geo.x1 && (
            <g>
              <line className="chart__marker" x1={fx(markerX)} x2={fx(markerX)} y1={pad.t} y2={plotB} />
              {markerLabel && (
                <text className="chart__tick chart__tick--strong" x={fx(markerX) + 6} y={pad.t + 10}>
                  {markerLabel}
                </text>
              )}
            </g>
          )}

          {shown.map((s) => (
            <path
              key={s.name}
              d={path(s)}
              fill="none"
              stroke={`var(--series-${s.slot})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 5' : undefined}
            />
          ))}

          {/* Names at the line ends, while there is room on the right for them. */}
          {geo.mode !== 'two' &&
            shown.length <= 4 &&
            endLabels.map((l) => (
              <text key={`l${l.name}`} className="chart__tick" x={l.x} y={l.y} dominantBaseline="middle">
                {l.name}
              </text>
            ))}

          {hx != null && (
            <g>
              <line className="chart__cross" x1={fx(hx)} x2={fx(hx)} y1={pad.t} y2={plotB} />
              {shown.map((s) => {
                const p = s.points[hover!]
                if (!p || !finite(p, xLog)) return null
                return <circle key={`d${s.name}`} className="chart__dot" cx={fx(p[0])} cy={axisOf(s).fy(yOf(s, p[1]))} r={4.5} fill={`var(--series-${s.slot})`} />
              })}
            </g>
          )}
        </svg>
        {hx != null && (
          <div className="chart__tip" style={{ left: `${Math.min(80, Math.max(20, (fx(hx) / W) * 100))}%` }}>
            <div className="chart__tip-x num">
              {xLabel}: {fmtX(hx)}
            </div>
            {shown.map((s) => {
              const p = s.points[hover!]
              if (!p || !finite(p, xLog)) return null
              return (
                <div key={s.name} className="chart__tip-row num">
                  <span className="chart__key" style={{ ['--key' as string]: `var(--series-${s.slot})` }} />
                  <span className="chart__tip-name">{s.name}</span>
                  <span>
                    {(s.fmt ?? compact)(p[1])} {s.unit}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {geo.mode === 'share' && <p className="chart__note soft">Lines with different units are drawn as a share of their own peak. Hover for real values.</p>}
    </figure>
  )
}
