import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Maker, Part } from '../lib/mfg'
import { usePeople } from '../lib/useMfg'
import { Sheet } from './ui'

// The workshop PC signs in with one shared account (People marks it). Start on that account asks
// who is really making the part, so the map, history and "manufactured by" name the person.
// The same sheet picks who the workshop lead hands parts to. Both put recent picks first.

const RECENT_KEY = 'steamhub.recentPicks'
const RECENT_MAX = 8

/** The people picked last on this device, newest first. Kept in the browser: the shared PC is one device. */
function recentPicks(): Maker[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((m) => m && typeof m.name === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function remember(m: Maker) {
  try {
    const rest = recentPicks().filter((x) => (m.id ? x.id !== m.id : x.name !== m.name))
    localStorage.setItem(RECENT_KEY, JSON.stringify([m, ...rest].slice(0, RECENT_MAX)))
  } catch {
    // Private mode: no recent picks, the search still works.
  }
}

/**
 * `pick(part)` resolves to:
 * - `undefined` on a personal account (credit the signed-in person, as before),
 * - a Maker once someone is picked (or, for a part already assigned, its person without asking),
 * - `null` if the sheet was closed without picking.
 */
export function useClaimAs() {
  const { shared } = useAuth()
  const { people } = usePeople()
  const [asking, setAsking] = useState<Part | null>(null)
  const resolver = useRef<((m: Maker | null) => void) | null>(null)

  const pick = useCallback(
    (part: Part): Promise<Maker | null | undefined> => {
      if (!shared) return Promise.resolve(undefined)
      // It's their part: start it for them.
      const owner = part.assignee_id ? people.find((p) => p.id === part.assignee_id) : undefined
      if (owner) return Promise.resolve({ id: owner.id, name: owner.name })
      return new Promise((resolve) => {
        resolver.current = resolve
        setAsking(part)
      })
    },
    [shared, people],
  )

  const done = (m: Maker | null) => {
    resolver.current?.(m)
    resolver.current = null
    setAsking(null)
  }

  return {
    pick,
    picker: (
      <PersonSheet
        open={!!asking}
        title={asking ? `Who's making ${asking.part_no}?` : ''}
        sub="The workshop PC is shared, so pick your name for this part."
        typed="Start"
        onDone={done}
      />
    ),
  }
}

/** `ask(title)` opens the picker and resolves to the person, or null if closed. No typed names. */
export function usePickPerson() {
  const [title, setTitle] = useState<string | null>(null)
  const resolver = useRef<((m: { id: string; name: string } | null) => void) | null>(null)
  const ask = useCallback(
    (t: string) =>
      new Promise<{ id: string; name: string } | null>((resolve) => {
        resolver.current = resolve
        setTitle(t)
      }),
    [],
  )
  const done = (m: Maker | null) => {
    resolver.current?.(m && m.id ? { id: m.id, name: m.name } : null)
    resolver.current = null
    setTitle(null)
  }
  return { ask, sheet: <PersonSheet open={title != null} title={title ?? ''} onDone={done} /> }
}

function PersonSheet({ open, title, sub, typed, onDone }: { open: boolean; title: string; sub?: string; typed?: string; onDone: (m: Maker | null) => void }) {
  const { people } = usePeople()
  const { userId, shared } = useAuth()
  const [q, setQ] = useState('')
  const [other, setOther] = useState('')
  const [hint, setHint] = useState(false)

  // Real people only: not the shared account, nobody banned. The shared PC can't pick itself.
  const real = useMemo(() => people.filter((p) => !p.shared && !p.banned && !(shared && p.id === userId)), [people, shared, userId])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return real.filter((p) => !t || p.name.toLowerCase().includes(t))
  }, [real, q])
  // Recent picks that are still real accounts (or typed names, where those are allowed).
  const recent = useMemo(() => (open ? recentPicks() : []).filter((m) => (m.id ? real.some((p) => p.id === m.id) : !!typed)), [open, real, typed])

  const close = (m: Maker | null) => {
    if (m) remember(m)
    setQ('')
    setOther('')
    setHint(false)
    onDone(m)
  }

  const submitTyped = () => {
    const name = other.trim()
    if (!name) return setHint(true)
    close({ id: null, name })
  }

  return (
    <Sheet open={open} onClose={() => close(null)} title={title}>
      {sub && <p className="soft small who__sub">{sub}</p>}
      {recent.length > 0 && !q.trim() && (
        <div className="who__recent" aria-label="Picked lately">
          {recent.map((m) => (
            <button key={m.id ?? m.name} type="button" className="q-btn who__chip" onClick={() => close(m)}>
              <span className="avatar avatar--soft">{m.name[0]?.toUpperCase()}</span>
              {m.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}
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
        {!list.length && <li className="soft small who__none">{typed ? 'No one by that name. Type it below.' : 'No one by that name.'}</li>}
      </ul>
      {typed && (
        <form
          className="who__other"
          onSubmit={(e) => {
            e.preventDefault()
            submitTyped()
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
            {typed}
          </button>
        </form>
      )}
    </Sheet>
  )
}
