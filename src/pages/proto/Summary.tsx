import { Link, useSearchParams } from 'react-router-dom'
import { ProtoStatusTag, ResultTag, TestVideo } from '../../components/proto'
import { Select } from '../../components/Select'
import { bestTest, keyLines, measureScore, paramsOf, subLabel, usePrototypes, useSeasons, type ParamDef, type Prototype, type Test } from '../../lib/proto'

// One subsystem's season of prototyping on one page: what was tried, what was chosen and why,
// and the best video of each. Written for next season's team to read before kickoff.

const ORDER: Record<Prototype['status'], number> = { chosen: 0, testing: 1, building: 2, idea: 3, dropped: 4 }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function Summary() {
  const [q, setQ] = useSearchParams()
  const { current, subsystemsOf } = useSeasons()
  const season = Number(q.get('season')) || current
  const { prototypes, tests, params, loading } = usePrototypes(season)
  const subs = subsystemsOf(season)
  const subParam = q.get('sub')
  const subNo = subParam === 'none' || subParam == null ? null : Number(subParam)

  // Subsystems that have prototypes this season, for the switcher.
  const withProtos = [...new Set(prototypes.map((p) => p.subsystem_number))].sort((a, b) => (a ?? 1e9) - (b ?? 1e9))
  const mine = prototypes.filter((p) => p.subsystem_number === subNo).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.created_at.localeCompare(b.created_at))
  const testsOf = (id: string) => tests.filter((t) => t.prototype_id === id)
  const allTests = mine.flatMap((p) => testsOf(p.id))
  const measureName = allTests.find((t) => t.measure_name)?.measure_name

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(q)
    if (v == null) n.delete(k)
    else n.set(k, v)
    setQ(n, { replace: true })
  }

  const groups: { title: string; list: Prototype[] }[] = [
    { title: 'Chosen', list: mine.filter((p) => p.status === 'chosen') },
    { title: 'Also tried', list: mine.filter((p) => p.status !== 'chosen' && p.status !== 'dropped') },
    { title: 'Dropped', list: mine.filter((p) => p.status === 'dropped') },
  ]

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Season summary</h1>
          <p className="soft sub-meta">
            {subLabel(subNo, subs)} · {season} season
            {mine.length ? ` · ${mine.length} prototype${mine.length === 1 ? '' : 's'}, ${allTests.length} test${allTests.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        {withProtos.length > 1 && (
          <Select
            className="field--inline"
            value={subNo == null ? 'none' : String(subNo)}
            onChange={(v) => set('sub', v)}
            options={withProtos.map((n) => ({ value: n == null ? 'none' : String(n), label: subLabel(n, subs) }))}
          />
        )}
      </div>

      {loading ? (
        <p className="soft">Loading</p>
      ) : mine.length === 0 ? (
        <div className="mfg-empty">
          <p>No prototypes for {subLabel(subNo, subs)} this season.</p>
          <Link to="/prototypes" className="q-btn">
            All prototypes
          </Link>
        </div>
      ) : (
        <>
          <section className="pt-sum__glance">
            <h2 className="section__title">At a glance</h2>
            <div className="pt-compare__scroll">
              <table className="pt-table num">
                <thead>
                  <tr>
                    <th scope="col">Prototype</th>
                    <th scope="col">Status</th>
                    <th scope="col">Tests</th>
                    <th scope="col">Best result</th>
                    {measureName && <th scope="col">{measureName}</th>}
                    <th scope="col">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((p) => {
                    const ts = testsOf(p.id)
                    const best = bestTest(ts)
                    // Best measured: the lowest time, or the highest count.
                    const topTest = ts.reduce<Test | null>((m, t) => (measureScore(t) != null && (m == null || measureScore(t)! > measureScore(m)!) ? t : m), null)
                    const topMeasure = topTest?.measure_value ?? null
                    return (
                      <tr key={p.id}>
                        <th scope="row" className="pt-sum__name">
                          <Link to={`/prototypes/${p.id}`} dir="auto">
                            {p.name}
                          </Link>
                        </th>
                        <td>
                          <ProtoStatusTag status={p.status} />
                        </td>
                        <td>{ts.length}</td>
                        <td>{best?.result ? <ResultTag result={best.result} /> : '–'}</td>
                        {measureName && <td>{topMeasure ?? '–'}</td>}
                        <td className="pt-table__note" dir="auto">
                          {p.status_note || '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {groups
            .filter((g) => g.list.length)
            .map((g) => (
              <section key={g.title} className="pt-sum__group">
                <h2 className="section__title">{g.title}</h2>
                <div className="pt-sum__list">
                  {g.list.map((p) => (
                    <SummaryCard key={p.id} p={p} tests={testsOf(p.id)} defs={paramsOf(p, params)} />
                  ))}
                </div>
              </section>
            ))}
        </>
      )}
    </div>
  )
}

function SummaryCard({ p, tests, defs }: { p: Prototype; tests: Test[]; defs: ParamDef[] }) {
  const best = bestTest(tests)
  // The video shown is the best test that has one, which isn't always the best test overall.
  const video = bestTest(tests.filter((t) => t.video_path || t.video_link))
  const shown = best ?? video
  const lines = shown ? keyLines(defs, shown.values, true) : []
  const dates = tests.map((t) => t.at).sort()
  return (
    <article className="pt-sum">
      <div className="pt-sum__media">{video ? <TestVideo test={video} params={defs} /> : <div className="pt-video pt-video--none soft small">No video</div>}</div>
      <div className="pt-sum__body">
        <div className="pt-card__top">
          <Link to={`/prototypes/${p.id}`} className="pt-sum__title" dir="auto">
            {p.name}
          </Link>
          <ProtoStatusTag status={p.status} />
        </div>
        {p.concept && (
          <p className="soft" dir="auto">
            {p.concept}
          </p>
        )}
        {p.status_note && (p.status === 'chosen' || p.status === 'dropped') && (
          <p className={`pt-verdict ${p.status === 'chosen' ? 'pt-verdict--ok' : ''}`} dir="auto">
            {p.status === 'chosen' ? 'Chosen' : 'Dropped'}: {p.status_note}
          </p>
        )}
        {shown ? (
          <>
            <p className="pt-sum__best small">
              <span className="strong">Best: test {shown.n}</span> <ResultTag result={shown.result} />
              {shown.score != null && <span className="tag num">{shown.score}/5</span>}
              {shown.measure_value != null && (
                <span className="tag num">
                  {shown.measure_name || 'Measured'}: {shown.measure_value}
                </span>
              )}
              {video && best && video.id !== best.id && <span className="soft"> · video from test {video.n}</span>}
            </p>
            {lines.length > 0 && <p className="small num">{lines.join(' · ')}</p>}
            {shown.note && (
              <p className="soft small" dir="auto">
                {shown.note}
              </p>
            )}
            <p className="soft small num">
              {tests.length} test{tests.length === 1 ? '' : 's'}
              {dates.length ? `, ${day(dates[0])}${dates.length > 1 && day(dates[0]) !== day(dates[dates.length - 1]) ? ` to ${day(dates[dates.length - 1])}` : ''}` : ''}
            </p>
          </>
        ) : (
          <p className="soft small">Not tested.</p>
        )}
      </div>
    </article>
  )
}
