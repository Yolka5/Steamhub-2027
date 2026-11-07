// Syncs plate stock and end mills from the team's Google Sheet (MANUFACTURING.md, phase 3).
// The sheet must be shared as "anyone with the link can view"; it's read as CSV, no Google key.
//  - First tab: plates. Columns thickness, length, width, qty (blank = 1). The header row is skipped.
//  - The end mills tab (name in settings): blocks headed "1 flute / diameter" style rows, then "3mm, count".
// Plates: one row per physical plate. Sync only adds or removes *available* plates that came from
// the sheet, so states people set (partly used, gone) and plates added in Steamhub stay as they are.
// End mills: the sheet is the source, counts are replaced.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Minimal CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const num = (s: string | undefined) => {
  const v = parseFloat(String(s ?? '').replace(',', '.').replace(/mm$/i, ''))
  return Number.isFinite(v) ? v : null
}

async function sheetCsv(id: string, tab?: string) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0${tab ? `&sheet=${encodeURIComponent(tab)}` : ''}`
  const res = await fetch(url, { redirect: 'follow' })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes('csv')) throw new Error('The sheet could not be read. Share it as "Anyone with the link can view".')
  return parseCsv(await res.text())
}

function flutesOf(label: string): number | null {
  const m = label.match(/(\d)\s*(flute|שן|שיניים)/i)
  if (m) return Number(m[1])
  if (/שן אחת|single|one/i.test(label)) return 1
  if (/שני|two|double/i.test(label)) return 2
  if (/שלוש|three/i.test(label)) return 3
  if (/ארבע|four/i.test(label)) return 4
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(token)
  const user = auth?.user
  if (!user) return json({ error: 'Sign in first.' }, 401)
  const { data: me } = await admin.from('profiles').select('name, banned').eq('id', user.id).maybeSingle()
  if (!me || me.banned) return json({ error: 'No access.' }, 403)

  const { data: setting } = await admin.from('settings').select('value').eq('key', 'plate_sheet').maybeSingle()
  const cfg = (setting?.value ?? {}) as { url?: string; endmill_tab?: string; low_m2?: number }
  const id = cfg.url?.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!id) return json({ error: 'No sheet link set. Paste it in the sync settings first.' }, 400)

  try {
    // ----- Plates -----
    const want = new Map<string, { t: number; l: number; w: number; n: number }>()
    for (const r of await sheetCsv(id)) {
      const t = num(r[0])
      const a = num(r[1])
      const b = num(r[2])
      if (t == null || a == null || b == null) continue // header and blank rows
      const n = Math.max(1, Math.round(num(r[3]) ?? 1))
      const l = Math.max(a, b)
      const w = Math.min(a, b)
      const key = `${t}|${l}|${w}`
      const cur = want.get(key) ?? { t, l, w, n: 0 }
      cur.n += n
      want.set(key, cur)
    }
    const { data: have, error: hErr } = await admin.from('plates').select('id, thickness, length, width, state').eq('source', 'sheet')
    if (hErr) throw new Error(hErr.message)
    const haveBy = new Map<string, { id: string; state: string }[]>()
    for (const p of have ?? []) {
      const key = `${Number(p.thickness)}|${Number(p.length)}|${Number(p.width)}`
      haveBy.set(key, [...(haveBy.get(key) ?? []), p])
    }
    const add: Record<string, unknown>[] = []
    const remove: string[] = []
    for (const key of new Set([...want.keys(), ...haveBy.keys()])) {
      const w = want.get(key)
      const list = haveBy.get(key) ?? []
      const need = w?.n ?? 0
      if (need > list.length) {
        for (let i = list.length; i < need; i++)
          add.push({ thickness: w!.t, length: w!.l, width: w!.w, material: 'Aluminum', source: 'sheet', updated_by: user.id, updated_by_name: me.name })
      } else if (need < list.length) {
        // Only plates nobody has marked go away.
        remove.push(...list.filter((p) => p.state === 'available').slice(0, list.length - need).map((p) => p.id))
      }
    }
    if (add.length) {
      const { error } = await admin.from('plates').insert(add)
      if (error) throw new Error(error.message)
    }
    if (remove.length) {
      const { error } = await admin.from('plates').delete().in('id', remove)
      if (error) throw new Error(error.message)
    }

    // ----- End mills -----
    let mills = 0
    if (cfg.endmill_tab) {
      const rows = await sheetCsv(id, cfg.endmill_tab)
      const found = new Map<string, { flutes: number; diameter: number; qty: number }>()
      let flutes: number | null = null
      for (const r of rows) {
        const cells = r.map((c) => c.trim())
        const label = cells.find((c) => c && num(c) == null && !/^\d+(\.\d+)?\s*mm$/i.test(c))
        const f = label ? flutesOf(label) : null
        if (f) {
          flutes = f
          continue
        }
        const dCell = cells.findIndex((c) => /^\d+(\.\d+)?\s*mm$/i.test(c))
        if (flutes && dCell >= 0) {
          const d = num(cells[dCell])!
          const qty = Math.max(0, Math.round(num(cells[dCell + 1]) ?? 0))
          found.set(`${flutes}|${d}`, { flutes, diameter: d, qty })
        }
      }
      if (found.size) {
        const { error } = await admin.from('end_mills').upsert([...found.values()], { onConflict: 'flutes,diameter' })
        if (error) throw new Error(error.message)
        mills = found.size
      }
    }

    await admin
      .from('settings')
      .update({ value: { ...cfg, synced_at: new Date().toISOString(), synced_by: me.name }, updated_at: new Date().toISOString() })
      .eq('key', 'plate_sheet')
    const plates = [...want.values()].reduce((s, w) => s + w.n, 0)
    return json({ plates, added: add.length, removed: remove.length, mills })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
