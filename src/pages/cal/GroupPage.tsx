import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { CalTabs, ProgressBar, TaskRow, useCalSeason } from '../../components/cal'
import { TaskSheetHost } from '../../components/TaskSheet'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import {
  createPhase,
  currentPhase,
  dayLabel,
  deletePhase,
  firstName,
  isoDay,
  rangeLabel,
  pushPhases,
  movePhases,
  taskOrder,
  TEAM_WORD,
  todayIso,
  updateGroup,
  updatePhase,
  type Phase,
} from '../../lib/cal'
import { showSuggest, useLinked, useSuggestNotify, type Progress } from '../../lib/calLinked'
import { applyRow, putRows, useCal, type Cal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { QuickAdd } from './Board'
import { usePhone } from '../../lib/usePhone'

// One group: its lead, its phases in order (dates, progress, finish), its tasks and the history
// of its daily updates, filterable by phase.

export default function GroupPage() {
  const { id } = useParams()
  const season = useCalSeason()
  const cal = useCal(season)
  const linked = useLinked(season, cal)
  const { userId } = useAuth()
  useSuggestNotify(cal, linked, userId)
  const { people, nameOf } = usePeople()
  const toast = useToast()
  const [phaseFilter, setPhaseFilter] = useState<string>('all')
  const [showDone, setShowDone] = useState(false)
  const group = cal.groups.find((g) => g.id === id)
  // Phones show one part at a time (Tasks, Phases, Updates) instead of one long page.
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  const part = params.get('s') ?? 'tasks'
  const shows = (k: string) => !phone || part === k
  const go = (k: string) => {
    const next = new URLSearchParams(params)
    if (k === 'tasks') next.delete('s')
    else next.set('s', k)
    setParams(next, { replace: true })
  }

  if (cal.error && !cal.groups.length) return <LoadError onRetry={cal.reload} />
  if (cal.loading) return <p className="soft page">Loading</p>
  if (!group)
    return (
      <div className="page page--narrow">
        <h1 className="page__title">Not here</h1>
        <p className="soft">This group isn't in this season's Calendar.</p>
        <Link to="/calendar" className="q-btn">
          Calendar
        </Link>
      </div>
    )

  const phases = cal.phases.filter((p) => p.group_id === group.id).sort((a, b) => a.sort - b.sort)
  const cur = currentPhase(cal.phases, group.id)
  const tasks = cal.tasks.filter((t) => t.group_id === group.id && !t.parent_id).sort(taskOrder)
  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')
  const updates = cal.updates
    .filter((u) => u.group_id === group.id && (phaseFilter === 'all' || u.phase_id === (phaseFilter === 'none' ? null : phaseFilter)))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
  const sentToday = cal.updates.some((u) => u.group_id === group.id && u.day === todayIso())

  const setLead = async (lead: string) => {
    const before = group.lead_id
    putRows('cal_groups', [{ ...group, lead_id: lead || null }])
    const res = await updateGroup(group.id, { lead_id: lead || null })
    if (res.error) {
      putRows('cal_groups', [{ ...group, lead_id: before }])
      toast(res.error)
    }
  }

  return (
    <div className="page cal-page">
      <div className="page__head">
        <div>
          <Link to={`/calendar${group.team ? `?team=${group.team}` : ''}`} className="soft small cal-crumb">
            {TEAM_WORD[group.team]}
          </Link>
          <h1 className="page__title">{group.name}</h1>
        </div>
        <div className="cal-head-end">
          <Link to={`/calendar/update?g=${group.id}`} className={`q-btn${sentToday ? '' : ' q-btn--main'}`}>
            {sentToday ? 'Edit today’s update' : 'Write today’s update'}
          </Link>
          {!phone && <CalTabs />}
        </div>
      </div>

      <div className="cal-lead">
        <span className="soft">Lead</span>
        <Select
          className="field--inline"
          label="Lead"
          value={group.lead_id ?? ''}
          onChange={setLead}
          options={[{ value: '', label: 'No lead yet' }, ...people.filter((p) => !p.banned && !p.shared).map((p) => ({ value: p.id, label: p.name }))]}
        />
        {group.kind === 'subsystem' && <span className="soft small">Follows the subsystem's lead from V1 setup. Change it there or here.</span>}
      </div>

      {phone && (
        <div className="picks picks--seg cal-parts" role="tablist" aria-label="Show">
          {[
            ['tasks', `Tasks${open.length ? ` ${open.length}` : ''}`],
            ['phases', 'Phases'],
            ['updates', 'Updates'],
          ].map(([k, label]) => (
            <button key={k} type="button" role="tab" className="pick" aria-selected={part === k} onClick={() => go(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="cal-group-page">
        <div>
          {shows('phases') && <Phases group={group.id} phases={phases} cal={cal} linked={linked} current={cur?.id ?? null} />}

          {shows('tasks') && (
          <section className="section">
            <h2 className="section__title">Tasks</h2>
            {open.length > 0 && (
              <ul className="rows cal-rows">
                {open.map((t) => (
                  <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
                ))}
              </ul>
            )}
            <QuickAdd group={group} cal={cal} people={people} compact={false} />
            {done.length > 0 && (
              <>
                <button type="button" className="link-btn soft small" onClick={() => setShowDone((s) => !s)}>
                  {showDone ? 'Hide' : 'Show'} {done.length} done
                </button>
                {showDone && (
                  <ul className="rows cal-rows">
                    {done.map((t) => (
                      <TaskRow key={t.id} task={t} cal={cal} nameOf={nameOf} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
          )}
        </div>

        {shows('updates') && (
        <section className="section cal-updates">
          <h2 className="section__title">Updates</h2>
          {phases.length > 0 && (
            <div className="picks picks--seg cal-updates__filter" role="radiogroup" aria-label="Phase">
              <button type="button" role="radio" className="pick" aria-checked={phaseFilter === 'all'} onClick={() => setPhaseFilter('all')}>
                All
              </button>
              {phases.map((p) => (
                <button key={p.id} type="button" role="radio" className="pick" aria-checked={phaseFilter === p.id} onClick={() => setPhaseFilter(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {updates.length === 0 ? (
            <p className="soft">{phaseFilter === 'all' ? 'No updates yet. The lead writes one at the end of each day.' : 'No updates during this phase.'}</p>
          ) : (
            <ol className="cal-feed">
              {updates.map((u) => (
                <li key={u.id} className="cal-feed__item">
                  <div className="cal-feed__head">
                    <span className="strong">{dayLabel(u.day)}</span>
                    <span className="soft small">
                      {firstName(nameOf(u.author_id))}
                      {u.phase_id && phaseFilter === 'all' ? ` · ${cal.phases.find((p) => p.id === u.phase_id)?.name ?? ''}` : ''}
                    </span>
                  </div>
                  <p className="cal-feed__text" dir="auto">
                    {u.text}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
        )}
      </div>

      <TaskSheetHost cal={cal} />
    </div>
  )
}

function Phases({ group, phases, cal, linked, current }: { group: string; phases: Phase[]; cal: Cal; linked: Map<string, Progress>; current: string | null }) {
  const who = useWho()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, run] = useBusy()

  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return toast('Name the phase first, like Wiring')
      const res = await createPhase(group, n, cal.phases)
      if (res.error) return toast(res.error)
      putRows('cal_phases', [res.data!])
      setName('')
    })

  return (
    <section className="section cal-phases">
      <h2 className="section__title">Phases</h2>
      {phases.length === 0 && <p className="soft">No phases: this group is a plain task list. Add phases if its work comes in stages.</p>}
      <ol className="cal-phase-list">
        {phases.map((p, i) => (
          <PhaseCard key={p.id} p={p} i={i} phases={phases} cal={cal} prog={linked.get(p.id)} current={p.id === current} who={who} />
        ))}
      </ol>
      <form
        className="task__add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wiring" aria-label="New phase name" />
        <button type="submit" className="q-btn">
          {busy ? 'Adding' : 'Add phase'}
        </button>
      </form>
    </section>
  )
}

function PhaseCard({ p, i, phases, cal, prog, current, who }: { p: Phase; i: number; phases: Phase[]; cal: Cal; prog: Progress | undefined; current: boolean; who: ReturnType<typeof useWho> }) {
  const toast = useToast()
  const [name, setName] = useState(p.name)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const tasks = cal.tasks.filter((t) => t.phase_id === p.id && !t.parent_id).length
  const end = p.ends_on ?? p.starts_on
  const late = !p.done_at && !!end && end < todayIso()

  const save = async (patch: Partial<Phase>) => {
    putRows('cal_phases', [{ ...p, ...patch }])
    const res = await updatePhase(p.id, patch)
    if (res.error) {
      putRows('cal_phases', [p])
      toast(res.error)
      return false
    }
    putRows('cal_phases', [res.data!])
    return true
  }

  const setDates = async (starts_on: string | null, ends_on: string | null) => {
    if (starts_on && ends_on && ends_on < starts_on) return toast('The end has to be on or after the start.')
    const moves = pushPhases({ id: p.id, starts_on, ends_on }, cal.phases)
    const before = moves.map((m) => {
      const o = cal.phases.find((x) => x.id === m.id)!
      return { id: o.id, starts_on: o.starts_on, ends_on: o.ends_on }
    })
    putRows('cal_phases', moves.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
    const res = await movePhases(moves)
    if (res.error) {
      putRows('cal_phases', before.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
      return toast(res.error)
    }
    if (moves.length > 1)
      toast(`The ${moves.length - 1 === 1 ? 'next phase' : `next ${moves.length - 1} phases`} moved later`, {
        undo: async () => {
          putRows('cal_phases', before.map((m) => ({ ...cal.phases.find((x) => x.id === m.id)!, ...m })))
          await movePhases(before)
        },
      })
  }

  const finish = async () => {
    if (!who) return
    if (await save({ done_at: new Date().toISOString(), done_by: who.userId }))
      toast(`${p.name} finished`, { undo: () => save({ done_at: null, done_by: null }) })
  }

  const swap = async (dir: -1 | 1) => {
    const other = phases[i + dir]
    if (!other) return
    putRows('cal_phases', [
      { ...p, sort: other.sort },
      { ...other, sort: p.sort },
    ])
    const a = await updatePhase(p.id, { sort: other.sort })
    const b = await updatePhase(other.id, { sort: p.sort })
    if (a.error || b.error) toast(a.error ?? b.error!)
  }

  const remove = async () => {
    const res = await deletePhase(p.id)
    if (res.error) return toast(res.error)
    applyRow('cal_phases', 'delete', p)
    toast(`${p.name} deleted${tasks ? `. Its ${tasks} ${tasks === 1 ? 'task stays' : 'tasks stay'} in the group.` : ''}`)
  }

  const suggest = showSuggest(p, prog)
  const state = p.done_at ? 'Done' : current ? 'Now' : 'Next'

  return (
    <li className="cal-phase" data-done={!!p.done_at || undefined} data-current={current || undefined} data-editing={editing || undefined}>
      <div className="cal-phase__top">
        <span className="cal-phase__state small">{state}</span>
        {editing ? (
          <input
            className="field cal-phase__name"
            aria-label="Phase name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim()
              if (!n) return setName(p.name)
              if (n !== p.name) save({ name: n })
            }}
          />
        ) : (
          <h3 className="cal-phase__title">{p.name}</h3>
        )}
        <span className="small num cal-phase__when" data-late={late || undefined}>
          {p.done_at ? `Finished ${dayLabel(isoDay(new Date(p.done_at)))}` : p.starts_on || p.ends_on ? rangeLabel(p.starts_on, p.ends_on) : 'No dates'}
        </span>
      </div>

      {prog && !p.done_at && (
        <div className="cal-phase__prog">
          <ProgressBar p={prog} />
          <span className="soft small">{prog.line}</span>
        </div>
      )}

      {suggest && (
        <div className="cal-suggest" role="status">
          <span>{prog!.suggest}</span>
          <span className="cal-suggest__acts">
            <button type="button" className="q-btn q-btn--small" onClick={() => save({ dismissed_for: prog!.key, suggested_at: null })}>
              Not yet
            </button>
            <button type="button" className="q-btn q-btn--small q-btn--main" onClick={finish}>
              Finish
            </button>
          </span>
        </div>
      )}

      {editing && (
        <div className="cal-phase__edit">
          <div className="task__pair task__dates">
            <label className="task__date">
              <span className="soft small">Start</span>
              <input type="date" className="field num" value={p.starts_on ?? ''} onChange={(e) => setDates(e.target.value || null, p.ends_on)} />
            </label>
            <span className="soft" aria-hidden="true">
              →
            </span>
            <label className="task__date">
              <span className="soft small">End</span>
              <input type="date" className="field num" value={p.ends_on ?? ''} onChange={(e) => setDates(p.starts_on, e.target.value || null)} />
            </label>
          </div>
          {i > 0 && (
            <label className="check small">
              <input type="checkbox" checked={p.follows_previous} onChange={(e) => save({ follows_previous: e.target.checked })} />
              Starts after {phases[i - 1].name}
            </label>
          )}
          <div className="cal-phase__tools">
            {i > 0 && (
              <button type="button" className="q-btn q-btn--small" onClick={() => swap(-1)}>
                <Icon name="up" size={16} /> Earlier
              </button>
            )}
            {i < phases.length - 1 && (
              <button type="button" className="q-btn q-btn--small" onClick={() => swap(1)}>
                <Icon name="down" size={16} /> Later
              </button>
            )}
            {confirm ? (
              <>
                <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(false)}>
                  Keep
                </button>
                <button type="button" className="q-btn q-btn--small q-btn--danger" onClick={remove}>
                  Delete phase
                </button>
              </>
            ) : (
              <button type="button" className="q-btn q-btn--small" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={16} /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      <div className="cal-phase__foot">
        <button type="button" className="q-btn q-btn--small" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done editing' : (
            <>
              <Icon name="edit" size={16} /> {p.starts_on || p.ends_on ? 'Edit' : 'Set dates'}
            </>
          )}
        </button>
        {p.done_at ? (
          <button type="button" className="q-btn q-btn--small" onClick={() => save({ done_at: null, done_by: null })}>
            Reopen
          </button>
        ) : (
          !suggest && (
            <button type="button" className="q-btn q-btn--small" onClick={finish}>
              Finish
            </button>
          )
        )}
      </div>
    </li>
  )
}
