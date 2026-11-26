import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalTabs, useCalSeason } from '../../components/cal'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { ago } from '../../lib/mfg'
import { dayLabel, groupOrder, sectionName, type CalGroup } from '../../lib/cal'
import { guessColumns, matchGroup, ownersOf, parseMonday, priorityOf, span, statusOf, day, type Field, type MondayBoard } from '../../lib/monday'
import { supabase } from '../../lib/supabase'
import { useCal, type Cal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { readXlsx } from '../../lib/xlsx'
import { count } from '../../lib/words'

// Bringing other calendars and task lists in: Google Calendar on its own every hour, Programming's
// GitHub issues as they change, and Monday boards from their Excel export.

export default function ImportPage() {
  const season = useCalSeason()
  const cal = useCal(season)
  return (
    <div className="page cal-page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Import</h1>
        <CalTabs />
      </div>
      {cal.error && !cal.groups.length ? (
        <LoadError onRetry={cal.reload} />
      ) : (
        <>
          <GoogleCalendar />
          <GitHub cal={cal} />
          <Monday groups={cal.groups} onDone={cal.reload} />
        </>
      )}
    </div>
  )
}

// ----- GitHub -----

type GitHubCfg = { repo?: string; project?: string | null; synced_at?: string | null; tried_at?: string | null; count?: number; error?: string | null; last_change?: string | null }

const HOOK = 'https://pzsxenrkaiolqulgxlcr.supabase.co/functions/v1/github-sync'

function GitHub({ cal }: { cal: Cal }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [cfg, setCfg] = useState<GitHubCfg | null>(null)
  const [repo, setRepo] = useState('')
  const [project, setProject] = useState('')
  const load = () =>
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'github')
      .maybeSingle()
      .then(({ data }) => {
        const v = (data?.value as GitHubCfg) ?? {}
        setCfg(v)
        setRepo(v.repo ?? '')
        setProject(v.project ?? '')
      })
  useEffect(() => {
    load()
  }, [])

  const sync = () =>
    run(async () => {
      const { data, error } = await supabase.functions.invoke('github-sync', { body: {} })
      await load()
      if (error) {
        let why: string | undefined
        try {
          why = (await (error as { context?: Response }).context?.json())?.error
        } catch {
          /* no body */
        }
        return toast(why ?? 'The sync did not run. Try again in a minute.')
      }
      const d = data as { changed: number; last?: string | null; recent?: boolean }
      await cal.reload()
      toast(d.recent ? 'It just ran. Try again in a few seconds.' : d.changed ? (d.last ? `1 change: ${d.last}` : `${count(d.changed, 'change')} from GitHub`) : 'Nothing changed in GitHub')
    })

  const save = () =>
    run(async () => {
      const r = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '')
      const p = project.trim().replace(/\/views\/.*$/, '').replace(/[?#].*$/, '')
      if (!p && !r) return toast('Paste the board’s address, or a repo')
      if (p && !/github\.com\/(orgs|users)\/[\w.-]+\/projects\/\d+/i.test(p)) return toast('Paste the board’s address, like github.com/orgs/frc1577/projects/3')
      if (r && !/^[\w.-]+\/[\w.-]+$/.test(r)) return toast('Type the repo as owner/name, or paste its GitHub address')
      // A new repo starts from scratch; the same repo keeps where the last sync got to.
      const same = cfg?.repo === r
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'github', value: { ...(same ? cfg : {}), repo: r || null, project: p || null, error: null }, updated_at: new Date().toISOString() })
      if (error) return toast(error.message)
      await load()
      toast('Saved')
    })

  // GitHub people nobody is linked to yet, from the synced tasks.
  const unlinked = [...new Set(cal.tasks.flatMap((t) => t.gh_people ?? []))].sort()
  const { people } = usePeople()
  const link = async (login: string, userId: string) => {
    if (!userId) return
    const { error } = await supabase.from('profiles').update({ github: login }).eq('id', userId)
    if (error) return toast(error.code === '23505' ? 'Someone else already has that GitHub name' : error.message)
    toast(`${login} is ${people.find((p) => p.id === userId)?.name}. The next sync makes them the owner.`)
  }

  const linked = !!(cfg?.repo || cfg?.project)
  const where = cfg?.project ? `Board ${cfg.project.replace(/^https?:\/\/github\.com\//i, '')}` : cfg?.repo
  return (
    <section className="section imp">
      <h2 className="section__title">GitHub</h2>
      <p className="soft">
        The parent issues on Programming’s GitHub board, the ones with sub-issues, show up as Programming tasks. Sub-issues and lone issues stay in GitHub, so the Calendar isn’t buried in them. Name, status and people follow GitHub. Dates do too
        when GitHub has them; when it doesn’t, place the issue on the Gantt here. It reads GitHub every 15 minutes in the day, and within seconds once a webhook is set. A new season means a new board: paste its
        link below.
      </p>
      {cfg == null ? (
        <p className="soft">Loading</p>
      ) : linked ? (
        <div className="imp__status">
          <Icon name="link" size={20} />
          <span className="imp__status-main">
            <span className="strong">
              {where}
              {cfg.error ? ': last sync failed' : cfg.synced_at ? `: ${count(cfg.count ?? 0, 'task')} from GitHub` : ''}
            </span>
            <span className={`small ${cfg.error ? 'imp__bad' : 'soft'}`}>
              {cfg.error ?? (cfg.synced_at ? `Last read ${ago(cfg.synced_at)}${cfg.last_change ? `. Last change: ${cfg.last_change}` : ''}` : 'Not read yet')}
            </span>
          </span>
          <button type="button" className="q-btn" onClick={sync}>
            {busy ? 'Syncing' : 'Sync now'}
          </button>
        </div>
      ) : (
        <p className="soft">Not linked yet.</p>
      )}
      {isAdmin ? (
        <>
          <form
            className="form imp__form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <label className="ctl">
              <span className="ctl__name">Project board</span>
              <input className="field" value={project} onChange={(e) => setProject(e.target.value)} placeholder="https://github.com/orgs/frc1577/projects/3" autoComplete="off" />
              <span className="soft small">Its parent issues, from any repo. Sub-issues and issues with none stay out. Its Status column (Todo, In Progress, Done) and date fields set the task. Issues taken off the board leave the Calendar.</span>
            </label>
            <label className="ctl">
              <span className="ctl__name">Or only a repo, without a board</span>
              <input className="field" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="frc1577/robot-2027" autoComplete="off" />
            </label>
            <button type="submit" className="q-btn">
              {busy ? 'Saving' : 'Save'}
            </button>
          </form>
          <details className="finder__more imp__steps">
            <summary>Setting up the key and the webhook</summary>
            <ol className="imp__list small">
              <li>
                In GitHub: Settings, Developer settings, Fine-grained tokens, Generate new token. Resource owner: the team’s organisation. Repository access: all repositories (a board holds cards from any of them). Repository
                permissions: <strong>Issues: Read-only</strong> (Metadata comes with it). Organisation permissions: <strong>Projects: Read-only</strong>. An organisation owner then approves the token.
              </li>
              <li>
                Don’t paste the token anywhere in Steamhub or in a chat. In Supabase: Edge Functions, Secrets, add <strong>GITHUB_TOKEN</strong> with the token as its value.
              </li>
              <li>
                For changes within seconds, someone with admin on the repo (or the organisation) adds a webhook: Settings, Webhooks, Add webhook. Payload URL <code>{HOOK}</code>, content type application/json, a secret of your choice,
                events: Issues, Sub-issues, and on an organisation webhook Projects v2 items. Put the same secret in Supabase as <strong>GITHUB_WEBHOOK_SECRET</strong>.
              </li>
              <li>Press Sync now. Without the webhook, the 15-minute sync still works.</li>
            </ol>
          </details>
          {unlinked.length > 0 && (
            <div className="imp__people">
              <h3 className="tsheet__head">Who is who on GitHub</h3>
              <p className="soft small">These GitHub names are on tasks but not linked to anyone yet.</p>
              <ul className="rows">
                {unlinked.map((login) => (
                  <li key={login} className="row imp__person">
                    <span className="row__main num">@{login}</span>
                    <Select
                      label={`Who is ${login}`}
                      value=""
                      placeholder="Pick who"
                      onChange={(v) => link(login, v)}
                      options={people.filter((p) => !p.banned && !p.shared && !p.github).map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        !linked && <p className="soft small">An admin links it once, from this page.</p>
      )}
    </section>
  )
}

// ----- Google Calendar -----

type Feed = { url?: string; synced_at?: string; tried_at?: string; count?: number; error?: string | null }

function GoogleCalendar() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [feed, setFeed] = useState<Feed | null>(null)
  const [url, setUrl] = useState('')
  const load = () =>
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'google_calendar')
      .maybeSingle()
      .then(({ data }) => setFeed((data?.value as Feed) ?? {}))
  useEffect(() => {
    load()
  }, [])

  const sync = () =>
    run(async () => {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: {} })
      await load()
      if (error) {
        // A failed sync answers with its reason ("Google answered 404"); read it from the response.
        let why: string | undefined
        try {
          why = (await (error as { context?: Response }).context?.json())?.error
        } catch {
          /* no body */
        }
        return toast(why ?? 'The sync did not run. Try again in a minute.')
      }
      const d = data as { count: number; removed: number }
      toast(`${count(d.count, 'event')} from Google Calendar${d.removed ? `, ${d.removed} removed` : ''}`)
    })

  const save = () =>
    run(async () => {
      const u = url.trim()
      if (!/^(https?|webcal):\/\/.+\.ics(\?|$)/i.test(u) && !/calendar\.google\.com/i.test(u)) return toast('Paste the address that ends in .ics, from the calendar’s settings')
      const { error } = await supabase.from('settings').upsert({ key: 'google_calendar', value: { ...(feed ?? {}), url: u, error: null, synced_at: null, tried_at: null }, updated_at: new Date().toISOString() })
      if (error) return toast(error.message)
      setUrl('')
      await load()
      await sync()
    })

  const linked = !!feed?.url
  return (
    <section className="section imp">
      <h2 className="section__title">Google Calendar</h2>
      <p className="soft">Meetings, competitions and deadlines from the team’s Google Calendar show up as events here, and follow every change made there. Steamhub reads it every hour.</p>
      {feed == null ? (
        <p className="soft">Loading</p>
      ) : linked ? (
        <div className="imp__status">
          <Icon name="calendar" size={20} />
          <span className="imp__status-main">
            <span className="strong">{feed.error ? 'Last sync failed' : `${count(feed.count ?? 0, 'event')} in sync`}</span>
            <span className={`small ${feed.error ? 'imp__bad' : 'soft'}`}>
              {feed.error ?? (feed.synced_at ? `Last read ${ago(feed.synced_at)}` : 'Not read yet')}
            </span>
          </span>
          <button type="button" className="q-btn" onClick={sync}>
            {busy ? 'Syncing' : 'Sync now'}
          </button>
        </div>
      ) : (
        <p className="soft">Not linked yet.</p>
      )}
      {isAdmin ? (
        <form
          className="form imp__form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="ctl">
            <span className="ctl__name">{linked ? 'Change the link' : 'Secret address in iCal format'}</span>
            <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" autoComplete="off" />
            <span className="soft small">
              In Google Calendar: Settings, pick the team calendar, then Integrate calendar. Copy <strong>Secret address in iCal format</strong>. Anyone with it can read the calendar, so it stays with admins.
            </span>
          </label>
          <button type="submit" className="q-btn">
            {busy ? 'Saving' : linked ? 'Save and sync' : 'Link and sync'}
          </button>
        </form>
      ) : (
        !linked && <p className="soft small">An admin links it once, from this page.</p>
      )}
      <p className="soft small">Name, time and repeat come from Google, so change those there. Who an event is for, its kind, status, reminders and comments are Steamhub’s and the sync keeps them.</p>
      {linked && <SendToGoogle />}
    </section>
  )
}

// ----- Steamhub to Google -----

type Push = { on?: boolean; pushed_at?: string; tried_at?: string; count?: number; error?: string | null; email?: string }

/** The other way: events made in Steamhub written into the same Google calendar (gcal-push). */
function SendToGoogle() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [busy, run] = useBusy()
  const [push, setPush] = useState<Push | null>(null)
  const [who, setWho] = useState<{ email: string | null } | null>(null)
  const load = () =>
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'google_calendar_push')
      .maybeSingle()
      .then(({ data }) => setPush((data?.value as Push) ?? {}))
  useEffect(() => {
    load()
    // Which account to share the calendar with: the service account in the server's secrets.
    supabase.functions.invoke('gcal-push', { body: { who: true } }).then(({ data }) => setWho((data as { email: string | null }) ?? { email: null }))
  }, [])

  const send = () =>
    run(async () => {
      const { data, error } = await supabase.functions.invoke('gcal-push', { body: {} })
      await load()
      if (error) {
        let why: string | undefined
        try {
          why = (await (error as { context?: Response }).context?.json())?.error
        } catch {
          /* no body */
        }
        return toast(why ?? 'Sending did not run. Try again in a minute.')
      }
      const d = data as { sent: number; removed: number }
      toast(d.sent || d.removed ? `${d.sent} sent to Google${d.removed ? `, ${d.removed} removed` : ''}` : 'Google is up to date')
    })

  const turn = (on: boolean) =>
    run(async () => {
      const { error } = await supabase.from('settings').upsert({ key: 'google_calendar_push', value: { ...(push ?? {}), on, error: null }, updated_at: new Date().toISOString() })
      if (error) return toast(error.message)
      await load()
      if (on) {
        // Everything made here so far goes out now.
        const { error: e2 } = await supabase.functions.invoke('gcal-push', { body: {} })
        await load()
        if (e2) return toast('Turned on, but the first send failed. The reason is below.')
        toast('Steamhub events now go to Google too')
      }
    })

  if (push == null) return null
  const email = who?.email ?? push.email ?? null
  return (
    <div className="imp__push">
      <h3 className="imp__h">Steamhub to Google</h3>
      <p className="soft">Events made here go into the same Google calendar right after each change. Each event is edited where it was made.</p>
      {push.on ? (
        <div className="imp__status">
          <Icon name="calendar" size={20} />
          <span className="imp__status-main">
            <span className="strong">{push.error ? 'Last send failed' : `${count(push.count ?? 0, 'event')} sent to Google`}</span>
            <span className={`small ${push.error ? 'imp__bad' : 'soft'}`}>{push.error ?? (push.pushed_at ? `Last sent ${ago(push.pushed_at)}` : 'Not sent yet')}</span>
          </span>
          <button type="button" className="q-btn" onClick={send}>
            {busy ? 'Sending' : 'Send now'}
          </button>
        </div>
      ) : null}
      {isAdmin ? (
        email ? (
          <>
            {!push.on && (
              <ol className="imp__steps soft small">
                <li>
                  In Google Calendar, open the team calendar's settings, then <strong>Share with specific people</strong>.
                </li>
                <li>
                  Add <span className="strong num">{email}</span> with <strong>Make changes to events</strong>.
                </li>
                <li>Turn sending on here.</li>
              </ol>
            )}
            <button type="button" className={push.on ? 'text-btn' : 'q-btn'} onClick={() => turn(!push.on)}>
              {push.on ? 'Stop sending to Google' : 'Turn on sending to Google'}
            </button>
          </>
        ) : (
          <div className="soft small">
            <p>Sending needs a Google service account, set up once:</p>
            <ol className="imp__steps">
              <li>
                At console.cloud.google.com, make a project and turn on the <strong>Google Calendar API</strong>.
              </li>
              <li>
                Under IAM, Service accounts, create one, then Keys, Add key, JSON. A file downloads.
              </li>
              <li>
                In Supabase, Edge Functions, Secrets, add <span className="num">GOOGLE_SERVICE_ACCOUNT</span> with the whole file as the value.
              </li>
              <li>Come back here: it shows the account's email to share the calendar with.</li>
            </ol>
          </div>
        )
      ) : (
        !push.on && <p className="soft small">An admin turns this on, from this page.</p>
      )}
    </div>
  )
}

// ----- Monday -----

/** The group picker's "Leave out": that Monday group's items aren't imported. */
const LEAVE_OUT = '-'

const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'name', label: 'Task name', hint: 'Required' },
  { key: 'owner', label: 'Owner', hint: 'Matched to people by name' },
  { key: 'status', label: 'Status', hint: 'Done, Working on it…' },
  { key: 'timeline', label: 'Timeline', hint: 'Start and due' },
  { key: 'due', label: 'Due day', hint: 'Used when there is no timeline' },
  { key: 'priority', label: 'Priority', hint: '' },
  { key: 'notes', label: 'Notes', hint: '' },
]

function Monday({ groups, onDone }: { groups: CalGroup[]; onDone: () => void }) {
  const toast = useToast()
  const who = useWho()
  const { people } = usePeople()
  const [busy, run] = useBusy()
  const [over, setOver] = useState(false)
  const [file, setFile] = useState('')
  const [board, setBoard] = useState<MondayBoard | null>(null)
  const [cols, setCols] = useState<Record<Field, string> | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})
  const [result, setResult] = useState<string | null>(null)
  const active = people.filter((p) => !p.banned && !p.shared)
  const sorted = useMemo(() => [...groups].sort(groupOrder), [groups])

  const take = async (f: File | undefined) => {
    if (!f) return
    setResult(null)
    if (!/\.xlsx$/i.test(f.name)) return toast('Export the Monday board to Excel (.xlsx) first')
    try {
      const b = parseMonday(await readXlsx(f))
      if (!b.items.length) return toast('No items found. Export the board itself, with its Name column.')
      setFile(f.name)
      setBoard(b)
      setCols(guessColumns(b.headers))
      // Each Monday group goes to the Steamhub group it most likely means ("Programing" →
      // Programming, "Plastic prototypes" → Prototypes - 3D prints), else to Mechanics as a section.
      const fallback = sorted.find((g) => g.kind === 'team')?.id ?? sorted[0]?.id ?? ''
      setMap(Object.fromEntries(b.groups.map((name) => [name, matchGroup(name, sorted)?.id ?? fallback])))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const rows = useMemo(() => {
    if (!board || !cols) return []
    return board.items
      .map((it) => {
        const v = (f: Field) => (cols[f] ? (it.cells[cols[f]] ?? '') : '')
        const t = v('timeline') ? span(v('timeline')) : { start: null, end: null }
        let starts_on = t.start
        let due_on = t.end ?? day(v('due'))
        if (starts_on && due_on && due_on < starts_on) [starts_on, due_on] = [due_on, starts_on]
        const owners = ownersOf(v('owner'), active)
        // Subitems have their own columns; read them by the same kind of header.
        const subs = it.subs
          .map((s) => {
            const pick = (re: RegExp) => Object.entries(s).find(([h]) => h !== 'Name' && re.test(h))?.[1] ?? ''
            const when = span(pick(/timeline|date|due|תאריך|ציר זמן/i))
            return {
              title: s.Name ?? '',
              status: statusOf(pick(/status|סטטוס/i)),
              starts_on: when.start,
              due_on: when.end,
              owners: ownersOf(pick(/person|people|owner|אחראי/i), active),
            }
          })
          .filter((s) => s.title)
        return {
          group: it.group,
          title: v('name'),
          status: statusOf(v('status')),
          priority: priorityOf(v('priority')),
          starts_on,
          due_on,
          notes: v('notes'),
          owners,
          subs,
        }
      })
      .filter((r) => r.title)
    // people changes rarely; board and columns drive this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, cols, people])

  const taken = rows.filter((r) => map[r.group] !== LEAVE_OUT)
  const missing = [...new Set(taken.flatMap((r) => [...r.owners.missing, ...r.subs.flatMap((s) => s.owners.missing)]))]
  const subCount = taken.reduce((n, r) => n + r.subs.length, 0)

  const doImport = () =>
    run(async () => {
      if (!who || !board) return
      if (!cols?.name) return toast('Pick the column with the task names first')
      if (!taken.length) return toast('Every group is left out. Pick where at least one goes.')
      const key = (r: (typeof rows)[number]) => `monday:${board.board}:${r.group}:${r.title}`.toLowerCase()
      // A Monday group that lands in a section's own group (To-Do December in Mechanics) becomes a list there.
      const listName = (mondayGroup: string, groupId: string) => {
        const g = groups.find((x) => x.id === groupId)
        return g && g.kind === 'team' && g.name.toLowerCase() !== mondayGroup.toLowerCase() ? mondayGroup.trim() : null
      }
      const listIds = new Map<string, string>()
      for (const r of taken) {
        const name = listName(r.group, map[r.group])
        const k = `${map[r.group]}|${name}`
        if (!name || listIds.has(k)) continue
        const { data: found } = await supabase.from('cal_lists').select('id').eq('group_id', map[r.group]).eq('name', name).maybeSingle()
        if (found) listIds.set(k, found.id as string)
        else {
          const { data: made, error } = await supabase.from('cal_lists').insert({ group_id: map[r.group], name, sort: Date.now() / 1000 }).select('id').single()
          if (error) return toast(error.message)
          listIds.set(k, made.id as string)
        }
      }
      const payload = taken.map((r, i) => ({
        import_key: key(r),
        group_id: map[r.group],
        list_id: listIds.get(`${map[r.group]}|${listName(r.group, map[r.group])}`) ?? null,
        title: r.title,
        status: r.status,
        priority: r.priority,
        starts_on: r.starts_on,
        due_on: r.due_on,
        notes: r.notes,
        created_by: who.userId,
        sort: Date.now() / 1000 + i,
      }))
      if (payload.some((p) => !p.group_id)) return toast('Pick a Steamhub group for every Monday group')
      // New items only: a task already imported keeps what was changed in Steamhub since (moved,
      // renamed, finished), so importing again never undoes that.
      const ids = new Map<string, string>()
      let added = 0
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await supabase.from('tasks').upsert(payload.slice(i, i + 200), { onConflict: 'import_key', ignoreDuplicates: true }).select('id, import_key')
        if (error) return toast(error.message.includes('import_key') ? 'The import migration has not run on the database yet.' : error.message)
        for (const d of data ?? []) ids.set(d.import_key as string, d.id as string)
        added += data?.length ?? 0
      }
      const known = payload.map((p) => p.import_key).filter((k) => !ids.has(k))
      for (let i = 0; i < known.length; i += 100) {
        const { data } = await supabase.from('tasks').select('id, import_key').in('import_key', known.slice(i, i + 100))
        for (const d of data ?? []) ids.set(d.import_key as string, d.id as string)
      }
      // Subitems: subtasks of their item, in the same group.
      const subPayload = taken.flatMap((r, i) =>
        r.subs.map((s, j) => ({
          import_key: `${key(r)}:sub:${s.title}`.toLowerCase(),
          parent_id: ids.get(key(r))!,
          group_id: map[r.group],
          title: s.title,
          status: s.status,
          priority: 'normal' as const,
          starts_on: s.starts_on && s.due_on && s.due_on < s.starts_on ? s.due_on : s.starts_on,
          due_on: s.starts_on && s.due_on && s.due_on < s.starts_on ? s.starts_on : s.due_on,
          notes: '',
          created_by: who.userId,
          sort: Date.now() / 1000 + i + j / 100,
        })),
      ).filter((s) => s.parent_id)
      let addedSubs = 0
      for (let i = 0; i < subPayload.length; i += 200) {
        const { data, error } = await supabase.from('tasks').upsert(subPayload.slice(i, i + 200), { onConflict: 'import_key', ignoreDuplicates: true }).select('id, import_key')
        if (error) return toast(error.message)
        for (const d of data ?? []) ids.set(d.import_key as string, d.id as string)
        addedSubs += data?.length ?? 0
      }
      const newIds = new Set(ids.values())
      const owners = taken
        .flatMap((r) => [
          ...r.owners.ids.map((user_id) => ({ task_id: ids.get(key(r))!, user_id })),
          ...r.subs.flatMap((s) => s.owners.ids.map((user_id) => ({ task_id: ids.get(`${key(r)}:sub:${s.title}`.toLowerCase())!, user_id }))),
        ])
        // Owners only on new tasks: the ones already here keep whoever has them now.
        .filter((o) => o.task_id && newIds.has(o.task_id) && added + addedSubs > 0)
      if (owners.length) await supabase.from('task_owners').upsert(owners, { onConflict: 'task_id,user_id', ignoreDuplicates: true })
      onDone()
      const already = payload.length - added
      setResult(
        `${count(added, 'new task')}${addedSubs ? ` and ${count(addedSubs, 'subtask')}` : ''} from ${board.board}${already ? `. ${count(already, 'task')} already here stayed as they are` : ''}${missing.length ? `. Not matched to anyone: ${missing.join(', ')}` : ''}.`,
      )
      setBoard(null)
      toast(`${count(added, 'new task')} imported`)
    })

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files[0])
  }

  return (
    <section className="section imp">
      <h2 className="section__title">Monday</h2>
      <p className="soft">Bring a Monday board’s tasks in: name, owner, status and dates. Importing the same board again only adds its new items: tasks already here keep every change made in Steamhub.</p>
      <label
        className="mfg-drop"
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".xlsx" hidden onChange={(e) => take(e.target.files?.[0])} />
        <Icon name="upload" size={22} />
        <span className="mfg-drop__text">
          <strong>Drop the board’s Excel export here</strong> or choose the file
        </span>
        <span className="soft small">In Monday: the board’s menu (⋯), Export board to Excel.</span>
      </label>
      {result && <p className="mfg-note">{result}</p>}

      {board && cols && (
        <div className="imp__map">
          <h3 className="imp__h">
            {board.board} <span className="soft num">· {count(rows.length, 'task')} · {file}</span>
          </h3>

          <div className="imp__grid">
            {FIELDS.map((f) => (
              <label key={f.key} className="ctl">
                <span className="ctl__name">{f.label}</span>
                <Select value={cols[f.key]} onChange={(v) => setCols({ ...cols, [f.key]: v })} options={[{ value: '', label: 'Not used' }, ...board.headers.map((h) => ({ value: h, label: h }))]} />
                {f.hint && <span className="soft small">{f.hint}</span>}
              </label>
            ))}
          </div>

          <h3 className="imp__h">Where each Monday group goes</h3>
          <ul className="rows">
            {board.groups.map((g) => (
              <li key={g} className="row imp__group">
                <span className="row__main">
                  <span className="strong">{g}</span>
                  <span className="soft small num">
                    {count(rows.filter((r) => r.group === g).length, 'task')}
                    {(() => {
                      const to = sorted.find((x) => x.id === map[g])
                      return to && to.kind === 'team' && to.name.toLowerCase() !== g.toLowerCase() ? ` · a section named ${g} in ${to.name}` : ''
                    })()}
                  </span>
                </span>
                <Select
                  className="field--inline"
                  label={`Steamhub group for ${g}`}
                  value={map[g] ?? ''}
                  onChange={(v) => setMap({ ...map, [g]: v })}
                  options={[
                    ...sorted.map((x) => ({ value: x.id, label: x.kind === 'team' ? x.name : `${sectionName(x.team)} · ${x.name}` })),
                    { value: LEAVE_OUT, label: 'Leave out' },
                  ]}
                />
              </li>
            ))}
          </ul>

          <h3 className="imp__h">First tasks</h3>
          <ul className="rows">
            {rows.slice(0, 6).map((r, i) => (
              <li key={i} className="row">
                <span className="row__main">
                  <span>{r.title}</span>
                  <span className="soft small num">
                    {[r.status === 'done' ? 'Done' : r.status === 'doing' ? 'In progress' : 'To do', r.owners.ids.map((id) => active.find((p) => p.id === id)?.name.split(' ')[0]).join(', '), r.due_on && `due ${dayLabel(r.due_on)}`, r.priority === 'high' && 'High'].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {missing.length > 0 && <p className="soft small">Not matched to anyone in Steamhub: {missing.join(', ')}. Those tasks come in without that owner.</p>}

          <div className="imp__acts">
            <button type="button" className="q-btn q-btn--main" onClick={doImport}>
              {busy ? 'Importing' : `Import ${count(taken.length, 'task')}${subCount ? ` and ${count(subCount, 'subtask')}` : ''}`}
            </button>
            <button type="button" className="q-btn" onClick={() => setBoard(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="soft small">
        Imported tasks land in their groups on the <Link to="/calendar">board</Link>.
      </p>
    </section>
  )
}
