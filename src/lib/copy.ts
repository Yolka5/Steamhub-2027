/**
 * Copies text and says whether it worked. The Clipboard API is missing or refused in some phone
 * browsers (in-app browsers, older iOS, no permission), so it falls back to the old select-and-copy
 * trick before giving up. Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused: try the fallback below.
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // Off screen, and 16px so iOS doesn't zoom in on it.
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
