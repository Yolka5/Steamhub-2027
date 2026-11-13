import { useCallback, useEffect, useState } from 'react'
import { selectAll, supabase } from './supabase'
import { useReloadOnReturn } from './useReturn'
import { updatePart, type Part, type Who } from './mfg'

// CNC plate stock and end mills. Plates have no labels; they're found by size. One row per
// physical plate, so each can be Available, Partly used (someone cut from it, there may be enough
// left) or Gone. See MANUFACTURING.md, phase 3.

export type PlateState = 'available' | 'partly_used' | 'gone'

export interface Plate {
  id: string
  material: string
  thickness: number
  length: number
  width: number
  state: PlateState
  source: 'sheet' | 'manual'
  notes: string | null
  updated_by_name: string | null
  updated_at: string
}

export interface EndMill {
  id: string
  flutes: number
  diameter: number
  qty: number
  /** What the sheet said at the last sync; differs from qty when Steamhub changed it since. */
  sheet_qty: number | null
}

export interface SheetSetting {
  url: string
  endmill_tab: string
  low_m2: number
  synced_at: string | null
  synced_by?: string
  /** Set by the merging sync. Only then is it safe to sync on every page open. */
  merges?: boolean
}

export const STATE_WORD: Record<PlateState, string> = { available: 'Available', partly_used: 'Partly used', gone: 'Gone' }

export const plateArea = (p: Pick<Plate, 'length' | 'width'>) => (p.length * p.width) / 1e6

/** "6.35" for a plate thickness, "5" for whole numbers. */
export const tText = (t: number) => String(+Number(t).toFixed(3))

export function usePlates() {
  const [plates, setPlates] = useState<Plate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await selectAll<Plate>(() => supabase.from('plates').select('*').order('thickness').order('length', { ascending: false }).order('id'))
    if (data) setPlates(data.map((p) => ({ ...p, thickness: Number(p.thickness), length: Number(p.length), width: Number(p.width) })))
    setError(error?.message ?? null)
    setLoading(false)
  }, [])
  useReloadOnReturn(reload)
  useEffect(() => {
    reload()
    const channel = supabase
      .channel('plates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plates' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])
  return { plates, loading, error, reload, setPlates }
}

export async function setPlateState(id: string, state: PlateState, who: { userId: string; name: string }) {
  const { data, error } = await supabase
    .from('plates')
    .update({ state, updated_by: who.userId, updated_by_name: who.name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return error ? { error: error.message } : { data: data as Plate }
}

export function useSheetSetting() {
  const [setting, setSetting] = useState<SheetSetting | null>(null)
  const reload = useCallback(async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'plate_sheet').maybeSingle()
    setSetting((data?.value as SheetSetting) ?? null)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { setting, reload }
}

export async function saveSheetSetting(value: SheetSetting) {
  const { error } = await supabase.from('settings').upsert({ key: 'plate_sheet', value, updated_at: new Date().toISOString() })
  return error ? { error: error.message } : {}
}

export async function syncSheet(): Promise<{ plates?: number; added?: number; adopted?: number; removed?: number; mills?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('sync-sheet', { body: {} })
  if (error) {
    // The function's own message is in the response body.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    return { error: body?.error ?? error.message }
  }
  return data
}

/**
 * Plates a part can be cut from: same thickness (±0.2 mm), big enough either way round with
 * 5 mm to spare on each side. Partly used ones first (use them up), then smallest first. A partly
 * used plate may have enough left, but never more than the whole plate, so it has to fit too.
 */
export function platesFor(plates: Plate[], size: number[]): Plate[] {
  const [x, y, t] = size.slice().sort((a, b) => b - a)
  if (!t) return []
  const m = 10
  return plates
    .filter((p) => p.state !== 'gone' && Math.abs(p.thickness - t) <= 0.2)
    .filter((p) => p.length >= x + m && p.width >= y + m)
    .sort((a, b) => (a.state === b.state ? plateArea(a) - plateArea(b) : a.state === 'partly_used' ? -1 : 1))
}

/** The plates that fit, with identical plates in the same state shown once and counted. */
export function fitGroups(plates: Plate[], size: number[], max = 4): { plate: Plate; n: number }[] {
  const groups = new Map<string, { plate: Plate; n: number }>()
  for (const pl of platesFor(plates, size)) {
    const k = `${pl.length}|${pl.width}|${pl.state}`
    const g = groups.get(k)
    if (g) g.n++
    else groups.set(k, { plate: pl, n: 1 })
  }
  return [...groups.values()].slice(0, max)
}

/** Plates of this thickness that aren't gone, fresh from the database. */
export async function platesAt(thickness: number): Promise<Plate[]> {
  const { data } = await supabase.from('plates').select('*').neq('state', 'gone').gte('thickness', thickness - 0.2).lte('thickness', thickness + 0.2)
  return ((data as Plate[] | null) ?? []).map((p) => ({ ...p, thickness: Number(p.thickness), length: Number(p.length), width: Number(p.width) }))
}

/**
 * A part was cut from this plate: the plate is now Partly used or Gone, and the part remembers it.
 * `undo` puts both back.
 */
export async function cutFromPlate(part: Part, plate: Plate, state: PlateState, who: Who): Promise<{ part?: Part; error?: string; undo?: () => Promise<Part | undefined> }> {
  const before = plate.state
  const res = await setPlateState(plate.id, state, who)
  if (res.error) return { error: res.error }
  const r2 = await updatePart(part.id, { plate_id: plate.id })
  if (r2.error) return { error: r2.error }
  return {
    part: r2.data,
    undo: async () => {
      await setPlateState(plate.id, before, who)
      const r3 = await updatePart(part.id, { plate_id: part.plate_id })
      return r3.data
    },
  }
}

export function useEndMills() {
  const [mills, setMills] = useState<EndMill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('end_mills').select('*').order('flutes').order('diameter')
    if (data) setMills((data as EndMill[]).map((m) => ({ ...m, diameter: Number(m.diameter) })))
    setError(error?.message ?? null)
    setLoading(false)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  useReloadOnReturn(reload)
  return { mills, loading, error, reload, setMills }
}

/**
 * Plates and End mills read the sheet in the background each time they open, so nobody has to
 * remember Sync. Quiet: no toast, the lists just update. Only once the sync merges (see sync-sheet).
 */
export function useAutoSync(setting: SheetSetting | null, after: () => void) {
  const [ran, setRan] = useState(false)
  useEffect(() => {
    if (ran || !setting?.url || !setting.merges) return
    setRan(true)
    syncSheet().then((res) => {
      if (!res.error) after()
    })
  }, [ran, setting, after])
}

/** Changes made in Steamhub that the sheet doesn't have yet, as lines to paste or type in. */
export function notInSheet(plates: Plate[]): { remove: Plate[]; add: Plate[] } {
  return {
    remove: plates.filter((p) => p.source === 'sheet' && p.state === 'gone'),
    add: plates.filter((p) => p.source !== 'sheet' && p.material === 'Aluminum' && p.state !== 'gone'),
  }
}
