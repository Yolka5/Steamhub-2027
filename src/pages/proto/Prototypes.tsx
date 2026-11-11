import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Poster, ProtoStatusTag, ResultTag } from '../../components/proto'
import { Select } from '../../components/Select'
import { LoadError, Sheet, useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { ago } from '../../lib/mfg'
import { createPrototype, keyLines, paramsOf, STATUS_WORD, STATUSES, subLabel, usePrototypes, useSeasons, type Prototype, type ProtoStatus, type Test } from '../../lib/proto'

// Every prototype of the season, grouped by subsystem. Filters live in the URL.

export default function Prototypes() {
  const [q, setQ] = useSearchParams()
  const { seasons, current, subsystemsOf } = useSeasons()
  const season = Number(q.get('season')) || current
  const { prototypes, tests, params, loading, error, reload } = usePrototypes(season)
  const subs = subsystemsOf(season)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()

  const subFilter = q.get('sub') // a number, "none" or null for all
  const status = (q.get('status') as ProtoStatus | null) ?? null
  const showDropped = q.get('dropped') === '1'
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(q)
    if (v == null || v === '') n.delete(k)
    else n.set(k, v)
    setQ(n, { replace: true })
  }

  const shown = prototypes.filter(
    (p) =>
      (status ? p.status === status : showDropped || p.status !== 'dropped') &&
      (subFilter == null || (subFilter === 'none' ? p.subsystem_number == null : p.subsystem_number === Number(subFilter))),
  )
  const groupKeys = [...new Set(shown.map((p) => p.subsystem_number))].sort((a, b) => (a ?? 1e9) - (b ?? 1e9))
  const testsOf = (id: string) => tests.filter((t) => t.prototype_id === id).sort((a, b) => b.n - a.n)
  const dropped = prototypes.filter((p) => p.status === 'dropped').length

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">Prototypes</h1>
        <div className="page__actions">
          <Link to="/prototypes/record" className="q-btn">
            <Icon name="video" size={18} /> Record a test
          </Link>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            New prototype
          </button>
        </div>
      </div>

      <div className="mfg-filters">
        {seasons.length > 1 && (
          <Select className="field--inline" value={String(season)} onChange={(v) => set('season', v === String(current) ? null : v)} options={seasons.map((s) => ({ value: String(s), label: `${s} season` }))} />
        )}
        <Select
          className="field--inline"
          value={subFilter ?? ''}
          onChange={(v) => set('sub', v)}
          options={[{ value: '', label: 'All subsystems' }, ...subs.map((s) => ({ value: String(s.number), label: `${s.number} ${s.name}` })), { value: 'none', label: 'No subsystem yet' }]}
        />
        <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label="Status">
          {[null, ...STATUSES.filter((s) => s !== 'dropped')].map((s) => (
            <button key={s ?? 'all'} type="button" role="radio" className="pick" aria-checked={status === s} onClick={() => set('status', s)}>
              {s ? STATUS_WORD[s] : 'All'}
            </button>
          ))}
        </div>
        {dropped > 0 && !status && (
          <label className="check">
            <input type="checkbox" checked={showDropped} onChange={(e) => set('dropped', e.target.checked ? '1' : null)} />
            Show dropped ({dropped})
          </label>
        )}
      </div>

      {error && !prototypes.length ? (
        <LoadError onRetry={reload} />
      ) : loading ? (
        <p className="soft">Loading</p>
      ) : prototypes.length === 0 ? (
        <div className="mfg-empty">
          <h2 className="section__title">Start your first prototype</h2>
          <p className="soft">One prototype per idea you build, like "2 rollers over the bumper". Each test is a video with the parameters it ran with.</p>
          <button type="button" className="q-btn q-btn--main" onClick={() => setAdding(true)}>
            New prototype
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="soft">No prototypes match these filters.</p>
      ) : (
        groupKeys.map((n) => {
          const list = shown.filter((p) => p.subsystem_number === n)
          const tested = list.filter((p) => testsOf(p.id).length > 0)
          const sub = subs.find((s) => s.number === n)
          return (
            <section key={n ?? 'none'} className="mfg-group">
              <div className="mfg-group__head">
                <h2 className="section__title">{subLabel(n, subs)}</h2>
                <Link className="soft small" to={`/prototypes/summary?sub=${n ?? 'none'}${season !== current ? `&season=${season}` : ''}`}>
                  Season summary
                </Link>
                {sub && (
                  <Link className="soft small" to={`/manufacturing/s/${sub.id}`}>
                    In Manufacturing
                  </Link>
                )}
                {tested.length >= 2 && (
                  <Link className="q-btn q-btn--small mfg-group__print" to={`/prototypes/compare?ids=${tested.slice(0, 4).map((p) => p.id).join(',')}`}>
                    <Icon name="compare" size={18} /> Compare
                  </Link>
                )}
              </div>
              <div className="pt-cards">
                {list.map((p) => (
                  <ProtoCard key={p.id} p={p} tests={testsOf(p.id)} lines={keyLinesFor(p, testsOf(p.id)[0], params)} />
                ))}
              </div>
            </section>
          )
        })
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New prototype">
        <NewPrototype
          season={season}
          subs={subs}
          defaultSub={subFilter && subFilter !== 'none' ? Number(subFilter) : null}
          onDone={(p) => {
            setAdding(false)
            navigate(`/prototypes/${p.id}`)
          }}
        />
      </Sheet>
    </div>
  )
}

const keyLinesFor = (p: Prototype, last: Test | undefined, params: Parameters<typeof paramsOf>[1]) => (last ? keyLines(paramsOf(p, params), last.values).slice(0, 3) : [])

function ProtoCard({ p, tests, lines }: { p: Prototype; tests: Test[]; lines: string[] }) {
  const last = tests[0]
  return (
    <Link to={`/prototypes/${p.id}`} className="pt-card">
      <Poster path={p.cover_path ?? tests.find((t) => t.poster_path)?.poster_path} />
      <span className="pt-card__body">
        <span className="pt-card__top">
          <span className="pt-card__name">{p.name}</span>
          <ProtoStatusTag status={p.status} />
        </span>
        {p.concept && <span className="soft small pt-card__concept">{p.concept}</span>}
        {last ? (
          <span className="small pt-card__last">
            <span className="soft num">
              Test {last.n} · {ago(last.at)}
            </span>{' '}
            <ResultTag result={last.result} />
          </span>
        ) : (
          <span className="soft small">No tests yet</span>
        )}
        {lines.length > 0 && <span className="soft small num pt-card__lines">{lines.join(' · ')}</span>}
      </span>
    </Link>
  )
}

export function NewPrototype({
  season,
  subs,
  defaultSub,
  onDone,
}: {
  season: number
  subs: { number: number; name: string }[]
  defaultSub: number | null
  onDone: (p: Prototype) => void
}) {
  const who = useWho()
  const toast = useToast()
  const [name, setName] = useState('')
  const [sub, setSub] = useState(defaultSub != null ? String(defaultSub) : '')
  const [concept, setConcept] = useState('')
  const [busy, run] = useBusy()

  const save = () =>
    run(async () => {
      if (!who) return
      if (!name.trim()) return toast('Give it a name, like "Double roller"')
      const res = await createPrototype({ season, subsystem_number: sub ? Number(sub) : null, name: name.trim(), concept: concept.trim() }, who)
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
      <label className="ctl">
        <span className="ctl__name">Name</span>
        <input className="field" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Double roller" />
      </label>
      <label className="ctl">
        <span className="ctl__name">Subsystem</span>
        <Select value={sub} onChange={setSub} options={[{ value: '', label: 'No subsystem yet' }, ...subs.map((s) => ({ value: String(s.number), label: `${s.number} ${s.name}` }))]} />
        <span className="soft small">
          {subs.length ? "It starts with the subsystem's parameters, so its tests line up with the others." : 'No subsystems this season yet. Add them under Manufacturing → Robots, or pick one later.'}
        </span>
      </label>
      <label className="ctl">
        <span className="ctl__name">Concept</span>
        <input className="field" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="2 rollers, over the bumper" />
      </label>
      <button type="submit" className="q-btn q-btn--main q-btn--wide">
        {busy ? 'Creating' : 'Create prototype'}
      </button>
    </form>
  )
}
