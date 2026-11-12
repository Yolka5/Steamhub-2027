import { useEffect, useState } from 'react'
import { useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { ago, saveFile, type Profile } from '../lib/mfg'
import { buildZip } from '../lib/step/engine'
import { selectAll, supabase } from '../lib/supabase'

// The admin's page: everyone who has signed in, who else may join (new accounts are refused
// unless their email is on that list), how much each section is used, and a backup of everything.
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

      <WhoCanJoin userId={userId} />
      <SectionUse />
      <Backup />
    </div>
  )
}

/**
 * Emails that may make a new account. Accounts that already exist sign in as before; anyone else
 * gets "not on the list" (handle_new_user in the database refuses them).
 */
function WhoCanJoin({ userId }: { userId: string | null }) {
  const toast = useToast()
  const [rows, setRows] = useState<{ email: string; created_at: string }[] | null>(null)
  const [email, setEmail] = useState('')
  const load = async () => {
    const { data, error } = await supabase.from('allowed_emails').select('email, created_at').order('created_at', { ascending: false })
    setRows(error ? [] : (data ?? []))
  }
  useEffect(() => {
    load()
  }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const list = email
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
    if (!list.length) return
    const bad = list.find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
    if (bad) return toast(`${bad} isn't an email`)
    const { error } = await supabase.from('allowed_emails').upsert(
      list.map((x) => ({ email: normEmail(x), added_by: userId })),
      { onConflict: 'email', ignoreDuplicates: true },
    )
    if (error) return toast(error.message)
    setEmail('')
    await load()
    toast(list.length === 1 ? `${list[0]} can join` : `${list.length} emails can join`)
  }

  const remove = async (x: string) => {
    const { error } = await supabase.from('allowed_emails').delete().eq('email', x)
    if (error) return toast(error.message)
    await load()
    toast(`${x} is off the list`)
  }

  return (
    <section className="section">
      <h2 className="section__title">Who can join</h2>
      <p className="soft small">Only these emails can make a new account. Everyone above already has one and keeps it. Removing an email here doesn't remove an account; use Ban for that.</p>
      <form className="inline-form people__add" onSubmit={add}>
        <input className="field" type="text" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" aria-label="Email to allow" />
        <button type="submit" className="q-btn">
          Add
        </button>
      </form>
      {rows == null ? (
        <p className="soft">Loading</p>
      ) : rows.length === 0 ? (
        <p className="soft">Nobody yet, so no new accounts can be made.</p>
      ) : (
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.email} className="row">
              <span className="row__main">
                <span className="strong">{r.email}</span>
                <span className="soft small">added {ago(r.created_at)}</span>
              </span>
              <span className="row__end">
                <button type="button" className="q-btn q-btn--small" onClick={() => remove(r.email)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Same as norm_email in the database: lower case, and Gmail ignores dots and "+anything". */
function normEmail(e: string) {
  const [name, domain] = e.trim().toLowerCase().split('@')
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `${name.split('+')[0].replace(/\./g, '')}@gmail.com`
  return `${name}@${domain}`
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
