import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { TaskCard, TaskMenu } from '../components/TaskCard'
import { CncRoomNow } from '../components/WorkshopNow'
import { LoadError, useToast } from '../components/ui'
import { canDraw, saveDxfAs } from '../lib/drawing'
import { doneRecently, fmtMm, plateThickness, type Part } from '../lib/mfg'
import { platesFor, usePlates, type Plate } from '../lib/plates'
import { subLabel, useTaskActions, useTaskRules, useTasks } from '../lib/useTasks'

// Home on the CNC room's PC (People: Shared PC, CNC room). Everything the CNC team needs on one
// screen: what's on the machine, what's ready to cut grouped by the plate it comes from (so one
// sheet's parts go to the machine together, as one DXF zip), whether that plate is in stock, and
// what was cut today. Start, Done and the menu are the board's, so the rules are the same.

/** Over this, a CNC part is cut from a block, not a plate (as partName says). */
const BLOCK_MM = 12

interface Group {
  key: string
  title: string
  thickness: number | null
  parts: Part[]
  urgent: number
}

/** "Aluminum 5.5" and "Aluminum block" both read as "Aluminum". */
const baseMaterial = (m: string | null) => (m ?? '').replace(/\bblock\b/gi, '').replace(/\d+(\.\d+)?\s*(mm)?/g, '').trim() || 'Plate'

function groupOf(p: Part): Omit<Group, 'parts' | 'urgent'> {
  const t = plateThickness(p.size ?? [])
  const mat = baseMaterial(p.material)
  if (!Number.isFinite(t) || t > BLOCK_MM) return { key: `block|${mat}`, title: `${mat} blocks`, thickness: null }
  return { key: `${mat}|${t}`, title: `${mat} ${fmtMm(t)} mm`, thickness: t }
}

export default function CncHome() {
  const { tasks, robots, live, loading, error, reload, put } = useTasks()
  const rules = useTaskRules()
  const actions = useTaskActions(put, tasks)
  const { plates } = usePlates()
  const toast = useToast()
  const [menu, setMenu] = useState<Part | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const cnc = useMemo(() => tasks.filter((p) => p.machine === 'CNC'), [tasks])
  const running = cnc.filter((p) => p.status === 'doing')
  const doneToday = cnc
    .filter((p) => doneRecently(p, now) && new Date(p.done_at!).toDateString() === new Date(now).toDateString())
    .sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!))

  const groups = useMemo<Group[]>(() => {
    const by = new Map<string, Group>()
    for (const p of cnc) {
      if (p.status !== 'todo') continue
      const g = groupOf(p)
      const cur = by.get(g.key) ?? { ...g, parts: [], urgent: 0 }
      cur.parts.push(p)
      if (p.urgent) cur.urgent++
      by.set(g.key, cur)
    }
    for (const g of by.values()) g.parts.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.part_no - b.part_no)
    // Urgent sheets first, then thin to thick, blocks last.
    return [...by.values()].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.thickness ?? 1e9) - (b.thickness ?? 1e9) || a.title.localeCompare(b.title))
  }, [cnc])
  const toCut = groups.reduce((n, g) => n + g.parts.length, 0)

  const multi = new Set([...live.values()].map((s) => s.robot_id)).size > 1
  const subText = (p: Part) => {
    const s = live.get(p.subsystem_id)
    return subLabel(s, robots.find((r) => r.id === s?.robot_id), multi)
  }

  const inStock = (t: number) => plates.filter((pl) => pl.state !== 'gone' && Math.abs(pl.thickness - t) <= 0.2)
  const fits = (p: Part, list: Plate[]) => platesFor(list, p.size.map(Number)).length > 0

  const zip = async (key: string, title: string, parts: Part[]) => {
    const drawable = parts.filter(canDraw)
    if (!drawable.length) return toast('No geometry saved for these parts. Drop the STEP again on the subsystem page.')
    if (zipping) return
    setZipping(key)
    try {
      await saveDxfAs(drawable, title)
    } catch (e) {
      toast(`Couldn't make the DXF: ${e instanceof Error ? e.message : e}`)
    }
    setZipping(null)
  }

  const dxfButton = (p: Part) =>
    canDraw(p) ? (
      <button type="button" className="icon-btn cnc__dxf" aria-label={`DXF for ${p.part_no}`} title="DXF" onClick={() => zip(p.id, String(p.part_no), [p])}>
        <Icon name="download" />
      </button>
    ) : null

  const summary = [`${toCut} to cut`, running.length ? `${running.length} on the machine` : '', doneToday.length ? `${doneToday.length} done today` : ''].filter(Boolean).join(' · ')
  const available = plates.filter((pl) => pl.state !== 'gone').length
  const tiles: { to: string; label: string; hint: string; icon: IconName }[] = [
    { to: '/stock/plates', label: 'Plates', hint: `${available} in stock`, icon: 'stock' },
    { to: '/stock/end-mills', label: 'End mills', hint: 'By flutes and size', icon: 'wrench' },
    { to: '/manufacturing?m=CNC', label: 'All CNC parts', hint: 'With filters and done ones', icon: 'gear' },
    { to: '/stock', label: 'Find stock', hint: 'Bar, tube and the rest', icon: 'search' },
  ]

  return (
    <div className="page cnc">
      <div className="page__head">
        <h1 className="page__title">CNC</h1>
      </div>
      <p className="soft num cnc__summary">{loading ? 'Loading' : summary}</p>

      <div className="cnc__grid">
        <div className="cnc__main">
          {error && !tasks.length ? (
            <LoadError onRetry={reload} />
          ) : loading ? null : (
            <>
              {running.length > 0 && (
                <section className="cnc__section">
                  <h2 className="section__title">On the machine</h2>
                  <ul className="tlist__list">
                    {running.map((p) => (
                      <li key={p.id}>
                        <TaskCard part={p} sub={subText(p)} actions={actions} rules={rules} onMenu={setMenu} extra={dxfButton(p)} maker={p.maker_name} big />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {groups.length === 0 ? (
                <div className="mfg-empty">
                  <p className="empty">Nothing to cut right now.</p>
                  <p className="soft">CNC parts show up here once someone releases them from their subsystem page.</p>
                  <Link to="/manufacturing?m=CNC" className="q-btn">
                    All CNC parts
                  </Link>
                </div>
              ) : (
                groups.map((g) => {
                  const stock = g.thickness == null ? null : inStock(g.thickness)
                  return (
                    <section key={g.key} className="cnc__section">
                      <div className="mfg-group__head">
                        <h2 className="section__title num">{g.title}</h2>
                        <span className="soft small num">
                          {g.parts.length} {g.parts.length === 1 ? 'part' : 'parts'}
                          {stock && stock.length > 0 && (
                            <>
                              {' · '}
                              <Link to="/stock/plates" className="cnc__stock">
                                {stock.length} {stock.length === 1 ? 'plate' : 'plates'} in stock
                              </Link>
                            </>
                          )}
                        </span>
                        {stock && stock.length === 0 && <span className="tag tag--warn">No {fmtMm(g.thickness!)} mm plate in stock</span>}
                        <button type="button" className="q-btn q-btn--small mfg-group__print" onClick={() => zip(g.key, g.title, g.parts)}>
                          <Icon name="download" size={18} /> {zipping === g.key ? 'Writing DXFs' : `DXF${g.parts.length > 1 ? ` (${g.parts.length})` : ''}`}
                        </button>
                      </div>
                      <ul className="tlist__list">
                        {g.parts.map((p) => (
                          <li key={p.id}>
                            <TaskCard
                              part={p}
                              sub={subText(p)}
                              actions={actions}
                              rules={rules}
                              onMenu={setMenu}
                              extra={dxfButton(p)}
                              // The sheet's plates are there, but none is big enough for this one.
                              tag={stock && stock.length > 0 && !fits(p, stock) ? <span className="tag tag--warn">No plate big enough</span> : null}
                              big
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })
              )}
            </>
          )}
        </div>

        <aside className="cnc__side">
          <CncRoomNow parts={tasks} />
          <div className="quick cnc__tiles">
            {tiles.map((t) => (
              <Link key={t.to} to={t.to} className="quick__item">
                <Icon name={t.icon} size={22} />
                <span className="quick__label">{t.label}</span>
                <span className="soft small num">{t.hint}</span>
              </Link>
            ))}
          </div>

          {doneToday.length > 0 && (
            <section className="cnc__section">
              <h2 className="section__title">Done today</h2>
              <ul className="tlist__list">
                {doneToday.map((p) => (
                  <li key={p.id}>
                    <TaskCard part={p} sub={p.maker_name ?? ''} actions={actions} rules={rules} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <TaskMenu part={menu} actions={actions} rules={rules} onClose={() => setMenu(null)} />
      {actions.sheets}
    </div>
  )
}
