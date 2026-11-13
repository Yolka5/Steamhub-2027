import type { MouseEvent } from 'react'

/** Ctrl (Cmd on a Mac) or Shift held: the click picks instead of opening. */
export const isPickClick = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey

/**
 * The picked set after a click on `id`. Shift adds everything from the last clicked item to this one,
 * in the order shown; anything else flips just this one.
 */
export function pickClick(picked: Set<string>, id: string, shift: boolean, order: string[], anchor: string | null) {
  const n = new Set(picked)
  const from = anchor ? order.indexOf(anchor) : -1
  const to = order.indexOf(id)
  if (shift && from >= 0 && to >= 0) {
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) n.add(order[i])
  } else if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}
