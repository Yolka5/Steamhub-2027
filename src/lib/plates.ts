import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

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
}

export interface SheetSetting {
  url: string
  endmill_tab: string
  low_m2: number
  synced_at: string | null
  synced_by?: string
}

export const STATE_WORD: Record<PlateState, string> = { available: 'Available', partly_used: 'Partly used', gone: 'Gone' }

export const plateArea = (p: Pick<Plate, 'length' | 'width'>) => (p.length * p.width) / 1e6

/** "6.35" for a plate thickness, "5" for whole numbers. */
export const tText = (t: number) => String(+Number(t).toFixed(3))

export function usePlates() {
  const [plates, setPlates] = useState<Plate[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    const { data } = await supabase.from('plates').select('*').order('thickness').order('length', { ascending: false })
    setPlates(((data as Plate[]) ?? []).map((p) => ({ ...p, thickness: Number(p.thickness), length: Number(p.length), width: Number(p.width) })))
    setLoading(false)
  }, [])
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
  return { plates, loading, reload, setPlates }
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

export async function syncSheet(): Promise<{ plates?: number; added?: number; removed?: number; mills?: number; error?: string }> {
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
 * 5 mm to spare on each side. Partly used ones first (use them up), then smallest first.
 */
export function platesFor(plates: Plate[], size: number[]): Plate[] {
  const [x, y, t] = size.slice().sort((a, b) => b - a)
  if (!t) return []
  const m = 10
  return plates
    .filter((p) => p.state !== 'gone' && Math.abs(p.thickness - t) <= 0.2)
    .filter((p) => p.state === 'partly_used' || (p.length >= x + m && p.width >= y + m))
    .sort((a, b) => (a.state === b.state ? plateArea(a) - plateArea(b) : a.state === 'partly_used' ? -1 : 1))
}

export function useEndMills() {
  const [mills, setMills] = useState<EndMill[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    const { data } = await supabase.from('end_mills').select('*').order('flutes').order('diameter')
    setMills(((data as EndMill[]) ?? []).map((m) => ({ ...m, diameter: Number(m.diameter) })))
    setLoading(false)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])
  return { mills, loading, reload, setMills }
}
