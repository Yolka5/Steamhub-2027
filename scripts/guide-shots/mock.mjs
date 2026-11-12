// A small stand-in for Supabase's REST, RPC and storage APIs, answering from the demo seed.
// It covers what Steamhub's queries use: select with embeds, eq/neq/in/is/gt/lt/cs filters,
// or, order, limit, Range, single rows, and insert/update/upsert/delete.

const FK = { robots: 'robot_id', subsystems: 'subsystem_id', parts: 'part_id', prototypes: 'prototype_id', pieces: 'piece_id', plates: 'plate_id', cal_groups: 'group_id' }
const PK = { pieces: 'id', locations: 'name', materials: 'name', settings: 'key', calc_robots: 'id' }

/** `*, sub:subsystems(*, robot:robots(*))` → [{ all }, { alias, table, inner, cols }] */
function parseSelect(s) {
  const out = []
  let i = 0
  const read = () => {
    let tok = ''
    while (i < s.length && s[i] !== ',' && s[i] !== '(' && s[i] !== ')') tok += s[i++]
    return tok.trim()
  }
  const list = () => {
    const items = []
    while (i < s.length && s[i] !== ')') {
      const tok = read()
      if (s[i] === '(') {
        i++
        const cols = list()
        i++ // )
        let [alias, rest] = tok.includes(':') ? tok.split(':') : [null, tok]
        const [table, hint] = rest.split('!')
        items.push({ alias: alias ?? table, table, inner: hint === 'inner', cols })
      } else if (tok) {
        const [alias, col] = tok.includes(':') ? tok.split(':') : [tok, tok]
        items.push({ col: col.replace(/::.*/, ''), alias })
      }
      if (s[i] === ',') i++
    }
    return items
  }
  out.push(...list())
  return out
}

function project(db, table, row, cols) {
  const o = {}
  for (const c of cols) {
    if (c.col === '*') Object.assign(o, row)
    else if (c.col) o[c.alias] = row[c.col] ?? null
  }
  for (const c of cols) {
    if (!c.table) continue
    const fk = FK[c.table]
    const rows = db[c.table] ?? []
    if (fk && fk in row) {
      const hit = rows.find((r) => r[PK[c.table] ?? 'id'] === row[fk])
      o[c.alias] = hit ? project(db, c.table, hit, c.cols) : null
    } else {
      const back = FK[table]
      o[c.alias] = rows.filter((r) => r[back] === row[PK[table] ?? 'id']).map((r) => project(db, c.table, r, c.cols))
    }
  }
  return o
}

const lit = (v) => {
  if (v === 'null') return null
  if (v === 'true') return true
  if (v === 'false') return false
  const d = v.replace(/^"|"$/g, '')
  return d
}
const same = (a, b) => (a == null || b == null ? a == b : String(a) === String(b))
const num = (a, b) => (typeof a === 'number' ? [a, Number(b)] : [String(a), String(b)])

function test(row, col, expr) {
  let not = false
  if (expr.startsWith('not.')) {
    not = true
    expr = expr.slice(4)
  }
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot)
  const raw = expr.slice(dot + 1)
  const v = row[col]
  let r
  switch (op) {
    case 'eq': r = same(v, lit(raw)); break
    case 'neq': r = !same(v, lit(raw)); break
    case 'is': r = lit(raw) === null ? v == null : v === lit(raw); break
    case 'in': r = raw.replace(/^\(|\)$/g, '').split(',').map(lit).some((x) => same(v, x)); break
    case 'gt': { const [a, b] = num(v, raw); r = v != null && a > b; break }
    case 'gte': { const [a, b] = num(v, raw); r = v != null && a >= b; break }
    case 'lt': { const [a, b] = num(v, raw); r = v != null && a < b; break }
    case 'lte': { const [a, b] = num(v, raw); r = v != null && a <= b; break }
    case 'like':
    case 'ilike': {
      const re = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*')}$`, op === 'ilike' ? 'i' : '')
      r = re.test(String(v ?? ''))
      break
    }
    case 'cs': {
      const want = raw.startsWith('{') ? raw.slice(1, -1).split(',').map(lit) : JSON.parse(raw)
      r = Array.isArray(v) && (Array.isArray(want) ? want : [want]).every((x) => v.some((y) => same(y, x)))
      if (!Array.isArray(v) && v && typeof v === 'object') r = Object.entries(want).every(([k, x]) => same(v[k], x))
      break
    }
    default: r = true
  }
  return not ? !r : r
}

/** Splits `a.eq.1,and(b.is.null,c.eq.2)` at top-level commas. */
function splitTop(s) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function logic(row, kind, inner) {
  const parts = splitTop(inner.replace(/^\(|\)$/g, '')).map((p) => {
    const m = p.match(/^(and|or)(\(.*\))$/)
    if (m) return logic(row, m[1], m[2])
    const d = p.indexOf('.')
    return test(row, p.slice(0, d), p.slice(d + 1))
  })
  return kind === 'and' ? parts.every(Boolean) : parts.some(Boolean)
}
const orTest = (row, expr) => logic(row, 'or', expr)

export function createMock({ db, files, me }) {
  let seq = 1000
  const newId = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

  function rest(method, url, headers, body) {
    const u = new URL(url)
    const table = u.pathname.split('/rest/v1/')[1]
    if (table.startsWith('rpc/')) return rpc(table.slice(4), body)
    const rows = db[table] ?? (db[table] = [])
    const p = u.searchParams
    let match = rows
    for (const [k, v] of p) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
      if (k === 'or') match = match.filter((r) => orTest(r, v))
      else match = match.filter((r) => test(r, k, v))
    }
    const prefer = headers['prefer'] ?? ''
    const single = (headers['accept'] ?? '').includes('vnd.pgrst.object')
    const sel = parseSelect(p.get('select') ?? '*')
    const out = (list, status = 200) => {
      let data = list.map((r) => project(db, table, r, sel))
      // !inner embeds drop rows without a match.
      for (const c of sel) if (c.inner) data = data.filter((d) => d[c.alias] != null)
      if (single) {
        if (data.length !== 1) return data.length === 0 && method === 'GET' ? { status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' } } : { status, json: data[0] ?? null }
        return { status, json: data[0] }
      }
      return { status, json: data, headers: { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` } }
    }

    if (method === 'GET' || method === 'HEAD') {
      let list = [...match]
      const order = p.get('order')
      if (order) {
        const keys = order.split(',').map((o) => o.split('.'))
        list.sort((a, b) => {
          for (const [col, dir = 'asc', nulls] of keys) {
            const x = a[col], y = b[col]
            if (x == y) continue
            if (x == null) return nulls === 'nullsfirst' ? -1 : 1
            if (y == null) return nulls === 'nullsfirst' ? 1 : -1
            const c = x < y ? -1 : 1
            return dir === 'desc' ? -c : c
          }
          return 0
        })
      }
      const range = headers['range']
      if (range) {
        const [a, b] = range.split('-').map(Number)
        list = list.slice(a, b + 1)
      } else if (p.get('limit')) list = list.slice(Number(p.get('offset') ?? 0), Number(p.get('offset') ?? 0) + Number(p.get('limit')))
      // supabase .maybeSingle() asks for an object; zero rows is fine there.
      if (single && list.length === 0) return { status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' } }
      return out(list)
    }

    const ret = prefer.includes('return=representation')
    if (method === 'POST') {
      const items = Array.isArray(body) ? body : [body]
      const conflict = p.get('on_conflict')?.split(',') ?? (prefer.includes('merge-duplicates') ? [PK[table] ?? 'id'] : null)
      const done = []
      for (const it of items) {
        const hit = conflict && rows.find((r) => conflict.every((c) => same(r[c], it[c])))
        if (hit) {
          if (!prefer.includes('ignore-duplicates')) Object.assign(hit, it)
          done.push(hit)
        } else {
          const row = { ...it }
          if (!PK[table] && row.id == null) row.id = typeof rows[0]?.id === 'number' ? Math.max(0, ...rows.map((r) => r.id)) + 1 : newId()
          for (const k of ['created_at', 'updated_at', 'at']) if (k in (rows[0] ?? {}) && row[k] == null) row[k] = new Date().toISOString()
          rows.push(row)
          done.push(row)
        }
      }
      return ret ? out(done, 201) : { status: 201, json: null }
    }
    if (method === 'PATCH') {
      for (const r of match) Object.assign(r, body, 'updated_at' in r ? { updated_at: new Date().toISOString() } : {})
      return ret ? out(match) : { status: 204, json: null }
    }
    if (method === 'DELETE') {
      db[table] = rows.filter((r) => !match.includes(r))
      return ret ? out(match) : { status: 204, json: null }
    }
    return { status: 405, json: null }
  }

  function rpc(name, body) {
    if (name === 'next_piece_id') {
      const prefix = body?.prefix ?? body?.p_prefix ?? 'PR'
      const nums = db.pieces.filter((p) => p.id.startsWith(prefix)).map((p) => Number(p.id.split('-')[1]))
      return { status: 200, json: `${prefix}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}` }
    }
    if (name === 'admin_people') return { status: 200, json: db.profiles.map((p) => ({ ...p, email: p.email ?? `${p.name.split(' ')[0].toLowerCase()}@example.com`, last_seen: new Date().toISOString() })) }
    return { status: 200, json: null }
  }

  function storage(method, url) {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname.split('/storage/v1/')[1])
    if (path.startsWith('object/sign/')) {
      return { status: 200, json: { signedURL: `/object/${path.slice(12)}?token=demo` } }
    }
    if (path.startsWith('object/list/')) return { status: 200, json: [] }
    if (path.startsWith('object/') && method === 'GET') {
      const key = path.replace(/^object\/(authenticated\/|public\/)?/, '')
      const f = files.get(key)
      if (!f) return { status: 400, json: { statusCode: '404', error: 'not_found', message: 'Object not found' } }
      return { status: 200, raw: f, headers: { 'content-type': 'application/octet-stream' } }
    }
    if (path.startsWith('object/') && (method === 'POST' || method === 'PUT')) return { status: 200, json: { Key: path } }
    return { status: 200, json: [] }
  }

  return { rest, storage, me }
}
