import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalTabs, useCalSeason } from '../../components/cal'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { ago } from '../../lib/mfg'
import { dayLabel, groupOrder, TEAM_WORD, type CalGroup } from '../../lib/cal'
import { guessColumns, ownersOf, parseMonday, priorityOf, span, statusOf, day, type Field, type MondayBoard } from '../../lib/monday'
import { supabase } from '../../lib/supabase'
import { useCal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { readXlsx } from '../../lib/xlsx'

// Bringing other calendars and task lists in: Google Calendar on its own every hour, and Monday
// boards from their Excel export.

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
          <Monday groups={cal.groups} onDone={cal.reload} />
        </>
      )}
    </div>
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
      toast(`${d.count} events from Google Calendar${d.removed ? `, ${d.removed} removed` : ''}`)
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
            <span className="strong">{feed.error ? 'Last sync failed' : `${feed.count ?? 0} events in sync`}</span>
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
      <p className="soft small">Events that come from Google are changed in Google; the next sync puts back edits made here.</p>
    </section>
  )
}

// ----- Monday -----

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
      // Each Monday group goes to the Steamhub group with the same name, else to Mechanics.
      const fallback = sorted.find((g) => g.kind === 'team')?.id ?? sorted[0]?.id ?? ''
      setMap(Object.fromEntries(b.groups.map((name) => [name, sorted.find((g) => g.name.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(g.name.toLowerCase()))?.id ?? fallback])))
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
        return {
          group: it.group,
          title: v('name'),
          status: statusOf(v('status')),
          priority: priorityOf(v('priority')),
          starts_on,
          due_on,
          notes: v('notes'),
          owners,
        }
      })
      .filter((r) => r.title)
    // people changes rarely; board and columns drive this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, cols, people])

  const missing = [...new Set(rows.flatMap((r) => r.owners.missing))]

  const doImport = () =>
    run(async () => {
      if (!who || !board) return
      if (!cols?.name) return toast('Pick the column with the task names first')
      const key = (r: (typeof rows)[number]) => `monday:${board.board}:${r.group}:${r.title}`.toLowerCase()
      const payload = rows.map((r, i) => ({
        import_key: key(r),
        group_id: map[r.group],
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
      const ids = new Map<string, string>()
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await supabase.from('tasks').upsert(payload.slice(i, i + 200), { onConflict: 'import_key' }).select('id, import_key')
        if (error) return toast(error.message.includes('import_key') ? 'The import migration has not run on the database yet.' : error.message)
        for (const d of data ?? []) ids.set(d.import_key as string, d.id as string)
      }
      const owners = rows.flatMap((r) => r.owners.ids.map((user_id) => ({ task_id: ids.get(key(r))!, user_id }))).filter((o) => o.task_id)
      if (owners.length) await supabase.from('task_owners').upsert(owners, { onConflict: 'task_id,user_id', ignoreDuplicates: true })
      onDone()
      setResult(`${payload.length} tasks from ${board.board} are on the Calendar${missing.length ? `. Not matched to anyone: ${missing.join(', ')}` : ''}.`)
      setBoard(null)
      toast(`${payload.length} tasks imported`)
    })

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files[0])
  }

  return (
    <section className="section imp">
      <h2 className="section__title">Monday</h2>
      <p className="soft">Bring a Monday board’s tasks in: name, owner, status and dates. Importing the same board again updates those tasks instead of adding them twice.</p>
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
            {board.board} <span className="soft num">· {rows.length} tasks · {file}</span>
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
                  <span className="soft small num">{rows.filter((r) => r.group === g).length} tasks</span>
                </span>
                <Select
                  className="field--inline"
                  label={`Steamhub group for ${g}`}
                  value={map[g] ?? ''}
                  onChange={(v) => setMap({ ...map, [g]: v })}
                  options={sorted.map((x) => ({ value: x.id, label: x.kind === 'team' ? x.name : `${TEAM_WORD[x.team]} · ${x.name}` }))}
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
              {busy ? 'Importing' : `Import ${rows.length} tasks`}
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
