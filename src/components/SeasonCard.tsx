import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Unit } from './Odometer'
import { Select } from './Select'
import { Sheet, useBusy, useToast } from './ui'
import { useWho } from '../lib/auth'
import { countParts } from '../lib/counts'
import { createRobot, type Part, type Robot, type Subsystem } from '../lib/mfg'
import { usePrototypes } from '../lib/proto'
import { selectAll, supabase } from '../lib/supabase'
import { usePeople, useRobots } from '../lib/useMfg'

// The season card on Home, in the countdown's place once kickoff is past: one compact band with
// the season's numbers, what it is, and the one thing to do next.
//   no V1 yet                  → Set up V1 (robot and subsystems in one sheet)
//   V1 with no parts yet       → prototype week: prototypes and tests per subsystem
//   V1 in production           → parts done per subsystem
//   25% of V1's parts made     → the same, with Start V2 (copies V1's subsystems and leads)
// Test and practice robots have no version, so they never count.

/** Share of a robot's made parts done before V2 is suggested. */
const NEXT_AT = 0.25

type Slim = Pick<Part, 'subsystem_id' | 'status' | 'machine' | 'released_at' | 'updated_at'>

function useRobotParts(subIds: string[]) {
  const [parts, setParts] = useState<Slim[]>([])
  const key = subIds.join(',')
  useEffect(() => {
    if (!key) return setParts([])
    selectAll<Slim>(() => supabase.from('parts').select('subsystem_id, status, machine, released_at, updated_at').in('subsystem_id', key.split(',')).order('id')).then(({ data }) => setParts(data ?? []))
  }, [key])
  return parts
}

export function SeasonCard({ since, season }: { since: number; season: number }) {
  const { robots, subs, loading, reload } = useRobots()
  const [setup, setSetup] = useState(false)
  const week = Math.floor(since / 7) + 1
  const day = (since % 7) + 1

  // The season's newest version, archived or not.
  const robot = useMemo(
    () =>
      robots
        .filter((r) => r.season === season && r.version != null)
        .sort((a, b) => b.version! - a.version!)[0] ?? null,
    [robots, season],
  )
  const robotSubs = useMemo(() => (robot ? subs.filter((s) => s.robot_id === robot.id).sort((a, b) => a.number - b.number) : []), [robot, subs])
  const parts = useRobotParts(robotSubs.map((s) => s.id))
  const total = countParts(parts)
  const next = (robot?.version ?? 0) + 1

  if (loading) return <section className="countdown season-card" aria-busy="true" />

  const sheet = (
    <Sheet open={setup} onClose={() => setSetup(false)} title={`Set up ${season} V${next}`}>
      {setup && (
        <SetupForm
          season={season}
          version={next}
          from={robotSubs}
          onDone={() => {
            setSetup(false)
            reload()
          }}
        />
      )}
    </Sheet>
  )

  if (!robot)
    return (
      <Card
        label={`Build week ${week}, day ${day}. Set up ${season} V1`}
        units={
          <>
            <Unit value={week} label="Build week" />
            <Unit value={day} label="Day" />
          </>
        }
        title={`Set up ${season} V1`}
        line="The robot and its subsystems come first."
        go={{ onClick: () => setSetup(true), label: `Set up ${season} V1` }}
        actions={
          <button type="button" className="q-btn q-btn--main" onClick={() => setSetup(true)}>
            <Icon name="plus" size={18} /> Set up V1
          </button>
        }
      >
        {sheet}
      </Card>
    )

  // V1 on paper, nothing uploaded yet: it's prototype week.
  if (total.made + total.bought === 0) return <PrototypeWeek robot={robot} subs={robotSubs} season={season} />

  const today = new Date().toDateString()
  const madeToday = parts.filter((p) => p.status === 'done' && p.machine !== 'Bought' && new Date(p.updated_at).toDateString() === today).length
  const doing = parts.filter((p) => p.status === 'doing').length
  const pct = total.made ? Math.round((total.done / total.made) * 100) : 0
  const offerNext = total.made > 0 && total.done / total.made >= NEXT_AT && !robots.some((r) => r.season === season && r.version === next)

  return (
    <Card
      label={`${robot.name}: ${pct}% of parts made`}
      units={
        <>
          <Unit value={pct} label="% made" />
          <Unit value={madeToday} label="Made today" />
          <Unit value={doing} label="In progress" />
        </>
      }
      title={robot.name}
      go={offerNext ? { onClick: () => setSetup(true), label: `Start V${next}` } : { to: `/manufacturing/r/${robot.id}`, label: `${robot.name} parts by subsystem` }}
      line={
        offerNext
          ? `${pct}% made. Start V${next} with the same subsystems?`
          : `${total.done} of ${total.made} parts made${total.bought ? ` · ${total.got} of ${total.bought} bought in` : ''} · week ${week}, day ${day}`
      }
      actions={
        <>
          {offerNext && (
            <button type="button" className="q-btn q-btn--main" onClick={() => setSetup(true)}>
              Start V{next}
            </button>
          )}
          <Link to={`/manufacturing/r/${robot.id}`} className="q-btn">
            {offerNext ? `V${robot.version} parts` : 'Parts by subsystem'}
          </Link>
        </>
      }
    >
      {sheet}
    </Card>
  )
}

type Go = { to: string; label: string } | { onClick: () => void; label: string }

/** One band in the countdown's place: numbers, then what it is, then what to do. */
function Card({ label, units, title, line, actions, go, children }: { label: string; units: ReactNode; title: string; line: string; actions: ReactNode; go: Go; children?: ReactNode }) {
  return (
    <section className="countdown season-card" aria-label={label}>
      <div className="countdown__units">{units}</div>
      <div className="season-card__text">
        <h2 className="countdown__title">{title}</h2>
        <p className="soft num">{line}</p>
      </div>
      <div className="season-card__actions">{actions}</div>
      {/* Phones show only the numbers and the title, as the countdown does, so the whole card is the button. */}
      {'to' in go ? (
        <Link to={go.to} className="season-card__go" aria-label={go.label} />
      ) : (
        <button type="button" className="season-card__go" aria-label={go.label} onClick={go.onClick} />
      )}
      {children}
    </section>
  )
}

function PrototypeWeek({ robot, subs, season }: { robot: Robot; subs: Subsystem[]; season: number }) {
  const { prototypes, tests } = usePrototypes(season)
  const today = new Date().toDateString()
  const testsToday = tests.filter((t) => new Date(t.at).toDateString() === today).length
  const covered = subs.filter((s) => prototypes.some((p) => p.subsystem_number === s.number)).length

  return (
    <Card
      label={`Prototype week: ${prototypes.length} prototypes, ${tests.length} tests`}
      units={
        <>
          <Unit value={prototypes.length} label="Prototypes" />
          <Unit value={tests.length} label="Tests" />
          <Unit value={testsToday} label="Today" />
        </>
      }
      title="Prototype week"
      go={{ to: '/prototypes', label: 'Prototypes' }}
      line={`${robot.name} · ${subs.length ? `${covered} of ${subs.length} subsystems have a prototype` : 'no subsystems yet'}`}
      actions={
        <>
          <Link to="/prototypes/record" className="q-btn q-btn--main">
            <Icon name="video" size={18} /> Record a test
          </Link>
          <Link to="/prototypes" className="q-btn">
            Prototypes
          </Link>
        </>
      }
    />
  )
}

/** Robot name, then its subsystems: numbers, names and leads, copied from the version before. */
function SetupForm({ season, version, from, onDone }: { season: number; version: number; from: Subsystem[]; onDone: () => void }) {
  const who = useWho()
  const toast = useToast()
  const { people } = usePeople()
  const [busy, run] = useBusy()
  const [name, setName] = useState(`${season} V${version}`)
  const [rows, setRows] = useState(() =>
    from.length ? from.map((s) => ({ number: String(s.number), name: s.name, lead: s.lead_id ?? '' })) : [{ number: '1', name: '', lead: '' }],
  )
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = () =>
    run(async () => {
      if (!who) return
      if (!name.trim()) return toast('Give the robot a name')
      const list = rows.filter((r) => r.name.trim() || r.number.trim())
      for (const r of list) if (!r.name.trim() || !Number(r.number)) return toast('Each subsystem needs a number and a name')
      const numbers = list.map((r) => Number(r.number))
      if (new Set(numbers).size !== numbers.length) return toast('Two subsystems have the same number')
      const res = await createRobot(
        name.trim(),
        season,
        who,
        undefined,
        list.map((r) => ({ number: Number(r.number), name: r.name.trim(), lead_id: r.lead || null })),
      )
      if (res.error) return toast(res.error)
      toast(`${name.trim()} is set up${list.length ? ` with ${list.length} subsystems` : ''}`)
      onDone()
    })

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Robot name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="soft small">Keep the V{version} in it: that's how Home knows which robot this is.</span>
      </label>
      <div className="ctl">
        <span className="ctl__name">Subsystems</span>
        {from.length > 0 && <span className="soft small">Copied from V{version - 1}. Change anything; parts start fresh.</span>}
        <ul className="season-setup">
          {rows.map((r, i) => (
            <li key={i} className="season-setup__row">
              <input className="field num" inputMode="numeric" aria-label="Number" value={r.number} onChange={(e) => set(i, { number: e.target.value.replace(/\D/g, '') })} />
              <input className="field" aria-label="Name" data-autofocus={i === 0 && !from.length ? true : undefined} value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Intake" />
              <Select value={r.lead} onChange={(v) => set(i, { lead: v })} options={[{ value: '', label: 'No lead yet' }, ...people.filter((p) => !p.banned).map((p) => ({ value: p.id, label: p.name }))]} />
              <button type="button" className="icon-btn" aria-label={`Remove subsystem ${r.number}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="q-btn q-btn--small season-setup__add"
          onClick={() => setRows((rs) => [...rs, { number: String(Math.max(0, ...rs.map((r) => Number(r.number) || 0)) + 1), name: '', lead: '' }])}
        >
          <Icon name="plus" size={18} /> Add subsystem
        </button>
      </div>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Setting up' : `Set up V${version}`}
      </button>
    </form>
  )
}
