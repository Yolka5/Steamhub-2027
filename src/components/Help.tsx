import { useExplain } from '../lib/explain'

/** The workbook's explanation for a field, shown only while Explain is on. */
export function Help({ text, className = '' }: { text?: string; className?: string }) {
  const { on } = useExplain()
  if (!on || !text) return null
  return <span className={`help ${className}`}>{text}</span>
}

export function ExplainToggle() {
  const { on, set } = useExplain()
  return (
    <button type="button" className="q-btn explain-toggle" aria-pressed={on} onClick={() => set(!on)}>
      {on ? 'Hide explanations' : 'Explain'}
    </button>
  )
}
