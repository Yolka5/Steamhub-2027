// Small motion helpers that need JS. Everything else lives in CSS.

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The glow on the main button follows the pointer, as on the TTM site. One listener for the page. */
export function initPointerGlow() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  document.addEventListener(
    'pointermove',
    (e) => {
      const btn = (e.target as Element | null)?.closest?.<HTMLElement>('.q-btn--main')
      if (!btn) return
      const r = btn.getBoundingClientRect()
      btn.style.setProperty('--px', `${e.clientX - r.left}px`)
      btn.style.setProperty('--py', `${e.clientY - r.top}px`)
    },
    { passive: true },
  )
}

/**
 * Switches theme with a circle that grows from the point that was clicked.
 * Falls back to an instant switch where View Transitions aren't supported.
 */
export function switchTheme(apply: () => void, x: number, y: number) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  if (!doc.startViewTransition || reducedMotion()) return apply()
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const t = doc.startViewTransition(apply)
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
}
