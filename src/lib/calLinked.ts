import { useEffect, useMemo, useRef, useState } from 'react'
import type { Phase } from './cal'
import { countParts } from './counts'
import { notify, type Part } from './mfg'
import { usePrototypes } from './proto'
import { selectAll, supabase } from './supabase'
import { useRobots } from './useMfg'
import type { Cal } from './useCal'

// Progress inside each phase, from what Steamhub already knows. Nobody types a percentage.
//   Prototypes     prototypes and tests for the subsystem, and the chosen one
//   CAD            parts released out of made parts, for that robot's subsystem
//   Manufacturing  parts done out of made parts, and bought parts got
//   anything else  the phase's tasks done
// When the data says a phase is finished, the lead is asked (once) to finish it. Never automatic.

export interface Progress {
  /** 0 to 1, or null when there's nothing to count yet. */
  share: number | null
  line: string
  /** Asked when the data says the phase is finished. */
  suggest: string | null
  /** What "Not yet" was pressed at; the question comes back once this changes. */
  key: string
}

type Slim = Pick<Part, 'subsystem_id' | 'status' | 'machine' | 'released_at'>

export function useLinked(season: number | null, cal: Pick<Cal, 'groups' | 'phases' | 'tasks'>) {
  const { robots, subs } = useRobots()
  const { prototypes, tests } = usePrototypes(season)
  const [parts, setParts] = useState<Slim[]>([])

  const seasonSubs = useMemo(() => {
    const rs = new Set(robots.filter((r) => r.season === season && r.version != null).map((r) => r.id))
    return subs.filter((s) => rs.has(s.robot_id))
  }, [robots, subs, season])
  const subKey = seasonSubs.map((s) => s.id).join(',')

  useEffect(() => {
    if (!subKey) return
    let live = true
    const load = () =>
      selectAll<Slim>(() => supabase.from('parts').select('subsystem_id, status, machine, released_at').in('subsystem_id', subKey.split(',')).order('id')).then(({ data }) => {
        if (live && data) setParts(data)
      })
    load()
    // Parts change all day in the workshop; the progress follows.
    const ch = supabase
      .channel(`cal-parts-${subKey.length}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, () => load())
      .subscribe()
    return () => {
      live = false
      supabase.removeChannel(ch)
    }
  }, [subKey])

  return useMemo(() => {
    const out = new Map<string, Progress>()
    const groupOf = new Map(cal.groups.map((g) => [g.id, g]))
    for (const ph of cal.phases) {
      const g = groupOf.get(ph.group_id)
      if (!g) continue
      if (ph.kind === 'prototypes' && g.subsystem_number != null) {
        const mine = prototypes.filter((p) => p.subsystem_number === g.subsystem_number && p.status !== 'dropped')
        const t = tests.filter((x) => mine.some((p) => p.id === x.prototype_id)).length
        const chosen = mine.find((p) => p.status === 'chosen')
        out.set(ph.id, {
          share: chosen ? 1 : null,
          line: mine.length ? `${mine.length} ${mine.length === 1 ? 'prototype' : 'prototypes'} · ${t} ${t === 1 ? 'test' : 'tests'}${chosen ? ` · ${chosen.name} chosen` : ''}` : 'No prototypes yet',
          suggest: chosen ? `${chosen.name} was chosen. Finish ${ph.name}?` : null,
          key: `p:${chosen?.id ?? ''}`,
        })
        continue
      }
      if ((ph.kind === 'cad' || ph.kind === 'manufacturing') && g.subsystem_number != null) {
        const sub = seasonSubs.find((s) => s.robot_id === ph.robot_id && s.number === g.subsystem_number)
        const c = countParts(sub ? parts.filter((p) => p.subsystem_id === sub.id) : [])
        if (ph.kind === 'cad') {
          out.set(ph.id, {
            share: c.made ? c.released / c.made : null,
            line: c.made ? `${c.released} of ${c.made} parts released` : 'No STEP uploaded yet',
            suggest: c.made && c.released === c.made ? `All ${c.made} parts released. Finish ${ph.name}?` : null,
            key: `c:${c.released}/${c.made}`,
          })
        } else {
          const ready = (c.made > 0 && c.done === c.made && c.got === c.bought) || !!sub?.assembled
          out.set(ph.id, {
            share: c.made ? c.done / c.made : null,
            line: c.made ? `${c.done} of ${c.made} parts made${c.bought ? ` · ${c.got} of ${c.bought} bought in` : ''}` : 'Nothing released yet',
            suggest: ready ? `Every part is made${c.bought ? ' and in' : ''}. Finish ${ph.name}?` : null,
            key: `m:${c.done}/${c.made}/${c.got}/${c.bought}`,
          })
        }
        continue
      }
      const list = cal.tasks.filter((t) => t.phase_id === ph.id && !t.parent_id)
      const done = list.filter((t) => t.status === 'done').length
      out.set(ph.id, {
        share: list.length ? done / list.length : null,
        line: list.length ? `${done} of ${list.length} tasks done` : 'No tasks yet',
        suggest: list.length && done === list.length ? `Every task is done. Finish ${ph.name}?` : null,
        key: `t:${done}/${list.length}`,
      })
    }
    return out
  }, [cal.groups, cal.phases, cal.tasks, prototypes, tests, parts, seasonSubs])
}

/** A suggestion is shown until the phase is finished, or "Not yet" was pressed at the same progress. */
export const showSuggest = (ph: Phase, p: Progress | undefined) => !!p?.suggest && !ph.done_at && ph.dismissed_for !== p.key

/** The group's lead hears about each suggestion once, whoever's screen noticed it first. */
export function useSuggestNotify(cal: Pick<Cal, 'groups' | 'phases'>, linked: Map<string, Progress>, me: string | null) {
  const asked = useRef(new Set<string>())
  useEffect(() => {
    for (const ph of cal.phases) {
      const p = linked.get(ph.id)
      if (!showSuggest(ph, p) || ph.suggested_at || asked.current.has(ph.id)) continue
      const g = cal.groups.find((x) => x.id === ph.group_id)
      if (!g?.lead_id) continue
      asked.current.add(ph.id)
      supabase
        .from('cal_phases')
        .update({ suggested_at: new Date().toISOString() })
        .eq('id', ph.id)
        .is('suggested_at', null)
        .select('id')
        .then(({ data }) => {
          // The lead looking at it right now sees the question on screen instead.
          if (data?.length) notify([g.lead_id], 'phase_suggest', `${g.name}: ${p!.suggest}`, `/calendar/g/${g.id}`, me ?? undefined)
        })
    }
  }, [cal.phases, cal.groups, linked, me])
}
