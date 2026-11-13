import { useLayoutEffect, useRef } from 'react'

/**
 * A selection fill that slides to whichever sibling is selected, instead of jumping.
 * Drop it as the first child of a .picks group (or the tab bar). It watches the
 * aria attributes, so the group needs no extra wiring.
 */
export function Indicator({ selector = '[aria-current="page"], [aria-checked="true"]' }: { selector?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return

    const place = () => {
      const target = parent.querySelector<HTMLElement>(selector)
      if (!target) {
        el.dataset.hidden = 'true'
        return
      }
      delete el.dataset.hidden
      el.style.width = `${target.offsetWidth}px`
      el.style.height = `${target.offsetHeight}px`
      el.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`
      // The first placement snaps; only later moves slide.
      if (!el.dataset.ready) requestAnimationFrame(() => (el.dataset.ready = 'true'))
    }

    place()
    const mo = new MutationObserver(place)
    // childList too: a tab added later (SteamLab once access loads) moves the others along.
    mo.observe(parent, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'aria-checked', 'aria-selected'] })
    const ro = new ResizeObserver(place)
    ro.observe(parent)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [selector])

  return <span ref={ref} className="indicator" aria-hidden="true" data-hidden="true" />
}
