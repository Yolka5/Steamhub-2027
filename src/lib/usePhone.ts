import { useSyncExternalStore } from 'react'

// Phone layout: the same breakpoint as the tab bar (under 900 px wide).
//
// TV layout: a big portrait touch screen, like the 9:16 TV in the CAD room (720 × 1280 after
// Windows scaling). It is narrower than 900 px, so the phone CSS still stacks things, but it gets
// the full PC version of every page, a bottom bar with every section and a clock. Phones are never
// 640 wide, and an iPad standing up is 3:4, so neither gets it.

const PHONE = '(max-width: 899px)'
export const TALL = '(min-width: 640px) and (max-width: 899px) and (max-aspect-ratio: 5/8)'

function subscribe(onChange: () => void) {
  const mqs = [PHONE, TALL].map((q) => window.matchMedia(q))
  mqs.forEach((mq) => mq.addEventListener('change', onChange))
  return () => mqs.forEach((mq) => mq.removeEventListener('change', onChange))
}

const isTall = () => window.matchMedia(TALL).matches

/** True on phones, false on the TV (it shows the PC version of each page). */
export const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches && !isTall())

/** True on the portrait TV. */
export const useTall = () => useSyncExternalStore(subscribe, isTall)

/** `tall` on <html> while the TV layout is on, so CSS can tell the TV from a phone. */
export function watchTall() {
  const mq = window.matchMedia(TALL)
  const set = () => document.documentElement.classList.toggle('tall', mq.matches)
  set()
  mq.addEventListener('change', set)
}
