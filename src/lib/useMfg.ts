import { useCallback, useEffect, useState } from 'react'
import { PROFILE_COLUMNS, type Part, type Profile, type Robot, type Subsystem, type Upload } from './mfg'
import { selectAll, supabase } from './supabase'
import { useReloadOnReturn } from './useReturn'

// Small loaders for the Manufacturing pages. Lists are small (hundreds of parts), so each page
// loads what it shows and keeps it live with realtime.

let peopleCache: Promise<Profile[]> | null = null
const loadPeople = () => Promise.resolve(supabase.from('profiles').select(PROFILE_COLUMNS).order('name')).then(({ data }) => (data as Profile[] | null) ?? [])

export function usePeople() {
  const [people, setPeople] = useState<Profile[]>([])
  useEffect(() => {
    peopleCache ??= loadPeople()
    peopleCache.then(setPeople)
  }, [])
  const reload = useCallback(async () => {
    peopleCache = loadPeople()
    setPeople(await peopleCache)
  }, [])
  return { people, nameOf: (id: string | null) => people.find((p) => p.id === id)?.name ?? null, reload }
}

/** Parts matching a filter, kept in sync with everyone else's changes. */
export function useParts(filter: { subsystemId?: string; released?: boolean }) {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { subsystemId, released } = filter

  const reload = useCallback(async () => {
    const { data, error } = await selectAll<Part>(() => {
      let q = supabase.from('parts').select('*').order('part_no').order('id')
      if (subsystemId) q = q.eq('subsystem_id', subsystemId)
      if (released) q = q.not('released_at', 'is', null)
      return q
    })
    // A failed reload keeps what's on screen; only the first load shows the error.
    if (data) setParts(data)
    setError(error?.message ?? null)
    setLoading(false)
  }, [subsystemId, released])
  useReloadOnReturn(reload)

  useEffect(() => {
    reload()
    const channel = supabase
      .channel(`parts-${subsystemId ?? 'all'}-${released ? 'r' : 'a'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts', ...(subsystemId ? { filter: `subsystem_id=eq.${subsystemId}` } : {}) }, (msg) => {
        setParts((list) => {
          if (msg.eventType === 'DELETE') return list.filter((x) => x.id !== (msg.old as Part).id)
          const row = msg.new as Part
          const keep = !released || !!row.released_at
          const i = list.findIndex((x) => x.id === row.id)
          if (i === -1) return keep ? [...list, row].sort((a, b) => a.part_no - b.part_no) : list
          if (!keep) return list.filter((x) => x.id !== row.id)
          const next = list.slice()
          next[i] = row
          return next
        })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload, subsystemId, released])

  /** Applies a saved row right away, before realtime echoes it. */
  const put = useCallback((rows: Part | Part[]) => {
    const list = Array.isArray(rows) ? rows : [rows]
    setParts((cur) => {
      const next = cur.slice()
      for (const r of list) {
        const i = next.findIndex((x) => x.id === r.id)
        if (i === -1) next.push(r)
        else next[i] = r
      }
      return next.sort((a, b) => a.part_no - b.part_no)
    })
  }, [])

  return { parts, loading, error, reload, put }
}

export function useRobots() {
  const [robots, setRobots] = useState<Robot[]>([])
  const [subs, setSubs] = useState<Subsystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase.from('robots').select('*').order('created_at', { ascending: false }),
      supabase.from('subsystems').select('*').order('number'),
    ])
    if (r.data) setRobots(r.data as Robot[])
    if (s.data) setSubs(s.data as Subsystem[])
    setError(r.error?.message ?? s.error?.message ?? null)
    setLoading(false)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  useReloadOnReturn(reload)
  return { robots, subs, loading, error, reload }
}

export function useSubsystem(id: string) {
  const [sub, setSub] = useState<Subsystem | null>(null)
  const [robot, setRobot] = useState<Robot | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    // Both at once: the uploads don't depend on the subsystem row.
    const [{ data, error }, u] = await Promise.all([
      supabase.from('subsystems').select('*, robot:robots(*)').eq('id', id).maybeSingle(),
      supabase.from('step_uploads').select('*').eq('subsystem_id', id).order('uploaded_at', { ascending: false }).limit(5),
    ])
    if (data) {
      const { robot: r, ...s } = data as Subsystem & { robot: Robot }
      setSub(s)
      setRobot(r)
    }
    if (u.data) setUploads(u.data as Upload[])
    setError(error?.message ?? null)
    setLoading(false)
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  return { sub, robot, uploads, loading, error, reload, setSub }
}
