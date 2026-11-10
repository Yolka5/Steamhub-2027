import { useMemo } from 'react'
import { stockDrawing } from '../lib/stockDraw'
import { sizeLabel, type Piece } from '../lib/stock'

/** The whole piece, drawn from its profile and length. Shades come from the theme, so it works in dark mode too. */
export function StockRender({ piece, className = '' }: { piece: Piece; className?: string }) {
  const d = useMemo(() => stockDrawing(piece), [piece])
  return (
    <svg
      className={`stock-render ${className}`}
      viewBox={d.viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${piece.id}, ${sizeLabel(piece)}, ${piece.length} mm${d.shortened ? ', drawn shorter than true scale' : ''}`}
    >
      {d.faces.map((face, i) => {
        // Lit faces lean to --render-lit, turned-away ones to --render-shade; both flip with the theme.
        const color = `color-mix(in srgb, var(--render-lit) ${Math.round(Math.min(96, 8 + 95 * face.tone ** 1.6))}%, var(--render-shade))`
        // A hairline in the face's own colour closes the seams between the facets of round bars.
        return <path key={i} d={face.d} fillRule={face.rule} vectorEffect="non-scaling-stroke" style={{ fill: color, stroke: face.rule ? 'none' : color, strokeWidth: 0.6 }} />
      })}
      <path d={d.lines} className="stock-render__lines" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
