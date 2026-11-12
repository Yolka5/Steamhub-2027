import { useEffect, useState } from 'react'
import type { Part } from './mfg'
import type { Query } from './stock'
import { barQuery, stockQuery } from './stockLinks'

/** The part's stock query, with a tube's wall read from its geometry. Undefined while loading. */
export function useStockQuery(part: Part | null) {
  const [q, setQ] = useState<Query | null | undefined>(undefined)
  const key = part ? [part.id, part.machine, part.cls, part.qty, part.size.join(','), part.geometry_path].join('|') : ''
  useEffect(() => {
    if (!part) return setQ(undefined)
    let stop = false
    setQ(barQuery(part))
    stockQuery(part).then((r) => !stop && setQ(r))
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return q
}

