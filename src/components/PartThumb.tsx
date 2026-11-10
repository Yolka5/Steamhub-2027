import { useEffect, useRef, useState } from 'react'
import { partThumb } from '../lib/thumb'
import type { Part } from '../lib/mfg'
import { Icon } from './Icon'

/** A small picture of the part, built when the row scrolls into view. */
export function PartThumb({ part }: { part: Pick<Part, 'geometry_path' | 'name' | 'machine'> }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const path = part.geometry_path

  useEffect(() => {
    const el = ref.current
    if (!el || !path) return
    let stop = false
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        partThumb(path, part.name).then((s) => {
          if (stop) return
          if (s) setSvg(s)
          else setFailed(true)
        })
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => {
      stop = true
      io.disconnect()
    }
  }, [path, part.name])

  if (!path || failed)
    return (
      <span className="thumb thumb--empty" title={part.machine === 'Bought' ? 'Bought part' : 'No geometry'}>
        <Icon name={part.machine === 'Bought' ? 'stock' : 'screw'} size={18} />
      </span>
    )
  return svg ? <span ref={ref} className="thumb" dangerouslySetInnerHTML={{ __html: svg }} /> : <span ref={ref} className="thumb thumb--loading" />
}
