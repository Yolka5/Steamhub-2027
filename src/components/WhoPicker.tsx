import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Maker, Part } from '../lib/mfg'
import { usePeople } from '../lib/useMfg'
import { Sheet } from './ui'

// The workshop PC signs in with one shared account (People marks it). Start on that account asks
// who is really making the part, so the map, history and "manufactured by" name the person.
// The same sheet picks who the workshop lead hands parts to. Both put recent picks first: whoever
// was handed parts lately, by any lead on any device, then this device's own picks.

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

/** People handed parts in the last two weeks, newest first, from any lead on any device. */
function useTeamRecent(open: boolean) {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    let live = true
    const since = new Date(Date.now() - 14 * 86400000).toISOString()
    supabase
      .from('parts')
      .select('assignee_id, assigned_at')
      .not('assignee_id', 'is', null)
      .gte('assigned_at', since)
      .order('assigned_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (live && data) setIds([...new Set(data.map((r) => r.assignee_id as string))])
      })
    return () => {
      live = false
    }
  }, [open])
  return ids
}

/**
 * `pick(part)` resolves to:
 * - `undefined` on a personal account (credit the signed-in person, as before),
 * - a Maker once someone is picked (or, for a part already assigned, its person without asking),
 * - `null` if the sheet was closed without picking.
 */
export function useClaimAs() {
  const { shared, room } = useAuth()
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
        sub={`The ${room === 'cnc' ? 'CNC' : 'workshop'} PC is shared, so pick your name for this part.`}
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
  const teamIds = useTeamRecent(open)
  // Recent first: people handed parts lately, then this device's picks. Only real accounts (or
  // typed names, where those are allowed).
  const recent = useMemo(() => {
    const team: Maker[] = teamIds.flatMap((id) => {
      const p = real.find((x) => x.id === id)
      return p ? [{ id: p.id, name: p.name }] : []
    })
    const mine = (open ? recentPicks() : []).filter((m) => (m.id ? real.some((p) => p.id === m.id) : !!typed))
    const seen = new Set<string>()
    return [...team, ...mine].filter((m) => {
      const k = m.id ?? `name:${m.name}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).slice(0, RECENT_MAX)
  }, [teamIds, open, real, typed])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const rank = new Map(recent.flatMap((m, i) => (m.id ? [[m.id, i] as const] : [])))
    return real
      .filter((p) => !t || p.name.toLowerCase().includes(t))
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
  }, [real, q, recent])

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
