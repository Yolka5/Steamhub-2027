import { useAuth } from '../../lib/auth'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { isPickClick, pickClick } from '../../lib/pick'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MfgTabs } from '../../components/mfg'
import { Select } from '../../components/Select'
import { TaskCard, TaskMenu } from '../../components/TaskCard'
import { LoadError } from '../../components/ui'
import { MADE, doneRecently, isOpen, type Machine, type Part } from '../../lib/mfg'
import { listOf, subLabel, useTaskActions, useTaskRules, useTasks } from '../../lib/useTasks'
import { usePhone } from '../../lib/usePhone'
import { supabase } from '../../lib/supabase'

// The board: Unassigned first, then a column per person with parts, in the lead's order. The
// workshop PC shows this; the lead hands out parts here (WORKSHOP_TASKS.md).

interface Column {
  id: string | null
  name: string
  open: Part[]
  done: Part[]
}

interface Drag {
  part: Part
  x: number
  y: number
  /** Where it would land: a column (null is Unassigned) and an index among its open cards. */
  col?: string | null
  index?: number
}

export default function Board() {
  const [params, setParams] = useSearchParams()
  const machine = (params.get('m') as Machine | null) ?? null
  const subId = params.get('s')
  const phone = usePhone()
  const { tasks, robots, live, people, loading, error, reload, put } = useTasks()
  const rules = useTaskRules()
  const actions = useTaskActions(put, tasks)
  const [menu, setMenu] = useState<Part | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  // Done parts drop off 12 hours after Done, so the board re-checks the time now and then.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const shown = useMemo(() => tasks.filter((p) => (!machine || p.machine === machine) && (!subId || p.subsystem_id === subId)), [tasks, machine, subId])
  const multi = new Set([...live.values()].map((s) => s.robot_id)).size > 1
  const subText = (p: Part) => {
    const s = live.get(p.subsystem_id)
    return subLabel(s, robots.find((r) => r.id === s?.robot_id), multi)
  }

  const columns = useMemo<Column[]>(() => {
    const none = listOf(shown, null)
    const ids = [...new Set(shown.filter((p) => p.assignee_id && (isOpen(p) || doneRecently(p, now))).map((p) => p.assignee_id!))]
    const cols = ids
      .map((id) => ({ id, name: people.find((x) => x.id === id)?.name ?? 'Someone', ...listOf(shown, id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [{ id: null, name: 'Unassigned', open: none.open, done: [] }, ...cols]
  }, [shown, people, now])

  // Phones show one column at a time; keep the chosen one while it exists.
  const current = columns.find((c) => c.id === tab) ?? columns[0]

  // ----- Select mode (leads) -----
  const toggle = (id: string, shift = false, order: string[] = []) => {
    // Read the anchor now: React runs the update later, after it has moved on to this card.
    const from = anchor.current
    setPicked((s) => pickClick(s, id, shift, order, from))
    anchor.current = id
  }
  // Ctrl or Shift on a card picks it, and starts handing out if it hasn't started. Shift takes the
  // cards between the last one clicked and this one, in the same column.
  const onCardClick = (e: MouseEvent, p: Part, c: Column) => {
    if (!rules.canAssign || p.status === 'done' || (e.target as HTMLElement).closest('.task__more')) return
    const order = c.open.map((x) => x.id)
    if (isPickClick(e)) {
      e.preventDefault()
      e.stopPropagation()
      if (!selecting) {
        setSelecting(true)
        anchor.current = null
      }
      toggle(p.id, e.shiftKey, order)
    } else if (selecting) {
      e.preventDefault()
      e.stopPropagation()
      toggle(p.id, false, order)
    }
  }
  const pickedParts = tasks.filter((p) => picked.has(p.id))
  const stopSelecting = () => {
    setSelecting(false)
    setPicked(new Set())
  }

  // ----- Drag and drop (leads, by the grip) -----
  const [drag, setDrag] = useState<Drag | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const target = (x: number, y: number): Pick<Drag, 'col' | 'index'> => {
    const el = document.elementsFromPoint(x, y).find((e) => e instanceof HTMLElement && e.dataset.col !== undefined) as HTMLElement | undefined
    if (!el) return {}
    const col = el.dataset.col === '' ? null : el.dataset.col!
    const cards = [...el.querySelectorAll<HTMLElement>('[data-open-card]')].filter((c) => c.dataset.openCard !== drag?.part.id)
    let index = cards.length
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        index = i
        break
      }
    }
    return { col, index }
  }
  const grip = (p: Part) =>
    rules.canAssign && !selecting && p.status !== 'done' ? (
      <span
        className="task__grip"
        role="button"
        tabIndex={-1}
        aria-label={`Drag ${p.part_no}`}
        onPointerDown={(e) => {
          e.preventDefault()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // No live pointer.
          }
          setDrag({ part: p, x: e.clientX, y: e.clientY })
        }}
        onPointerMove={(e) => {
          if (!drag) return
          // Near the board's edges, scroll it sideways so far columns are reachable.
          const b = boardRef.current?.getBoundingClientRect()
          if (b && boardRef.current) {
            if (e.clientX > b.right - 48) boardRef.current.scrollLeft += 14
            else if (e.clientX < b.left + 48) boardRef.current.scrollLeft -= 14
          }
          setDrag({ ...drag, x: e.clientX, y: e.clientY, ...target(e.clientX, e.clientY) })
        }}
        onPointerUp={async () => {
          const d = drag
          setDrag(null)
          if (!d || d.col === undefined || d.index === undefined) return
          await actions.drop(d.part, d.col, d.index, people)
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <Icon name="grip" size={18} />
      </span>
    ) : undefined

  const card = (p: Part, c: Column) => (
    <li
      key={p.id}
      data-open-card={p.status !== 'done' ? p.id : undefined}
      className={drag?.part.id === p.id ? 'is-dragging' : undefined}
      onClickCapture={(e) => onCardClick(e, p, c)}
      // Shift-click would otherwise select the card's text.
      onMouseDown={(e) => e.shiftKey && rules.canAssign && e.preventDefault()}
    >
      <TaskCard
        part={p}
        sub={subText(p)}
        actions={actions}
        rules={rules}
        onMenu={setMenu}
        grip={grip(p)}
        maker={c.id === null && p.status === 'doing' ? p.maker_name : null}
        select={selecting && p.status !== 'done' ? { on: picked.has(p.id), toggle: () => toggle(p.id) } : undefined}
      />
    </li>
  )

  const column = (c: Column) => {
    const inProgress = c.open.some((p) => p.status === 'doing')
    const drop = drag && drag.col === c.id ? drag.index : undefined
    return (
      <section key={c.id ?? 'none'} className={`tcol${c.id === null ? ' tcol--none' : ''}${drag && drag.col === c.id ? ' is-over' : ''}`} data-col={c.id ?? ''}>
        <header className="tcol__head">
          {c.id ? (
            <Link to={`/manufacturing/board/${c.id}`} className="tcol__name">
              <span className="avatar avatar--soft">{c.name[0]?.toUpperCase()}</span>
              <span>{c.name}</span>
            </Link>
          ) : (
            <h2 className="tcol__name">{c.name}</h2>
          )}
          <span className="soft small num">
            {inProgress && <i className="tcol__busy" title="Something in progress" />}
            {c.open.length} open
          </span>
          {selecting && c.open.length > 0 && (
            <button
              type="button"
              className="q-btn q-btn--small tcol__all"
              onClick={() =>
                setPicked((s) => {
                  const n = new Set(s)
                  const all = c.open.every((p) => n.has(p.id))
                  for (const p of c.open) {
                    if (all) n.delete(p.id)
                    else n.add(p.id)
                  }
                  return n
                })
              }
            >
              {c.open.every((p) => picked.has(p.id)) ? 'None' : 'All'}
            </button>
          )}
        </header>
        <ul className="tcol__list">
          {c.open.map((p) => (
            <FragmentWithMark key={p.id} mark={drop !== undefined && p.id !== drag?.part.id && drop === c.open.filter((x) => x.id !== drag?.part.id).indexOf(p)}>
              {card(p, c)}
            </FragmentWithMark>
          ))}
          {drop !== undefined && drop >= c.open.filter((p) => p.id !== drag?.part.id).length && <li className="tcol__mark" aria-hidden="true" />}
          {c.open.length === 0 && <li className="soft small tcol__empty">{c.id === null ? 'Everything is handed out.' : 'Nothing open.'}</li>}
          {c.done.map((p) => card(p, c))}
        </ul>
      </section>
    )
  }

  const filters = (
    <div className="mfg-filters">
      <div className="picks picks--seg" role="radiogroup" aria-label="Machine">
        {[null, ...MADE].map((m) => (
          <button key={m ?? 'all'} type="button" role="radio" className="pick" aria-checked={machine === m} onClick={() => set('m', m)}>
            {m ?? 'All'}
          </button>
        ))}
      </div>
      <div className="mfg-filters__sub">
        <Select
          className="field--inline"
          label="Subsystem"
          value={subId ?? ''}
          onChange={(v) => set('s', v || null)}
          options={[
            { value: '', label: 'All subsystems' },
            ...[...live.values()].sort((a, b) => a.number - b.number).map((s) => ({ value: s.id, label: subLabel(s, robots.find((r) => r.id === s.robot_id), multi) })),
          ]}
        />
      </div>
      {rules.canAssign && !selecting && (
        <button type="button" className="q-btn" onClick={() => setSelecting(true)}>
          <Icon name="people" /> Hand out
        </button>
      )}
    </div>
  )

  return (
    <div className="page page--board">
      <div className="page__head">
        <h1 className="page__title">Manufacturing</h1>
        <div className="mfg-head-end">
          <MfgTabs />
        </div>
      </div>
      <YourPartsLink tasks={tasks} />

      {phone ? (
        <details className="finder__more mfg-filters-fold">
          <summary>
            Filters <span className="soft">{[machine ?? 'All machines', subId ? (live.get(subId)?.name ?? 'One subsystem') : 'All subsystems'].join(' · ')}</span>
          </summary>
          {filters}
        </details>
      ) : (
        filters
      )}
      {phone && rules.canAssign && !selecting && (
        <button type="button" className="q-btn tboard__hand" onClick={() => setSelecting(true)}>
          <Icon name="people" /> Hand out
        </button>
      )}
      {selecting && <p className="soft small">Tick parts, Shift-click for a run of them, or All on a column. Then pick who makes them.</p>}

      {error && !tasks.length ? (
        <LoadError onRetry={reload} />
      ) : loading ? (
        <p className="soft">Loading</p>
      ) : tasks.length === 0 ? (
        <div className="mfg-empty">
          <p className="empty">Nothing to make yet.</p>
          <p className="soft">Parts show up here once someone releases them from their subsystem page.</p>
        </div>
      ) : phone ? (
        <>
          <div className="picks tboard__tabs" role="tablist" aria-label="People">
            {columns.map((c) => (
              <button key={c.id ?? 'none'} type="button" role="tab" className="pick" aria-selected={current === c} onClick={() => setTab(c.id)}>
                {c.id ? c.name.split(' ')[0] : c.name} <span className="soft num">{c.open.length}</span>
              </button>
            ))}
          </div>
          {current && column(current)}
        </>
      ) : (
        <div className="tboard" ref={boardRef}>
          {columns.map(column)}
        </div>
      )}

      {selecting && (
        <div className="tbar" role="region" aria-label="Hand out">
          <span className="num tbar__count">
            {picked.size} {picked.size === 1 ? 'part' : 'parts'}
          </span>
          <button
            type="button"
            className="q-btn q-btn--main"
            onClick={async () => {
              if (!pickedParts.length) return
              if (await actions.assignTo(pickedParts)) stopSelecting()
            }}
          >
            {pickedParts.length ? 'Give to…' : 'Tick parts first'}
          </button>
          {pickedParts.some((p) => p.assignee_id) && (
            <button
              type="button"
              className="q-btn"
              onClick={async () => {
                if (await actions.unassign(pickedParts)) stopSelecting()
              }}
            >
              Unassign
            </button>
          )}
          <button type="button" className="q-btn" onClick={stopSelecting}>
            Cancel
          </button>
        </div>
      )}

      {drag && (
        <div className="task-ghost num" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.part.part_no}
        </div>
      )}
      <TaskMenu part={menu} actions={actions} rules={rules} onClose={() => setMenu(null)} />
      {actions.sheets}
    </div>
  )
}

/** A drop line above a card while a dragged card would land there. */
function FragmentWithMark({ mark, children }: { mark: boolean; children: ReactNode }) {
  return (
    <>
      {mark && <li className="tcol__mark" aria-hidden="true" />}
      {children}
    </>
  )
}

/** "3 parts for you": a way to your own list from the shared screens, on personal accounts. */
export function YourPartsLink({ tasks }: { tasks: Part[] }) {
  const { userId, shared } = useTaskRules()
  if (shared || !userId) return null
  const n = tasks.filter((p) => p.assignee_id === userId && isOpen(p)).length
  if (!n) return null
  return (
    <Link to="/manufacturing/mine" className="row tyours">
      <span className="row__main">
        <span className="strong">
          {n} {n === 1 ? 'part' : 'parts'} for you
        </span>
        <span className="soft small">Your list, in the order the workshop lead set</span>
      </span>
      <span className="tyours__arrow">
        <Icon name="back" />
      </span>
    </Link>
  )
}

/**
 * Where Make and the Manufacturing rail item open: CNC parts on the CNC room's PC, the board on the shared workshop PC, your own
 * list on a phone when you have parts, the workshop list otherwise.
 */
export function MfgStart() {
  const { userId, shared } = useTaskRules()
  const { room } = useAuth()
  const phone = usePhone()
  // The CNC room's PC: the workshop list, filtered to CNC.
  const [to, setTo] = useState<string | null>(room === 'cnc' ? '/manufacturing?m=CNC' : shared ? '/manufacturing/board' : phone ? null : '/manufacturing')
  useEffect(() => {
    if (to || !userId) return
    supabase
      .from('parts')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', userId)
      .in('status', ['todo', 'doing'])
      .then(({ count }) => setTo(count ? '/manufacturing/mine' : '/manufacturing'))
  }, [to, userId])
  if (!to) return <div className="page"><p className="soft">Loading</p></div>
  return <Navigate to={to} replace />
}
