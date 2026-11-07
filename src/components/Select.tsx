import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

// Every dropdown in Steamhub. With a mouse it opens Steamhub's own menu: same surfaces, a tick on
// the chosen item, arrow keys, typing a letter jumps. On touch (phones, the workshop screen) it's
// the native select, because the phone's own picker beats anything custom.
// Menus open in the browser's top layer (popover), so sheets and lists never clip them.

export interface Option {
  value: string
  label: string
  /** Options with the same group are listed under that heading. */
  group?: string
}

const touch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

// ---------- The floating list ----------

function useMenuPosition(anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLDivElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const m = menu.current
    const a = anchor.current
    if (!open || !m || !a) return
    const place = () => {
      const r = a.getBoundingClientRect()
      const below = window.innerHeight - r.bottom - 12
      const above = r.top - 12
      const want = Math.min(m.scrollHeight, 288)
      const up = below < want && above > below
      m.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, m.offsetWidth) - 8))}px`
      m.style.minWidth = `${r.width}px`
      m.style.maxHeight = `${Math.max(120, Math.min(288, up ? above : below))}px`
      m.style.top = up ? 'auto' : `${r.bottom + 6}px`
      m.style.bottom = up ? `${window.innerHeight - r.top + 6}px` : 'auto'
      m.dataset.side = up ? 'top' : 'bottom'
    }
    if (m.showPopover && !m.matches(':popover-open')) m.showPopover()
    place()
    // Follows the field while the page or a sheet scrolls under it.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      if (m.hidePopover && m.matches(':popover-open')) m.hidePopover()
    }
  }, [open, anchor, menu])
}

function useOutside(open: boolean, refs: RefObject<HTMLElement | null>[], close: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, refs, close])
}

function Menu({
  id,
  menuRef,
  options,
  value,
  active,
  setActive,
  pick,
  animate,
  empty,
}: {
  id: string
  menuRef: RefObject<HTMLDivElement | null>
  options: Option[]
  value: string | null
  active: number
  setActive: (i: number) => void
  pick: (o: Option) => void
  animate: boolean
  empty?: ReactNode
}) {
  // Opens scrolled to the current choice, then keeps the highlighted item in view while arrowing.
  // Scrolls only the list itself, never the page.
  const reveal = (el: HTMLElement | null | undefined) => {
    const m = menuRef.current
    if (!m || !el) return
    if (el.offsetTop < m.scrollTop) m.scrollTop = el.offsetTop - 4
    else if (el.offsetTop + el.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = el.offsetTop + el.offsetHeight - m.clientHeight + 4
  }
  useLayoutEffect(() => {
    reveal(menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (active >= 0) reveal(menuRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  let lastGroup: string | undefined
  return (
    <div ref={menuRef} id={id} className="menu-pop" role="listbox" popover="manual" data-anim={animate || undefined}>
      {options.length === 0 && empty}
      {options.map((o, i) => {
        const head = o.group && o.group !== lastGroup ? o.group : null
        lastGroup = o.group
        return (
          <div key={`${o.group ?? ''}|${o.value}`}>
            {head && <div className="menu-pop__label">{head}</div>}
            <div
              role="option"
              id={`${id}-${i}`}
              data-i={i}
              aria-selected={o.value === value}
              className={`menu-pop__item${i === active ? ' is-active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => pick(o)}
            >
              {o.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Select ----------

export function Select({
  value,
  options,
  onChange,
  label,
  className = '',
  placeholder = 'Pick one',
  autoFocus,
}: {
  value: string
  options: Option[]
  onChange: (value: string) => void
  /** Read out to screen readers; the visible label sits next to it. */
  label?: string
  className?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const native = useMemo(touch, [])
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [animate, setAnimate] = useState(true)
  const [active, setActive] = useState(-1)
  const typed = useRef({ text: '', at: 0 })
  const current = options.find((o) => o.value === value)

  useMenuPosition(btn, menu, open)
  const refs = useMemo(() => [btn, menu], [])
  useOutside(open, refs, () => setOpen(false))

  if (native) {
    const groups = [...new Set(options.map((o) => o.group))]
    const opt = (o: Option) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    )
    return (
      <select className={`field select ${className}`} value={value} aria-label={label} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}>
        {!current && <option value={value}>{placeholder}</option>}
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options.filter((o) => o.group === g).map(opt)}
            </optgroup>
          ) : (
            options.filter((o) => !o.group).map(opt)
          ),
        )}
      </select>
    )
  }

  const show = (byKey: boolean) => {
    setAnimate(!byKey)
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const pick = (o: Option) => {
    setOpen(false)
    btn.current?.focus()
    if (o.value !== value) onChange(o.value)
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show(true)
      }
      return
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (options[active]) pick(options[active])
    } else if (e.key.length === 1) {
      // Typing jumps to the first option that starts with what was typed.
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (i >= 0) setActive(i)
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`field select select--menu ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        aria-label={label ? `${label}: ${current?.label ?? placeholder}` : undefined}
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        onClick={() => (open ? setOpen(false) : show(false))}
        onKeyDown={onKey}
      >
        <span className="select__value" data-empty={!current || undefined}>
          {current?.label ?? placeholder}
        </span>
        <span className="select__chev" aria-hidden="true" />
      </button>
      {open && <Menu id={id} menuRef={menu} options={options} value={value} active={active} setActive={setActive} pick={pick} animate={animate} />}
    </>
  )
}

// ---------- Combo: type anything, or pick a suggestion ----------

export function Combo({
  value,
  options,
  onChange,
  onCommit,
  label,
  className = '',
  placeholder,
  autoFocus,
}: {
  value: string
  options: string[]
  /** Every keystroke, for a field the parent holds in state. */
  onChange?: (value: string) => void
  /** Once, when the person leaves the field or picks a suggestion: for fields that save on their own. */
  onCommit?: (value: string) => void
  label?: string
  className?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [typing, setTyping] = useState(false)
  // Picking a suggestion already saved; the blur that follows must not save the old text again.
  const picked = useRef(false)

  // A saved value from elsewhere (another person, a reload) replaces the text when not editing.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(value)
  }, [value])

  const t = text.trim().toLowerCase()
  // Everything until the person types; then only what matches.
  const list = useMemo<Option[]>(
    () => options.filter((o) => !typing || !t || o.toLowerCase().includes(t)).map((o) => ({ value: o, label: o })),
    [options, t, typing],
  )
  const shown = open && list.length > 0

  useMenuPosition(input, menu, shown)
  const refs = useMemo(() => [input, menu], [])
  useOutside(shown, refs, () => setOpen(false))

  const set = (v: string) => {
    setText(v)
    onChange?.(v)
  }
  const pick = (o: Option) => {
    set(o.value)
    setOpen(false)
    if (o.value !== value) onCommit?.(o.value)
    picked.current = true
    input.current?.blur()
  }

  return (
    <>
      <input
        ref={input}
        className={`field ${className}`}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        data-autofocus={autoFocus || undefined}
        role="combobox"
        aria-expanded={shown}
        aria-controls={shown ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        onFocus={() => {
          setTyping(false)
          setActive(-1)
          setOpen(true)
        }}
        onChange={(e) => {
          set(e.target.value)
          setTyping(true)
          setActive(-1)
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
          if (picked.current) {
            picked.current = false
            return
          }
          if (text.trim() !== value) onCommit?.(text.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(list.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            if (shown && list[active]) {
              e.preventDefault()
              pick(list[active])
            } else if (onCommit) {
              e.preventDefault()
              input.current?.blur()
            }
          } else if (e.key === 'Escape' && shown) {
            e.preventDefault()
            setOpen(false)
          }
        }}
      />
      {shown && <Menu id={id} menuRef={menu} options={list} value={text} active={active} setActive={setActive} pick={pick} animate />}
    </>
  )
}
