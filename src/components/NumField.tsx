import { useEffect, useState } from 'react'
import { Help } from './Help'

/**
 * A number input that lets people type freely ("0.", "-", "") and only reports a value when it
 * parses. Results update on every keystroke, so there is no Calculate button.
 */
export function NumField({
  label,
  unit,
  value,
  onChange,
  step,
  min,
  hint,
  help,
}: {
  label: string
  unit?: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  /** Short reminder that is always shown. */
  hint?: string
  /** The longer explanation, shown when Explain is on. */
  help?: string
}) {
  const [text, setText] = useState(String(value))

  // Follow outside changes (another person's save, a preset) unless the user is mid-edit.
  useEffect(() => {
    if (Number(text.replace(',', '.')) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label className="num-field">
      <span className="num-field__label">{label}</span>
      <span className="num-field__box">
        <input
          className="num-field__input num"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            const n = Number(t.replace(',', '.'))
            if (t.trim() !== '' && Number.isFinite(n) && (min == null || n >= min)) onChange(n)
          }}
          onKeyDown={(e) => {
            if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault()
              const n = +(value + (e.key === 'ArrowUp' ? step : -step)).toFixed(6)
              if (min == null || n >= min) onChange(n)
            }
          }}
        />
        {unit && <span className="num-field__unit">{unit}</span>}
      </span>
      {hint && <span className="help help--always">{hint}</span>}
      <Help text={help} />
    </label>
  )
}
