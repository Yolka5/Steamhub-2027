import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Poster } from './proto'
import { Select } from './Select'
import { Sheet, useBusy, useToast } from './ui'
import { useWho } from '../lib/auth'
import { countParts, type Counts } from '../lib/counts'
import { createRobot, type Part, type Robot, type Subsystem } from '../lib/mfg'
import { usePrototypes } from '../lib/proto'
import { selectAll, supabase } from '../lib/supabase'
import { usePeople, useRobots } from '../lib/useMfg'

// The season card on Home, in the countdown's place once kickoff is past. It shows the one thing
// to do next, then a live view of it:
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
  const when = `Build week ${week} · day ${day}`

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
      <section className="countdown season-card" data-mode="setup">
        <RobotArt />
        <div className="season-card__body">
          <p className="season-card__eyebrow">{when}</p>
          <h2 className="season-card__title">Set up {season} V1</h2>
          <p className="soft">
            The robot and its subsystems, with a lead for each. Prototypes, parts, stock and the calculator all hang off them, so this comes first.
          </p>
          <div className="season-card__actions">
            <button type="button" className="q-btn q-btn--main" onClick={() => setSetup(true)}>
              <Icon name="plus" size={18} /> Set up V1
            </button>
          </div>
        </div>
        {sheet}
      </section>
    )

  // V1 on paper, nothing uploaded yet: it's prototype week.
  if (total.made + total.bought === 0)
    return (
      <>
        <PrototypeWeek robot={robot} subs={robotSubs} season={season} when={when} />
        {sheet}
      </>
    )

  const bySub = new Map<string, Slim[]>()
  for (const p of parts) bySub.set(p.subsystem_id, [...(bySub.get(p.subsystem_id) ?? []), p])
  const today = new Date().toDateString()
  const madeToday = parts.filter((p) => p.status === 'done' && p.machine !== 'Bought' && new Date(p.updated_at).toDateString() === today).length
  const doing = parts.filter((p) => p.status === 'doing').length
  const share = total.made ? total.done / total.made : 0
  const hasNext = robots.some((r) => r.season === season && r.version === next)

  return (
    <section className="countdown season-card" data-mode="build">
      <RobotArt />
      <div className="season-card__body">
        <p className="season-card__eyebrow">{when}</p>
        <h2 className="season-card__title">
          <Link to={`/manufacturing/r/${robot.id}`}>{robot.name}</Link>
        </h2>
        <p className="soft num">
          {total.done} of {total.made} parts made ({Math.round(share * 100)}%)
          {madeToday ? ` · ${madeToday} today` : ''}
          {doing ? ` · ${doing} in progress` : ''}
          {total.bought ? ` · ${total.got} of ${total.bought} bought parts in` : ''}
        </p>
        <ul className="season-card__subs">
          {robotSubs.map((s) => (
            <SubBar key={s.id} sub={s} c={countParts(bySub.get(s.id) ?? [])} />
          ))}
        </ul>
        {share >= NEXT_AT && !hasNext && (
          <div className="season-card__next">
            <span>
              <strong>V{robot.version} is {Math.round(share * 100)}% made.</strong> Start V{next} with the same subsystems and leads?
            </span>
            <button type="button" className="q-btn q-btn--small" onClick={() => setSetup(true)}>
              Start V{next}
            </button>
          </div>
        )}
      </div>
      {sheet}
    </section>
  )
}

function SubBar({ sub, c }: { sub: Subsystem; c: Counts }) {
  const pct = c.made ? Math.round((c.done / c.made) * 100) : 0
  return (
    <li>
      <Link to={`/manufacturing/s/${sub.id}`} className="season-card__sub">
        <span className="season-card__subname">
          {sub.number} {sub.name}
        </span>
        <span className="mfg-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="soft small num">{c.made ? `${c.done}/${c.made}` : 'No STEP yet'}</span>
      </Link>
    </li>
  )
}

function PrototypeWeek({ robot, subs, season, when }: { robot: Robot; subs: Subsystem[]; season: number; when: string }) {
  const { prototypes, tests } = usePrototypes(season)
  const today = new Date().toDateString()
  const testsToday = tests.filter((t) => new Date(t.at).toDateString() === today).length
  // The newest filmed test of the season is the picture on the side.
  const poster = tests
    .filter((t) => t.poster_path)
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.poster_path

  return (
    <section className="countdown season-card" data-mode="protos">
      {poster ? <Poster path={poster} className="season-card__art season-card__art--photo" /> : <RobotArt />}
      <div className="season-card__body">
        <p className="season-card__eyebrow">
          {when} · {robot.name}
        </p>
        <h2 className="season-card__title">Prototype week</h2>
        <p className="soft num">
          {prototypes.length} prototypes · {tests.length} tests{testsToday ? `, ${testsToday} today` : ''}
        </p>
        <ul className="season-card__tiles">
          {subs.map((s) => {
            const mine = prototypes.filter((p) => p.subsystem_number === s.number)
            const n = tests.filter((t) => mine.some((p) => p.id === t.prototype_id)).length
            const chosen = mine.find((p) => p.status === 'chosen')
            return (
              <li key={s.id}>
                <Link to={mine.length ? `/prototypes?sub=${s.number}` : `/prototypes?sub=${s.number}&new=1`} className="season-card__tile" data-empty={!mine.length || undefined}>
                  <span className="season-card__subname">
                    {s.number} {s.name}
                  </span>
                  <span className="soft small num">
                    {chosen ? `Chosen: ${chosen.name}` : mine.length ? `${mine.length} prototype${mine.length > 1 ? 's' : ''} · ${n} test${n === 1 ? '' : 's'}` : '+ Start a prototype'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="season-card__actions">
          <Link to="/prototypes/record" className="q-btn q-btn--main">
            <Icon name="video" size={18} /> Record a test
          </Link>
          <Link to={`/manufacturing/r/${robot.id}`} className="q-btn">
            Subsystems
          </Link>
        </div>
      </div>
    </section>
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

/** A robot drawn in lines, blurred into the card's right side. Decoration only. */
function RobotArt() {
  return (
    <svg className="season-card__art" viewBox="0 0 320 260" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      {/* elevator towers and carriage */}
      <path d="M118 40v150M202 40v150M118 40h84" />
      <rect x="132" y="70" width="56" height="34" rx="6" />
      <path d="M160 104v30" />
      {/* arm and intake rollers */}
      <path d="M188 86l64-30" />
      <circle cx="262" cy="52" r="14" />
      <circle cx="262" cy="52" r="4" />
      {/* frame */}
      <rect x="60" y="150" width="200" height="54" rx="8" />
      <path d="M100 150v54M220 150v54" />
      {/* bumpers */}
      <rect x="44" y="196" width="232" height="26" rx="13" />
      {/* wheels */}
      <circle cx="88" cy="234" r="16" />
      <circle cx="232" cy="234" r="16" />
    </svg>
  )
}
