// Brings Programming's GitHub work into the Calendar as tasks (CALENDAR_V2_PLAN.md, part 4).
// Two ways, by what's saved in settings 'github':
//  - A Project board (Programming uses the org board "2026OffSeason"): every card on it, from any
//    repo, draft cards too. Status, people, dates and sub-issues come from the board. Cards taken
//    off the board leave the Calendar. This is the main way.
//  - Only a repo: its issues, as before.
// GitHub → Steamhub only: GitHub stays the truth for name, status and owners; Steamhub keeps its own
// comments, waits, list and which group a task sits in.
//
//  - The key is a fine-grained, read-only GitHub token in the Supabase secret GITHUB_TOKEN. It never
//    reaches the app. The repo (and optionally a Project board) is in settings 'github'.
//  - Runs when GitHub calls it (a webhook on issue changes, checked against GITHUB_WEBHOOK_SECRET when
//    set), every 15 minutes in the day as a safety net (pg_cron), and on Sync now.
//  - Cheap: only issues changed since the last run, with an ETag, so "nothing changed" costs nothing
//    against GitHub's limit. A Project board's columns come from GraphQL, read only for changed issues.
//  - Issues become tasks; sub-issues become their subtasks (deeper ones flattened under the top one).
//  - Status: the board column when there is a board (Todo / In Progress / Done), else open or closed.
//  - Owners: GitHub assignees, matched by the github username on profiles. Unknown ones are kept on
//    the task as their GitHub name until someone links them.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Cfg = {
  repo?: string
  /** A Project (v2) board: its URL, as pasted. */
  project?: string | null
  since?: string | null
  etag?: string | null
  synced_at?: string | null
  tried_at?: string | null
  count?: number
  error?: string | null
  last_change?: string | null
}

type Issue = {
  id: number
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  state_reason?: string | null
  closed_at: string | null
  updated_at: string
  labels: { name: string }[]
  assignees: { login: string }[]
  milestone: { due_on: string | null } | null
  pull_request?: unknown
  sub_issues_summary?: { total: number }
}

const israelDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

async function hmacOk(secret: string, body: string, sig: string | null) {
  if (!sig?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  const want = sig.slice(7)
  if (hex.length !== want.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i)
  return diff === 0
}

/** Board column → Steamhub status. */
function statusOfColumn(name: string | null | undefined): 'todo' | 'doing' | 'done' | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (/done|closed|finished|complete|shipped|merged/.test(n)) return 'done'
  if (/progress|doing|review|testing|wip|working|blocked/.test(n)) return 'doing'
  return 'todo'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.text()

  // A webhook from GitHub: checked when a secret is set. A ping just says hello.
  const event = req.headers.get('x-github-event')
  if (event) {
    const secret = Deno.env.get('GITHUB_WEBHOOK_SECRET')
    if (secret && !(await hmacOk(secret, body, req.headers.get('x-hub-signature-256')))) return json({ error: 'Bad signature' }, 401)
    if (event === 'ping') return json({ ok: true })
  }

  const { data: setting } = await db.from('settings').select('value').eq('key', 'github').maybeSingle()
  const cfg = (setting?.value ?? {}) as Cfg
  const save = (patch: Partial<Cfg>) => db.from('settings').upsert({ key: 'github', value: { ...cfg, ...patch }, updated_at: new Date().toISOString() })
  const token = Deno.env.get('GITHUB_TOKEN')
  if (!cfg.repo && !cfg.project) return json({ error: 'No GitHub board or repo saved yet' }, 400)
  if (!token) {
    await save({ tried_at: new Date().toISOString(), error: 'No GitHub key yet. Add it in Supabase as the secret GITHUB_TOKEN.' })
    return json({ error: 'No GitHub key yet. Add it in Supabase as the secret GITHUB_TOKEN.' }, 400)
  }
  // Open without a sign-in (GitHub and the timer have none), so it only re-reads the saved repo,
  // and not more than once every 10 seconds.
  const last = Date.parse(cfg.tried_at ?? '') || 0
  if (Date.now() - last < 10_000) return json({ changed: 0, recent: true })
  const started = new Date().toISOString()
  await save({ tried_at: started })

  const gh = (path: string, extra: Record<string, string> = {}) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'steamhub-calendar', ...extra },
    })

  try {
    if (cfg.project) {
      const out = await syncBoard(db, token, cfg.project)
      await save({ synced_at: started, count: out.count, error: null, ...(out.changed ? { last_change: out.last } : {}) })
      return json({ changed: out.changed, count: out.count, last: out.changed === 1 ? out.last : null })
    }
    const repo = (cfg.repo ?? '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '')
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('The repo should look like owner/name')

    // ----- Issues changed since the last run -----
    const firstRun = !cfg.since
    const since = cfg.since ?? new Date(Date.now() - 365 * 86_400_000).toISOString()
    const changed: Issue[] = []
    let etag: string | null = cfg.etag ?? null
    for (let page = 1; page <= 20; page++) {
      const res = await gh(`/repos/${repo}/issues?state=all&sort=updated&direction=asc&per_page=100&page=${page}&since=${encodeURIComponent(since)}`, page === 1 && cfg.etag ? { 'If-None-Match': cfg.etag } : {})
      if (res.status === 304) break
      if (res.status === 401) throw new Error('GitHub refused the key. Check GITHUB_TOKEN in Supabase.')
      if (res.status === 404) throw new Error(`GitHub can't see ${repo}. Check the name, and that the key may read it.`)
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      if (page === 1) etag = res.headers.get('etag')
      const list = (await res.json()) as Issue[]
      changed.push(...list.filter((i) => !i.pull_request))
      if (list.length < 100) break
    }
    // The first run skips issues closed long ago: they'd only fill the done list.
    const issues = changed.filter((i) => !(firstRun && i.state === 'closed' && i.closed_at && Date.now() - Date.parse(i.closed_at) > 60 * 86_400_000))
    if (!issues.length) {
      await save({ synced_at: started, since: cfg.since ?? started, etag, error: null })
      return json({ changed: 0 })
    }

    // ----- Where they go -----
    const { data: seasonRow } = await db.from('cal_groups').select('season').order('season', { ascending: false }).limit(1).maybeSingle()
    const season = seasonRow?.season as number | undefined
    if (season == null) throw new Error('The Calendar has no season yet')
    const { data: groups } = await db.from('cal_groups').select('id, team, kind, github_label').eq('season', season).eq('team', 'programming')
    const home = (groups ?? []).find((g) => g.kind === 'team')
    if (!home) throw new Error('No Programming group this season')
    const byLabel = new Map((groups ?? []).filter((g) => g.github_label).map((g) => [String(g.github_label).toLowerCase(), g.id as string]))
    const groupFor = (i: Issue) => i.labels.map((l) => byLabel.get(l.name.toLowerCase())).find(Boolean) ?? (home.id as string)

    const { data: profiles } = await db.from('profiles').select('id, github').not('github', 'is', null)
    const personOf = new Map((profiles ?? []).map((p) => [String(p.github).toLowerCase(), p.id as string]))

    // ----- Sub-issues: who is whose parent -----
    const parentOf = new Map<number, number>()
    for (const i of issues) {
      if (!i.sub_issues_summary?.total) continue
      const res = await gh(`/repos/${repo}/issues/${i.number}/sub_issues?per_page=100`)
      if (!res.ok) continue
      for (const c of (await res.json()) as Issue[]) parentOf.set(c.number, i.number)
    }

    // ----- A Project board's column and dates, for the changed issues -----
    const board = new Map<number, { status: string | null; start: string | null; end: string | null }>()
    const pm = cfg.project ? /github\.com\/(orgs|users)\/([\w.-]+)\/projects\/(\d+)/i.exec(cfg.project) : null
    if (pm) {
      const [owner, name] = repo.split('/')
      const num = Number(pm[3])
      const date = (alias: string, field: string) => `${alias}: fieldValueByName(name: "${field}") { ... on ProjectV2ItemFieldDateValue { date } }`
      for (let k = 0; k < issues.length; k += 40) {
        const part = issues.slice(k, k + 40)
        const q = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${part
          .map(
            (i) => `i${i.number}: issue(number: ${i.number}) { projectItems(first: 10) { nodes { project { number } status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } ${date('s1', 'Start date')} ${date('s2', 'Start')} ${date('e1', 'Target date')} ${date('e2', 'End date')} ${date('e3', 'Due date')} ${date('e4', 'Due')} } } }`,
          )
          .join(' ')} } }`
        const res = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'steamhub-calendar' },
          body: JSON.stringify({ query: q }),
        })
        if (!res.ok) throw new Error(`GitHub's board answered ${res.status}. The key may need read access to Projects.`)
        const out = (await res.json()) as { data?: { repository?: Record<string, { projectItems: { nodes: Record<string, { name?: string; date?: string; number?: number } | null>[] } } | null> }; errors?: { message: string }[] }
        if (!out.data?.repository && out.errors?.length) throw new Error(`GitHub's board: ${out.errors[0].message}`)
        for (const i of part) {
          const node = out.data?.repository?.[`i${i.number}`]?.projectItems.nodes.find((n) => (n.project as { number?: number } | null)?.number === num)
          if (!node) continue
          const d = (k2: string) => (node[k2] as { date?: string } | null)?.date ?? null
          board.set(i.number, { status: (node.status as { name?: string } | null)?.name ?? null, start: d('s1') ?? d('s2'), end: d('e1') ?? d('e2') ?? d('e3') ?? d('e4') })
        }
      }
    }

    // ----- Write them -----
    const { data: had } = await db.from('tasks').select('id, gh_id, gh_number, parent_id, group_id').eq('source', 'github')
    const byNumber = new Map((had ?? []).map((t) => [t.gh_number as number, t]))
    const topOf = (n: number) => {
      let cur = n
      for (let guard = 0; parentOf.has(cur) && guard < 10; guard++) cur = parentOf.get(cur)!
      return cur
    }
    // Parents first, so their subtasks can point at them.
    const ordered = [...issues].sort((a, b) => Number(parentOf.has(a.number)) - Number(parentOf.has(b.number)))
    let written = 0
    for (const i of ordered) {
      const b = board.get(i.number)
      const status = i.state === 'closed' ? 'done' : (statusOfColumn(b?.status) ?? (i.labels.some((l) => /in progress|doing|wip/i.test(l.name)) ? 'doing' : 'todo'))
      const due = b?.end ?? (i.milestone?.due_on ? israelDay(i.milestone.due_on) : null)
      const start = b?.start ?? null
      const known = (i.assignees ?? []).map((a) => a.login)
      const owners = known.map((l) => personOf.get(l.toLowerCase())).filter((x): x is string => !!x)
      const unknown = known.filter((l) => !personOf.has(l.toLowerCase()))
      const top = parentOf.has(i.number) ? topOf(i.number) : null
      const parentTask = top != null ? byNumber.get(top) : null
      const prev = byNumber.get(i.number)
      const fields: Record<string, unknown> = {
        title: i.title.slice(0, 300),
        status,
        gh_number: i.number,
        gh_url: i.html_url,
        gh_people: unknown,
        source: 'github',
      }
      // Dates only when GitHub has them, so dates set in Steamhub stay otherwise.
      if (due) fields.due_on = start && start > due ? start : due
      if (start) fields.starts_on = start && due && start > due ? due : start
      if (parentTask) fields.parent_id = parentTask.id
      let id: string
      if (prev) {
        // Which group it sits in is Steamhub's: a subtask follows its parent, a task stays put.
        if (parentTask) fields.group_id = parentTask.group_id
        const { error } = await db.from('tasks').update(fields).eq('id', prev.id)
        if (error) throw new Error(error.message)
        id = prev.id as string
      } else {
        const { data, error } = await db
          .from('tasks')
          .insert({ ...fields, gh_id: i.id, group_id: parentTask ? parentTask.group_id : groupFor(i), priority: 'normal', notes: '', sort: Date.now() / 1000 })
          .select('id, gh_id, gh_number, parent_id, group_id')
          .single()
        if (error) throw new Error(error.message)
        byNumber.set(i.number, data)
        id = data.id as string
      }
      // Owners follow GitHub's assignees.
      await db.from('task_owners').delete().eq('task_id', id)
      if (owners.length) await db.from('task_owners').insert(owners.map((user_id) => ({ task_id: id, user_id })))
      written++
    }

    const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('source', 'github')
    // The next run asks from a minute before this one started, so nothing slips between.
    const nextSince = new Date(Date.parse(started) - 60_000).toISOString()
    await save({ synced_at: started, since: nextSince, etag, count: count ?? 0, error: null, last_change: issues.length === 1 ? `#${issues[0].number} ${issues[0].title}` : `${issues.length} issues` })
    return json({ changed: written, count: count ?? 0, last: issues.length === 1 ? `#${issues[0].number} ${issues[0].title}` : null })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await save({ tried_at: started, error: message })
    return json({ error: message }, 502)
  }
})

// ----- The board way -----

type Named = { name?: string } | null
type FieldValue = {
  name?: string
  date?: string
  startDate?: string
  duration?: number
  field?: Named
}
type BoardItem = {
  databaseId: number
  isArchived: boolean
  type: 'ISSUE' | 'DRAFT_ISSUE' | 'PULL_REQUEST' | 'REDACTED'
  fieldValues: { nodes: (FieldValue | null)[] }
  content: {
    databaseId?: number
    number?: number
    title?: string
    url?: string
    state?: 'OPEN' | 'CLOSED'
    closedAt?: string | null
    assignees?: { nodes: { login: string }[] }
    labels?: { nodes: { name: string }[] }
    milestone?: { dueOn: string | null } | null
    parent?: { databaseId: number } | null
  } | null
}

const BOARD_QUERY = (root: 'organization' | 'user') => `query($login: String!, $num: Int!, $after: String) {
  ${root}(login: $login) { projectV2(number: $num) { url items(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { databaseId isArchived type
      fieldValues(first: 20) { nodes {
        ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
        ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
        ... on ProjectV2ItemFieldIterationValue { startDate duration field { ... on ProjectV2FieldCommon { name } } }
      } }
      content {
        ... on Issue { databaseId number title url state closedAt assignees(first: 10) { nodes { login } } labels(first: 20) { nodes { name } } milestone { dueOn } parent { databaseId } }
        ... on DraftIssue { title assignees(first: 10) { nodes { login } } }
      }
    }
  } } }
}`

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// deno-lint-ignore no-explicit-any
async function syncBoard(db: any, token: string, link: string): Promise<{ changed: number; count: number; last: string }> {
  const pm = /github\.com\/(orgs|users)\/([\w.-]+)\/projects\/(\d+)/i.exec(link)
  if (!pm) throw new Error('The board link should look like github.com/orgs/<org>/projects/<number>')
  const root = pm[1].toLowerCase() === 'orgs' ? 'organization' : 'user'
  const login = pm[2]
  const num = Number(pm[3])

  // ----- Every card on the board (a few points of GitHub's 5,000 an hour) -----
  const items: BoardItem[] = []
  let boardUrl = link
  let after: string | null = null
  let complete = false
  for (let page = 0; page < 30; page++) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'steamhub-calendar' },
      body: JSON.stringify({ query: BOARD_QUERY(root), variables: { login, num, after } }),
    })
    if (res.status === 401) throw new Error('GitHub refused the key. Check GITHUB_TOKEN in Supabase, and that an org owner approved it.')
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    // deno-lint-ignore no-explicit-any
    const out = (await res.json()) as { data?: any; errors?: { message: string }[] }
    const project = out.data?.[root]?.projectV2
    if (!project) {
      const why = out.errors?.[0]?.message ?? ''
      throw new Error(`GitHub can't show board ${num} of ${login}${why ? `: ${why}` : ''}. The key needs Projects: Read-only, and an org owner's approval.`)
    }
    boardUrl = project.url ?? link
    items.push(...(project.items.nodes as BoardItem[]).filter(Boolean))
    if (!project.items.pageInfo.hasNextPage) {
      complete = true
      break
    }
    after = project.items.pageInfo.endCursor
  }

  // Issues by their GitHub id; draft cards by minus their card id, so the two never clash.
  const keyOf = (it: BoardItem) => (it.type === 'ISSUE' ? it.content?.databaseId ?? null : it.type === 'DRAFT_ISSUE' ? -it.databaseId : null)
  const cards = items.filter((it) => !it.isArchived && keyOf(it) != null && it.content)

  // ----- Where they go -----
  const { data: seasonRow } = await db.from('cal_groups').select('season').order('season', { ascending: false }).limit(1).maybeSingle()
  const season = seasonRow?.season as number | undefined
  if (season == null) throw new Error('The Calendar has no season yet')
  const { data: groups } = await db.from('cal_groups').select('id, team, kind, github_label').eq('season', season).eq('team', 'programming')
  const home = (groups ?? []).find((g: { kind: string }) => g.kind === 'team')
  if (!home) throw new Error('No Programming group this season')
  // A group's GitHub label matches an issue label or any board field value (like an "Area" column).
  const byLabel = new Map<string, string>((groups ?? []).filter((g: { github_label: string | null }) => g.github_label).map((g: { github_label: string; id: string }) => [g.github_label.toLowerCase(), g.id]))
  const groupFor = (it: BoardItem) => {
    const words = [...(it.content?.labels?.nodes ?? []).map((l) => l.name), ...it.fieldValues.nodes.map((v) => v?.name).filter((x): x is string => !!x)]
    return words.map((w) => byLabel.get(w.toLowerCase())).find(Boolean) ?? (home.id as string)
  }

  const { data: profiles } = await db.from('profiles').select('id, github').not('github', 'is', null)
  const personOf = new Map<string, string>((profiles ?? []).map((p: { github: string; id: string }) => [p.github.toLowerCase(), p.id]))

  // ----- What each card says -----
  const onBoard = new Map<number, BoardItem>(cards.map((it) => [keyOf(it)!, it]))
  const parentKey = (it: BoardItem) => {
    const p = it.content?.parent?.databaseId
    return p != null && onBoard.has(p) ? p : null
  }
  // Subtasks hang under the top card of their chain that's on the board.
  const topOf = (k: number) => {
    let cur = k
    for (let guard = 0; guard < 10; guard++) {
      const p = parentKey(onBoard.get(cur)!)
      if (p == null) break
      cur = p
    }
    return cur
  }
  const read = (it: BoardItem) => {
    const values = it.fieldValues.nodes.filter((v): v is FieldValue => !!v)
    const statusCol = values.find((v) => v.name && v.field?.name?.toLowerCase() === 'status')?.name ?? null
    const dated = (re: RegExp) => values.find((v) => v.date && re.test(v.field?.name ?? ''))?.date ?? null
    let start = dated(/start|begin/i)
    let end = dated(/target|end|due|finish|deadline/i)
    const iter = values.find((v) => v.startDate)
    if (!start && !end && iter?.startDate) {
      start = iter.startDate
      end = addDays(iter.startDate, Math.max(0, (iter.duration ?? 1) - 1))
    }
    if (!end && it.content?.milestone?.dueOn) end = israelDay(it.content.milestone.dueOn)
    if (start && end && start > end) [start, end] = [end, start]
    const closed = it.content?.state === 'CLOSED'
    const status = closed ? 'done' : (statusOfColumn(statusCol) ?? 'todo')
    const logins = (it.content?.assignees?.nodes ?? []).map((a) => a.login)
    return {
      title: (it.content?.title ?? 'Untitled').slice(0, 300),
      status,
      starts_on: start,
      due_on: end,
      gh_number: it.content?.number ?? null,
      gh_url: it.content?.url ?? boardUrl,
      gh_people: logins.filter((l) => !personOf.has(l.toLowerCase())).sort(),
      owners: logins.map((l) => personOf.get(l.toLowerCase())).filter((x): x is string => !!x).sort(),
      closedLongAgo: closed && !!it.content?.closedAt && Date.now() - Date.parse(it.content.closedAt) > 60 * 86_400_000,
    }
  }

  // ----- Write only what changed -----
  const { data: had } = await db.from('tasks').select('id, gh_id, title, status, starts_on, due_on, gh_number, gh_url, gh_people, parent_id, group_id, task_owners(user_id)').eq('source', 'github')
  type Row = { id: string; gh_id: number; title: string; status: string; starts_on: string | null; due_on: string | null; gh_number: number | null; gh_url: string | null; gh_people: string[] | null; parent_id: string | null; group_id: string; task_owners: { user_id: string }[] }
  const byKey = new Map<number, Row>(((had ?? []) as Row[]).map((t) => [Number(t.gh_id), t]))

  // Top cards first, so subtasks can point at them.
  const ordered = [...cards].sort((a, b) => Number(parentKey(a) != null) - Number(parentKey(b) != null))
  let changed = 0
  let last = ''
  for (const it of ordered) {
    const key = keyOf(it)!
    const r = read(it)
    const prev = byKey.get(key)
    // The first time, cards closed long ago stay out: they'd only fill the done list.
    if (!prev && r.closedLongAgo) continue
    const pk = parentKey(it)
    const parent = pk != null ? byKey.get(topOf(key)) ?? null : null
    const fields = {
      title: r.title,
      status: r.status,
      starts_on: r.starts_on,
      due_on: r.due_on,
      gh_number: r.gh_number,
      gh_url: r.gh_url,
      gh_people: r.gh_people,
      parent_id: parent?.id ?? null,
      source: 'github',
    }
    let id: string
    if (prev) {
      const prevOwners = prev.task_owners.map((o) => o.user_id).sort()
      const same =
        prev.title === fields.title && prev.status === fields.status && prev.starts_on === fields.starts_on && prev.due_on === fields.due_on &&
        prev.gh_number === fields.gh_number && prev.gh_url === fields.gh_url && (prev.gh_people ?? []).slice().sort().join() === fields.gh_people.join() &&
        prev.parent_id === fields.parent_id && prevOwners.join() === r.owners.join() && (!parent || prev.group_id === parent.group_id)
      if (same) continue
      // Which group a task sits in is Steamhub's; a subtask follows its parent.
      const { error } = await db.from('tasks').update(parent ? { ...fields, group_id: parent.group_id } : fields).eq('id', prev.id)
      if (error) throw new Error(error.message)
      id = prev.id
    } else {
      const { data, error } = await db
        .from('tasks')
        .insert({ ...fields, gh_id: key, group_id: parent ? parent.group_id : groupFor(it), priority: 'normal', notes: '', sort: Date.now() / 1000 })
        .select('id, gh_id, title, status, starts_on, due_on, gh_number, gh_url, gh_people, parent_id, group_id')
        .single()
      if (error) throw new Error(error.message)
      byKey.set(key, { ...data, task_owners: [] })
      id = data.id
    }
    await db.from('task_owners').delete().eq('task_id', id)
    if (r.owners.length) await db.from('task_owners').insert(r.owners.map((user_id) => ({ task_id: id, user_id })))
    changed++
    last = r.gh_number != null ? `#${r.gh_number} ${r.title}` : r.title
  }

  // ----- Cards taken off the board (or archived) leave the Calendar -----
  // Only after a full, clean read, and never more than half at once, in case GitHub answered oddly.
  const gone = [...byKey.entries()].filter(([k]) => !onBoard.has(k)).map(([, t]) => t.id)
  if (complete && cards.length > 0 && gone.length && gone.length <= Math.max(3, byKey.size / 2)) {
    const { error } = await db.from('tasks').delete().in('id', gone)
    if (error) throw new Error(error.message)
    changed += gone.length
    if (!last) last = `${gone.length} taken off the board`
  }

  const { count } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('source', 'github')
  return { changed, count: count ?? 0, last: changed > 1 ? `${changed} cards` : last }
}
