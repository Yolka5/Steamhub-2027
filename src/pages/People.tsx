import { useEffect, useState } from 'react'
import { useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ago, saveFile, type Profile } from '../lib/mfg'
import { buildZip } from '../lib/step/engine'
import { selectAll, supabase } from '../lib/supabase'

// The admin's page: everyone who has signed in (anyone with a Google account can, so the admin
// can ban accounts that don't belong), how much each section is used, and a backup of everything.
// A ban takes effect on their next page load.

export default function People() {
  const { isAdmin, userId, profile } = useAuth()
  if (!profile) return <div className="page page--narrow"><p className="soft">Loading</p></div>
  if (!isAdmin) return <div className="page page--narrow"><p className="soft">This page is for the admin.</p></div>
  return <Admin userId={userId} />
}

function Admin({ userId }: { userId: string | null }) {
  const toast = useToast()
  const [people, setPeople] = useState<Profile[]>([])
  const [armed, setArmed] = useState<string | null>(null)

  const load = async () => {
    // Emails come only through admin_people(). Before that migration runs, names are listed.
    const r = await supabase.rpc('admin_people')
    if (!r.error) return setPeople((r.data as Profile[]) ?? [])
    const { data } = await supabase.from('profiles').select('id, name, avatar, is_admin, banned, created_at').order('created_at', { ascending: false })
    setPeople((data as Profile[] | null) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const setBan = async (p: Profile, banned: boolean) => {
    const { error } = await supabase.from('profiles').update({ banned }).eq('id', p.id)
    setArmed(null)
    if (error) return toast(error.message)
    await load()
    toast(banned ? `${p.name} is banned` : `${p.name} can sign in again`)
  }

  // The workshop PC's shared account: Start on it asks who's making the part.
  const setShared = async (p: Profile, shared: boolean) => {
    const { error } = await supabase.from('profiles').update({ shared }).eq('id', p.id)
    if (error) return toast(error.message)
    await load()
    toast(shared ? `${p.name} is the shared workshop PC. Start on it asks who's making the part.` : `${p.name} is a personal account again`)
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">People</h1>
      </div>
      <p className="soft">{people.length} accounts. Newest first.</p>
      <ul className="rows">
        {people.map((p) => (
          <li key={p.id} className="row">
            <span className="avatar avatar--soft">{p.name[0]?.toUpperCase()}</span>
            <span className="row__main">
              <span className="strong">
                {p.name}
                {p.is_admin ? <span className="soft"> · admin</span> : null}
              </span>
              <span className="soft small">
                {p.email ? `${p.email} · ` : ''}joined {ago(p.created_at)}
              </span>
            </span>
            {p.banned && <span className="tag tag--bad">Banned</span>}
            {p.shared && <span className="tag">Shared workshop PC</span>}
            {p.id !== userId && (
              <span className="row__end people__acts">
                <button type="button" className="q-btn q-btn--small" onClick={() => setShared(p, !p.shared)}>
                  {p.shared ? 'Not shared' : 'Shared PC'}
                </button>
                {p.banned ? (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setBan(p, false)}>
                    Unban
                  </button>
                ) : armed === p.id ? (
                  <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={() => setBan(p, true)}>
                    Ban {p.name.split(' ')[0]}
                  </button>
                ) : (
                  <button type="button" className="q-btn q-btn--small" onClick={() => setArmed(p.id)}>
                    Ban
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      <SectionUse />
      <Backup />
    </div>
  )
}

const SECTION_NAME: Record<string, string> = {
  home: 'Home',
  stock: 'Stock',
  manufacturing: 'Manufacturing',
  prototypes: 'Prototypes',
  tools: 'Tools',
  calculators: 'Calculator',
  handbook: 'Handbook',
  notifications: 'Notifications',
  people: 'People',
}

/** Opens per section over the last 14 days, so the ones nobody uses can be removed. */
function SectionUse() {
  const [rows, setRows] = useState<{ section: string; n: number }[] | null>(null)
  useEffect(() => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
    supabase
      .from('page_views')
      .select('section, n')
      .gte('day', since)
      .then(({ data, error }) => {
        if (error) return setRows([])
        const by = new Map<string, number>()
        for (const r of (data as { section: string; n: number }[]) ?? []) by.set(r.section, (by.get(r.section) ?? 0) + r.n)
        setRows([...by].map(([section, n]) => ({ section, n })).sort((a, b) => b.n - a.n))
      })
  }, [])
  const max = Math.max(1, ...(rows ?? []).map((r) => r.n))
  return (
    <section className="section">
      <h2 className="section__title">Sections used, last 14 days</h2>
      <p className="soft small">Page opens per section, counted without names. Two weeks after kickoff, the bottom of this list is what to remove.</p>
      {rows == null ? (
        <p className="soft">Loading</p>
      ) : rows.length === 0 ? (
        <p className="soft">Nothing counted yet.</p>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.section} className="row use-row">
              <span className="use-row__name">{SECTION_NAME[r.section] ?? r.section}</span>
              <span className="mfg-bar use-row__bar" aria-hidden="true">
                <span style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="num row__end">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Everything the team typed in, as CSV files in one zip. The free plan keeps no backups. */
const TABLES = [
  'pieces',
  'piece_events',
  'plates',
  'end_mills',
  'robots',
  'subsystems',
  'parts',
  'part_events',
  'wishlist',
  'prototypes',
  'prototype_tests',
  'param_defs',
  'prototype_blocks',
  'calc_robots',
  'hardware',
  'materials',
  'locations',
  'cal_groups',
  'cal_phases',
  'tasks',
  'task_owners',
  'task_waits',
  'cal_updates',
  'events',
]

const csvCell = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n')
}

function Backup() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async () => {
    if (busy) return
    const files: { name: string; data: string }[] = []
    try {
      for (const t of TABLES) {
        setBusy(`Reading ${t}`)
        const { data, error } = await selectAll<Record<string, unknown>>(() => supabase.from(t).select('*'))
        if (error) throw new Error(`${t}: ${error.message}`)
        files.push({ name: `${t}.csv`, data: toCsv(data ?? []) })
      }
      const day = new Date().toISOString().slice(0, 10)
      saveFile(`Steamhub backup ${day}.zip`, buildZip(files), 'application/zip')
      toast('Backup saved. Keep it somewhere outside Steamhub, like the team Drive.')
    } catch (e) {
      toast(`Backup failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="section">
      <h2 className="section__title">Backup</h2>
      <p className="soft small">Every list in Steamhub as CSV files in one zip: stock, plates, parts, prototypes, the calculator robot, and the Calendar's tasks, phases, updates and events. Photos, drawings and videos stay in storage. Once a week in build season is plenty.</p>
      <button type="button" className="q-btn" onClick={run} disabled={!!busy}>
        {busy ?? 'Download a backup'}
      </button>
    </section>
  )
}
