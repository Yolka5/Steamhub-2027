import { useEffect, useMemo, useState } from 'react'
import { Working } from '../components/Working'
import { Select } from '../components/Select'
import { weightWorking } from '../lib/workings'
import { Link } from 'react-router-dom'
import { Copy } from '../components/ui'
import { area, sizeLabel, type Piece } from '../lib/stock'
import { useStore } from '../lib/store'
import { useRobots } from '../lib/useMfg'
import { ago, type Part, type Subsystem } from '../lib/mfg'
import { kgText, massText, weightLimitKg, type OsLink } from '../lib/onshape'
import { supabase } from '../lib/supabase'

// Weight per mechanism. The real number is the CAD weight Onshape gave on the last sync: a
// subsystem's own link when it has one, otherwise its row in the full robot assembly. Below it,
// the raw stock reserved per mechanism, which is what gets cut, not what ends up on the robot.

// ---------- Onshape ----------

interface CadRow {
  key: string
  sub: Subsystem | null
  name: string
  grams: number
  target: number | null
  /** 'sub': the subsystem's own link. 'robot': its row in the robot assembly. */
  from: 'sub' | 'robot'
  syncedAt: string | null
  heavy: { id: string; part_no: number; name: string; grams: number; qty: number }[]
}

type HeavyPart = Pick<Part, 'id' | 'subsystem_id' | 'part_no' | 'name' | 'qty' | 'machine' | 'os_mass_g'>

function useCad(robotId: string | null, subs: Subsystem[]) {
  const [links, setLinks] = useState<OsLink[]>([])
  const [parts, setParts] = useState<HeavyPart[]>([])
  const [loading, setLoading] = useState(true)
  const subIds = subs.map((s) => s.id).join(',')
  useEffect(() => {
    if (!robotId) return
    let live = true
    setLoading(true)
    const ids = subIds ? subIds.split(',') : []
    Promise.all([
      supabase.from('onshape_links').select('*').or(`robot_id.eq.${robotId}${ids.length ? `,subsystem_id.in.(${ids.join(',')})` : ''}`),
      ids.length
        ? supabase.from('parts').select('id, subsystem_id, part_no, name, qty, machine, os_mass_g').in('subsystem_id', ids).not('os_mass_g', 'is', null)
        : Promise.resolve({ data: [] }),
    ]).then(([l, p]) => {
      if (!live) return
      // Before the Onshape migration ran these fail; the page then just shows stock.
      setLinks(((l as { data: OsLink[] | null }).data ?? []) as OsLink[])
      setParts(((p as { data: HeavyPart[] | null }).data ?? []) as HeavyPart[])
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [robotId, subIds])
  return { links, parts, loading }
}

function cadRows(robotId: string, subs: Subsystem[], links: OsLink[], parts: HeavyPart[]): CadRow[] {
  const robotLink = links.find((l) => l.robot_id === robotId && l.last_sync_at)
  const rows: CadRow[] = []
  const heavyOf = (subId: string) =>
    parts
      .filter((p) => p.subsystem_id === subId && p.machine !== '3D print' && p.os_mass_g != null)
      .map((p) => ({ id: p.id, part_no: p.part_no, name: p.name, qty: p.qty, grams: p.os_mass_g! * p.qty }))
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 5)
  for (const s of subs) {
    const own = links.find((l) => l.subsystem_id === s.id && l.last_sync_at && l.mass_g != null)
    const group = robotLink?.summary.groups?.find((g) => g.subsystem_id === s.id)
    if (own) rows.push({ key: s.id, sub: s, name: `${s.number} ${s.name}`, grams: Number(own.mass_g), target: own.target_g, from: 'sub', syncedAt: own.last_sync_at, heavy: heavyOf(s.id) })
    else if (group) rows.push({ key: s.id, sub: s, name: `${s.number} ${s.name}`, grams: group.mass_g, target: null, from: 'robot', syncedAt: robotLink!.last_sync_at, heavy: heavyOf(s.id) })
  }
  // What the robot assembly has that no subsystem claims: bumpers, wiring, a frame nobody linked.
  for (const [i, g] of (robotLink?.summary.groups ?? []).entries()) {
    if (g.subsystem_id && subs.some((s) => s.id === g.subsystem_id)) continue
    rows.push({ key: `g${i}`, sub: null, name: g.name, grams: g.mass_g, target: null, from: 'robot', syncedAt: robotLink!.last_sync_at, heavy: [] })
  }
  return rows.sort((a, b) => b.grams - a.grams)
}

function CadWeights() {
  const { robots, subs: allSubs, loading: loadingR } = useRobots()
  const active = useMemo(() => robots.filter((r) => !r.archived), [robots])
  const [picked, setPicked] = useState<string | null>(null)
  const robot = active.find((r) => r.id === picked) ?? active.find((r) => !r.offseason) ?? active[0] ?? null
  const subs = useMemo(() => allSubs.filter((s) => s.robot_id === robot?.id), [allSubs, robot?.id])
  const { links, parts, loading } = useCad(robot?.id ?? null, subs)
  const [limit, setLimit] = useState(52.2)
  useEffect(() => {
    weightLimitKg().then(setLimit)
  }, [])

  if (loadingR || (robot && loading)) return <p className="soft">Loading</p>
  if (!robot) return null

  const rows = cadRows(robot.id, subs, links, parts)
  const robotLink = links.find((l) => l.robot_id === robot.id && l.last_sync_at && l.mass_g != null)
  const total = robotLink ? Number(robotLink.mass_g) : rows.reduce((s, r) => s + r.grams, 0)
  const max = Math.max(1, ...rows.map((r) => r.grams))
  const over = total / 1000 > limit
  const unsynced = subs.filter((s) => !rows.some((r) => r.sub?.id === s.id))

  return (
    <>
      {active.length > 1 && (
        <Select label="Robot" value={robot.id} onChange={setPicked} options={active.map((r) => ({ value: r.id, label: r.name }))} />
      )}
      {rows.length === 0 ? (
        <p className="soft">
          Nothing on {robot.name} has been synced from Onshape yet. Link a subsystem or the full robot assembly from its page in{' '}
          <Link to="/manufacturing">Manufacturing</Link> and sync it, and its CAD weight shows up here.
        </p>
      ) : (
        <>
          <p className="soft">
            CAD weight from Onshape, <Copy value={kgText(total)} /> kg{robotLink ? ' for the whole robot' : ` in ${rows.length} synced ${rows.length === 1 ? 'subsystem' : 'subsystems'}, not the whole robot`}, of the{' '}
            {limit.toFixed(1)} kg limit
            {over ? (
              <>
                {' '}
                · <span className="tag tag--bad">{(total / 1000 - limit).toFixed(2)} kg over</span>
              </>
            ) : (
              ` · ${(limit - total / 1000).toFixed(2)} kg to spare`
            )}
            . As of the last sync; printed parts and parts with no material aren't counted.
          </p>
          {rows.map((r) => {
            const bad = r.target != null && r.grams > r.target
            return (
              <section key={r.key} className="mw">
                <div className="mw__head">
                  <h2 className="section__title">{r.sub ? <Link to={`/manufacturing/s/${r.sub.id}`}>{r.name}</Link> : r.name}</h2>
                  <span className="mw__kg num">
                    <Copy value={kgText(r.grams)} /> kg
                  </span>
                </div>
                <span className="os-bar" data-over={bad || undefined} aria-hidden="true">
                  <span style={{ width: `${r.target ? Math.min(100, (r.grams / r.target) * 100) : (r.grams / max) * 100}%` }} />
                </span>
                <p className="soft small num">
                  {r.target != null && (
                    <>
                      {bad ? <span className="tag tag--bad">{kgText(r.grams - r.target)} kg over</span> : `${kgText(r.target - r.grams)} kg under`} the {kgText(r.target)} kg target ·{' '}
                    </>
                  )}
                  {r.sub ? (r.from === 'sub' ? 'Its own Onshape link' : 'From the robot assembly') : 'In the robot assembly, no subsystem'}
                  {r.syncedAt ? ` · synced ${ago(r.syncedAt)}` : ''}
                </p>
                {r.heavy.length > 0 && (
                  <details className="more">
                    <summary>Heaviest parts</summary>
                    <ul className="rows">
                      {r.heavy.map((h) => (
                        <li key={h.id}>
                          <Link to={`/manufacturing/p/${h.id}`} className="row">
                            <span>
                              <span className="num strong">{h.part_no}</span> {h.name}
                              {h.qty > 1 && <span className="soft"> ×{h.qty}</span>}
                            </span>
                            <span className="row__end num soft">{massText(h.grams)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )
          })}
        </>
      )}
      {rows.length > 0 && unsynced.length > 0 && (
        <p className="soft small">
          Not synced yet: {unsynced.map((s) => `${s.number} ${s.name}`).join(', ')}.
        </p>
      )}
    </>
  )
}

// ---------- Stock ----------

// Uses the planned length when there is one, otherwise the whole piece, so the number is an upper
// bound until people add planned lengths.

interface Line {
  piece: Piece
  length: number
  planned: boolean
  grams: number | null
}

interface Group {
  name: string
  lines: Line[]
  grams: number
  unknown: number
  unplanned: number
}

/** Same mechanism typed slightly differently ("Arm", "arm ") lands in one group. */
const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function groupByMechanism(pieces: Piece[], densities: Map<string, number>): Group[] {
  const groups = new Map<string, { names: Map<string, number>; lines: Line[] }>()
  for (const p of pieces) {
    if (p.status === 'available' || !p.reserved_for?.trim()) continue
    const k = keyOf(p.reserved_for)
    const g = groups.get(k) ?? { names: new Map<string, number>(), lines: [] as Line[] }
    const shown = p.reserved_for.trim()
    g.names.set(shown, (g.names.get(shown) ?? 0) + 1)
    const planned = p.planned_length != null && p.planned_length > 0 && p.planned_length <= p.length
    const length = planned ? p.planned_length! : p.length
    const ar = area(p)
    const d = p.material ? densities.get(p.material) : undefined
    g.lines.push({ piece: p, length, planned, grams: ar != null && d ? (ar * d * length) / 1000 : null })
    groups.set(k, g)
  }
  return [...groups.values()]
    .map((g) => {
      // Show the spelling most people used.
      const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const lines = g.lines.sort((a, b) => (b.grams ?? 0) - (a.grams ?? 0))
      return {
        name,
        lines,
        grams: lines.reduce((s, l) => s + (l.grams ?? 0), 0),
        unknown: lines.filter((l) => l.grams == null).length,
        unplanned: lines.filter((l) => !l.planned).length,
      }
    })
    .sort((a, b) => b.grams - a.grams)
}

const kg = (g: number) => (g / 1000).toFixed(2)

function StockWeights({ pieces, densities }: { pieces: Piece[]; densities: Map<string, number> }) {
  const groups = useMemo(() => groupByMechanism(pieces, densities), [pieces, densities])
  const total = groups.reduce((s, g) => s + g.grams, 0)
  const max = Math.max(1, ...groups.map((g) => g.grams))

  if (groups.length === 0) return <p className="soft">Nothing is reserved for a mechanism yet. Reserve a piece from Stock and name the mechanism, and it shows up here.</p>
  return (
    <>
      <p className="soft">
        {groups.length} {groups.length === 1 ? 'mechanism has' : 'mechanisms have'} about <Copy value={kg(total)} /> kg of raw material reserved. That's what gets cut, not
        what ends up on the robot. Pieces without a planned length count at full length.
      </p>
      {groups[0]?.lines[0] && (
        <Working
          id="mech-weight"
          title="How the stock weights are worked out"
          lines={[
            'Each piece weighs cross-section × density × length, using the planned cut length when there is one. A mechanism is the sum of its pieces. Worked for the heaviest piece:',
            ...weightWorking(groups[0].lines[0].piece, densities, groups[0].lines[0].length),
          ]}
        />
      )}
      {groups.map((g) => (
        <section key={g.name} className="mw">
          <div className="mw__head">
            <h3 className="section__title">{g.name}</h3>
            <span className="mw__kg num">
              <Copy value={kg(g.grams)} /> kg
            </span>
          </div>
          <div className="mw__bar" aria-hidden="true">
            <span style={{ width: `${(g.grams / max) * 100}%` }} />
          </div>
          {(g.unplanned > 0 || g.unknown > 0) && (
            <p className="soft small">
              {[g.unplanned > 0 && `${g.unplanned} at full length (no planned cut)`, g.unknown > 0 && `${g.unknown} with unknown material, not counted`].filter(Boolean).join(', ')}
            </p>
          )}
          <ul className="rows">
            {g.lines.map((l) => (
              <li key={l.piece.id}>
                <Link to={`/stock/${l.piece.id}`} className="row">
                  <span className="num strong">{l.piece.id}</span>
                  <span className="num soft">
                    {sizeLabel(l.piece)} · {l.length} mm{l.planned ? '' : ' (full)'}
                    {l.piece.status === 'used' ? ' · used' : ''}
                  </span>
                  <span className="row__end num soft">{l.grams == null ? '?' : `${Math.round(l.grams)} g`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

export default function Mechanisms() {
  const { pieces, densities, loading } = useStore()
  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Mechanisms</h1>
        <Link to="/stock" className="q-btn">
          Stock
        </Link>
      </div>
      <CadWeights />
      <h2 className="section__title" style={{ marginTop: '2.5rem' }}>
        Raw stock reserved
      </h2>
      {loading ? <p className="soft">Loading</p> : <StockWeights pieces={pieces} densities={densities} />}
    </div>
  )
}
