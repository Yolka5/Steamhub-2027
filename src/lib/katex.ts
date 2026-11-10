// KaTeX typesets the "How it's worked out" formulas. It is its own download, fetched once in the
// background after the app starts, so the first panel opened is instant.

export type Render = (latex: string) => string

let load: Promise<Render> | null = null

export function loadKatex(): Promise<Render> {
  load ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([k]) =>
      (latex: string) =>
        k.default.renderToString(`\\displaystyle ${latex}`, { throwOnError: false, strict: false, output: 'html' }),
  )
  return load
}

/**
 * Fetch KaTeX in the background once the first screen is fully up: 3 s after the page has loaded,
 * then when the phone is idle. Any earlier and it competes with the first screen's own font and
 * data on a slow connection.
 */
export function preloadKatex() {
  const idle = () => {
    const start = () => void loadKatex()
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 })
    else start()
  }
  const later = () => setTimeout(idle, 3000)
  if (document.readyState === 'complete') later()
  else window.addEventListener('load', later, { once: true })
}
