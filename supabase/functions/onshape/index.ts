// Steamhub's link to Onshape (ONSHAPE.md). The only place that calls Onshape's API.
//
// Each person connects their own Onshape API key; it's kept in Vault and never sent back. A
// subsystem or a robot is linked to an assembly tab, and a sync reads its bill of materials:
// each part's material, mass and source document. It only reads, plus the STEP export, which
// stores nothing in the document.
//
//   POST { action, ... }   one of the fixed actions below; the browser can't send an Onshape URL
//
// Deployed with verify_jwt off, because the nightly run has no user token. A call needs either a
// signed-in member or the Vault key cron sends (x-onshape-key).
//
// Whose key pays: the caller's own, then the subsystem lead's, then an admin's. A key past 2,400
// calls this year is skipped, so Steamhub never uses up someone's 2,500.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const API = 'https://cad.onshape.com/api/v10'
const WARN_AT = 2000
const STOP_AT = 2400
const MAX_LOOKUPS = 40
const PLATE_THICKNESS = [0.5, 1, 1.2, 1.5, 1.524, 2, 3, 4, 5, 6, 6.35, 8, 10]

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-onshape-key',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
/** A problem the person can act on. Sent as 200 so the page can show the sentence. */
class Say extends Error {}
/** This key can't open the document, or is used up: try the next one. */
class NextKey extends Error {}

interface Caller { id: string | null; name: string; admin: boolean; captain: boolean; cron: boolean }
interface Ctx { keyUser: string; auth: string; by: string | null; linkId: string | null; action: string; calls: number; log: { endpoint: string; status: number }[] }
// deno-lint-ignore no-explicit-any
type Any = any

// ---------- who is calling ----------

async function caller(req: Request): Promise<Caller | null> {
  const key = req.headers.get('x-onshape-key')
  if (key) {
    const { data } = await db.rpc('onshape_key_ok', { k: key })
    return data === true ? { id: null, name: 'Nightly run', admin: true, captain: false, cron: true } : null
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  if (!data.user) return null
  const { data: p } = await db.from('profiles').select('id, name, is_admin, captain, banned').eq('id', data.user.id).maybeSingle()
  if (!p || p.banned) return null
  return { id: p.id, name: p.name ?? 'Someone', admin: !!p.is_admin, captain: !!p.captain, cron: false }
}

// ---------- keys and calls ----------

const basic = (a: string, s: string) => 'Basic ' + btoa(`${a}:${s}`)

/** The first of these people who has a key with budget left. */
async function keysFor(action: string, by: string | null, linkId: string | null, people: (string | null | undefined)[], softStop = STOP_AT): Promise<Ctx[]> {
  const ids = [...new Set(people.filter((x): x is string => !!x))]
  if (!ids.length) return []
  const { data: accounts } = await db.from('onshape_accounts').select('user_id, year, calls').in('user_id', ids)
  const year = new Date().getUTCFullYear()
  const out: Ctx[] = []
  for (const id of ids) {
    const a = (accounts ?? []).find((x: Any) => x.user_id === id)
    if (!a || (a.year === year && a.calls >= softStop)) continue
    const { data: k } = await db.rpc('onshape_key_get', { uid: id })
    if (k?.a && k?.s) out.push({ keyUser: id, auth: basic(k.a, k.s), by, linkId, action, calls: 0, log: [] })
  }
  return out
}

async function admins(): Promise<string[]> {
  const { data } = await db.from('profiles').select('id').eq('is_admin', true).eq('banned', false)
  return ((data ?? []) as { id: string }[]).map((p) => p.id)
}

/** One Onshape call. Counts it when Onshape does (2xx and 3xx), and writes it down. */
async function os(ctx: Ctx, method: string, path: string, body?: unknown, raw = false): Promise<Any> {
  const go = () =>
    fetch(API + path, {
      method,
      headers: { Authorization: ctx.auth, Accept: raw ? 'application/octet-stream' : 'application/json;charset=UTF-8; qs=0.09', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  let res = await go()
  if (res.status === 429) {
    const wait = Math.min(8, Number(res.headers.get('retry-after')) || 3)
    await res.body?.cancel()
    await new Promise((r) => setTimeout(r, wait * 1000))
    res = await go()
  }
  ctx.log.push({ endpoint: `${method} ${path.split('?')[0].replace(/[0-9a-f]{24}/g, '…')}`.slice(0, 120), status: res.status })
  if (res.status < 400) ctx.calls += 1
  if (res.status === 402) {
    await res.body?.cancel()
    throw new NextKey('budget')
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    await res.body?.cancel()
    throw new NextKey(res.status === 401 ? 'key' : 'access')
  }
  if (!res.ok) {
    const t = await res.text()
    console.error('onshape', res.status, path.split('?')[0], t.slice(0, 300))
    throw new Say(res.status === 429 ? 'Onshape is busy right now. Try again in a minute.' : `Onshape answered ${res.status}. Try again in a minute.`)
  }
  return raw ? res : await res.json()
}

/** Save the call log, add to the key's yearly count, and warn its owner once at 2,000. */
async function flush(ctx: Ctx) {
  if (ctx.log.length) {
    await db.from('onshape_calls').insert(ctx.log.map((l) => ({ ...l, key_user: ctx.keyUser, by_user: ctx.by, link_id: ctx.linkId, action: ctx.action })))
    ctx.log = []
  }
  if (!ctx.calls) return
  const n = ctx.calls
  ctx.calls = 0
  const { data: total } = await db.rpc('onshape_count', { uid: ctx.keyUser, n })
  if (typeof total === 'number' && total >= WARN_AT && total - n < WARN_AT) {
    await db.from('notifications').insert({ user_id: ctx.keyUser, kind: 'onshape', text: `Steamhub has used ${total.toLocaleString('en')} of your 2,500 Onshape calls this year. It stops using your key at 2,400.`, link: '/manufacturing' })
  }
}

/** Run `job` with the first key that can open the document. */
async function withKey<T>(ctxs: Ctx[], job: (ctx: Ctx) => Promise<T>): Promise<{ out: T; ctx: Ctx; calls: number }> {
  let why = ''
  for (const ctx of ctxs) {
    try {
      const out = await job(ctx)
      return { out, ctx, calls: ctx.calls }
    } catch (e) {
      await flush(ctx)
      if (!(e instanceof NextKey)) throw e
      why = e.message
    }
  }
  if (!ctxs.length) throw new Say('Nobody here has connected Onshape yet. Connect yours from the account menu.')
  throw new Say(
    why === 'budget'
      ? "That Onshape account has no calls left this year. Someone else's key can run the sync."
      : why === 'key'
        ? 'Onshape refused the key. Disconnect and connect Onshape again.'
        : "The connected Onshape accounts can't open this document. Share it with the lead in Onshape, or connect your own account.",
  )
}

// ---------- reading a bill of materials ----------

interface Row { name: string; qty: number; material: string | null; mass: number | null; pn: string | null; did: string; eid: string; partId: string | null; std: boolean; href: string | null; level: number }

const GRAMS: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, lb: 453.59237, oz: 28.349523, t: 1e6 }
function grams(s: unknown): number | null {
  if (typeof s === 'number') return s * 1000
  if (typeof s !== 'string') return null
  const m = s.trim().match(/^([-+\d.eE]+)\s*([a-zA-Z]+)?$/)
  if (!m) return null
  const v = Number(m[1])
  const k = GRAMS[(m[2] ?? 'kg').toLowerCase()]
  return Number.isFinite(v) && k ? v * k : null
}

function readBom(bom: Any): Row[] {
  const id: Record<string, string> = {}
  for (const h of bom.headers ?? []) id[h.name] = h.id
  const val = (r: Any, n: string) => (id[n] ? r.headerIdToValue?.[id[n]] : undefined)
  return (bom.rows ?? []).map((r: Any) => {
    const mat = val(r, 'Material')
    const s = r.itemSource ?? {}
    return {
      name: String(val(r, 'Name') ?? '').trim(),
      qty: Number(val(r, 'Quantity')) || 1,
      material: mat && typeof mat === 'object' ? (mat.displayName ?? null) : typeof mat === 'string' && mat ? mat : null,
      mass: grams(val(r, 'Mass')),
      pn: (val(r, 'Part number') as string) || null,
      did: s.documentId ?? '',
      eid: s.elementId ?? '',
      partId: s.partId || null,
      std: !!s.isStandardContent,
      href: s.viewHref ?? null,
      level: r.indentLevel ?? 0,
    }
  })
}

const bomPath = (l: { did: string; wid: string; eid: string }, indented: boolean) =>
  `/assemblies/d/${l.did}/w/${l.wid}/e/${l.eid}/bom?indented=${indented}&multiLevel=true&generateIfAbsent=false&onlyVisibleColumns=false`

const isPrintMaterial = (m: string | null) => !!m && /3d[\s-]*print|\bpla\b|\bpetg\b|\babs\b|\btpu\b|\basa\b/i.test(m)
const isDefaultName = (name: string) => /^\s*(part|body|solid)[\s_-]*\d+\s*$/i.test(name)
const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim()
const kg = (g: number) => (g / 1000).toFixed(2)

/** "Aluminum - 6061" on a 5 mm plate reads "Aluminum 6061 · 5 mm". */
function materialText(os: string, part: { cls: string | null; size: number[]; machine: string }) {
  const name = os.replace(/^3D Printed\s+/i, '').replace(/\s+-\s+/g, ' ').trim()
  if (part.cls !== 'plate' || part.machine !== 'CNC') return name
  const t = Math.min(...(part.size ?? []).map(Number).filter((v) => v > 0))
  if (!Number.isFinite(t)) return name
  const near = PLATE_THICKNESS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a))
  const th = Math.abs(near - t) <= 0.2 ? near : Math.round(t * 100) / 100
  return `${name} · ${th} mm`
}

async function settings() {
  const { data } = await db.from('settings').select('key, value').in('key', ['weight_limit_kg', 'weight_gain_kg', 'weight_heavy_part_kg'])
  const get = (k: string, d: number) => Number((data ?? []).find((s: Any) => s.key === k)?.value) || d
  return { limit: get('weight_limit_kg', 52.2), gain: get('weight_gain_kg', 0.2), heavy: get('weight_heavy_part_kg', 5) }
}

/** Team or library, for every source document in these rows. New ones cost one call each, once. */
async function documentKinds(ctx: Ctx, rows: Row[]): Promise<{ kinds: Map<string, string>; pending: number }> {
  const dids = [...new Set(rows.filter((r) => !r.std && r.did).map((r) => r.did))]
  const kinds = new Map<string, string>()
  if (!dids.length) return { kinds, pending: 0 }
  const { data: known } = await db.from('onshape_documents').select('did, kind').in('did', dids)
  for (const d of (known ?? []) as { did: string; kind: string }[]) kinds.set(d.did, d.kind)
  const todo = dids.filter((d) => !kinds.has(d))
  const now = todo.slice(0, MAX_LOOKUPS)
  const found: Any[] = []
  for (let i = 0; i < now.length; i += 5) {
    await Promise.all(
      now.slice(i, i + 5).map(async (did) => {
        try {
          const d = await os(ctx, 'GET', `/documents/${did}`)
          const kind = d.public ? 'library' : 'team'
          kinds.set(did, kind)
          found.push({ did, name: d.name ?? null, owner_name: d.owner?.name ?? null, public: !!d.public, kind })
        } catch (e) {
          // A document this key can't open stays unknown; another key may know it next time.
          if (!(e instanceof NextKey)) throw e
        }
      }),
    )
  }
  if (found.length) await db.from('onshape_documents').upsert(found, { onConflict: 'did', ignoreDuplicates: true })
  return { kinds, pending: todo.length - found.length }
}

// ---------- sync ----------

interface Link { id: string; subsystem_id: string | null; robot_id: string | null; did: string; wid: string; eid: string; doc_name: string | null; microversion: string | null; mass_g: number | null; target_g: number | null; dismissed: string[] }

async function linkPeople(link: Link): Promise<{ lead: string | null; sub: Any; robot: Any }> {
  if (link.subsystem_id) {
    const { data: sub } = await db.from('subsystems').select('id, number, name, lead_id, robot_id').eq('id', link.subsystem_id).maybeSingle()
    return { lead: sub?.lead_id ?? null, sub, robot: null }
  }
  const { data: robot } = await db.from('robots').select('id, name').eq('id', link.robot_id).maybeSingle()
  return { lead: null, sub: null, robot }
}

async function sync(link: Link, who: Caller, force: boolean, nightly = false) {
  const { lead, sub, robot } = await linkPeople(link)
  const order = nightly ? [lead, ...(await admins())] : [who.id, lead, ...(await admins())]
  // The nightly run leaves a key alone once it's past the warning line.
  const ctxs = await keysFor(nightly ? 'nightly' : 'sync', who.id, link.id, order, nightly ? WARN_AT : STOP_AT)
  const { out, ctx, calls } = await withKey(ctxs, async (ctx) => {
    const mv = (await os(ctx, 'GET', `/documents/d/${link.did}/w/${link.wid}/currentmicroversion`)).microversion as string
    if (!force && mv && mv === link.microversion) {
      await db.from('onshape_links').update({ last_checked_at: new Date().toISOString() }).eq('id', link.id)
      return { changed: false as const }
    }
    const res = sub ? await syncSubsystem(ctx, link, sub, mv, who) : await syncRobot(ctx, link, robot, mv)
    return { changed: true as const, ...res }
  })
  await flush(ctx)
  if (out.changed) {
    await db.from('onshape_links').update({ last_sync_at: new Date().toISOString(), last_sync_by: who.id, last_key_user: ctx.keyUser, last_calls: calls, last_checked_at: new Date().toISOString() }).eq('id', link.id)
    await db.from('onshape_syncs').insert({ link_id: link.id, by_id: who.id, key_user: ctx.keyUser, kind: 'light', microversion: out.microversion, mass_g: out.mass_g, rows: out.rows, matched: out.matched, calls, note: out.note })
  }
  return { ...out, calls, key_user: ctx.keyUser }
}

async function syncSubsystem(ctx: Ctx, link: Link, sub: Any, mv: string, who: Caller) {
  const bom = await os(ctx, 'GET', bomPath(link, false))
  const rows = readBom(bom).filter((r) => r.partId)
  const { kinds, pending } = await documentKinds(ctx, rows)
  const cfg = await settings()

  const { data: partData } = await db.from('parts').select('id, part_no, name, qty, machine, material, material_by, size, cls, status, released_at, os_keep, os_part_id, os_document, os_material, os_mass_g, os_bought, os_href, os_part_number').eq('subsystem_id', sub.id).neq('status', 'cancelled').limit(2000)
  const parts = (partData ?? []) as Any[]

  // Pair by name. A name that repeats is paired only when the quantity singles one out.
  const byName = new Map<string, { rows: Row[]; parts: Any[] }>()
  const slot = (n: string) => byName.get(n) ?? byName.set(n, { rows: [], parts: [] }).get(n)!
  for (const r of rows) slot(norm(r.name)).rows.push(r)
  for (const p of parts) slot(norm(p.name ?? '')).parts.push(p)
  const pairs: { row: Row; part: Any }[] = []
  const rowsLeft: Row[] = []
  const partsLeft: Any[] = []
  const dupNames: { name: string; n: number }[] = []
  for (const g of byName.values()) {
    if (g.rows.length === 1 && g.parts.length === 1) {
      pairs.push({ row: g.rows[0], part: g.parts[0] })
      continue
    }
    if (g.rows.length > 1) dupNames.push({ name: g.rows[0].name, n: g.rows.length })
    const usedParts = new Set<Any>()
    for (const r of g.rows) {
      const same = g.parts.filter((p) => !usedParts.has(p) && Number(p.qty) === r.qty)
      const rivals = g.rows.filter((x) => x.qty === r.qty)
      if (same.length === 1 && rivals.length === 1) {
        pairs.push({ row: r, part: same[0] })
        usedParts.add(same[0])
      } else rowsLeft.push(r)
    }
    for (const p of g.parts) if (!usedParts.has(p)) partsLeft.push(p)
  }
  const partOf = new Map(pairs.map((x) => [x.row, x.part]))

  // What each matched part learns from Onshape.
  let moved = 0
  let materials = 0
  const noMaterial: Any[] = []
  const noStock: Any[] = []
  const updates: { id: string; patch: Any }[] = []
  const { data: plates } = await db.from('plates').select('thickness, material, state').neq('state', 'gone')
  for (const { row, part } of pairs) {
    const bought = row.std ? 'standard' : kinds.get(row.did) === 'library' ? 'library' : null
    const patch: Any = { os_part_id: row.partId, os_document: row.did, os_href: row.href, os_material: row.material, os_mass_g: row.mass, os_part_number: row.pn, os_bought: bought }
    let machine = part.machine
    if (bought && !part.released_at && machine !== 'Bought' && !part.os_keep) {
      patch.machine = machine = 'Bought'
      patch.material = ''
      moved += 1
    }
    if (machine !== 'Bought') {
      if (row.material && part.material_by !== 'person') {
        const text = materialText(row.material, { ...part, machine })
        if (text !== part.material) materials += 1
        patch.material = text
        patch.material_by = 'onshape'
        const m = text.match(/^Aluminum.*· ([\d.]+) mm$/)
        if (m && !(plates ?? []).some((p: Any) => /alumin/i.test(p.material ?? '') && Math.abs(Number(p.thickness) - Number(m[1])) < 0.06)) noStock.push({ id: part.id, part_no: part.part_no, name: part.name, t: Number(m[1]) })
      } else if (!row.material && !bought && machine !== '3D print') noMaterial.push({ id: part.id, part_no: part.part_no, name: part.name })
    }
    if (Object.keys(patch).some((k) => (patch[k] ?? null) !== (part[k] ?? null))) updates.push({ id: part.id, patch })
  }
  for (let i = 0; i < updates.length; i += 10) await Promise.all(updates.slice(i, i + 10).map((u) => db.from('parts').update(u.patch).eq('id', u.id)))

  // Weight: every row with a mass, without printed parts (CAD counts them solid).
  let total = 0
  let prints = 0
  let noMass = 0
  const heavy: Any[] = []
  for (const r of rows) {
    const p = partOf.get(r)
    if (isPrintMaterial(r.material) || p?.machine === '3D print') prints += 1
    else if (r.mass == null) noMass += 1
    else {
      total += r.mass * r.qty
      if (r.mass / 1000 >= cfg.heavy) heavy.push({ name: r.name, kg: Number(kg(r.mass)), qty: r.qty })
    }
  }

  const flags: Any[] = []
  const prev = link.mass_g == null ? null : Number(link.mass_g)
  const gain = prev == null ? 0 : (total - prev) / 1000
  if (prev != null && gain >= cfg.gain) flags.push({ id: `gain:${mv}`, kind: 'gain', kg: Number(gain.toFixed(2)) })
  const target = link.target_g == null ? null : Number(link.target_g)
  if (target != null && total > target) flags.push({ id: 'over', kind: 'over', kg: Number(kg(total - target)) })
  if (heavy.length) flags.push({ id: `heavy:${heavy.length}`, kind: 'heavy', parts: heavy.slice(0, 6) })
  if (noMaterial.length) flags.push({ id: `nomat:${noMaterial.map((p) => p.part_no).join(',')}`.slice(0, 200), kind: 'nomat', parts: noMaterial.slice(0, 12), n: noMaterial.length })
  for (const p of noStock.slice(0, 6)) flags.push({ id: `stock:${p.part_no}:${p.t}`, kind: 'stock', part: p })
  const unnamed = parts.filter((p) => p.machine !== 'Bought' && isDefaultName(p.name ?? ''))
  if (unnamed.length) flags.push({ id: `names:${unnamed.length}`, kind: 'names', n: unnamed.length, parts: unnamed.slice(0, 6).map((p) => ({ id: p.id, part_no: p.part_no, name: p.name })) })
  if (dupNames.length) flags.push({ id: `dup:${dupNames.length}`, kind: 'dup', names: dupNames.sort((a, b) => b.n - a.n).slice(0, 6) })

  const first = link.microversion == null
  const bits = [`${pairs.length} of ${rows.length} parts matched`]
  if (moved) bits.push(`${moved} moved to Bought, ${moved === 1 ? 'it comes' : 'they come'} from a parts library`)
  if (materials) bits.push(`${materials} ${materials === 1 ? 'material' : 'materials'} set from Onshape`)
  const note = bits.join('. ') + '.'

  await db
    .from('onshape_links')
    .update({
      microversion: mv,
      doc_name: bom.bomSource?.document?.name ?? link.doc_name,
      mass_g: Math.round(total * 10) / 10,
      summary: { rows: rows.length, matched: pairs.length, prints, no_mass: noMass, moved, materials, docs_pending: pending, note },
      flags,
      // A dismissed flag comes back only when it changes (its id carries what it's about).
      dismissed: (link.dismissed ?? []).filter((d) => flags.some((f) => f.id === d)),
      unmatched: {
        onshape: rowsLeft.slice(0, 40).map((r) => ({ name: r.name, qty: r.qty, material: r.material, mass_g: r.mass })),
        steamhub: partsLeft.slice(0, 40).map((p) => ({ id: p.id, part_no: p.part_no, name: p.name, qty: p.qty })),
        onshape_n: rowsLeft.length,
        steamhub_n: partsLeft.length,
      },
    })
    .eq('id', link.id)

  // Only weight pushes to the lead: a jump over the threshold, or crossing the target.
  if (sub.lead_id && sub.lead_id !== who.id && !first) {
    const label = `${sub.number} ${sub.name}`
    const linkTo = `/manufacturing/s/${sub.id}`
    const crossed = target != null && total > target && (prev == null || prev <= target)
    if (crossed) await db.from('notifications').insert({ user_id: sub.lead_id, kind: 'onshape', text: `${label} is over its weight target: ${kg(total)} kg of ${kg(target!)} kg in CAD.`, link: linkTo })
    else if (gain >= cfg.gain) await db.from('notifications').insert({ user_id: sub.lead_id, kind: 'onshape', text: `${label} gained ${gain.toFixed(2)} kg in CAD. It's now ${kg(total)} kg.`, link: linkTo })
  }
  return { microversion: mv, mass_g: total, rows: rows.length, matched: pairs.length, note }
}

async function syncRobot(ctx: Ctx, link: Link, robot: Any, mv: string) {
  const bom = await os(ctx, 'GET', bomPath(link, true))
  const mp = await os(ctx, 'GET', `/assemblies/d/${link.did}/w/${link.wid}/e/${link.eid}/massproperties`)
  const rows = readBom(bom)
  const cfg = await settings()

  const { data: subs } = await db.from('subsystems').select('id').eq('robot_id', robot.id)
  const { data: links } = await db.from('onshape_links').select('subsystem_id, did, eid').in('subsystem_id', ((subs ?? []) as Any[]).map((s) => s.id).concat('00000000-0000-0000-0000-000000000000'))
  const subOf = new Map(((links ?? []) as Any[]).map((l) => [`${l.did}/${l.eid}`, l.subsystem_id as string]))

  // Top-level rows are the groups; quantities multiply down the tree.
  interface Group { name: string; subsystem_id: string | null; mass_g: number; rows: number }
  const groups: Group[] = []
  const loose: Group = { name: 'Loose parts', subsystem_id: null, mass_g: 0, rows: 0 }
  const stack: number[] = []
  let cur: Group = loose
  let total = 0
  let prints = 0
  let noMass = 0
  let leaves = 0
  const heavy: Any[] = []
  for (const r of rows) {
    stack.length = r.level
    const mult = stack.reduce((a, b) => a * b, 1)
    stack.push(r.qty)
    if (r.level === 0) {
      if (r.partId) cur = loose
      else {
        cur = { name: r.name, subsystem_id: subOf.get(`${r.did}/${r.eid}`) ?? null, mass_g: 0, rows: 0 }
        groups.push(cur)
      }
    }
    if (!r.partId) continue
    leaves += 1
    cur.rows += 1
    if (isPrintMaterial(r.material)) prints += 1
    else if (r.mass == null) noMass += 1
    else {
      const m = r.mass * r.qty * mult
      total += m
      cur.mass_g += m
      heavy.push({ name: r.name, kg: m / 1000, each: r.mass / 1000, qty: r.qty * mult, group: cur.name })
    }
  }
  if (loose.rows) groups.push(loose)
  heavy.sort((a, b) => b.kg - a.kg)
  const top = heavy.slice(0, 8).map((h) => ({ ...h, kg: Number(h.kg.toFixed(2)), each: Number(h.each.toFixed(2)) }))

  const flags: Any[] = []
  const tooHeavy = heavy.filter((h) => h.each >= cfg.heavy)
  if (tooHeavy.length) flags.push({ id: `heavy:${tooHeavy.length}`, kind: 'heavy', parts: tooHeavy.slice(0, 6).map((h) => ({ name: h.name, kg: Number(h.each.toFixed(2)), qty: h.qty })) })
  if (total / 1000 > cfg.limit) flags.push({ id: 'limit', kind: 'limit', kg: Number((total / 1000 - cfg.limit).toFixed(2)) })

  const note = `${leaves} part rows in ${groups.length} groups.`
  await db
    .from('onshape_links')
    .update({
      microversion: mv,
      doc_name: bom.bomSource?.document?.name ?? link.doc_name,
      mass_g: Math.round(total * 10) / 10,
      centroid: Array.isArray(mp?.centroid) ? mp.centroid.slice(0, 3) : null,
      summary: { rows: leaves, prints, no_mass: noMass, groups: groups.map((g) => ({ ...g, mass_g: Math.round(g.mass_g * 10) / 10 })), heavy: top, note },
      flags,
      dismissed: (link.dismissed ?? []).filter((d) => flags.some((f) => f.id === d)),
    })
    .eq('id', link.id)
  return { microversion: mv, mass_g: total, rows: leaves, matched: groups.filter((g) => g.subsystem_id).length, note }
}

// ---------- actions ----------

const HEX = /^[0-9a-f]{24}$/
async function getLink(id: unknown): Promise<Link> {
  const { data } = await db.from('onshape_links').select('*').eq('id', String(id)).maybeSingle()
  if (!data) throw new Say("This isn't linked to Onshape anymore.")
  return data as Link
}

/** The lead, the captain and admins set and change a link and its weight target. */
async function mayLink(who: Caller, subsystemId: string | null, robotId: string | null) {
  if (who.admin || who.captain) return true
  if (!who.id) return false
  if (subsystemId) {
    const { data } = await db.from('subsystems').select('lead_id').eq('id', subsystemId).maybeSingle()
    return data?.lead_id === who.id
  }
  const { data } = await db.from('subsystems').select('id').eq('robot_id', robotId).eq('lead_id', who.id).limit(1)
  return !!data?.length
}

async function act(who: Caller, b: Any): Promise<Any> {
  switch (b.action) {
    case 'connect': {
      if (!who.id) throw new Say('Sign in first.')
      const a = String(b.access ?? '').trim()
      const s = String(b.secret ?? '').trim()
      if (!a) throw new Say('Paste the access key first.')
      if (!s) throw new Say('Paste the secret key too.')
      const ctx: Ctx = { keyUser: who.id, auth: basic(a, s), by: who.id, linkId: null, action: 'connect', calls: 0, log: [] }
      let me: Any
      try {
        me = await os(ctx, 'GET', '/users/sessioninfo')
      } catch (e) {
        if (e instanceof NextKey) throw new Say("Onshape didn't accept those keys. Copy both again; the secret key is only shown once.")
        throw e
      }
      await db.rpc('onshape_key_set', { uid: who.id, a, s })
      await db.from('onshape_accounts').upsert({ user_id: who.id, onshape_name: me?.name ?? null, connected_at: new Date().toISOString() }, { onConflict: 'user_id' })
      await flush(ctx)
      // Scope bit 2 is write. The key works either way; read-only is the safer kind.
      return { ok: true, name: me?.name ?? null, can_write: typeof me?.oauth2Scopes === 'number' ? (me.oauth2Scopes & 2) !== 0 : null }
    }
    case 'disconnect': {
      if (!who.id) throw new Say('Sign in first.')
      await db.rpc('onshape_key_del', { uid: who.id })
      await db.from('onshape_accounts').delete().eq('user_id', who.id)
      return { ok: true }
    }
    case 'link': {
      const subsystemId = b.subsystem_id ? String(b.subsystem_id) : null
      const robotId = b.robot_id ? String(b.robot_id) : null
      if (!subsystemId === !robotId) throw new Say('Pick a subsystem or a robot to link.')
      if (!(await mayLink(who, subsystemId, robotId))) throw new Say('The lead, the captain or an admin links it to Onshape.')
      const url = String(b.url ?? '').trim()
      if (!url) throw new Say('Paste the assembly link first.')
      if (/\/documents\/[0-9a-f]{24}\/[vm]\//.test(url)) throw new Say("That's a link to a version. Open the main workspace in Onshape and copy the address from there.")
      const m = url.match(/\/documents\/([0-9a-f]{24})\/w\/([0-9a-f]{24})\/e\/([0-9a-f]{24})/)
      if (!m) throw new Say("That doesn't look like an Onshape tab link. Copy the address from the Assembly tab.")
      const row = { subsystem_id: subsystemId, robot_id: robotId, did: m[1], wid: m[2], eid: m[3], linked_by: who.id }
      const { data: old } = await db.from('onshape_links').select('id, did, wid, eid').eq(subsystemId ? 'subsystem_id' : 'robot_id', subsystemId ?? robotId).maybeSingle()
      if (old && old.did === row.did && old.wid === row.wid && old.eid === row.eid) return { ok: true, id: old.id }
      // A different assembly starts clean: its weight and flags belonged to the old one.
      if (old) await db.from('onshape_links').delete().eq('id', old.id)
      const { data, error } = await db.from('onshape_links').insert(row).select('id').single()
      if (error) throw new Say(error.message)
      return { ok: true, id: data.id }
    }
    case 'unlink': {
      const link = await getLink(b.link_id)
      if (!(await mayLink(who, link.subsystem_id, link.robot_id))) throw new Say('The lead, the captain or an admin changes the link.')
      await db.from('onshape_links').delete().eq('id', link.id)
      return { ok: true }
    }
    case 'target': {
      const link = await getLink(b.link_id)
      if (!(await mayLink(who, link.subsystem_id, link.robot_id))) throw new Say('The lead, the captain or an admin sets the weight target.')
      const v = b.kg === null || b.kg === '' ? null : Number(b.kg)
      if (v !== null && !(v > 0 && v < 200)) throw new Say('Give the target in kg, like 4.5.')
      await db.from('onshape_links').update({ target_g: v === null ? null : Math.round(v * 1000) }).eq('id', link.id)
      return { ok: true }
    }
    case 'dismiss': {
      const link = await getLink(b.link_id)
      const flag = String(b.flag ?? '')
      if (flag && !(link.dismissed ?? []).includes(flag)) await db.from('onshape_links').update({ dismissed: [...(link.dismissed ?? []), flag] }).eq('id', link.id)
      return { ok: true }
    }
    case 'doc_kind': {
      if (!who.admin) throw new Say('Only an admin changes what a document counts as.')
      if (!HEX.test(String(b.did)) || !['team', 'library'].includes(b.kind)) throw new Say('Pick team or library.')
      await db.from('onshape_documents').update({ kind: b.kind, set_by: who.id }).eq('did', b.did)
      return { ok: true }
    }
    case 'sync':
      return await sync(await getLink(b.link_id), who, !!b.force)
    case 'step_start':
    case 'step_status':
    case 'step_get': {
      const link = await getLink(b.link_id)
      const { lead } = await linkPeople(link)
      const ctxs = await keysFor(b.action, who.id, link.id, [who.id, lead, ...(await admins())])
      const { out, ctx } = await withKey<Any>(ctxs, async (ctx) => {
        if (b.action === 'step_start') {
          const t = await os(ctx, 'POST', `/assemblies/d/${link.did}/w/${link.wid}/e/${link.eid}/translations`, { formatName: 'STEP', storeInDocument: false, stepUnit: 'MILLIMETER' })
          return { id: t.id as string, name: (t.name as string) ?? link.doc_name ?? 'assembly' }
        }
        if (b.action === 'step_status') {
          if (!HEX.test(String(b.id))) throw new Say('That export is gone. Start it again.')
          const t = await os(ctx, 'GET', `/translations/${b.id}`)
          return { state: t.requestState as string, fid: (t.resultExternalDataIds?.[0] as string) ?? null, reason: (t.failureReason as string) ?? null }
        }
        if (!HEX.test(String(b.fid))) throw new Say('That export is gone. Start it again.')
        return (await os(ctx, 'GET', `/documents/d/${link.did}/externaldata/${b.fid}`, undefined, true)) as Response
      })
      await flush(ctx)
      if (out instanceof Response) return new Response(out.body, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } })
      return out
    }
    case 'nightly': {
      if (!who.cron && !who.admin) throw new Say('Only the nightly run or an admin starts this.')
      const { data: links } = await db.from('onshape_links').select('*')
      const out: Any[] = []
      for (const link of (links ?? []) as Link[]) {
        try {
          const r = await sync(link, { ...who, id: null }, false, true)
          out.push({ link: link.id, changed: r.changed, calls: r.calls })
        } catch (e) {
          out.push({ link: link.id, error: (e as Error).message })
        }
      }
      return { ok: true, links: out }
    }
  }
  throw new Say("Steamhub doesn't know that Onshape action.")
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req)
  if (!who) return json({ error: 'Sign in first.' }, 401)
  let body: Any = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Nothing to do.' }, 400)
  }
  try {
    const out = await act(who, body)
    return out instanceof Response ? out : json(out)
  } catch (e) {
    if (e instanceof Say) return json({ error: e.message })
    console.error('onshape failed', body?.action, (e as Error).message)
    return json({ error: 'Something went wrong on the way to Onshape. Try again.' }, 500)
  }
})
