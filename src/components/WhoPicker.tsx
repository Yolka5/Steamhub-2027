import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Maker, Part } from '../lib/mfg'
import { usePeople } from '../lib/useMfg'
import { Sheet } from './ui'

// The workshop PC signs in with one shared account (People marks it). Start on that account asks
// who is really making the part, so the map, history and "manufactured by" name the person.

/**
 * `pick(part)` resolves to:
 * - `undefined` on a personal account (credit the signed-in person, as before),
 * - a Maker once someone is picked,
 * - `null` if the sheet was closed without picking.
 */
export function useClaimAs() {
  const { profile } = useAuth()
  const [asking, setAsking] = useState<Part | null>(null)
  const resolver = useRef<((m: Maker | null) => void) | null>(null)

  const pick = useCallback(
    (part: Part): Promise<Maker | null | undefined> => {
      if (!profile?.shared) return Promise.resolve(undefined)
      return new Promise((resolve) => {
        resolver.current = resolve
        setAsking(part)
      })
    },
    [profile?.shared],
  )

  const done = (m: Maker | null) => {
    resolver.current?.(m)
    resolver.current = null
    setAsking(null)
  }

  return { pick, picker: <WhoPicker part={asking} onDone={done} /> }
}

function WhoPicker({ part, onDone }: { part: Part | null; onDone: (m: Maker | null) => void }) {
  const { people } = usePeople()
  const { userId } = useAuth()
  const [q, setQ] = useState('')
  const [other, setOther] = useState('')
  const [hint, setHint] = useState(false)

  // Real people only: not the shared account itself, nobody banned.
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return people.filter((p) => p.id !== userId && !p.shared && !p.banned && (!t || p.name.toLowerCase().includes(t)))
  }, [people, q, userId])

  const close = (m: Maker | null) => {
    setQ('')
    setOther('')
    setHint(false)
    onDone(m)
  }

  const typed = () => {
    const name = other.trim()
    if (!name) return setHint(true)
    close({ id: null, name })
  }

  return (
    <Sheet open={!!part} onClose={() => close(null)} title={part ? `Who's making ${part.part_no}?` : ''}>
      <p className="soft small who__sub">The workshop PC is shared, so pick your name for this part.</p>
      <input
        className="field"
        type="search"
        placeholder="Search names"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search names"
        data-autofocus
        autoComplete="off"
      />
      <ul className="who__names">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" className="who__name" onClick={() => close({ id: p.id, name: p.name })}>
              <span className="avatar avatar--soft">{p.name[0]?.toUpperCase()}</span>
              {p.name}
            </button>
          </li>
        ))}
        {!list.length && <li className="soft small who__none">No one by that name. Type it below.</li>}
      </ul>
      <form
        className="who__other"
        onSubmit={(e) => {
          e.preventDefault()
          typed()
        }}
      >
        <input
          className="field"
          placeholder={hint ? 'Type a name first' : 'Not on the list? Type your name'}
          value={other}
          onChange={(e) => {
            setOther(e.target.value)
            setHint(false)
          }}
          aria-label="Your name, if it isn't on the list"
          autoComplete="off"
        />
        <button type="submit" className="q-btn q-btn--main">
          Start
        </button>
      </form>
    </Sheet>
  )
}
