import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

// ---------- Toast ----------

/** With undo, the toast gets an Undo button and stays long enough to reach it. */
type Toast = (msg: string, opts?: { undo?: () => void }) => void

const ToastContext = createContext<Toast>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; undo?: () => void } | null>(null)
  // An open sheet makes the rest of the page unreachable, Undo included, so the toast shows
  // inside the topmost open sheet while there is one.
  const [host, setHost] = useState<HTMLDialogElement | null>(null)
  const timer = useRef<number>(0)
  const show = useCallback<Toast>((msg, opts) => {
    const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    setHost(open[open.length - 1] ?? null)
    setT({ msg, undo: opts?.undo })
    window.clearTimeout(timer.current)
    // Long messages (usually errors) and Undo stay up longer than a quick "Saved".
    const ms = opts?.undo ? 6000 : Math.min(6000, Math.max(2600, msg.length * 55))
    timer.current = window.setTimeout(() => setT(null), ms)
  }, [])
  // The sheet closing (Delete, Save) hands the toast back to the page.
  useEffect(() => {
    if (!host) return
    const back = () => setHost(null)
    host.addEventListener('close', back)
    return () => host.removeEventListener('close', back)
  }, [host])
  const undo = () => {
    window.clearTimeout(timer.current)
    const fn = t?.undo
    setT(null)
    fn?.()
  }
  const toast = (
    <div className="toast" role="status" aria-live="polite" data-open={t ? 'true' : 'false'} data-undo={t?.undo ? 'true' : undefined}>
      <span>{t?.msg}</span>
      {t?.undo && (
        <button type="button" className="toast__undo" onClick={undo}>
          Undo
        </button>
      )}
    </div>
  )
  return (
    <ToastContext.Provider value={show}>
      {children}
      {host?.isConnected && host.open ? createPortal(toast, host) : toast}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// ---------- Couldn't load ----------

/**
 * What a page shows when its data didn't arrive, so a failed load never looks like an empty list
 * ("Nothing to make yet") or a deleted part.
 */
export function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mfg-empty" role="alert">
      <p className="empty">Couldn't load this.</p>
      <p className="soft">{navigator.onLine ? 'The connection dropped or the server is slow.' : 'No connection.'} Nothing was lost.</p>
      <button type="button" className="q-btn" onClick={() => (onRetry ? onRetry() : location.reload())}>
        Try again
      </button>
    </div>
  )
}

// ---------- One tap at a time ----------

/**
 * For every button that writes. A second tap while the first is still saving does nothing.
 * Busy state alone isn't enough: a double tap lands before the button re-renders as disabled.
 */
export function useBusy() {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined
    running.current = true
    setBusy(true)
    try {
      return await fn()
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return [busy, run] as const
}

// ---------- Copy a number ----------

/** Any value a CAD person might paste. Click copies it. */
export function Copy({ value, children }: { value: string | number; children?: ReactNode }) {
  const toast = useToast()
  return (
    <button
      type="button"
      className="copy num"
      title="Copy"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        navigator.clipboard?.writeText(String(value))
        toast(`Copied ${value}`)
      }}
    >
      {children ?? value}
    </button>
  )
}

// ---------- Sheet (dialog) ----------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // showModal focuses the close button, so hand focus to the field that should take typing.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="sheet__head">
        <h2 className="sheet__title">{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {open && children}
    </dialog>
  )
}
