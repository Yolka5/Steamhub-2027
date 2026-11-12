import { useCallback, useRef, useState } from 'react'
import { Sheet } from './ui'

// One text box and one button: why a part is rejected, what to ask, what was made differently.

interface Ask {
  title: string
  sub: string
  placeholder: string
  button: string
}

/** `write(ask)` opens the sheet and resolves to the note, or null if it was closed. */
export function useNote() {
  const [asking, setAsking] = useState<Ask | null>(null)
  const resolver = useRef<((v: string | null) => void) | null>(null)
  const write = useCallback(
    (a: Ask) =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve
        setAsking(a)
      }),
    [],
  )
  const done = (v: string | null) => {
    resolver.current?.(v)
    resolver.current = null
    setAsking(null)
  }
  return { write, sheet: <NoteSheet ask={asking} onDone={done} /> }
}

function NoteSheet({ ask, onDone }: { ask: Ask | null; onDone: (v: string | null) => void }) {
  const [text, setText] = useState('')
  const [hint, setHint] = useState(false)
  const close = (v: string | null) => {
    setText('')
    setHint(false)
    onDone(v)
  }
  return (
    <Sheet open={!!ask} onClose={() => close(null)} title={ask?.title ?? ''}>
      {ask && (
        <form
          className="note-sheet"
          onSubmit={(e) => {
            e.preventDefault()
            const v = text.trim()
            if (!v) return setHint(true)
            close(v)
          }}
        >
          <p className="soft small">{ask.sub}</p>
          <textarea
            className="field"
            rows={3}
            dir="auto"
            data-autofocus
            value={text}
            placeholder={ask.placeholder}
            onChange={(e) => {
              setText(e.target.value)
              setHint(false)
            }}
            aria-label={ask.title}
          />
          {hint && <p className="error small">Write a few words first.</p>}
          <button type="submit" className="q-btn q-btn--main">
            {ask.button}
          </button>
        </form>
      )}
    </Sheet>
  )
}
