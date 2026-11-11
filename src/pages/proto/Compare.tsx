import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ProtoStatusTag, ResultTag, TestVideo } from '../../components/proto'
import { Select } from '../../components/Select'
import { bestTest, fmtValue, measureScore, paramsOf, RESULT_WORD, resultScore, subLabel, usePrototypes, useSeasons, type ParamDef, type Prototype, type Test } from '../../lib/proto'
import { supabase } from '../../lib/supabase'

// Two to four prototypes of one subsystem side by side: one row per parameter, differences
// marked, best result marked, and their videos started together.

export default function Compare() {
  const [q, setQ] = useSearchParams()
  const ids = (q.get('ids') ?? '').split(',').filter(Boolean)
  const [season, setSeason] = useState<number | null>(null)
  useEffect(() => {
    if (!ids[0]) return
    supabase
      .from('prototypes')
      .select('season')
      .eq('id', ids[0])
      .maybeSingle()
      .then(({ data }) => setSeason(data?.season ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids[0]])
  const { prototypes, tests, params, loading } = usePrototypes(season)
  const { subsystemsOf } = useSeasons()
  const subs = season ? subsystemsOf(season) : []
  const chosen = ids.map((id) => prototypes.find((p) => p.id === id)).filter((p): p is Prototype => !!p)
  const subNo = chosen[0]?.subsystem_number ?? null
  const pool = prototypes.filter((p) => p.subsystem_number === subNo && tests.some((t) => t.prototype_id === p.id))

  // Which test each column shows, in the URL as t=<protoId>:<n>,…
  const picked = useMemo(() => new Map((q.get('t') ?? '').split(',').filter(Boolean).map((s) => s.split(':') as [string, string])), [q])
  const testsOf = (id: string) => tests.filter((t) => t.prototype_id === id)
  const testFor = (p: Prototype) => {
    const n = picked.get(p.id)
    return (n ? testsOf(p.id).find((t) => String(t.n) === n) : undefined) ?? bestTest(testsOf(p.id))
  }
  const cols = chosen.map((p) => ({ p, t: testFor(p), defs: paramsOf(p, params) }))

  const setIds = (next: string[]) => {
    const n = new URLSearchParams(q)
    n.set('ids', next.join(','))
    setQ(n, { replace: true })
  }
  const pickTest = (pid: string, n: string) => {
    picked.set(pid, n)
    const s = new URLSearchParams(q)
    s.set('t', [...picked].map(([a, b]) => `${a}:${b}`).join(','))
    setQ(s, { replace: true })
  }

  // One row per parameter name, so a prototype's own "Gap" lines up with another's.
  const rows = useMemo(() => {
    const byName = new Map<string, ParamDef[]>()
    for (const c of cols) for (const d of c.defs) byName.set(d.name.toLowerCase(), [...(byName.get(d.name.toLowerCase()) ?? []), d])
    return [...byName.values()].map((defs) => defs[0])
  }, [cols])
  const valueOf = (c: (typeof cols)[number], name: string) => {
    const d = c.defs.find((x) => x.name.toLowerCase() === name.toLowerCase())
    return d && c.t ? fmtValue(d, c.t.values[d.id]) : '–'
  }
  const best = (f: (t: Test) => number | null) => {
    const vals = cols.map((c) => (c.t ? f(c.t) : null))
    const max = Math.max(...vals.filter((v): v is number => v != null))
    return (i: number) => vals[i] != null && vals[i] === max && vals.filter((v) => v === max).length < cols.length
  }
  const bestResult = best(resultScore)
  const bestScore = best((t) => t.score)
  // Lower is better for times (cycle time), higher for counts (balls in out of 10).
  const bestMeasure = best(measureScore)
  const measureName = cols.find((c) => c.t?.measure_name)?.t?.measure_name

  const playAll = () => {
    const vids = [...document.querySelectorAll<HTMLVideoElement>('.pt-compare__videos video')]
    for (const v of vids) {
      v.currentTime = 0
      v.muted = true
    }
    vids.forEach((v) => v.play().catch(() => {}))
  }

  if (!ids.length) return <div className="page"><p className="soft">Pick prototypes to compare from the Prototypes list.</p></div>
  if (loading || season == null) return <div className="page"><p className="soft">Loading</p></div>

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Compare</h1>
          <p className="soft sub-meta">{subLabel(subNo, subs)}</p>
        </div>
        <button type="button" className="q-btn" onClick={playAll}>
          <Icon name="play" size={18} /> Play together
        </button>
      </div>

      {pool.length > chosen.length || chosen.length > 2 ? (
        <div className="chips pt-compare__pick">
          {pool.map((p) => {
            const on = ids.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={on}
                data-on={on || undefined}
                onClick={() => (on ? ids.length > 2 && setIds(ids.filter((x) => x !== p.id)) : ids.length < 4 && setIds([...ids, p.id]))}
              >
                {on ? '✓ ' : '+ '}
                {p.name}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="pt-compare" style={{ ['--cols' as string]: cols.length }}>
        <div className="pt-compare__videos">
          {cols.map(({ p, t, defs }) => (
            <div key={p.id} className="pt-compare__col">
              <Link to={`/prototypes/${p.id}`} className="pt-compare__name" dir="auto">
                {p.name}
              </Link>
              {t && (t.video_path || t.video_link) ? <TestVideo test={t} params={defs} /> : <div className="pt-video pt-video--none soft small">No video</div>}
            </div>
          ))}
        </div>

        <div className="pt-compare__scroll">
          <table className="pt-table num">
            <thead>
              <tr>
                <th scope="col" />
                {cols.map(({ p }) => (
                  <th key={p.id} scope="col" dir="auto">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Status</th>
                {cols.map(({ p }) => (
                  <td key={p.id}>
                    <ProtoStatusTag status={p.status} />
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Test</th>
                {cols.map(({ p, t }) => (
                  <td key={p.id}>
                    {t ? (
                      <Select
                        className="field--inline"
                        value={String(t.n)}
                        onChange={(v) => pickTest(p.id, v)}
                        options={testsOf(p.id)
                          .sort((a, b) => b.n - a.n)
                          .map((x) => ({ value: String(x.n), label: `Test ${x.n}${x.result ? `, ${RESULT_WORD[x.result].toLowerCase()}` : ''}` }))}
                      />
                    ) : (
                      '–'
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Result</th>
                {cols.map(({ p, t }, i) => (
                  <td key={p.id} data-best={bestResult(i) || undefined}>
                    {t?.result ? <ResultTag result={t.result} /> : '–'}
                  </td>
                ))}
              </tr>
              {cols.some((c) => c.t?.score != null) && (
                <tr>
                  <th scope="row">Score</th>
                  {cols.map(({ p, t }, i) => (
                    <td key={p.id} data-best={bestScore(i) || undefined}>
                      {t?.score != null ? `${t.score}/5` : '–'}
                    </td>
                  ))}
                </tr>
              )}
              {cols.some((c) => c.t?.measure_value != null) && (
                <tr>
                  <th scope="row">{measureName || 'Measured'}</th>
                  {cols.map(({ p, t }, i) => (
                    <td key={p.id} data-best={bestMeasure(i) || undefined}>
                      {t?.measure_value ?? '–'}
                    </td>
                  ))}
                </tr>
              )}
              {rows.map((d) => {
                const vals = cols.map((c) => valueOf(c, d.name))
                const differs = new Set(vals).size > 1
                return (
                  <tr key={d.name} data-diff={differs || undefined}>
                    <th scope="row">{d.name}</th>
                    {vals.map((v, i) => (
                      <td key={cols[i].p.id}>{v}</td>
                    ))}
                  </tr>
                )
              })}
              <tr>
                <th scope="row">Note</th>
                {cols.map(({ p, t }) => (
                  <td key={p.id} className="pt-table__note" dir="auto">
                    {t?.note || '–'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="soft small">Rows that differ are marked. The best result in each row is in bold. Each column shows its best test unless you pick another.</p>
      </div>
    </div>
  )
}
