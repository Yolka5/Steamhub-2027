import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Select } from '../../components/Select'
import { CalTabs, useCalSeason } from '../../components/cal'
import { LineHead, NotesHost, PhaseEditorHost, PhaseRow, TaskList, useOpenPhases } from '../../components/CalPhase'
import { TaskSheetHost } from '../../components/TaskSheet'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { createPhase, dayLabel, firstName, phaseBars, taskOrder, TEAM_WORD, todayIso, updateGroup, type Phase } from '../../lib/cal'
import { useLinked, useSuggestNotify, type Progress } from '../../lib/calLinked'
import type { Profile } from '../../lib/mfg'
import { putRows, useCal, type Cal } from '../../lib/useCal'
import { usePeople } from '../../lib/useMfg'
import { TodayUpdate } from './TodayUpdate'
import { usePhone } from '../../lib/usePhone'
import { PartsList } from '../../components/CalParts'
import { CNC_MACHINES, openParts, WORKSHOP_MACHINES } from '../../lib/calParts'
import { useTasks } from '../../lib/useTasks'

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
  const group = cal.groups.find((g) => g.id === id)
  // CNC and Workshop make parts: their page shows the parts waiting, not phases.
  const { tasks: boardParts } = useTasks()
  // Phones show one part at a time (Tasks, Phases, Updates) instead of one long page.
  const phone = usePhone()
  const [params, setParams] = useSearchParams()
  // A group with phases opens on them: that's where its tasks are now.
  const phased = !!group && cal.phases.some((p) => p.group_id === group.id)
  const part = params.get('s') ?? (phased ? 'phases' : 'tasks')
  const shows = (k: string) => !phone || part === k
  const go = (k: string) => {
    const next = new URLSearchParams(params)
    next.set('s', k)
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

  const machines = group.kind === 'cnc' ? CNC_MACHINES : group.kind === 'workshop' ? WORKSHOP_MACHINES : null
  const waiting = machines ? openParts(boardParts, machines) : []
  const phases = cal.phases.filter((p) => p.group_id === group.id).sort((a, b) => a.sort - b.sort)
  // Tasks in a phase show under it; this list is the rest.
  const tasks = cal.tasks.filter((t) => t.group_id === group.id && !t.parent_id && (!phases.length || !t.phase_id)).sort(taskOrder)
  const open = tasks.filter((t) => t.status !== 'done')
  const updates = cal.updates
    // Today's is in the box above the list.
    .filter((u) => u.group_id === group.id && u.day !== todayIso())
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
          {TEAM_WORD[group.team] !== group.name && (
            <Link to={`/calendar?team=${group.team}`} className="soft small cal-crumb">
              {TEAM_WORD[group.team]}
            </Link>
          )}
          <h1 className="page__title">{group.name}</h1>
        </div>
        <div className="cal-head-end">
          {/* Takes you to today's box in Updates, where the update is written. */}
          <button
            type="button"
            className="q-btn"
            onClick={() => {
              if (phone) go('updates')
              window.setTimeout(() => {
                const box = document.getElementById(`today-${group.id}`)
                box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                box?.focus({ preventScroll: true })
              }, 60)
            }}
          >
            {sentToday ? 'Today’s update ✓' : 'Write today’s update'}
          </button>
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
        {group.kind === 'project' && <span className="soft small">An off-season project. Follows its subsystem's lead in Manufacturing.</span>}
      </div>

      {phone && (
        <div className="picks picks--seg cal-parts" role="tablist" aria-label="Show">
          {[
            ...(machines
              ? [['tasks', `Tasks${open.length ? ` ${open.length}` : ''}`], ['parts', `Parts${waiting.length ? ` ${waiting.length}` : ''}`]]
              : phased
                ? [['phases', 'Phases'], ['tasks', `Other tasks${open.length ? ` ${open.length}` : ''}`]]
                : [['tasks', `Tasks${open.length ? ` ${open.length}` : ''}`], ['phases', 'Phases']]),
            ['updates', 'Updates'],
          ].map(([k, label]) => (
            <button key={k} type="button" role="tab" className="pick" aria-selected={part === k} onClick={() => go(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Computers: phases across the whole page, so their columns have room. */}
      {!machines && !phone && <Phases group={group.id} phases={phases} cal={cal} linked={linked} people={people} />}

      <div className="cal-group-page">
        <div>
          {machines
            ? shows('parts') && <PartsList list={waiting} machines={machines} />
            : phone && shows('phases') && <Phases group={group.id} phases={phases} cal={cal} linked={linked} people={people} />}

          {shows('tasks') && (
            <section className="section">
              <h2 className="section__title">{phases.length ? 'Other tasks' : 'Tasks'}</h2>
              {phases.length > 0 && tasks.length === 0 && <p className="soft small">Tasks in a phase are under it. These are the rest.</p>}
              <TaskList tasks={tasks} cal={cal} nameOf={nameOf} people={people} addTo={{ group, phaseId: null }} />
            </section>
          )}
        </div>

        {shows('updates') && (
        <section className="section cal-updates">
          <h2 className="section__title">Updates</h2>
          <TodayUpdate group={group} phase={null} cal={cal} />
          {updates.length === 0 ? (
            <p className="soft">Earlier days show up here.</p>
          ) : (
            <ol className="cal-feed">
              {updates.map((u) => (
                <li key={u.id} className="cal-feed__item">
                  <div className="cal-feed__head">
                    <span className="strong">{dayLabel(u.day)}</span>
                    <span className="soft small">
                      {firstName(nameOf(u.author_id))}
                      {u.phase_id ? ` · ${cal.phases.find((p) => p.id === u.phase_id)?.name ?? ''}` : ''}
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
      <PhaseEditorHost cal={cal} />
      <NotesHost cal={cal} people={people} />
    </div>
  )
}

function Phases({ group, phases, cal, linked, people }: { group: string; phases: Phase[]; cal: Cal; linked: Map<string, Progress>; people: Profile[] }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  const [openPhases, togglePhase] = useOpenPhases()
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null
  const bars = phaseBars(cal.phases, group)

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
      {phases.length === 0 ? (
        <p className="soft">No phases: this group is a plain task list. Add phases if its work comes in stages.</p>
      ) : (
        <>
          <LineHead />
          <ol className="cal-phase-rows">
            {phases.map((p) => (
              <PhaseRow key={p.id} p={p} cal={cal} prog={linked.get(p.id)} bar={bars.get(p.id)} nameOf={nameOf} people={people} open={openPhases.has(p.id)} onFold={() => togglePhase(p.id)} />
            ))}
          </ol>
        </>
      )}
      <form
        className="tsheet__add cal-add-phase"
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
