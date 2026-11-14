// Steamhub's side of the Onshape connection (ONSHAPE.md). Everything that touches Onshape goes
// through the `onshape` edge function; the browser only reads what a sync saved.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Onshape allows this many API calls a year per account on the Education plan. */
export const OS_BUDGET = 2500

export interface OsFlag {
  id: string
  kind: 'gain' | 'over' | 'heavy' | 'nomat' | 'stock' | 'names' | 'dup' | 'limit'
  kg?: number
  n?: number
  parts?: { id?: string; part_no?: number; name: string; kg?: number; qty?: number }[]
  part?: { id: string; part_no: number; name: string; t: number }
  names?: { name: string; n: number }[]
}

export interface OsGroup {
  name: string
  subsystem_id: string | null
  mass_g: number
  rows: number
}

export interface OsLink {
  id: string
  subsystem_id: string | null
  robot_id: string | null
  did: string
  wid: string
  eid: string
  doc_name: string | null
  microversion: string | null
  mass_g: number | null
  target_g: number | null
  /** Metres, in the assembly's own axes. */
  centroid: number[] | null
  summary: {
    rows?: number
    matched?: number
    prints?: number
    no_mass?: number
    moved?: number
    materials?: number
    docs_pending?: number
    note?: string
    groups?: OsGroup[]
    heavy?: { name: string; kg: number; each: number; qty: number; group: string }[]
  }
  flags: OsFlag[]
  dismissed: string[]
  unmatched: {
    onshape?: { name: string; qty: number; material: string | null; mass_g: number | null }[]
    steamhub?: { id: string; part_no: number; name: string; qty: number }[]
    onshape_n?: number
    steamhub_n?: number
  }
  last_sync_at: string | null
  last_sync_by: string | null
  last_key_user: string | null
  last_calls: number | null
}

export interface OsAccount {
  user_id: string
  onshape_name: string | null
  year: number
  calls: number
}

export const osUrl = (l: Pick<OsLink, 'did' | 'wid' | 'eid'>) => `https://cad.onshape.com/documents/${l.did}/w/${l.wid}/e/${l.eid}`
export const kgText = (g: number) => (g / 1000).toFixed(2)
/** A part's weight the way a person says it: grams under 100 g, kg above. */
export const massText = (g: number) => (g >= 100 ? `${kgText(g)} kg` : `${g >= 10 ? Math.round(g) : Math.round(g * 10) / 10} g`)

type Res<T> = { data?: T; error?: string }

/** One action on the edge function. A problem the person can fix comes back as a sentence. */
export async function os<T = { ok: true }>(body: Record<string, unknown>): Promise<Res<T>> {
  const { data, error } = await supabase.functions.invoke('onshape', { body })
  if (error) return { error: navigator.onLine ? "Couldn't reach Onshape through Steamhub. Try again." : 'No connection.' }
  if (data && typeof data === 'object' && !(data instanceof Blob) && 'error' in data) return { error: String((data as { error: unknown }).error) }
  return { data: data as T }
}

export interface SyncResult {
  changed: boolean
  calls: number
  key_user: string
  note?: string
}

/** The Onshape link of one subsystem or robot, if it has one. */
export function useOsLink(target: { subsystemId?: string; robotId?: string }) {
  const [link, setLink] = useState<OsLink | null>(null)
  const [loaded, setLoaded] = useState(false)
  const { subsystemId, robotId } = target
  const reload = useCallback(async () => {
    const q = supabase.from('onshape_links').select('*')
    const { data, error } = await (subsystemId ? q.eq('subsystem_id', subsystemId) : q.eq('robot_id', robotId ?? '')).maybeSingle()
    // Before the migration ran the table doesn't exist; the page then just shows no Onshape block.
    if (!error) setLink((data as OsLink) ?? null)
    setLoaded(!error)
  }, [subsystemId, robotId])
  useEffect(() => {
    reload()
  }, [reload])
  return { link, loaded, reload }
}

/** Every subsystem link of a robot, for the weight bars. */
export function useOsLinks(subsystemIds: string[]) {
  const key = subsystemIds.join(',')
  const [links, setLinks] = useState<OsLink[]>([])
  const reload = useCallback(async () => {
    if (!key) return setLinks([])
    const { data } = await supabase.from('onshape_links').select('*').in('subsystem_id', key.split(','))
    setLinks((data as OsLink[]) ?? [])
  }, [key])
  useEffect(() => {
    reload()
  }, [reload])
  return { links, reload }
}

let accountsCache: Promise<OsAccount[]> | null = null
const loadAccounts = async () => ((await supabase.from('onshape_accounts').select('user_id, onshape_name, year, calls')).data as OsAccount[]) ?? []

/** Who has connected Onshape, and how many calls each key has used this year. */
export function useOsAccounts() {
  const [accounts, setAccounts] = useState<OsAccount[]>([])
  useEffect(() => {
    accountsCache ??= loadAccounts()
    accountsCache.then(setAccounts)
  }, [])
  const reload = useCallback(async () => {
    accountsCache = loadAccounts()
    setAccounts(await accountsCache)
  }, [])
  const used = (a: OsAccount | undefined) => (a && a.year === new Date().getFullYear() ? a.calls : 0)
  return { accounts, reload, has: (id: string | null | undefined) => !!id && accounts.some((a) => a.user_id === id), used: (id: string | null | undefined) => used(accounts.find((a) => a.user_id === id)) }
}

export async function weightLimitKg(): Promise<number> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'weight_limit_kg').maybeSingle()
  return Number(data?.value) || 52.2
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The assembly as a STEP file, exported by Onshape: start, ask until it's done, download.
 * Usually 3 calls. The waits grow so a slow export doesn't eat the budget.
 */
export async function stepFromOnshape(linkId: string, onProgress: (t: string) => void): Promise<Res<File>> {
  onProgress('Asking Onshape for the STEP')
  const start = await os<{ id: string; name: string }>({ action: 'step_start', link_id: linkId })
  if (start.error || !start.data) return { error: start.error }
  let fid: string | null = null
  for (const ms of [6000, 8000, 12000, 20000, 30000, 45000]) {
    onProgress('Onshape is exporting')
    await wait(ms)
    const st = await os<{ state: string; fid: string | null; reason: string | null }>({ action: 'step_status', link_id: linkId, id: start.data.id })
    if (st.error || !st.data) return { error: st.error }
    if (st.data.state === 'DONE') {
      fid = st.data.fid
      break
    }
    if (st.data.state === 'FAILED') return { error: `Onshape couldn't export it${st.data.reason ? `: ${st.data.reason}` : ''}.` }
  }
  if (!fid) return { error: 'Onshape is still exporting after two minutes. Try again, or export the STEP by hand.' }
  onProgress('Downloading the STEP')
  const { data, error } = await supabase.functions.invoke('onshape', { body: { action: 'step_get', link_id: linkId, fid } })
  if (error || !(data instanceof Blob)) return { error: "The STEP didn't download. Try again." }
  return { data: new File([data], `${start.data.name.replace(/[^\w.\- ]+/g, '_') || 'assembly'}.step`, { type: 'application/step' }) }
}
