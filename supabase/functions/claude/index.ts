// Steamhub's one door to Claude (ONSHAPE.md phase 4). The API key lives only here, as the secret
// ANTHROPIC_API_KEY. Each feature has its prompt on the server, so the browser can't send its own:
// it names a feature and hands over ids, a question or a drawing.
//
//   POST { feature: 'part_review', part_id, image }   checks one part's drawing and route
//   POST { feature: 'part_review', example_id, image } the same, on a drawing-training example
//   POST { feature: 'drawing_notes' }                 admin: turn training feedback into rules
//   POST { feature: 'ask', question }                 SteamLab: a question about the synced CAD data
//   POST { feature: 'reject_reports' }                the 5-minute run: one report per subsystem
//
// Deployed with verify_jwt off, because the reject run has no user token. A call needs a signed-in
// member or the Vault key cron sends (x-claude-key). Every call is written to ai_calls with its
// tokens and cost, and each person has a daily cap per feature.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import Anthropic from 'npm:@anthropic-ai/sdk'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const MODEL = 'claude-opus-5-5'
// $ per million tokens, for the cost column. Opus 5.5.
const PRICE = { input: 4, output: 20 }
const CAP: Record<string, number> = { part_review: 600, ask: 40, drawing_notes: 20 }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-claude-key',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
class Say extends Error {}
// deno-lint-ignore no-explicit-any
type Any = any

interface Caller { id: string | null; name: string; admin: boolean; steamlab: boolean; cron: boolean }

async function caller(req: Request): Promise<Caller | null> {
  const key = req.headers.get('x-claude-key')
  if (key) {
    const { data } = await db.rpc('claude_key_ok', { k: key })
    return data === true ? { id: null, name: 'Scheduled run', admin: true, steamlab: true, cron: true } : null
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  if (!data.user) return null
  const { data: p } = await db.from('profiles').select('id, name, is_admin, captain, mentor, banned').eq('id', data.user.id).maybeSingle()
  if (!p || p.banned) return null
  let steamlab = !!(p.is_admin || p.captain || p.mentor)
  if (!steamlab) {
    const [{ data: s }, { data: g }] = await Promise.all([
      db.from('subsystems').select('id').eq('lead_id', p.id).limit(1),
      db.from('cal_groups').select('id').eq('lead_id', p.id).limit(1),
    ])
    steamlab = !!(s?.length || g?.length)
  }
  return { id: p.id, name: p.name ?? 'Someone', admin: !!p.is_admin, steamlab, cron: false }
}

async function underCap(who: Caller, feature: string) {
  if (!who.id || !CAP[feature]) return
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { count } = await db.from('ai_calls').select('id', { count: 'exact', head: true }).eq('user_id', who.id).eq('feature', feature).gte('at', since)
  if ((count ?? 0) >= CAP[feature]) throw new Say(feature === 'ask' ? "That's today's limit of questions. It resets tomorrow." : "That's today's limit of drawing checks. The rest can wait until tomorrow.")
}

/** One request to Claude that must come back as JSON matching `schema`. */
async function claude<T>(who: Caller, feature: string, effort: 'low' | 'medium', system: string, content: Any, schema: Any): Promise<{ out: T; model: string }> {
  const client = new Anthropic()
  // Server-side fallback: if the model declines, the API re-runs the request on another model.
  const params: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  }
  let res: Any
  try {
    res = await client.beta.messages.create(params as never)
  } catch (e) {
    await db.from('ai_calls').insert({ user_id: who.id, feature, model: MODEL, ok: false })
    if (e instanceof Anthropic.RateLimitError) throw new Say('Claude is busy right now. Try again in a minute.')
    if (e instanceof Anthropic.APIError) {
      console.error('claude', feature, e.status, e.message)
      throw new Say("Claude didn't answer. Try again in a minute.")
    }
    throw e
  }
  const u = res.usage ?? {}
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  const output = u.output_tokens ?? 0
  const text = res.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined
  const ok = res.stop_reason !== 'refusal' && res.stop_reason !== 'max_tokens' && !!text
  await db.from('ai_calls').insert({ user_id: who.id, feature, model: res.model, input_tokens: input, output_tokens: output, cost_usd: (input * PRICE.input + output * PRICE.output) / 1e6, ok })
  if (!ok) throw new Say("Claude couldn't answer that one.")
  return { out: JSON.parse(text!.text) as T, model: res.model }
}

const first = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/)[0] || 'Someone'

// ---------- Part review: is the drawing usable, and is the route right? ----------

const REVIEW_SYSTEM = `You check one part of an FRC robot before it goes to the team's student workshop. You get the part's drawing as an image and a few facts about it. Find only problems that would waste a student's time at a machine. Most parts are fine: then return no findings.

Check two things.
1. Can the part be made from this drawing? The views must show the part clearly. A part made on the Lathe or Mill needs the dimensions its features depend on: a diameter and a length for a turned step, a width and a depth for a slot, a size and a position for a hole. A dimension label must point at the feature it measures.
2. Is the route right? "machine" is where the part is made: CNC (flat plates cut on a router), Mill, Lathe, 3D print, or Bought (not made at all). Flag a part that is clearly a bought item (motor, bearing, bolt, belt, sensor, gear from a vendor) but routed to a machine, a part routed to a machine that can't make its shape (a round shaft on the CNC, a flat plate on the lathe), or a material that doesn't fit the machine (a sheet thickness on a turned part).

Rules.
- The title block (robot, subsystem, part number, material, version, drawn by) is printed by Steamhub, not drawn by the student. Never comment on it: not its layout, not overlapping or cut-off text, not whether it is readable.
- The part number is Steamhub's own. A number at the start of the part's name, as in "3022 - Front Plate", is an older number from CAD and may differ. Never flag that.
- CNC plate drawings are minimal on purpose: they show the outline, the plate width and bearing holes only, because the router cuts from a DXF. Never flag missing hole sizes or missing dimensions on a CNC part.
- 3D-printed parts are printed from the STEP file. Never flag missing dimensions on them.
- A name like "Part 7" is flagged elsewhere. Don't flag names.
- Don't judge the design: not strength, not weight, not whether it could be made more easily.
- Don't repeat the facts back, and don't praise.
- At most two findings. Each is one or two plain sentences a 16-year-old can act on, saying what is wrong and what to do, like "No length is shown for the shaft. Add the overall length." No part numbers in the text.
- kind is "drawing" for a drawing problem, "route" for a wrong machine or material, "bought" when it should be Bought.
- If you are not sure, return no finding.`

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['kind', 'text'], properties: { kind: { type: 'string', enum: ['drawing', 'route', 'bought'] }, text: { type: 'string' } } },
    },
  },
}

/**
 * Rules learned from drawing training (DRAWING_TRAINING.md), approved by an admin. They come from
 * real corrections, so they win over the two general checks, but never over the fixed Rules. They
 * go in the request, right before the answer: at the end of the system prompt they were ignored.
 */
async function reviewNotes(): Promise<string | null> {
  const { data } = await db.from('drawing_lessons').select('text, kind').eq('status', 'live').order('approved_at').limit(30)
  if (!data?.length) return null
  const lines = (data as Any[]).map((l) => `- ${l.kind === 'engine_gap' ? "(Steamhub draws this, the student can't fix it) " : ''}${l.text}`)
  return `Notes from the team's mentor, learned from drawings they corrected. They take priority over "Check two things": before you answer, drop every finding a note says not to make, even if the checks would make it, and look for what a note says to flag. They never override the Rules.
${lines.join('\n')}`
}

async function partReview(who: Caller, b: Any) {
  await underCap(who, 'part_review')
  const image = String(b.image ?? '')
  const m = image.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if (!m) throw new Say('The drawing picture is missing.')
  if (m[2].length > 4_000_000) throw new Say('The drawing picture is too big to check.')
  const notes = await reviewNotes()
  const check = (facts: Any) => claude<{ findings: { kind: string; text: string }[] }>(who, 'part_review', 'low', REVIEW_SYSTEM, [
    { type: 'image', source: { type: 'base64', media_type: `image/${m[1]}`, data: m[2] } },
    { type: 'text', text: `Facts about this part:\n${JSON.stringify(facts)}${notes ? `\n\n${notes}` : ''}` },
  ], REVIEW_SCHEMA)

  // A drawing-training example: admin only, findings stored on the example.
  if (b.example_id) {
    if (!who.admin) throw new Say('Drawing training is for the admin.')
    const { data: e } = await db.from('drawing_examples').select('id, name, qty, machine, route, why, material, size, cls').eq('id', String(b.example_id)).maybeSingle()
    if (!e) throw new Say("That example isn't there anymore.")
    const { out, model } = await check({
      name: e.name,
      subsystem: null,
      machine: e.machine,
      route: e.route?.length > 1 ? `${e.route.join(' → ')}${e.why ? ` (${e.why})` : ''}` : null,
      material: e.material || null,
      size_mm: e.size,
      shape_class: e.cls,
      quantity: e.qty,
      onshape_says_bought: null,
      onshape_material: null,
    })
    const findings = (out.findings ?? []).slice(0, 2).filter((f) => f.text?.trim())
    await db.from('drawing_examples').update({ claude_findings: findings, claude_at: new Date().toISOString(), claude_engine: model }).eq('id', e.id)
    return { findings }
  }

  const { data: p } = await db.from('parts').select('id, sig, part_no, name, qty, machine, material, size, cls, notes, os_bought, os_material, subsystem_id').eq('id', String(b.part_id)).maybeSingle()
  if (!p) throw new Say("That part isn't there anymore.")
  const { data: sub } = await db.from('subsystems').select('number, name').eq('id', p.subsystem_id).maybeSingle()
  const route = /^Route: (.+?)(?: \(|$)/m.exec(p.notes ?? '')?.[1] ?? null
  const { out, model } = await check({
    name: p.name,
    subsystem: sub ? `${sub.number} ${sub.name}` : null,
    machine: p.machine,
    route,
    material: p.material || null,
    size_mm: p.size,
    shape_class: p.cls,
    quantity: p.qty,
    onshape_says_bought: p.os_bought ?? null,
    onshape_material: p.os_material ?? null,
  })
  const findings = (out.findings ?? []).slice(0, 2).filter((f) => f.text?.trim())
  await db.from('part_reviews').upsert({ part_id: p.id, sig: p.sig, findings, dismissed: [], model, reviewed_at: new Date().toISOString() }, { onConflict: 'part_id' })
  return { findings }
}

// ---------- Drawing notes: training feedback turned into rules for the part review ----------

const NOTES_SYSTEM = `You help improve an automatic drawing check for FRC team 1577 Steampunk. Steamhub turns each uploaded STEP part into a workshop drawing with its own engine, and guesses whether the part is made or bought, its machine route (CNC, Lathe, Mill, 3D print, Bend) and its material. Then Claude checks each drawing with a fixed prompt (below, under "The check's prompt").

The team's mentor reviewed training drawings: they marked fix chips, put notes on the drawing, corrected the engine's guesses, and marked each of the check's findings right or wrong. You get those reviews as JSON, and the rules already in use.

Write new short rules for the check, so it stops repeating mistakes they already corrected:
- A finding marked wrong again and again means the check should stop saying it. Write a "don't flag" rule.
- A problem they marked that the check missed means it should look for it. Write a "flag" rule, only for things a student can fix in CAD (a wrong material, a part that should be bought) or that a workshop student must be warned about.
- A problem the drawing engine causes (a missing flat pattern, a view chosen badly, overlapping dimension text) is not the student's to fix. Write it as kind "engine_gap": a rule that tells the check not to blame the student for it.
- Route or made/bought corrections that follow a pattern become "route" or "bought" rules.

Rules:
- Only rules backed by at least two reviews, unless one review is unmistakable. Say how many reviews back each one in "sources".
- Never repeat or contradict a rule already in use; never contradict the check's prompt (CNC drawings are minimal on purpose; 3D prints need no dimensions; never comment on the title block).
- Each rule is one or two plain sentences, at most 40 words, general (no part names or numbers).
- At most 8 rules. Return none if nothing new is worth a rule.`

const NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rules'],
  properties: {
    rules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'kind', 'sources'],
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['drawing', 'route', 'bought', 'engine_gap'] }, sources: { type: 'integer' } },
      },
    },
  },
}

async function drawingNotes(who: Caller) {
  if (!who.admin || who.cron) throw new Say('Drawing training is for the admin.')
  await underCap(who, 'drawing_notes')
  const { data: lessons } = await db.from('drawing_lessons').select('text, kind, status, created_at').neq('status', 'dropped').order('created_at', { ascending: false })
  const since = (lessons as Any[] | null)?.[0]?.created_at ?? '1970-01-01'
  const { data: reviews } = await db
    .from('drawing_reviews')
    .select('verdict, fixes, marks, made, route, material, cls, claude_marks, note, engine_version, at, drawing_examples(name, machine, route, why, material, cls, size, custom)')
    .gt('at', since)
    .order('at', { ascending: false })
    .limit(300)
  const useful = ((reviews ?? []) as Any[]).filter((r) => r.verdict !== 'skipped' && (r.verdict !== 'right' || r.claude_marks?.length))
  if (!useful.length) return { added: 0 }
  const rows = useful.map((r) => ({
    verdict: r.verdict,
    engine_picked: r.drawing_examples ? { name: r.drawing_examples.name, made: r.drawing_examples.custom ? 'made' : 'bought', machine: r.drawing_examples.machine, route: r.drawing_examples.route, why: r.drawing_examples.why, material: r.drawing_examples.material, shape: r.drawing_examples.cls, size_mm: r.drawing_examples.size } : null,
    corrected: { made: r.made, route: r.route, material: r.material, shape: r.cls },
    fixes: r.fixes,
    marks: (r.marks ?? []).map((m: Any) => [m.note, m.fix].filter(Boolean).join(' · ')).filter(Boolean),
    note: r.note || undefined,
    claude_findings_marked: r.claude_marks,
  }))
  const inUse = ((lessons ?? []) as Any[]).map((l) => `- [${l.status}] ${l.text}`).join('\n') || '(none)'
  const { out } = await claude<{ rules: { text: string; kind: string; sources: number }[] }>(who, 'drawing_notes', 'medium', NOTES_SYSTEM, [
    { type: 'text', text: `The check's prompt:\n${REVIEW_SYSTEM}\n\nRules already in use or waiting for approval:\n${inUse}\n\nReviews since the last notes:\n${JSON.stringify(rows)}` },
  ], NOTES_SCHEMA)
  const add = (out.rules ?? []).filter((r) => r.text?.trim()).slice(0, 8)
  if (add.length) await db.from('drawing_lessons').insert(add.map((r) => ({ text: r.text.trim(), kind: r.kind, sources: Math.max(0, r.sources | 0), status: 'proposed' })))
  return { added: add.length }
}

// ---------- Ask: a question about the synced CAD and parts data ----------

const ASK_SYSTEM = `You answer questions from the mentors and leads of FRC team 1577 Steampunk about their robot. You get a JSON snapshot of Steamhub: robots, subsystems with their leads, how many parts are made, and what the last sync from Onshape (the CAD) found: weights, materials, flags and recent changes.

Rules.
- Use only the snapshot. If it doesn't hold the answer, say so in one sentence and say what would be needed (for example "that subsystem isn't linked to Onshape yet").
- Lead with the answer. Plain English, short sentences, no headings, no lists unless the answer is a list. At most about 120 words.
- Weights are CAD weights in kg, to two decimals, with the unit. They leave out 3D-printed parts and parts with no material; mention that only when it changes the answer.
- No blame. Name a part by its number and name.
- "numbers" holds the figures you used, each with a short label and a value with its unit, so the reader can check you. Leave it empty when you used none.`

const ASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'numbers'],
  properties: {
    answer: { type: 'string' },
    numbers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' } } } },
  },
}

async function snapshot() {
  const [{ data: robots }, { data: subs }, { data: links }, { data: syncs }, { data: people }] = await Promise.all([
    db.from('robots').select('id, name, season, version, archived').eq('archived', false),
    db.from('subsystems').select('id, robot_id, number, name, lead_id, assembled'),
    db.from('onshape_links').select('id, subsystem_id, robot_id, doc_name, mass_g, target_g, centroid, summary, flags, unmatched, last_sync_at'),
    db.from('onshape_syncs').select('link_id, mass_g, rows, matched, note, at').order('at', { ascending: false }).limit(60),
    db.from('profiles').select('id, name'),
  ])
  const nameOf = (id: string | null) => first(((people ?? []) as Any[]).find((p) => p.id === id)?.name)
  const live = new Set(((robots ?? []) as Any[]).map((r) => r.id))
  const mySubs = ((subs ?? []) as Any[]).filter((s) => live.has(s.robot_id))
  const ids = mySubs.map((s) => s.id)
  const parts: Any[] = []
  for (let i = 0; i < ids.length; i += 40) {
    const { data } = await db.from('parts').select('subsystem_id, part_no, name, qty, machine, material, status, released_at, os_mass_g, os_bought, urgent').in('subsystem_id', ids.slice(i, i + 40)).neq('status', 'cancelled').limit(3000)
    parts.push(...(data ?? []))
  }
  const kg = (g: Any) => (g == null ? null : Math.round(Number(g) / 10) / 100)
  const linkOf = (k: string, id: string) => ((links ?? []) as Any[]).find((l) => l[k] === id)
  const onshape = (l: Any) =>
    l && {
      document: l.doc_name,
      cad_weight_kg: kg(l.mass_g),
      target_kg: kg(l.target_g),
      last_sync: l.last_sync_at,
      not_counted: { printed_parts: l.summary?.prints ?? 0, no_material_or_mass: l.summary?.no_mass ?? 0 },
      flags: l.flags,
      unmatched_parts: (l.unmatched?.onshape_n ?? 0) + (l.unmatched?.steamhub_n ?? 0),
      history: ((syncs ?? []) as Any[]).filter((s) => s.link_id === l.id).slice(0, 8).map((s) => ({ at: s.at, cad_weight_kg: kg(s.mass_g), note: s.note })),
    }
  return {
    now: new Date().toISOString(),
    robots: ((robots ?? []) as Any[]).map((r) => {
      const l = linkOf('robot_id', r.id)
      return {
        name: r.name,
        season: r.season,
        onshape: l && { ...onshape(l), centre_of_mass_m: l.centroid, groups: (l.summary?.groups ?? []).map((g: Any) => ({ name: g.name, cad_weight_kg: kg(g.mass_g) })), heaviest_parts: l.summary?.heavy ?? [] },
        subsystems: mySubs
          .filter((s) => s.robot_id === r.id)
          .map((s) => {
            const mine = parts.filter((p) => p.subsystem_id === s.id)
            const made = mine.filter((p) => p.machine !== 'Bought')
            return {
              number: s.number,
              name: s.name,
              lead: s.lead_id ? nameOf(s.lead_id) : null,
              assembled: s.assembled,
              made_parts: { total: made.length, in_design: made.filter((p) => !p.released_at).length, released: made.filter((p) => p.released_at).length, done: made.filter((p) => p.status === 'done').length },
              bought_parts: mine.length - made.length,
              onshape: onshape(linkOf('subsystem_id', s.id)) ?? 'not linked',
              parts: mine.map((p) => [p.part_no, p.name, p.machine, p.material || null, p.qty, p.status, p.os_mass_g == null ? null : Math.round(p.os_mass_g * 10) / 10]),
            }
          }),
      }
    }),
    parts_columns: ['part_no', 'name', 'machine', 'material', 'qty', 'status', 'cad_grams_each'],
  }
}

async function ask(who: Caller, b: Any) {
  if (!who.steamlab) throw new Say('Questions are for mentors and leads.')
  await underCap(who, 'ask')
  const q = String(b.question ?? '').trim()
  if (q.length < 3) throw new Say('Write a question first.')
  if (q.length > 400) throw new Say('Make the question shorter, under 400 letters.')
  const snap = await snapshot()
  const { out } = await claude<{ answer: string; numbers: { label: string; value: string }[] }>(who, 'ask', 'medium', ASK_SYSTEM, `Snapshot:\n${JSON.stringify(snap)}\n\nQuestion from ${first(who.name)}: ${q}`, ASK_SCHEMA)
  return { answer: out.answer, numbers: (out.numbers ?? []).slice(0, 8) }
}

// ---------- Reject reports: one per subsystem, for its lead ----------

const REJECT_SYSTEM = `The workshop lead of FRC team 1577 Steampunk sent some parts back to design before making them. You write a short report for the students who designed them, so they know what to fix. You get each part with the lead's note, its history, and what stock the workshop has.

Rules.
- "why": one or two plain sentences on why it was sent back, in your own words. The lead's exact note is shown next to yours, so don't quote it.
- "fix": one concrete thing to change, like "Add the missing 5 mm hole and release it again." If the note doesn't say enough to know, say what to ask the workshop lead.
- "stock": only when the reason is material or size. Say what the workshop has that would work, from the stock list, like "There's no 6 mm plate, but 4 plates of 6.35 mm are in stock." Otherwise an empty string.
- "headline": one sentence for a phone notification, like "3 Intake parts came back: two need a different plate, one is missing a hole."
- Plain English, short, no blame, no praise. Facts only from what you were given. Units with a space: "5 mm".
- Return every part you were given, by its part_no, in the same order.`

const REJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'parts'],
  properties: {
    headline: { type: 'string' },
    parts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['part_no', 'why', 'fix', 'stock'], properties: { part_no: { type: 'integer' }, why: { type: 'string' }, fix: { type: 'string' }, stock: { type: 'string' } } } },
  },
}

async function rejectReports(who: Caller) {
  if (!who.cron && !who.admin) throw new Say('Only the scheduled run or an admin starts this.')
  // Ten minutes after a reject, so a lead who sends back several parts gets one report.
  const before = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data } = await db.from('parts').select('id, subsystem_id, part_no, name, qty, machine, material, size, released_by, rejected_note, rejected_by, rejected_at, reject_reported_at').not('rejected_note', 'is', null).not('rejected_at', 'is', null).is('released_at', null).lt('rejected_at', before).limit(200)
  const due = ((data ?? []) as Any[]).filter((p) => !p.reject_reported_at || p.reject_reported_at < p.rejected_at)
  if (!due.length) return { ok: true, reports: 0 }

  const [{ data: plates }, { data: pieces }, { data: people }] = await Promise.all([
    db.from('plates').select('material, thickness, length, width, state').neq('state', 'gone'),
    db.from('pieces').select('kind, material, a, b, wall, inner_d, length, status').eq('status', 'available').limit(300),
    db.from('profiles').select('id, name'),
  ])
  const nameOf = (id: string | null) => first(((people ?? []) as Any[]).find((p) => p.id === id)?.name)
  // Plates as "material thickness: how many", the way someone would say it.
  const plateCount = new Map<string, number>()
  for (const p of (plates ?? []) as Any[]) plateCount.set(`${p.material} ${Number(p.thickness)} mm`, (plateCount.get(`${p.material} ${Number(p.thickness)} mm`) ?? 0) + 1)
  const stock = {
    plates: [...plateCount].map(([k, n]) => `${k}: ${n}`),
    bars_and_tubes: ((pieces ?? []) as Any[]).map((p) => [p.kind, p.material, p.a, p.b, p.wall, p.inner_d, p.length].filter((x) => x != null && x !== '').join(' ')),
    bars_columns: 'kind material side_a side_b wall inner_diameter length, in mm',
  }

  let made = 0
  const bySub = new Map<string, Any[]>()
  for (const p of due) bySub.set(p.subsystem_id, [...(bySub.get(p.subsystem_id) ?? []), p])
  for (const [subId, parts] of bySub) {
    const { data: sub } = await db.from('subsystems').select('id, number, name, lead_id').eq('id', subId).maybeSingle()
    if (!sub) continue
    const ids = parts.map((p) => p.id)
    const { data: reqs } = await db.from('part_requests').select('part_id, kind, note, by_name, status, answer, answered_by_name, created_at').in('part_id', ids).order('created_at')
    const label = `${sub.number} ${sub.name}`
    const linkTo = `/manufacturing/s/${sub.id}`
    const to = [...new Set([sub.lead_id, ...parts.map((p) => p.released_by)].filter((x): x is string => !!x))]
    const base = parts.map((p) => ({ part_id: p.id, part_no: p.part_no, name: p.name, note: p.rejected_note, by: nameOf(p.rejected_by), at: p.rejected_at }))
    let items: Any[] = base.map((x) => ({ ...x, why: '', fix: '', stock: '' }))
    let headline = `${parts.length} ${label} ${parts.length === 1 ? 'part was' : 'parts were'} sent back to design.`
    let model: string | null = null
    try {
      const input = {
        subsystem: label,
        parts: parts.map((p) => ({
          part_no: p.part_no,
          name: p.name,
          machine: p.machine,
          material: p.material || null,
          size_mm: p.size,
          quantity: p.qty,
          rejected_by: nameOf(p.rejected_by),
          lead_note: p.rejected_note,
          history: ((reqs ?? []) as Any[]).filter((r) => r.part_id === p.id).map((r) => ({ kind: r.kind, note: r.note, by: first(r.by_name), status: r.status, answer: r.answer, answered_by: r.answered_by_name ? first(r.answered_by_name) : null })),
        })),
        workshop_stock: stock,
      }
      const res = await claude<{ headline: string; parts: { part_no: number; why: string; fix: string; stock: string }[] }>(who, 'reject_report', 'medium', REJECT_SYSTEM, JSON.stringify(input), REJECT_SCHEMA)
      model = res.model
      headline = res.out.headline || headline
      items = base.map((x) => ({ ...x, ...(res.out.parts.find((r) => r.part_no === x.part_no) ?? { why: '', fix: '', stock: '' }) }))
    } catch (e) {
      // Claude didn't answer: the people still hear about it, with the lead's own words.
      console.error('reject report without Claude', (e as Error).message)
    }
    const { error } = await db.from('reject_reports').insert({ subsystem_id: sub.id, headline, items, model })
    if (error) {
      console.error('reject report not saved', error.message)
      continue
    }
    await db.from('parts').update({ reject_reported_at: new Date().toISOString() }).in('id', ids)
    if (to.length) await db.from('notifications').insert(to.map((user_id) => ({ user_id, kind: 'part_rejected', text: headline, link: linkTo })))
    made += 1
  }
  return { ok: true, reports: made }
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
    if (body.feature === 'part_review') return json(await partReview(who, body))
    if (body.feature === 'ask') return json(await ask(who, body))
    if (body.feature === 'drawing_notes') return json(await drawingNotes(who))
    if (body.feature === 'reject_reports') return json(await rejectReports(who))
    return json({ error: "Steamhub doesn't know that Claude feature." })
  } catch (e) {
    if (e instanceof Say) return json({ error: e.message })
    console.error('claude failed', body?.feature, (e as Error).message)
    return json({ error: 'Something went wrong on the way to Claude. Try again.' }, 500)
  }
})
