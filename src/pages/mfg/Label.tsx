import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoadError, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { loadGeometry } from '../../lib/drawing'
import type { Part, Subsystem } from '../../lib/mfg'
import { isoView, projectView } from '../../lib/step/engine'
import { guessRoute } from '../../lib/step/classify.js'
import { supabase } from '../../lib/supabase'

// The right answer for every uploaded part, labelled by hand: a test set for the part classifier
// (PLAN in memory "part-classifier-strategy"). One part at a time, two pictures, tap the machines
// in order. Keys: 1–6 machines, Backspace undo, Enter save, G guess is right, S skip, ← → move.

const STEPS = ['CNC', 'Lathe', 'Mill', '3D print', 'Bend', 'Bought'] as const
type Step = (typeof STEPS)[number]

interface Label {
  part_id: string
  route: Step[]
  note: string
}

type Row = Pick<Part, 'id' | 'sig' | 'name' | 'qty' | 'geometry_path' | 'size' | 'cls' | 'machine' | 'subsystem_id' | 'part_no'>

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Two iso pictures from opposite corners, line art on white. */
async function pictures(path: string): Promise<string[]> {
  const G = await loadGeometry(path)
  return [false, true].map((flip) => {
    const pv = projectView(G, isoView(flip))
    const [x0, y0, x1, y1] = pv.bb
    const side = Math.max(x1 - x0, y1 - y0) * 1.08 || 1
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const k = 100 / side
    const d = (L: [number, number][][]) =>
      L.map((l) => l.map(([x, y], i) => `${i ? 'L' : 'M'}${(50 + (x - cx) * k).toFixed(2)} ${(50 - (y - cy) * k).toFixed(2)}`).join('')).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d(pv.hid)}" fill="none" stroke="#b8b8b8" stroke-width="0.6" stroke-dasharray="1.5 1" vector-effect="non-scaling-stroke"/><path d="${d(pv.vis)}" fill="none" stroke="#111" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`
  })
}

export default function LabelPage() {
  const who = useWho()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const show = (params.get('show') ?? 'todo') as 'todo' | 'all' | 'wrong'
  const [parts, setParts] = useState<Row[]>([])
  const [subs, setSubs] = useState<Map<string, string>>(new Map())
  const [labels, setLabels] = useState<Map<string, Label>>(new Map())
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [at, setAt] = useState<string | null>(null)
  const [route, setRoute] = useState<Step[]>([])
  const [note, setNote] = useState('')
  const [pics, setPics] = useState<string[] | null>(null)
  const [check, setCheck] = useState<{ n: number; right: number; misses: { id: string; name: string; want: string; got: string; why: string }[] } | 'running' | null>(null)

  const load = useCallback(async () => {
    const [p, s, l] = await Promise.all([
      supabase.from('parts').select('id, sig, name, qty, geometry_path, size, cls, machine, subsystem_id, part_no').order('part_no'),
      supabase.from('subsystems').select('id, number, name'),
      supabase.from('part_labels').select('part_id, route, note'),
    ])
    if (p.error || s.error || l.error) setError(true)
    setParts((p.data ?? []) as Row[])
    setSubs(new Map(((s.data ?? []) as Pick<Subsystem, 'id' | 'number' | 'name'>[]).map((x) => [x.id, `${x.number} ${x.name}`])))
    setLabels(new Map(((l.data ?? []) as Label[]).filter((x) => x.part_id).map((x) => [x.part_id, x])))
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const list = useMemo(() => {
    const bySub = [...parts].sort((a, b) => (subs.get(a.subsystem_id) ?? '').localeCompare(subs.get(b.subsystem_id) ?? '', undefined, { numeric: true }) || a.part_no - b.part_no)
    if (show === 'all') return bySub
    if (show === 'wrong') return bySub.filter((p) => { const l = labels.get(p.id); return l && l.route.length && !same(l.route, [p.machine]) })
    return bySub.filter((p) => !labels.has(p.id) || p.id === at)
  }, [parts, subs, labels, show, at])

  const cur = list.find((p) => p.id === at) ?? list[0] ?? null
  const idx = cur ? list.indexOf(cur) : -1

  // Score so far: how often the upload's guess matches the label.
  const score = useMemo(() => {
    let n = 0, route = 0, made = 0
    for (const p of parts) {
      const l = labels.get(p.id)
      if (!l || !l.route.length) continue
      n++
      if (same(l.route, [p.machine])) route++
      if ((l.route[0] === 'Bought') === (p.machine === 'Bought')) made++
    }
    return { n, route, made }
  }, [parts, labels])

  // Moving to a part: load its label (or nothing) and its pictures.
  useEffect(() => {
    if (!cur) return
    const l = labels.get(cur.id)
    setRoute(l?.route ?? [])
    setNote(l?.note ?? '')
    setPics(null)
    if (!cur.geometry_path) return
    let stop = false
    pictures(cur.geometry_path).then((s) => !stop && setPics(s)).catch(() => !stop && setPics([]))
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id])

  const go = useCallback((d: number) => {
    const next = list[idx + d]
    if (next) setAt(next.id)
  }, [list, idx])

  const save = useCallback(async (r: Step[]) => {
    if (!cur) return
    const row = {
      part_id: cur.id, sig: cur.sig, name: cur.name, geometry_path: cur.geometry_path, size: cur.size, cls: cur.cls, guess: cur.machine,
      route: r, note, labeled_by: who?.userId ?? null, labeled_by_name: who?.name ?? null, labeled_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('part_labels').upsert(row, { onConflict: 'part_id' })
    if (error) { toast(`Not saved: ${error.message}`); return }
    setLabels((m) => new Map(m).set(cur.id, { part_id: cur.id, route: r, note }))
    // In "to do" the saved part drops out of the list, so the next one is the one after it.
    const next = list[idx + 1]
    setAt(next?.id ?? null)
  }, [cur, note, who, toast, list, idx])

  const tap = (s: Step) => setRoute((r) => (r.includes(s) ? r.filter((x) => x !== s) : s === 'Bought' ? ['Bought'] : [...r.filter((x) => x !== 'Bought'), s]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const n = Number(e.key)
      if (n >= 1 && n <= STEPS.length) tap(STEPS[n - 1])
      else if (e.key === 'Backspace') setRoute((r) => r.slice(0, -1))
      else if (e.key === 'Enter' && route.length) save(route)
      else if ((e.key === 'g' || e.key === 'G') && cur) save([cur.machine as Step])
      else if (e.key === 's' || e.key === 'S') save([])
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route, save, go, cur])

  // Run today's guesser (classify.js) on every labelled part and compare.
  const runCheck = async () => {
    setCheck('running')
    let n = 0, right = 0
    const misses: { id: string; name: string; want: string; got: string; why: string }[] = []
    for (const p of parts) {
      const l = labels.get(p.id)
      if (!l || !l.route.length) continue
      let G = null
      try {
        G = p.geometry_path ? await loadGeometry(p.geometry_path) : null
      } catch {
        G = null
      }
      const g = guessRoute(G, p.name)
      n++
      if (g.route.join(' → ') === l.route.join(' → ')) right++
      else misses.push({ id: p.id, name: p.name, want: l.route.join(' → '), got: g.route.join(' → '), why: g.why })
    }
    setCheck({ n, right, misses })
  }

  const setShow = (v: string) => { setAt(null); setParams(v === 'todo' ? {} : { show: v }, { replace: true }) }
  const pct = (a: number) => (score.n ? Math.round((100 * a) / score.n) + '%' : '–')
  const done = parts.filter((p) => labels.has(p.id)).length

  return (
    <div className="page label">
      <header className="page__head">
        <h1 className="page__title">Label parts</h1>
        <p className="soft">The right machines for each part, so we can score how well uploads guess.</p>
      </header>

      <div className="label__bar">
        <div className="chips" role="tablist">
          {(['todo', 'all', 'wrong'] as const).map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={show === v} onClick={() => setShow(v)}>
              {v === 'todo' ? 'To do' : v === 'all' ? 'All' : 'Guess was wrong'}
            </button>
          ))}
        </div>
        <span className="soft num">
          {done} of {parts.length} labelled · upload guessed right {pct(score.route)} · made/bought right {pct(score.made)}
        </span>
        <button type="button" className="q-btn q-btn--small" disabled={check === 'running' || !score.n} onClick={runCheck}>
          {check === 'running' ? 'Scoring…' : 'Score the guesser'}
        </button>
      </div>
      {check && check !== 'running' && (
        <div className="label__check">
          <p>
            <b>Guesser today: {Math.round((1000 * check.right) / Math.max(1, check.n)) / 10}% right</b> ({check.right} of {check.n} parts).
            {check.misses.length ? ' Still different from your labels:' : ' Every label matches.'}
          </p>
          {check.misses.length > 0 && (
            <ul>
              {check.misses.map((m) => (
                <li key={m.id}>
                  <button type="button" className="label__miss" onClick={() => { setShow('all'); setAt(m.id) }}>
                    {m.name}
                  </button>{' '}
                  <span className="soft">you said {m.want}, guesser says {m.got} ({m.why})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="label__progress" aria-hidden="true"><span style={{ width: `${parts.length ? (100 * done) / parts.length : 0}%` }} /></div>

      {error && <LoadError onRetry={load} />}
      {!loading && !cur && <p className="empty">{show === 'todo' ? 'Every part is labelled.' : 'Nothing here.'}</p>}

      {cur && (
        <div className="label__grid">
          <div className="label__pics">
            {!cur.geometry_path ? (
              <div className="paper paper--empty soft">No geometry for this part</div>
            ) : !pics ? (
              <><div className="paper label__pic label__pic--wait" /><div className="paper label__pic label__pic--wait" /></>
            ) : pics.length ? (
              pics.map((s, i) => <div key={i} className="paper label__pic" dangerouslySetInnerHTML={{ __html: s }} />)
            ) : (
              <div className="paper paper--empty soft">Couldn't draw this part</div>
            )}
          </div>

          <div className="label__side">
            <p className="soft num">{subs.get(cur.subsystem_id)} · #{cur.part_no} · {idx + 1} of {list.length}</p>
            <h2 className="label__name">{cur.name}</h2>
            <p className="num">
              {cur.size.map((v) => Math.round(v * 10) / 10).join(' × ')} mm · qty {cur.qty}
            </p>
            <p className="soft">
              Upload guessed <b>{cur.machine}</b>{cur.cls ? ` (shape: ${cur.cls})` : ''}
            </p>

            <div className="label__steps">
              {STEPS.map((s, i) => {
                const pos = route.indexOf(s)
                return (
                  <button key={s} type="button" className="label__step" aria-pressed={pos >= 0} onClick={() => tap(s)}>
                    <span className="label__key num">{i + 1}</span>
                    {s}
                    {pos >= 0 && route.length > 1 && <span className="label__order num">{pos + 1}</span>}
                  </button>
                )
              })}
            </div>
            <p className="label__route">{route.length ? route.join(' → ') : <span className="soft">Tap the machines in order</span>}</p>

            <input className="field" placeholder="Note (optional): why, what it is" value={note} onChange={(e) => setNote(e.target.value)} />

            <div className="label__actions">
              <button type="button" className="q-btn q-btn--main q-btn--big" disabled={!route.length} onClick={() => save(route)}>
                Save <kbd>Enter</kbd>
              </button>
              <button type="button" className="q-btn" onClick={() => save([cur.machine as Step])}>
                Guess is right <kbd>G</kbd>
              </button>
              <button type="button" className="q-btn" onClick={() => save([])}>
                Not sure <kbd>S</kbd>
              </button>
            </div>
            <div className="label__nav">
              <button type="button" className="q-btn q-btn--small" disabled={idx <= 0} onClick={() => go(-1)}>← Back</button>
              <button type="button" className="q-btn q-btn--small" disabled={idx >= list.length - 1} onClick={() => go(1)}>Next →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
