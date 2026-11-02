import { useCallback, useEffect, useState } from 'react'
import type { Robot } from './calc'
import { DEFAULT_ROBOT } from './calcDefaults'
import { supabase } from './supabase'

// The team shares one robot. Anyone can change numbers freely: changes stay a private draft on
// this device (and survive a reload) until "Save to team robot". Nothing anyone tries breaks
// what everyone else sees.

const ROBOT_ID = 'main'
const DRAFT_KEY = 'calc-draft'

interface Remote {
  data: Robot
  updatedAt: string | null
  updatedBy: string | null
}

interface Draft {
  data: Robot
  base: string | null // updated_at of the team robot the draft started from
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage blocked: the draft just lives in memory */
  }
}

export function useCalcRobot(who: { userId: string; name: string } | null) {
  const [remote, setRemote] = useState<Remote>({ data: DEFAULT_ROBOT, updatedAt: null, updatedBy: null })
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraftState] = useState<Draft | null>(readDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apply = (row: { data: Robot; updated_at: string; updated_by_name: string | null }) =>
      setRemote({ data: row.data, updatedAt: row.updated_at, updatedBy: row.updated_by_name })

    supabase
      .from('calc_robots')
      .select('data, updated_at, updated_by_name')
      .eq('id', ROBOT_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (data) apply(data as never)
        setLoaded(true)
      })

    const channel = supabase
      .channel('calc-robot')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calc_robots', filter: `id=eq.${ROBOT_ID}` }, (msg) => {
        if (msg.new && 'data' in msg.new) apply(msg.new as never)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const setDraft = useCallback((d: Draft | null) => {
    setDraftState(d)
    writeDraft(d)
  }, [])

  const robot = draft?.data ?? remote.data

  /** Every edit goes through here. The first edit starts a draft from the team robot. */
  const update = useCallback(
    (fn: (r: Robot) => Robot) => {
      setDraftState((d) => {
        const next: Draft = { data: fn(d?.data ?? remote.data), base: d?.base ?? remote.updatedAt }
        writeDraft(next)
        return next
      })
    },
    [remote],
  )

  const save = useCallback(async () => {
    if (!draft || !who) return
    setSaving(true)
    setError(null)
    const { data, error } = await supabase
      .from('calc_robots')
      .upsert({ id: ROBOT_ID, data: draft.data, updated_by: who.userId, updated_by_name: who.name })
      .select('data, updated_at, updated_by_name')
      .single()
    setSaving(false)
    if (error) return setError(error.message)
    setRemote({ data: data.data as Robot, updatedAt: data.updated_at, updatedBy: data.updated_by_name })
    setDraft(null)
  }, [draft, who, setDraft])

  const discard = useCallback(() => setDraft(null), [setDraft])

  return {
    robot,
    loaded,
    hasDraft: !!draft,
    /** Someone saved the team robot after this draft started. */
    teamChanged: !!draft && draft.base !== remote.updatedAt && remote.updatedAt != null,
    updatedAt: remote.updatedAt,
    updatedBy: remote.updatedBy,
    update,
    save,
    discard,
    saving,
    error,
  }
}
