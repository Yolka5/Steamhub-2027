import { useEffect, useState } from 'react'
import type { Part } from './mfg'
import { supabase } from './supabase'

// Part counts per subsystem, for robot and subsystem cards. Only the columns the counts need.

export interface Counts {
  made: number
  released: number
  done: number
  bought: number
  got: number
}

type Slim = Pick<Part, 'subsystem_id' | 'status' | 'machine' | 'released_at'>

export function countParts(list: Slim[]): Counts {
  const c: Counts = { made: 0, released: 0, done: 0, bought: 0, got: 0 }
  for (const p of list) {
    if (p.status === 'cancelled') continue
    if (p.machine === 'Bought') {
      c.bought++
      if (p.status === 'done') c.got++
      continue
    }
    c.made++
    if (p.released_at) c.released++
    if (p.status === 'done') c.done++
  }
  return c
}

/** In design, In production, Ready for assembly or Assembled, worked out from the parts. */
export function subStatus(c: Counts, assembled: boolean) {
  if (assembled) return 'Assembled'
  if (!c.made && !c.bought) return 'No STEP yet'
  if (c.made && c.done === c.made && c.got === c.bought) return 'Ready for assembly'
  if (c.released) return 'In production'
  return 'In design'
}

export function useCounts() {
  const [bySub, setBySub] = useState<Map<string, Counts>>(new Map())
  useEffect(() => {
    supabase
      .from('parts')
      .select('subsystem_id, status, machine, released_at')
      .then(({ data }) => {
        const groups = new Map<string, Slim[]>()
        for (const p of (data as Slim[]) ?? []) groups.set(p.subsystem_id, [...(groups.get(p.subsystem_id) ?? []), p])
        setBySub(new Map([...groups].map(([k, v]) => [k, countParts(v)])))
      })
  }, [])
  return bySub
}

export const empty: Counts = { made: 0, released: 0, done: 0, bought: 0, got: 0 }
