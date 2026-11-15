import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ResultTag, Swatch, TestVideo } from '../../components/proto'
import { ago } from '../../lib/mfg'
import { fmtValue, measureScore, resultScore, usePrototype, type Test } from '../../lib/proto'

// Tests of one prototype side by side. Most of the work happens here: a subsystem has two or
// three prototypes, and each of them gets tuned over many tests (compression, wheels, ratio).
// One column per test, one row per parameter, what changed marked, best result in bold, and the
// videos started together.

const MAX = 4

export default function TestCompare() {
  const { id = '' } = useParams()
  const { proto, loading, testsLoading, tests, params } = usePrototype(id)
  const [q, setQ] = useSearchParams()
  const [onlyDiff, setOnlyDiff] = useState(false)

  const byN = useMemo(() => tests.slice().sort((a, b) => a.n - b.n), [tests])
  // ?n=2,5 picks the tests. Without it: the last two, the comparison people want most.
  const asked = (q.get('n') ?? '').split(',').filter(Boolean)
  const cols: Test[] = asked.length
    ? asked.map((n) => byN.find((t) => String(t.n) === n)).filter((t): t is Test => !!t)
    : byN.slice(-2)

  const setNs = (ns: number[]) => {
    const s = new URLSearchParams(q)
    s.set('n', ns.sort((a, b) => a - b).join(','))
    setQ(s, { replace: true })
  }
  const toggle = (t: Test) => {
    const ns = cols.map((c) => c.n)
    if (ns.includes(t.n)) {
      if (ns.length > 2) setNs(ns.filter((n) => n !== t.n))
    } else if (ns.length < MAX) setNs([...ns, t.n])
  }

  const best = (f: (t: Test) => number | null) => {
    const vals = cols.map(f)
    const max = Math.max(...vals.filter((v): v is number => v != null))
    return (i: number) => vals[i] != null && vals[i] === max && vals.filter((v) => v === max).length < cols.length
  }
  const bestResult = best(resultScore)
  const bestScore = best((t) => t.score)
  const bestMeasure = best(measureScore)
  const measureName = cols.find((t) => t.measure_name)?.measure_name

  // Parameters at least one of these tests has a value for.
  const filled = (t: Test, pid: string) => t.values[pid] !== undefined && t.values[pid] !== null && t.values[pid] !== ''
  const rows = params
    .filter((d) => cols.some((t) => filled(t, d.id)))
    .map((d) => {
      const vals = cols.map((t) => (filled(t, d.id) ? fmtValue(d, t.values[d.id]) : '–'))
      // A test without this value isn't a change: only values that are there count.
      return { d, vals, differs: new Set(vals.filter((v) => v !== '–')).size > 1 }
    })
  const shownRows = onlyDiff ? rows.filter((r) => r.differs) : rows
  const empty = cols.filter((t) => !params.some((d) => filled(t, d.id)))

  const playAll = () => {
    const vids = [...document.querySelectorAll<HTMLVideoElement>('.pt-compare__videos video')]
    for (const v of vids) {
      v.currentTime = 0
      v.muted = true
    }
    vids.forEach((v) => v.play().catch(() => {}))
  }

  if (!proto) return <div className="page">{loading ? <p className="soft">Loading</p> : <p className="soft">This prototype doesn't exist anymore.</p>}</div>
  if (testsLoading) return <div className="page"><p className="soft">Loading</p></div>
  if (byN.length < 2)
    return (
      <div className="page">
        <p className="soft">
          Comparing needs two tests. <Link to={`/prototypes/${proto.id}/test`}>Record another test</Link>.
        </p>
      </div>
    )

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Compare tests</h1>
          <p className="soft sub-meta">
            <Link to={`/prototypes/${proto.id}`} dir="auto">
              {proto.name}
            </Link>
          </p>
        </div>
        <button type="button" className="q-btn" onClick={playAll}>
          <Icon name="play" size={18} /> Play together
        </button>
      </div>

      <div className="chips pt-compare__pick" aria-label="Tests to compare">
        {byN.map((t) => {
          const on = cols.some((c) => c.id === t.id)
          return (
            <button key={t.id} type="button" className="chip num" aria-pressed={on} data-on={on || undefined} onClick={() => toggle(t)}>
              {on ? '✓ ' : '+ '}Test {t.n}
            </button>
          )
        })}
      </div>

      <div className="pt-compare pt-compare--tests" style={{ ['--cols' as string]: cols.length }}>
        <div className="pt-compare__videos">
          {cols.map((t) => (
            <div key={t.id} className="pt-compare__col">
              <Link to={`/prototypes/${proto.id}#test-${t.n}`} className="pt-compare__name num">
                Test {t.n}
              </Link>
              {t.video_path || t.video_link ? <TestVideo test={t} params={params} /> : <div className="pt-video pt-video--none soft small">No video</div>}
            </div>
          ))}
        </div>

        {empty.length > 0 && (
          <p className="pt-job small">
            <span>
              {empty.length === cols.length ? 'None of these tests have' : `Test ${empty.map((t) => t.n).join(' and ')} ${empty.length > 1 ? "don't" : "doesn't"} have`} parameters filled in, so there's
              nothing to compare yet.{' '}
              <Link to={`/prototypes/${proto.id}/test/${empty[0].id}`}>Fill in test {empty[0].n}</Link>
            </span>
          </p>
        )}

        <label className="pt-compare__only small">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only what's different
        </label>

        <div className="pt-compare__scroll">
          <table className="pt-table num">
            <thead>
              <tr>
                <th scope="col" />
                {cols.map((t) => (
                  <th key={t.id} scope="col">
                    Test {t.n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Result</th>
                {cols.map((t, i) => (
                  <td key={t.id} data-best={bestResult(i) || undefined}>
                    {t.result ? <ResultTag result={t.result} /> : '–'}
                  </td>
                ))}
              </tr>
              {cols.some((t) => t.score != null) && (
                <tr>
                  <th scope="row">Score</th>
                  {cols.map((t, i) => (
                    <td key={t.id} data-best={bestScore(i) || undefined}>
                      {t.score != null ? `${t.score}/5` : '–'}
                    </td>
                  ))}
                </tr>
              )}
              {cols.some((t) => t.measure_value != null) && (
                <tr>
                  <th scope="row">{measureName || 'Measured'}</th>
                  {cols.map((t, i) => (
                    <td key={t.id} data-best={bestMeasure(i) || undefined}>
                      {t.measure_value ?? '–'}
                    </td>
                  ))}
                </tr>
              )}
              {shownRows.map(({ d, vals, differs }) => (
                <tr key={d.id} data-diff={differs || undefined}>
                  <th scope="row">
                    {d.name}
                    {d.unit && d.kind === 'number' ? <span className="soft"> ({d.unit})</span> : null}
                  </th>
                  {vals.map((v, i) => (
                    <td key={cols[i].id}>
                      {d.kind === 'choice' && v !== '–' && <Swatch option={String(cols[i].values[d.id])} />}
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Note</th>
                {cols.map((t) => (
                  <td key={t.id} className="pt-table__note" dir="auto">
                    {t.note || '–'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">By</th>
                {cols.map((t) => (
                  <td key={t.id} className="soft">
                    {t.by_name} · {ago(t.at)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="soft small">Rows that differ are marked. The best result in each row is in bold. Pick up to {MAX} tests above.</p>
      </div>
    </div>
  )
}
