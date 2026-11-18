import { useEffect, useState } from 'react'
import { convert, readTyped, tidy } from '../lib/units'
import { Help } from './Help'

/**
 * A number input that lets people type freely ("0.", "-", "") and only reports a value when it
 * parses. Results update on every keystroke, so there is no Calculate button. A unit typed after
 * the number ("4in" in a mm field) is turned into the field's unit; the field shows the result
 * under it while typing and switches to it on leaving the field.
 */
export function NumField({
  label,
  unit,
  store,
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
  /** The unit shown and typed in. */
  unit?: string
  /** The unit `value` is saved in, when it isn't the shown one (saved in cm, shown in mm). */
  store?: string
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
  const toShown = (n: number) => (store && unit ? +convert(n, store, unit).toFixed(6) : n)
  const toStored = (n: number) => (store && unit ? +convert(n, unit, store).toFixed(6) : n)
  const shown = toShown(value)
  const [text, setText] = useState(tidy(shown))

  /** The typed number in the shown unit, or why it can't be used. The last good value stays in use. */
  const read = (t: string): { n: number | null; problem: string | null; from?: string } => {
    const r = readTyped(t, unit)
    if (r.value == null) return { n: null, problem: r.error ?? 'Type a number.' }
    const n = r.value
    if (min != null && toStored(n) < min) return { n: null, problem: `Use ${tidy(toShown(min))} or more.` }
    if (max != null && toStored(n) > max) return { n: null, problem: `Use ${tidy(toShown(max))} or less.` }
    if (whole && !Number.isInteger(n)) return { n: null, problem: 'Use a whole number.' }
    return { n, problem: null, from: r.from }
  }
  const now = read(text)

  // Follow outside changes (another person's save, a preset) unless the user is mid-edit.
  useEffect(() => {
    if (now.n == null || Math.abs(toStored(now.n) - value) > 1e-9) setText(tidy(shown))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const shownStep = step && store && unit ? convert(step, store, unit) : step

  return (
    <label className="num-field">
      <span className="num-field__label">{label}</span>
      <span className="num-field__box">
        <input
          className="num-field__input num"
          inputMode="decimal"
          value={text}
          aria-invalid={now.problem ? true : undefined}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            const r = read(t)
            if (r.n != null) onChange(toStored(r.n))
          }}
          onBlur={() => {
            if (now.from && now.n != null) setText(tidy(now.n))
          }}
          onKeyDown={(e) => {
            if (shownStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault()
              const n = +(shown + (e.key === 'ArrowUp' ? shownStep : -shownStep)).toFixed(6)
              if (!read(String(n)).problem) {
                setText(tidy(n))
                onChange(toStored(n))
              }
            }
            if (e.key === 'Enter' && now.from && now.n != null) setText(tidy(now.n))
          }}
        />
        {unit && <span className="num-field__unit">{unit}</span>}
      </span>
      {now.problem ? (
        <span className="num-field__error" role="alert">
          {now.problem} Still using {tidy(shown)}.
        </span>
      ) : (
        now.from && now.n != null && <span className="help help--always num">= {tidy(now.n)} {unit}</span>
      )}
      {hint && <span className="help help--always">{hint}</span>}
      <Help text={help} />
    </label>
  )
}
