import { useSyncExternalStore } from 'react'

// Phone layout: the same breakpoint as the tab bar (under 900 px wide).

const query = '(max-width: 899px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
