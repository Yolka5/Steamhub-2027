import type { InputHTMLAttributes } from 'react'
import { readTyped, tidy } from '../lib/units'

/**
 * A text field for a number in one unit that also takes another unit typed after it: "2in" in a
 * mm field shows "= 50.8 mm" underneath and becomes 50.8 on leaving the field. Read the value with
 * numIn(text, unit).
 */
export function UnitInput({ value, onChange, unit, ...rest }: { value: string; onChange: (t: string) => void; unit: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const typed = /[^\d.,\-\s]/.test(value) ? readTyped(value, unit) : null
  return (
    <>
      <input
        className="field num"
        inputMode="decimal"
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (typed?.value != null) onChange(tidy(typed.value))
          rest.onBlur?.(e)
        }}
      />
      {typed && <span className={`small num ${typed.value == null ? 'error' : 'soft'}`}>{typed.value == null ? typed.error : `= ${tidy(typed.value)} ${unit}`}</span>}
    </>
  )
}
