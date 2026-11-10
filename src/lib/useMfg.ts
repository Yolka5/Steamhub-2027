import { useCallback, useEffect, useState } from 'react'
import type { Part, Profile, Robot, Subsystem, Upload } from './mfg'
import { supabase } from './supabase'

// Small loaders for the Manufacturing pages. Lists are small (hundreds of parts), so each page
// loads what it shows and keeps it live with realtime.

let peopleCache: Promise<Profile[]> | null = null

export function usePeople() {
  const [people, setPeople] = useState<Profile[]>([])
  useEffect(() => {
    peopleCache ??= Promise.resolve(supabase.from('profiles').select('*').order('name')).then(({ data }) => (data as Profile[]) ?? [])
    peopleCache.then(setPeople)
  }, [])
  const reload = useCallback(async () => {
    peopleCache = Promise.resolve(supabase.from('profiles').select('*').order('name')).then(({ data }) => (data as Profile[]) ?? [])
    setPeople(await peopleCache)
  }, [])
  return { people, nameOf: (id: string | null) => people.find((p) => p.id === id)?.name ?? null, reload }
}

/** Parts matching a filter, kept in sync with everyone else's changes. */
export function useParts(filter: { subsystemId?: string; released?: boolean }) {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const { subsystemId, released } = filter

  const reload = useCallback(async () => {
    let q = supabase.from('parts').select('*').order('part_no')
    if (subsystemId) q = q.eq('subsystem_id', subsystemId)
    if (released) q = q.not('released_at', 'is', null)
    const { data } = await q
    setParts((data as Part[]) ?? [])
    setLoading(false)
  }, [subsystemId, released])

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

  return { parts, loading, reload, put }
}

export function useRobots() {
  const [robots, setRobots] = useState<Robot[]>([])
  const [subs, setSubs] = useState<Subsystem[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase.from('robots').select('*').order('created_at', { ascending: false }),
      supabase.from('subsystems').select('*').order('number'),
    ])
    setRobots((r.data as Robot[]) ?? [])
    setSubs((s.data as Subsystem[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { robots, subs, loading, reload }
}

export function useSubsystem(id: string) {
  const [sub, setSub] = useState<Subsystem | null>(null)
  const [robot, setRobot] = useState<Robot | null>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    // Both at once: the uploads don't depend on the subsystem row.
    const [{ data }, u] = await Promise.all([
      supabase.from('subsystems').select('*, robot:robots(*)').eq('id', id).maybeSingle(),
      supabase.from('step_uploads').select('*').eq('subsystem_id', id).order('uploaded_at', { ascending: false }).limit(5),
    ])
    if (data) {
      const { robot: r, ...s } = data as Subsystem & { robot: Robot }
      setSub(s)
      setRobot(r)
    }
    setUploads((u.data as Upload[]) ?? [])
    setLoading(false)
  }, [id])
  useEffect(() => {
    reload()
  }, [reload])
  return { sub, robot, uploads, loading, reload, setSub }
}
