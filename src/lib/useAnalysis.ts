import { useCallback, useEffect, useState } from 'react'
import { loadAnalysis } from './guide'
import type { Robot, Subsystem } from './mfg'
import type { Analysis } from './step/worker'
import { supabase } from './supabase'

// A subsystem with the bolt table and guide from its latest assembly upload.

export function useAnalysis(subId: string) {
  const [sub, setSub] = useState<Subsystem | null>(null)
  const [robot, setRobot] = useState<Robot | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [file, setFile] = useState<{ name: string; at: string; latest: boolean } | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [state, setState] = useState<'loading' | 'none' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let stop = false
    ;(async () => {
      const { data } = await supabase.from('subsystems').select('*, robot:robots(*)').eq('id', subId).maybeSingle()
      if (stop) return
      if (data) {
        const { robot: r, ...s } = data as Subsystem & { robot: Robot }
        setSub(s)
        setRobot(r)
      }
      const { data: ups } = await supabase.from('step_uploads').select('id, filename, uploaded_at, analysis_path').eq('subsystem_id', subId).order('uploaded_at', { ascending: false }).limit(10)
      const withA = (ups ?? []).find((u) => u.analysis_path)
      if (!withA) return !stop && setState('none')
      setPath(withA.analysis_path)
      setFile({ name: withA.filename, at: withA.uploaded_at, latest: ups![0].id === withA.id })
      try {
        const a = await loadAnalysis(withA.analysis_path)
        if (!stop) {
          setAnalysis(a)
          setState('ready')
        }
      } catch {
        if (!stop) setState('error')
      }
    })()
    return () => {
      stop = true
    }
  }, [subId])

  return { sub, robot, path, file, analysis, state }
}

/** Per-subsystem saved choices: joint types ("type:<key>") and shopping items ("item:<name>"). */
export function useHardwareState(subId: string) {
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({})
  const reload = useCallback(async () => {
    const { data } = await supabase.from('hardware').select('key, value').eq('subsystem_id', subId)
    setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value as Record<string, unknown>])))
  }, [subId])
  useEffect(() => {
    reload()
  }, [reload])
  const set = useCallback(
    async (key: string, value: Record<string, unknown>, by: string) => {
      setValues((v) => ({ ...v, [key]: value }))
      const { error } = await supabase.from('hardware').upsert({ subsystem_id: subId, key, value, updated_by_name: by, updated_at: new Date().toISOString() })
      return error?.message ?? null
    },
    [subId],
  )
  return { values, set }
}
