import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { guidePdf, loadChunk, resToSvg } from '../../lib/guide'
import { ago, fileSafe, saveFile } from '../../lib/mfg'
import type { Analysis } from '../../lib/step/worker'
import { supabase } from '../../lib/supabase'
import { useAnalysis } from '../../lib/useAnalysis'

// Step by step build order from the assembly: one step for each pair of parts that go together.
// Ticks are shared, so the whole build crew sees how far it is.

export default function Guide() {
  const { id = '' } = useParams()
  const { sub, robot, analysis, path, file, state } = useAnalysis(id)
  const who = useWho()
  const toast = useToast()
  const [done, setDone] = useState<Map<string, string | null>>(new Map())
  const [pdf, setPdf] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      supabase
        .from('guide_progress')
        .select('step_key, done_by_name')
        .eq('subsystem_id', id)
        .then(({ data }) => setDone(new Map((data ?? []).map((r) => [r.step_key as string, r.done_by_name as string | null]))))
    load()
    const channel = supabase
      .channel(`guide-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guide_progress', filter: `subsystem_id=eq.${id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  if (!sub || !robot || state === 'loading') return <div className="page">{<p className="soft">Loading</p>}</div>

  const title = `${sub.number} ${sub.name}`
  const toggle = async (key: string) => {
    if (!who) return
    const was = done.has(key)
    setDone((m) => {
      const n = new Map(m)
      if (was) n.delete(key)
      else n.set(key, who.name)
      return n
    })
    const { error } = was
      ? await supabase.from('guide_progress').delete().eq('subsystem_id', id).eq('step_key', key)
      : await supabase.from('guide_progress').upsert({ subsystem_id: id, step_key: key, done_by_name: who.name, done_at: new Date().toISOString() })
    if (error) toast(error.message)
  }

  const makePdf = async (a: Analysis) => {
    if (pdf || !path) return
    setPdf('Starting')
    try {
      const bytes = await guidePdf(a, path, `${title}, ${robot.name}`, new Set(done.keys()), setPdf)
      saveFile(`${fileSafe(`${robot.name} ${title} assembly guide`)}.pdf`, bytes, 'application/pdf')
    } catch (e) {
      toast(`Couldn't make the PDF: ${e instanceof Error ? e.message : e}`)
    }
    setPdf(null)
  }

  const steps = analysis?.steps ?? []
  const phases: { name: string; n: number; first: number }[] = []
  steps.forEach((st, i) => {
    const p = phases.find((x) => x.name === st.phase)
    if (p) p.n++
    else phases.push({ name: st.phase, n: 1, first: i })
  })
  const count = steps.filter((s) => done.has(s.key)).length

  return (
    <div className="page guide">
      <div className="page__head">
        <div>
          <h1 className="page__title">Assembly guide</h1>
          <p className="soft sub-meta">
            <Link to={`/manufacturing/s/${sub.id}`}>{title}</Link> · {robot.name}
            {analysis ? ` · ${count} of ${steps.length} steps done` : ''}
            {file ? ` · from ${file.name}, ${ago(file.at)}` : ''}
          </p>
        </div>
        <div className="page__actions">
          <Link to={`/manufacturing/s/${sub.id}/bolts`} className="q-btn">
            Bolts
          </Link>
          {analysis && (
            <button type="button" className="q-btn" onClick={() => makePdf(analysis)}>
              <Icon name="download" size={18} /> {pdf ?? 'PDF'}
            </button>
          )}
        </div>
      </div>

      {state !== 'ready' || !analysis || !path ? (
        <div className="mfg-help">
          <p>
            {state === 'error'
              ? "The guide couldn't be loaded. Drop the assembly STEP again on the subsystem page."
              : 'No guide yet. It needs the whole assembly as one STEP file, which has every part in its place.'}
          </p>
        </div>
      ) : (
        <>
          {file && !file.latest && <p className="mfg-note mfg-note--warn">This is from an older upload. The latest one was separate part files, which have no positions.</p>}
          <div className="guide__top">
            <section className="guide__box">
              <h2 className="guide__h">Tools</h2>
              <ul className="guide__tools">
                {analysis.tools.length ? analysis.tools.map((t) => <li key={t}>{t}</li>) : <li className="soft">Hands only</li>}
              </ul>
            </section>
            <section className="guide__box">
              <h2 className="guide__h">Order</h2>
              <ol className="guide__phases">
                {phases.map((p) => (
                  <li key={p.name}>
                    <button type="button" className="text-btn" onClick={() => document.getElementById(`step-${p.first}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      {p.name}
                    </button>{' '}
                    <span className="soft small num">
                      {p.n} {p.n === 1 ? 'step' : 'steps'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <p className="soft small">Grey is already built, orange is this step's part, the blue arrow shows where it goes and blue dots are bolt holes.</p>

          <ol className="guide__steps">
            {steps.map((st, i) => (
              <li key={st.key} id={`step-${i}`} className="gstep-wrap">
                {(i === 0 || steps[i - 1].phase !== st.phase) && <h2 className="section__title guide__phase">{st.phase}</h2>}
                <article className="gstep" data-done={done.has(st.key) || undefined}>
                  <label className="gstep__head">
                    <input type="checkbox" className="gstep__check" checked={done.has(st.key)} onChange={() => toggle(st.key)} aria-label={`Step ${i + 1} done`} />
                    <span className="gstep__no num">{i + 1}</span>
                    <span className="gstep__title">{st.title}</span>
                  </label>
                  <div className="gstep__body">
                    <p className="gstep__text">{st.text}</p>
                    {st.tools.length > 0 && (
                      <p className="gstep__tools">
                        {st.tools.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </p>
                    )}
                    {done.get(st.key) && <p className="soft small">Done by {done.get(st.key)}</p>}
                    <StepPic path={path} index={i} a={analysis} />
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

/** Loads its chunk of pictures when it scrolls near the screen. */
function StepPic({ path, index, a }: { path: string; index: number; a: Analysis }) {
  const ref = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let stop = false
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return
        io.disconnect()
        loadChunk(path, Math.floor(index / a.chunk))
          .then((c) => {
            const res = c[index % a.chunk]
            if (!stop && res) setSvg(resToSvg(res, a.W, a.H))
          })
          .catch(() => !stop && setSvg(''))
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => {
      stop = true
      io.disconnect()
    }
  }, [path, index, a])
  return (
    <div ref={ref} className="gstep__pic" style={{ aspectRatio: `${a.W} / ${a.H}` }}>
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : svg === '' ? <span className="soft small">Picture didn't load</span> : null}
    </div>
  )
}
