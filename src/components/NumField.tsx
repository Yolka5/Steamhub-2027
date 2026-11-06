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
  max,
  whole,
  hint,
  help,
}: {
  label: string
  unit?: string
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  /** Only whole numbers, like a count of motors. */
  whole?: boolean
  /** Short reminder that is always shown. */
  hint?: string
  /** The longer explanation, shown when Explain is on. */
  help?: string
}) {
  const [text, setText] = useState(String(value))

  /** Why typed text can't be used, or null when it can. The last good value stays in use. */
  const problem = (t: string): string | null => {
    const n = Number(t.replace(',', '.'))
    if (t.trim() === '' || !Number.isFinite(n)) return 'Type a number.'
    if (min != null && n < min) return `Use ${min} or more.`
    if (max != null && n > max) return `Use ${max} or less.`
    if (whole && !Number.isInteger(n)) return 'Use a whole number.'
    return null
  }
  const error = problem(text)

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
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            if (!problem(t)) onChange(Number(t.replace(',', '.')))
          }}
          onKeyDown={(e) => {
            if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault()
              const n = +(value + (e.key === 'ArrowUp' ? step : -step)).toFixed(6)
              if (!problem(String(n))) onChange(n)
            }
          }}
        />
        {unit && <span className="num-field__unit">{unit}</span>}
      </span>
      {error && (
        <span className="num-field__error" role="alert">
          {error} Still using {value}.
        </span>
      )}
      {hint && <span className="help help--always">{hint}</span>}
      <Help text={help} />
    </label>
  )
}
