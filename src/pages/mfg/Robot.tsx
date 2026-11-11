import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MfgTabs } from '../../components/mfg'
import { LoadError, Sheet, useBusy, useToast } from '../../components/ui'
import { Rename } from './SubsystemPage'
import { useAuth } from '../../lib/auth'
import { empty, subStatus, useCounts } from '../../lib/counts'
import { createSubsystem, versionIn, type Subsystem } from '../../lib/mfg'
import { supabase } from '../../lib/supabase'
import { usePeople, useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'

// One robot: a card per subsystem with its lead and how far its parts are.

export default function RobotPage() {
  const { id = '' } = useParams()
  const { robots, subs, loading, error, reload } = useRobots()
  const { nameOf } = usePeople()
  const { isAdmin } = useAuth()
  const counts = useCounts()
  const toast = useToast()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [busy, run] = useBusy()
  const robot = robots.find((r) => r.id === id)
  const mine = subs.filter((s) => s.robot_id === id)

  if (!robot)
    return (
      <div className="page">
        {error ? <LoadError onRetry={reload} /> : loading ? <p className="soft">Loading</p> : <p className="soft">This robot doesn't exist anymore.</p>}
      </div>
    )

  const rename = (name: string) =>
    run(async () => {
      const { error } = await supabase.from('robots').update({ name, version: versionIn(name) }).eq('id', robot.id)
      if (error?.code === '23505') return toast(`This season already has a V${versionIn(name)}.`)
      if (error) return toast(error.message)
      await reload()
      setRenaming(false)
      toast('Saved. New drawings use the new name.')
    })

  const archive = async () => {
    const { error } = await supabase.from('robots').update({ archived: !robot.archived }).eq('id', robot.id)
    if (error) return toast(error.message)
    toast(robot.archived ? 'Back in the list' : 'Archived. Its parts leave the workshop list.')
    if (!robot.archived) navigate('/manufacturing/robots')
    else reload()
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">{robot.name}</h1>
        <MfgTabs />
      </div>
      {renaming ? (
        <Rename name={robot.name} label="Robot name" busy={busy} onSave={rename} onCancel={() => setRenaming(false)} />
      ) : (
        <p className="soft sub-meta">
          {robot.season} season ·{' '}
          <button type="button" className="text-btn" onClick={() => setRenaming(true)}>
            Rename
          </button>
        </p>
      )}
      <div className="mfg-bar-head">
        <h2 className="section__title">Subsystems</h2>
        <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
          New subsystem
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="soft">No subsystems yet. Add the first one, like 1 Drive or 3 Intake. Its number starts every part number in it.</p>
      ) : (
        <div className="mfg-subs">
          {mine.map((s) => {
            const c = counts.get(s.id) ?? empty
            return (
              <Link key={s.id} to={`/manufacturing/s/${s.id}`} className="mfg-sub">
                <span className="mfg-sub__no num">{s.number}</span>
                <span className="mfg-sub__name">{s.name}</span>
                <span className="soft small">{nameOf(s.lead_id) ? `Lead: ${nameOf(s.lead_id)}` : 'No lead yet'}</span>
                <span className="mfg-sub__status small">
                  {subStatus(c, s.assembled)}
                  {c.made ? <span className="soft num"> · {c.done}/{c.made} made</span> : null}
                </span>
                {c.made > 0 && (
                  <span className="mfg-bar" aria-hidden="true">
                    <span style={{ width: `${(c.done / c.made) * 100}%` }} />
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <p className="mfg-foot">
          <button type="button" className="text-btn" onClick={archive}>
            {robot.archived ? 'Unarchive this robot' : 'Archive this robot'}
          </button>
        </p>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New subsystem">
        <NewSubsystem
          robotId={robot.id}
          taken={mine}
          onDone={(s) => {
            setAdding(false)
            navigate(`/manufacturing/s/${s.id}`)
          }}
        />
      </Sheet>
    </div>
  )
}

function NewSubsystem({ robotId, taken, onDone }: { robotId: string; taken: Subsystem[]; onDone: (s: Subsystem) => void }) {
  const toast = useToast()
  const { people } = usePeople()
  const [number, setNumber] = useState(String(Math.max(0, ...taken.map((s) => s.number)) + 1))
  const [name, setName] = useState('')
  const [lead, setLead] = useState('')
  const [busy, run] = useBusy()

  const save = () =>
    run(async () => {
      const n = Number(number)
      if (!n) return toast('Give it a number, like 3')
      if (!name.trim()) return toast('Give it a name, like Intake')
      if (!lead) return toast('Pick the lead first')
      const res = await createSubsystem(robotId, n, name.trim(), lead)
      if (res.error) return toast(res.error)
      onDone(res.data!)
    })

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="dims">
        <label className="ctl">
          <span className="ctl__name">Number</span>
          <input className="field num" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="ctl">
          <span className="ctl__name">Name</span>
          <input className="field" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Intake" />
        </label>
      </div>
      <p className="soft small num">Parts will be numbered {Number(number) || 'N'}001, {Number(number) || 'N'}002 and on.</p>
      <label className="ctl">
        <span className="ctl__name">Lead</span>
        <Select value={lead} onChange={setLead} placeholder="Pick someone" options={people.filter((p) => !p.banned).map((p) => ({ value: p.id, label: p.name }))} />
        <span className="soft small">They get a note when a released part changes in CAD.</span>
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Creating' : 'Create subsystem'}
      </button>
    </form>
  )
}
