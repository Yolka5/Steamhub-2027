import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MfgTabs } from '../../components/mfg'
import { LoadError, Sheet, useBusy, useToast } from '../../components/ui'
import { Rename } from './SubsystemPage'
import { useAuth } from '../../lib/auth'
import { empty, subStatus, useCounts } from '../../lib/counts'
import { createSubsystem, deleteRobot, robotFootprint, versionIn, type Robot, type Subsystem } from '../../lib/mfg'
import { supabase } from '../../lib/supabase'
import { usePeople, useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'
import { RobotWeight } from '../../components/Onshape'

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
  const [deleting, setDeleting] = useState(false)
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
      const { error } = await supabase.from('robots').update({ name, version: robot.offseason ? null : versionIn(name) }).eq('id', robot.id)
      if (error?.code === '23505') return toast(`This season already has a V${versionIn(name)}.`)
      if (error) return toast(error.message)
      await reload()
      setRenaming(false)
      toast('Saved. New drawings use the new name.')
    })

  const setOffseason = (offseason: boolean) =>
    run(async () => {
      // Off-season never holds a V number; back to the season, the name decides again.
      const { error } = await supabase.from('robots').update({ offseason, version: offseason ? null : versionIn(robot.name) }).eq('id', robot.id)
      if (error?.code === '23505') return toast(`This season already has a V${versionIn(robot.name)}. Rename it first.`)
      if (error) return toast(error.message.includes('offseason') ? 'The off-season migration has not run on the database yet.' : error.message)
      await reload()
      toast(offseason ? 'Now an off-season project, with its own Calendar groups' : 'Back with the season robots')
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
          {robot.offseason ? `Off-season project, ${robot.season}` : `${robot.season} season`} ·{' '}
          <button type="button" className="text-btn" onClick={() => setRenaming(true)}>
            Rename
          </button>
          {robot.version == null && (
            <>
              {' · '}
              <button type="button" className="text-btn" disabled={busy} onClick={() => setOffseason(!robot.offseason)}>
                {robot.offseason ? 'Make it a season robot' : 'Mark as off-season project'}
              </button>
            </>
          )}
        </p>
      )}
      <RobotWeight robot={robot} subs={mine} />
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
          {' · '}
          <button type="button" className="text-btn text-btn--bad" onClick={() => setDeleting(true)}>
            Delete this robot
          </button>
        </p>
      )}

      <Sheet open={deleting} onClose={() => setDeleting(false)} title={`Delete ${robot.name}?`}>
        {deleting && <DeleteRobot robot={robot} onCancel={() => setDeleting(false)} onDone={() => navigate('/manufacturing/robots')} />}
      </Sheet>

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

/** The confirm step. A robot with released or made parts asks for its name, so a real robot isn't lost to one tap. */
function DeleteRobot({ robot, onCancel, onDone }: { robot: Robot; onCancel: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, run] = useBusy()
  const [f, setF] = useState<Awaited<ReturnType<typeof robotFootprint>> | null>(null)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    robotFootprint(robot.id).then(setF)
  }, [robot.id])

  if (!f) return <p className="soft">Counting what it holds</p>
  const askName = f.worked > 0
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const remove = () =>
    run(async () => {
      if (askName && typed.trim() !== robot.name.trim()) return toast(`Type ${robot.name} to delete it`)
      const res = await deleteRobot(robot.id)
      if (res.error) return toast(res.error)
      toast(`${robot.name} deleted`)
      onDone()
    })

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        remove()
      }}
    >
      <p>
        {f.subs === 0
          ? "It has no subsystems yet. This can't be undone."
          : `This deletes ${plural(f.subs, 'subsystem', 'subsystems')} and ${plural(f.parts, 'part', 'parts')} with their drawings and history. It can't be undone.`}
      </p>
      <ul className="soft small del-list">
        {f.stock > 0 && <li>{plural(f.stock, 'reserved stock piece goes', 'reserved stock pieces go')} back to available.</li>}
        {f.phases > 0 && <li>{plural(f.phases, 'calendar phase', 'calendar phases')} for this robot go too.</li>}
        {f.parts > 0 && <li>Open wishlist items for its parts are removed.</li>}
        <li>To keep it but hide it, archive it instead.</li>
      </ul>
      {askName && (
        <label className="ctl">
          <span className="ctl__name">
            {plural(f.worked, 'part was', 'parts were')} released or made. Type <strong>{robot.name}</strong> to delete it.
          </span>
          <input className="field" data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      )}
      <div className="del-acts">
        <button type="submit" className="q-btn q-btn--danger">
          {busy ? 'Deleting' : 'Delete robot'}
        </button>
        <button type="button" className="q-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
