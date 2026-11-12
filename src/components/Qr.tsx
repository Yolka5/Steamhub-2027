import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/**
 * A QR code as crisp SVG squares, made in the browser from `value`, so a printed code always
 * matches the link in the code. Error correction M survives some wear and tape on a wall poster.
 */
export function Qr({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue
        // Runs of dark squares in a row become one rectangle: a much shorter path.
        let run = 1
        while (c + run < n && qr.isDark(r, c + run)) run++
        d += `M${c + 4} ${r + 4}h${run}v1h-${run}z`
        c += run - 1
      }
    }
    // Four modules of quiet zone on every side, as scanners expect.
    return { size: n + 8, path: d }
  }, [value])

  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
