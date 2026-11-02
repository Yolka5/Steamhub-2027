import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

// ---------- Toast ----------

const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>(0)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast" role="status" aria-live="polite" data-open={msg ? 'true' : 'false'}>
        {msg}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

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
