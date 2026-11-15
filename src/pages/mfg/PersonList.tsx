import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TaskCard, TaskMenu } from '../../components/TaskCard'
import { LoadError } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import type { Part } from '../../lib/mfg'
import { listOf, subLabel, useTaskActions, useTaskRules, useTasks } from '../../lib/useTasks'

// One person's list, big: /manufacturing/mine on your own account, /manufacturing/board/:id when
// someone taps their name on the shared PC. In the lead's order, done ones for 12 hours below.

const IDLE_MS = 3 * 60_000

export default function PersonList({ mine = false }: { mine?: boolean }) {
  const { id: param } = useParams()
  const { userId, room } = useAuth()
  const personId = mine ? userId : (param ?? null)
  const navigate = useNavigate()
  const { tasks, robots, live, people, loading, error, reload, put } = useTasks()
  const rules = useTaskRules()
  const actions = useTaskActions(put, tasks)
  const [menu, setMenu] = useState<Part | null>(null)
  // Ticking several to give back at once.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  // On the shared PC, back to the board after 3 minutes untouched, so the next person doesn't
  // land in someone else's list.
  useEffect(() => {
    if (!rules.shared || mine) return
    // The CNC room's PC goes back to its Home.
    const back = room === 'cnc' ? '/' : '/manufacturing/board'
    let t = window.setTimeout(() => navigate(back, { replace: true }), IDLE_MS)
    const poke = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => navigate(back, { replace: true }), IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    for (const e of events) window.addEventListener(e, poke, { passive: true })
    return () => {
      window.clearTimeout(t)
      for (const e of events) window.removeEventListener(e, poke)
    }
  }, [rules.shared, mine, navigate, room])

  const person = people.find((p) => p.id === personId)
  const name = mine ? 'Your parts' : (person?.name ?? 'Parts')
  const { open, done } = listOf(tasks, personId)
  const recent = done.filter((p) => now - Date.parse(p.done_at!) < 12 * 3600_000)
  const multi = new Set([...live.values()].map((s) => s.robot_id)).size > 1
  const givable = open.filter(rules.canGiveBack)
  const pickedParts = picked ? givable.filter((p) => picked.has(p.id)) : []
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const giveBackPicked = async () => {
    if (busy || !pickedParts.length) return
    setBusy(true)
    if (await actions.handBackMany(pickedParts)) setPicked(null)
    setBusy(false)
  }
  const subText = (p: Part) => {
    const s = live.get(p.subsystem_id)
    return subLabel(s, robots.find((r) => r.id === s?.robot_id), multi)
  }

  return (
    <div className="page page--narrow tlist">
      <div className="page__head">
        <h1 className="page__title">{name}</h1>
        <Link to={mine ? '/manufacturing' : '/manufacturing/board'} className="q-btn">
          {mine ? 'All parts' : 'Board'}
        </Link>
      </div>

      {error && !tasks.length ? (
        <LoadError onRetry={reload} />
      ) : loading ? (
        <p className="soft">Loading</p>
      ) : (
        <>
          {open.length === 0 ? (
            <div className="mfg-empty">
              <p className="empty">{mine ? 'Nothing for you right now.' : 'Nothing open.'}</p>
              <p className="soft">The workshop lead hands out parts on the board. You can also start an unassigned part yourself.</p>
              <Link to="/manufacturing/board" className="q-btn">
                Board
              </Link>
            </div>
          ) : (
            <>
              <p className="soft small num">
                {picked ? 'Tick the parts to give back. They go to the workshop lead to hand to someone else.' : `${open.length} open · top one first`}
              </p>
              <ul className="tlist__list">
                {open.map((p) => (
                  <li key={p.id}>
                    <TaskCard
                      part={p}
                      sub={subText(p)}
                      actions={actions}
                      rules={rules}
                      onMenu={setMenu}
                      select={picked && rules.canGiveBack(p) ? { on: picked.has(p.id), toggle: () => toggle(p.id) } : undefined}
                      big
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {recent.length > 0 && (
            <section className="section">
              <h2 className="section__title">Done in the last 12 hours</h2>
              <ul className="tlist__list">
                {recent.map((p) => (
                  <li key={p.id}>
                    <TaskCard part={p} sub={subText(p)} actions={actions} rules={rules} big />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {picked && (
        <div className="tbar" role="region" aria-label="Give back">
          <span className="num tbar__count">
            {pickedParts.length} {pickedParts.length === 1 ? 'part' : 'parts'}
          </span>
          <button type="button" className="q-btn q-btn--main" onClick={giveBackPicked} disabled={busy}>
            {busy ? 'Giving back' : pickedParts.length ? `Give back ${pickedParts.length}` : 'Tick parts first'}
          </button>
          <button
            type="button"
            className="q-btn"
            onClick={() => setPicked(pickedParts.length === givable.length ? new Set() : new Set(givable.map((p) => p.id)))}
          >
            {pickedParts.length === givable.length ? 'None' : 'All'}
          </button>
          <button type="button" className="q-btn" onClick={() => setPicked(null)}>
            Cancel
          </button>
        </div>
      )}
      <TaskMenu
        part={menu}
        actions={actions}
        rules={rules}
        onClose={() => setMenu(null)}
        onGiveBackSeveral={givable.length > 1 ? (p) => setPicked(new Set([p.id])) : undefined}
      />
      {actions.sheets}
    </div>
  )
}
