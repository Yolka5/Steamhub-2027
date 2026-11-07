import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MfgTabs } from '../../components/mfg'
import { Sheet, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { empty, useCounts } from '../../lib/counts'
import { createRobot } from '../../lib/mfg'
import { useRobots } from '../../lib/useMfg'
import { Select } from '../../components/Select'

// Every robot: V1, V2, prototypes. Each holds its own subsystems and parts.

export default function Robots() {
  const { robots, subs, loading } = useRobots()
  const counts = useCounts()
  const [adding, setAdding] = useState(false)
  const active = robots.filter((r) => !r.archived)
  const archived = robots.filter((r) => r.archived)

  const row = (r: (typeof robots)[number]) => {
    const mine = subs.filter((s) => s.robot_id === r.id)
    const c = mine.reduce((acc, s) => {
      const k = counts.get(s.id) ?? empty
      return { made: acc.made + k.made, done: acc.done + k.done }
    }, { made: 0, done: 0 })
    return (
      <li key={r.id}>
        <Link to={`/manufacturing/r/${r.id}`} className="row row--tall">
          <span className="row__main">
            <span className="strong">{r.name}</span>
            <span className="soft small num">
              {mine.length} {mine.length === 1 ? 'subsystem' : 'subsystems'} · {c.made} parts to make{c.made ? ` · ${c.done} done` : ''}
            </span>
          </span>
          {c.made > 0 && (
            <span className="mfg-bar" aria-hidden="true">
              <span style={{ width: `${(c.done / c.made) * 100}%` }} />
            </span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">Manufacturing</h1>
        <MfgTabs />
      </div>
      <div className="mfg-bar-head">
        <h2 className="section__title">Robots</h2>
        <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
          New robot
        </button>
      </div>

      {loading ? (
        <p className="soft">Loading</p>
      ) : active.length === 0 ? (
        <p className="soft">No robots yet. Add the first one, like "2027 V1", then its subsystems.</p>
      ) : (
        <ul className="rows">{active.map(row)}</ul>
      )}

      {archived.length > 0 && (
        <details className="more mfg-archived">
          <summary>Archived ({archived.length})</summary>
          <ul className="rows">{archived.map(row)}</ul>
        </details>
      )}

      <NewRobot open={adding} robots={active} onClose={() => setAdding(false)} />
    </div>
  )
}

function NewRobot({ open, robots, onClose }: { open: boolean; robots: { id: string; name: string }[]; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New robot">
      <NewRobotForm robots={robots} onClose={onClose} />
    </Sheet>
  )
}

function NewRobotForm({ robots, onClose }: { robots: { id: string; name: string }[]; onClose: () => void }) {
  const who = useWho()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [season, setSeason] = useState(String(new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear()))
  const [copy, setCopy] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy || !who) return
    if (!name.trim()) return toast('Give the robot a name first')
    setBusy(true)
    const res = await createRobot(name.trim(), Number(season) || new Date().getFullYear(), who, copy || undefined)
    setBusy(false)
    if (res.error) return toast(res.error)
    onClose()
    navigate(`/manufacturing/r/${res.data!.id}`)
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label className="ctl">
        <span className="ctl__name">Name</span>
        <input className="field" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="2027 V1" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Season</span>
        <input className="field num" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value.replace(/\D/g, ''))} />
      </label>
      {robots.length > 0 && (
        <label className="ctl">
          <span className="ctl__name">Copy subsystems from</span>
          <Select value={copy} onChange={setCopy} options={[{ value: '', label: 'Start empty' }, ...robots.map((r) => ({ value: r.id, label: r.name }))]} />
          <span className="soft small">Copies numbers, names and leads. Parts start fresh.</span>
        </label>
      )}
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Creating' : 'Create robot'}
      </button>
    </form>
  )
}
