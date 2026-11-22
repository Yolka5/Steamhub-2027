import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadError, useToast } from '../../components/ui'
import { useAuth, useWho } from '../../lib/auth'
import { writeDrawingNotes } from '../../lib/claude'
import { ENGINE_VERSION, loadGeometry } from '../../lib/drawing'
import { guessRoute } from '../../lib/step/classify.js'
import { classifyPart } from '../../lib/step/engine'
import { supabase } from '../../lib/supabase'
import {
  canDrawExample,
  checkExamples,
  exampleDrawing,
  fixesFor,
  isoPictures,
  removeUpload,
  savedDrawing,
  saveReview,
  SHAPES,
  STEPS,
  trainingUpload,
  type Example,
  type Lesson,
  type Mark,
  type Review,
  type Step,
  type Upload,
  type Verdict,
} from '../../lib/training'

// Drawing training (DRAWING_TRAINING.md). Admin only. Upload STEP assemblies that never reach the
// workshop, correct each drawing, and teach Claude's upload check. Keys on Review: ← → move,
// G looks right, Enter save, S skip.

type Tab = 'upload' | 'review' | 'notes' | 'engine'
type Drawn = { svg: string; cls: string; template: string; scale: number }

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const sameList = (a: string[] | null | undefined, b: string[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i])
const inField = (e: KeyboardEvent) => e.target instanceof Element && !!e.target.closest('input, textarea, select')

export default function DrawingsPage() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'review') as Tab
  const [uploads, setUploads] = useState<Upload[]>([])
  const [examples, setExamples] = useState<Example[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [u, e, r, l] = await Promise.all([
      supabase.from('drawing_uploads').select('*').order('at', { ascending: false }),
      supabase.from('drawing_examples').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('drawing_reviews').select('*').order('at', { ascending: false }).limit(10000),
      supabase.from('drawing_lessons').select('*').order('created_at', { ascending: false }),
    ])
    setError(!!(u.error || e.error || r.error || l.error))
    setUploads((u.data ?? []) as Upload[])
    setExamples((e.data ?? []) as Example[])
    setReviews((r.data ?? []) as Review[])
    setLessons((l.data ?? []) as Lesson[])
    setLoading(false)
  }, [])
  useEffect(() => {
    if (isAdmin) load()
  }, [load, isAdmin])

  if (!isAdmin) return <div className="page page--narrow"><p className="soft">This page is for the admin.</p></div>

  const todo = examples.filter((e) => e.status === 'todo').length
  const recheck = recheckList(examples, reviews).length
  const setTab = (t: Tab) => setParams(t === 'review' ? {} : { tab: t }, { replace: true })

  return (
    <div className="page dtrain">
      <header className="page__head dtrain__head">
        <div>
          <h1 className="page__title">Drawing training</h1>
          <p className="soft">Correct what the engine draws, and teach Claude's upload check. Nothing here reaches the workshop.</p>
        </div>
        <Link className="q-btn q-btn--small" to="/manufacturing/label">Label parts</Link>
      </header>
      <div className="picks picks--seg picks--wrap dtrain__tabs" role="tablist">
        {([
          ['upload', 'Upload'],
          ['review', `Review${todo ? ` · ${todo} left` : ''}`],
          ['notes', "Claude's notes"],
          ['engine', `Engine updates${recheck ? ` · ${recheck}` : ''}`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" className="pick" aria-selected={tab === t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {error && <LoadError onRetry={load} />}
      {loading ? null : tab === 'upload' ? (
        <UploadTab uploads={uploads} examples={examples} reload={load} toReview={() => setTab('review')} />
      ) : tab === 'notes' ? (
        <NotesTab lessons={lessons} reviews={reviews} reload={load} />
      ) : tab === 'engine' ? (
        <EngineTab examples={examples} reviews={reviews} reload={load} />
      ) : (
        <ReviewTab examples={examples} reviews={reviews} uploads={uploads} reload={load} />
      )}
    </div>
  )
}

// ======================= Upload =======================

function UploadTab({ uploads, examples, reload, toReview }: { uploads: Upload[]; examples: Example[]; reload: () => Promise<void>; toReview: () => void }) {
  const who = useWho()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [test, setTest] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const go = async (files: File[]) => {
    if (!who || busy) return
    setBusy('Reading the STEP file')
    const res = await trainingUpload(files, who, test, setBusy)
    if (res.error && !res.upload) {
      setBusy(null)
      toast(res.error)
      return
    }
    await reload()
    if (res.added.length) {
      const r = await checkExamples(res.added, (d, t) => setBusy(`Claude is checking the drawings ${d}/${t}`))
      if (r.error) toast(r.error)
    }
    setBusy(null)
    await reload()
    toast(`${res.added.length} new ${res.added.length === 1 ? 'part' : 'parts'}${res.upload?.repeats ? `, ${res.upload.repeats} already in the set` : ''}.`)
  }

  const byUpload = useMemo(() => {
    const m = new Map<string, Example[]>()
    for (const e of examples) m.set(e.upload_id, [...(m.get(e.upload_id) ?? []), e])
    return m
  }, [examples])

  const recheckClaude = async (list: Example[]) => {
    setBusy('Claude is checking')
    const r = await checkExamples(list, (d, t) => setBusy(`Claude is checking the drawings ${d}/${t}`))
    setBusy(null)
    if (r.error) toast(r.error)
    await reload()
  }

  return (
    <>
      <label
        className={`dtrain__drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); go([...e.dataTransfer.files]) }}
      >
        <input ref={input} type="file" accept=".step,.stp" multiple hidden onChange={(e) => { go([...(e.target.files ?? [])]); e.target.value = '' }} />
        <span className="dtrain__drop-big">{busy ?? 'Drop STEP assemblies here'}</span>
        <span className="soft">{busy ? 'Keep this tab open.' : 'Split into parts like a real upload. Claude checks each drawing, about $0.015 a part.'}</span>
        {!busy && <span className="q-btn q-btn--small">Choose files</span>}
      </label>
      <label className="check dtrain__test">
        <input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Test upload (removed after testing)
      </label>

      {!uploads.length && <p className="empty">No training uploads yet.</p>}
      {uploads.map((u) => {
        const list = byUpload.get(u.id) ?? []
        const n = (s: Example['status']) => list.filter((e) => e.status === s).length
        const unchecked = list.filter((e) => canDrawExample(e) && !e.claude_at)
        return (
          <section key={u.id} className="dtrain__batch">
            <div className="dtrain__batch-head">
              <b>{u.filename}</b>
              <span className="soft">{fmtDate(u.at)} · {u.uploaded_by_name}</span>
              {u.test && <span className="tag">Test</span>}
              <span className="dtrain__sp" />
              <button
                type="button"
                className="q-btn q-btn--small"
                onClick={async () => {
                  if (!confirm(`Remove ${u.filename} and its ${list.length} parts and reviews from the training set?`)) return
                  const err = await removeUpload(u.id)
                  if (err) toast(err)
                  await reload()
                }}
              >
                Remove
              </button>
            </div>
            <p className="soft num">
              {u.parts} parts · {u.drawn} drawings · {u.bought} bought · {u.repeats} already had · to review {n('todo')} · corrected {n('corrected')} · looks right {n('right')}
            </p>
            {unchecked.length > 0 && !busy && (
              <button type="button" className="q-btn q-btn--small" onClick={() => recheckClaude(unchecked)}>
                Claude hasn't checked {unchecked.length}. Check them
              </button>
            )}
          </section>
        )
      })}
      {examples.some((e) => e.status === 'todo') && (
        <button type="button" className="q-btn q-btn--main" onClick={toReview}>Review the drawings</button>
      )}
    </>
  )
}

// ======================= Review =======================

const FILTERS = [
  ['todo', 'To review'],
  ['all', 'All'],
  ['corrected', 'Corrected'],
  ['right', 'Looks right'],
  ['bought', 'Bought'],
] as const
type Filter = (typeof FILTERS)[number][0]

function ReviewTab({ examples, reviews, uploads, reload }: { examples: Example[]; reviews: Review[]; uploads: Upload[]; reload: () => Promise<void> }) {
  const who = useWho()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('todo')
  const [at, setAt] = useState<string | null>(null)
  const upName = useMemo(() => new Map(uploads.map((u) => [u.id, u.filename])), [uploads])
  const mine = useMemo(() => new Map(reviews.filter((r) => r.engine_version === ENGINE_VERSION).map((r) => [r.example_id, r])), [reviews])

  const list = useMemo(() => {
    const all = [...examples].sort((a, b) => b.created_at.localeCompare(a.created_at) || Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name))
    if (filter === 'all') return all
    if (filter === 'bought') return all.filter((e) => !e.custom)
    return all.filter((e) => e.status === filter || e.id === at)
  }, [examples, filter, at])
  const cur = list.find((e) => e.id === at) ?? list[0] ?? null
  const idx = cur ? list.indexOf(cur) : -1
  const go = useCallback((d: number) => { const n = list[idx + d]; if (n) setAt(n.id) }, [list, idx])
  const afterSave = useCallback(async () => {
    const next = list[idx + 1]
    await reload()
    setAt(next?.id ?? null)
  }, [list, idx, reload])

  return (
    <>
      <div className="dtrain__bar">
        <div className="chips">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => { setAt(null); setFilter(f) }}>
              {label} <span className="num soft">{f === 'all' ? examples.length : f === 'bought' ? examples.filter((e) => !e.custom).length : examples.filter((e) => e.status === f).length}</span>
            </button>
          ))}
        </div>
        {cur && <span className="soft num">{idx + 1} of {list.length}</span>}
      </div>
      {!cur ? (
        <p className="empty">{filter === 'todo' ? 'Every drawing is reviewed. Drop more STEP files on Upload.' : 'Nothing here.'}</p>
      ) : (
        <ReviewOne key={cur.id} e={cur} from={upName.get(cur.upload_id) ?? ''} prev={mine.get(cur.id)} who={who} go={go} saved={afterSave} toast={toast} canBack={idx > 0} canNext={idx < list.length - 1} />
      )}
    </>
  )
}

interface OneProps {
  e: Example
  from: string
  prev?: Review
  who: ReturnType<typeof useWho>
  go: (d: number) => void
  saved: () => Promise<void>
  toast: (s: string) => void
  canBack: boolean
  canNext: boolean
}

function ReviewOne({ e, from, prev, who, go, saved, toast, canBack, canNext }: OneProps) {
  const [drawn, setDrawn] = useState<Drawn | null | 'error'>(null)
  const [pics, setPics] = useState<string[] | null>(null)
  const [made, setMade] = useState<'made' | 'bought'>(prev?.made ?? (e.custom ? 'made' : 'bought'))
  const [route, setRoute] = useState<string[]>(prev?.route ?? e.route)
  const [material, setMaterial] = useState(prev?.material ?? e.material)
  const [cls, setCls] = useState<string | null>(prev?.cls ?? e.cls)
  const [fixes, setFixes] = useState<string[]>(prev?.fixes ?? [])
  const [marks, setMarks] = useState<Mark[]>(prev?.marks ?? [])
  const [open, setOpen] = useState<number | null>(null)
  const [note, setNote] = useState(prev?.note ?? '')
  const findings = useMemo(() => e.claude_findings ?? [], [e.claude_findings])
  const [cm, setCm] = useState<Record<string, boolean>>(() => Object.fromEntries((prev?.claude_marks ?? []).map((m) => [m.text, m.right])))
  const [saving, setSaving] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    let stop = false
    if (canDrawExample(e)) exampleDrawing(e).then((d) => !stop && setDrawn(d)).catch(() => !stop && setDrawn('error'))
    else if (e.geometry_path) isoPictures(e.geometry_path).then((p) => !stop && setPics(p)).catch(() => !stop && setPics([]))
    return () => { stop = true }
  }, [e])

  // ----- marks -----
  const frac = (ev: RPointerEvent) => {
    const r = sheet.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) }
  }
  const down = (ev: RPointerEvent) => {
    if ((ev.target as HTMLElement).closest('.dtrain__pop, .dtrain__pin, .dtrain__box b')) return
    start.current = frac(ev)
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
  }
  const move = (ev: RPointerEvent) => {
    if (!start.current) return
    const p = frac(ev)
    const s = start.current
    setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = (ev: RPointerEvent) => {
    if (!start.current) return
    const p = frac(ev)
    const s = start.current
    start.current = null
    setDrag(null)
    const n = Math.max(0, ...marks.map((m) => m.n)) + 1
    const big = Math.abs(p.x - s.x) > 0.02 || Math.abs(p.y - s.y) > 0.02
    const m: Mark = big ? { n, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y), note: '' } : { n, x: p.x, y: p.y, note: '' }
    setMarks((l) => [...l, m])
    setOpen(n)
  }
  const editMark = (n: number, patch: Partial<Mark>) => setMarks((l) => l.map((m) => (m.n === n ? { ...m, ...patch } : m)))
  const dropMark = (n: number) => { setMarks((l) => l.filter((m) => m.n !== n)); setOpen(null) }

  // ----- engine picks -----
  const tapStep = (s: Step) => setRoute((r) => (r.includes(s) ? r.filter((x) => x !== s) : s === 'Bought' ? ['Bought'] : [...r.filter((x) => x !== 'Bought'), s]))
  const setMadeTo = (m: 'made' | 'bought') => {
    setMade(m)
    if (m === 'bought') setRoute(['Bought'])
    else if (route[0] === 'Bought') setRoute(e.custom ? e.route : [])
  }
  const toggleFix = (f: string) => setFixes((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]))

  const engineMade = e.custom ? 'made' : 'bought'
  const corrected = {
    made: made !== engineMade ? made : null,
    route: !sameList(route, e.route) && route.length ? route : null,
    material: material.trim() !== e.material ? material.trim() : null,
    cls: cls !== e.cls ? cls : null,
  }
  const anything = fixes.length > 0 || marks.length > 0 || note.trim() !== '' || Object.values(corrected).some((v) => v !== null)

  const save = useCallback(async (verdict: Verdict) => {
    if (saving) return
    setSaving(true)
    const keepAll = verdict === 'corrected'
    const err = await saveReview(e, {
      example_id: e.id,
      verdict,
      fixes: keepAll ? fixes : [],
      marks: keepAll ? marks.filter((m) => m.note.trim() || m.fix) : [],
      made: keepAll ? corrected.made : null,
      route: keepAll ? corrected.route : null,
      material: keepAll ? corrected.material : null,
      cls: keepAll ? corrected.cls : null,
      claude_marks: findings.filter((f) => f.text in cm).map((f) => ({ text: f.text, kind: f.kind, right: cm[f.text] })),
      note: keepAll ? note.trim() : '',
    }, drawn && drawn !== 'error' ? drawn : null, who)
    setSaving(false)
    if (err) { toast(`Not saved: ${err}`); return }
    await saved()
  }, [saving, e, fixes, marks, corrected.made, corrected.route, corrected.material, corrected.cls, findings, cm, note, drawn, who, toast, saved])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (inField(ev) || open !== null) return
      if (ev.key === 'ArrowLeft') go(-1)
      else if (ev.key === 'ArrowRight') go(1)
      else if (ev.key === 'g' || ev.key === 'G') save('right')
      else if (ev.key === 's' || ev.key === 'S') save('skipped')
      else if (ev.key === 'Enter') save(anything ? 'corrected' : 'right')
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, save, anything, open])

  const openMark = marks.find((m) => m.n === open)
  const fixGroups = fixesFor(e.machine)

  return (
    <div className="dtrain__grid">
      <div className="dtrain__main">
        <p className="dtrain__meta">
          <b>{e.name}</b> <span className="soft num">· {from} · ×{e.qty} · {e.size.map((v) => Math.round(v)).join(' × ')} mm</span>
          {prev && <span className="tag">{prev.verdict === 'right' ? 'Looks right' : prev.verdict === 'skipped' ? 'Skipped' : 'Corrected'}</span>}
        </p>
        {canDrawExample(e) ? (
          drawn === null ? (
            <div className="paper paper--empty soft">Drawing…</div>
          ) : drawn === 'error' ? (
            <div className="paper paper--empty soft">The engine couldn't draw this part. That's worth a note.</div>
          ) : (
            <div ref={sheet} className="paper dtrain__sheet" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              <div dangerouslySetInnerHTML={{ __html: drawn.svg }} />
              {marks.map((m) =>
                m.w != null ? (
                  <span key={m.n} className="dtrain__box" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${(m.h ?? 0) * 100}%` }}>
                    <b onPointerDown={(ev) => { ev.stopPropagation(); setOpen(m.n) }}>{m.n}</b>
                  </span>
                ) : (
                  <span key={m.n} className="dtrain__pin" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }} onPointerDown={(ev) => { ev.stopPropagation(); setOpen(m.n) }}>
                    <b>{m.n}</b>
                  </span>
                ),
              )}
              {drag && <span className="dtrain__box is-drag" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.w * 100}%`, height: `${drag.h * 100}%` }} />}
              {openMark && (
                <div className="dtrain__pop" style={{ left: `${Math.min(openMark.x, 0.7) * 100}%`, top: `${Math.min(openMark.y + (openMark.h ?? 0), 0.8) * 100}%` }} onPointerDown={(ev) => ev.stopPropagation()}>
                  <textarea
                    className="field"
                    autoFocus
                    rows={2}
                    placeholder="What's wrong here?"
                    value={openMark.note}
                    onChange={(ev) => editMark(openMark.n, { note: ev.target.value })}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); setOpen(null) }
                      if (ev.key === 'Escape') { if (!openMark.note.trim()) dropMark(openMark.n); else setOpen(null) }
                    }}
                  />
                  <select className="field" value={openMark.fix ?? ''} onChange={(ev) => {
                    const f = ev.target.value || undefined
                    editMark(openMark.n, { fix: f })
                    if (f && !fixes.includes(f)) setFixes((l) => [...l, f])
                  }}>
                    <option value="">No fix chip</option>
                    {fixGroups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map((x) => <option key={x}>{x}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div className="dtrain__pop-row">
                    <button type="button" className="q-btn q-btn--small" onClick={() => dropMark(openMark.n)}>Delete</button>
                    <button type="button" className="q-btn q-btn--small q-btn--main" onClick={() => setOpen(null)}>Done</button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="dtrain__pics">
            {!e.geometry_path ? (
              <div className="paper paper--empty soft">Bought part, no drawing and no geometry kept. Check the made/bought call by its name.</div>
            ) : !pics ? (
              <div className="paper paper--empty soft">Drawing…</div>
            ) : (
              pics.map((s, i) => <div key={i} className="paper dtrain__pic" dangerouslySetInnerHTML={{ __html: s }} />)
            )}
          </div>
        )}
        <div className="dtrain__keys soft">
          <span><kbd>←</kbd> <kbd>→</kbd> move</span>
          <span><kbd>G</kbd> looks right</span>
          <span><kbd>Enter</kbd> save</span>
          <span><kbd>S</kbd> skip</span>
          {canDrawExample(e) && <span>tap = pin · drag = box</span>}
        </div>
        <div className="dtrain__actions">
          <button type="button" className="q-btn q-btn--small" disabled={!canBack} onClick={() => go(-1)}>← Back</button>
          <button type="button" className="q-btn q-btn--small" disabled={!canNext} onClick={() => go(1)}>Next →</button>
          <span className="dtrain__sp" />
          <button type="button" className="q-btn" disabled={saving} onClick={() => save('skipped')}>Skip <kbd>S</kbd></button>
          <button type="button" className="q-btn" disabled={saving} onClick={() => save('right')}>Looks right <kbd>G</kbd></button>
          <button type="button" className="q-btn q-btn--main" disabled={saving || !anything} onClick={() => save('corrected')}>Save corrections <kbd>Enter</kbd></button>
        </div>
      </div>

      <div className="dtrain__side">
        <section className="dtrain__card">
          <h2 className="dtrain__h">What the engine picked</h2>
          <div className="dtrain__pick">
            <span className="soft">Made / bought</span>
            <div className="picks picks--seg" role="radiogroup">
              {(['made', 'bought'] as const).map((m) => (
                <button key={m} type="button" role="radio" className="pick" aria-checked={made === m} onClick={() => setMadeTo(m)}>
                  {m === 'made' ? 'Made' : 'Bought'}{engineMade === m && made !== m ? ' (engine)' : ''}
                </button>
              ))}
            </div>
            {made === 'made' && (
              <>
                <span className="soft">Route</span>
                <div>
                  <div className="chips">
                    {STEPS.filter((s) => s !== 'Bought').map((s) => {
                      const pos = route.indexOf(s)
                      return (
                        <button key={s} type="button" className="chip" aria-pressed={pos >= 0} onClick={() => tapStep(s)}>
                          {s}{pos >= 0 && route.length > 1 ? <span className="num"> {pos + 1}</span> : null}
                        </button>
                      )
                    })}
                  </div>
                  {!sameList(route, e.route) && <p className="dtrain__was">engine: {e.route.join(' → ')}</p>}
                </div>
                <span className="soft">Material</span>
                <div>
                  <input className="field" value={material} list="dtrain-materials" onChange={(ev) => setMaterial(ev.target.value)} />
                  {material.trim() !== e.material && <p className="dtrain__was">engine: {e.material || 'none'}</p>}
                </div>
                <span className="soft">Shape</span>
                <div>
                  <div className="chips">
                    {SHAPES.map((s) => (
                      <button key={s} type="button" className="chip" aria-pressed={cls === s} onClick={() => setCls(s)}>{s}</button>
                    ))}
                  </div>
                  {cls !== e.cls && <p className="dtrain__was">engine: {e.cls ?? 'none'}</p>}
                </div>
              </>
            )}
          </div>
          {e.why && <p className="dtrain__was">Engine said: {e.why}</p>}
          <datalist id="dtrain-materials">
            {['Aluminum 6061 · 3 mm', 'Aluminum 6061 · 5 mm', 'Aluminum 6061 · 6.35 mm', 'Aluminum block', 'Aluminum round', 'Aluminum hex 1/2"', 'Steel hex 1/2"', 'Aluminum box tube 1×2', 'Polycarb · 3 mm', 'PLA', 'PA-CF', 'TPU'].map((m) => <option key={m} value={m} />)}
          </datalist>
        </section>

        {canDrawExample(e) && (
          <section className="dtrain__card">
            <h2 className="dtrain__h">Fixes</h2>
            {fixGroups.map((g) => (
              <div key={g.group} className="dtrain__grp">
                <span className="soft">{g.group}</span>
                <div className="chips">
                  {g.items.map((f) => (
                    <button key={f} type="button" className="chip" aria-pressed={fixes.includes(f)} onClick={() => toggleFix(f)}>{f}</button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {marks.length > 0 && (
          <section className="dtrain__card">
            <h2 className="dtrain__h">Marks</h2>
            {marks.map((m) => (
              <button key={m.n} type="button" className="dtrain__mark" onClick={() => setOpen(m.n)}>
                <span className="dtrain__dot">{m.n}</span>
                <span>{m.note || <span className="soft">No note yet</span>}{m.fix && <span className="soft"> · {m.fix}</span>}</span>
              </button>
            ))}
          </section>
        )}

        {canDrawExample(e) && (
          <section className="dtrain__card">
            <h2 className="dtrain__h">Claude's check · was it right?</h2>
            {!e.claude_at ? (
              <p className="soft">Not checked yet. Upload has a button for that.</p>
            ) : !findings.length ? (
              <p className="soft">Claude found nothing. If it missed something, a mark or fix teaches it.</p>
            ) : (
              findings.map((f) => (
                <div key={f.text} className="dtrain__find">
                  <span className="dtrain__kind">{f.kind}</span>
                  <p>{f.text}</p>
                  <div className="picks picks--seg" role="radiogroup">
                    <button type="button" role="radio" className="pick" aria-checked={cm[f.text] === true} onClick={() => setCm((c) => ({ ...c, [f.text]: true }))}>✓ Right</button>
                    <button type="button" role="radio" className="pick" aria-checked={cm[f.text] === false} onClick={() => setCm((c) => ({ ...c, [f.text]: false }))}>✗ Wrong</button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        <textarea className="field" rows={2} placeholder="Note on the whole drawing (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} />
      </div>
    </div>
  )
}

// ======================= Claude's notes =======================

function NotesTab({ lessons, reviews, reload }: { lessons: Lesson[]; reviews: Review[]; reload: () => Promise<void> }) {
  const who = useWho()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [text, setText] = useState('')

  const shown = lessons.filter((l) => l.status !== 'dropped').sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === 'proposed' ? -1 : 1))
  const live = lessons.filter((l) => l.status === 'live').length
  const lastNotes = lessons.reduce((m, l) => (l.created_at > m ? l.created_at : m), '')
  const since = reviews.filter((r) => (r.verdict === 'corrected' || r.claude_marks.length) && (r.at ?? '') > lastNotes).length

  // How often Claude's findings were marked right: this week and before.
  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400_000
    const all = reviews.flatMap((r) => r.claude_marks.map((m) => ({ right: m.right, at: Date.parse(r.at ?? '') })))
    const pct = (l: { right: boolean }[]) => (l.length ? Math.round((100 * l.filter((x) => x.right).length) / l.length) : null)
    return { week: pct(all.filter((x) => x.at >= week)), before: pct(all.filter((x) => x.at < week)), n: all.length }
  }, [reviews])

  const set = async (l: Lesson, patch: Partial<Lesson> & { approved_by_name?: string }) => {
    const { error } = await supabase.from('drawing_lessons').update(patch).eq('id', l.id)
    if (error) toast(error.message)
    await reload()
  }
  const approve = (l: Lesson) => {
    if (live >= 30) { toast('30 notes are in use already. Drop one first.'); return }
    set(l, { status: 'live', approved_at: new Date().toISOString(), approved_by_name: who?.name ?? '' })
  }
  const update = async () => {
    setBusy(true)
    const r = await writeDrawingNotes()
    setBusy(false)
    if (r.error) toast(r.error)
    else toast(r.data?.added ? `${r.data.added} new ${r.data.added === 1 ? 'note' : 'notes'} to look at.` : 'Nothing new worth a note.')
    await reload()
  }

  return (
    <div className="dtrain__two">
      <section className="dtrain__card dtrain__rules">
        {!shown.length && <p className="soft">No notes yet. Correct some drawings, then press Update Claude's notes.</p>}
        {shown.map((l) => (
          <div key={l.id} className="dtrain__rule">
            {editing === l.id ? (
              <textarea className="field" rows={2} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
            ) : (
              <p>{l.text}</p>
            )}
            <p className="soft dtrain__rule-meta">
              <span className={`tag${l.status === 'live' ? ' tag--ok' : ' tag--new'}`}>{l.status === 'live' ? 'In use' : 'New'}</span>
              {l.kind === 'engine_gap' && <span className="tag tag--bad">Engine gap</span>}
              <span>{l.kind !== 'engine_gap' ? l.kind : ''} · from {l.sources} {l.sources === 1 ? 'correction' : 'corrections'}{l.approved_at ? ` · approved ${fmtDate(l.approved_at)}` : ''}</span>
            </p>
            <div className="dtrain__rule-acts">
              {editing === l.id ? (
                <>
                  <button type="button" className="q-btn q-btn--small" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="q-btn q-btn--small q-btn--main" onClick={async () => { await set(l, { text: text.trim() }); setEditing(null) }}>Save</button>
                </>
              ) : (
                <>
                  <button type="button" className="q-btn q-btn--small" onClick={() => { setEditing(l.id); setText(l.text) }}>Edit</button>
                  <button type="button" className="q-btn q-btn--small" onClick={() => set(l, { status: 'dropped' })}>Drop</button>
                  {l.status === 'proposed' && <button type="button" className="q-btn q-btn--small q-btn--main" onClick={() => approve(l)}>Approve</button>}
                </>
              )}
            </div>
          </div>
        ))}
      </section>
      <div className="dtrain__side">
        <section className="dtrain__card">
          <h2 className="dtrain__h">Write new notes</h2>
          <p className="soft">Claude reads the {since} {since === 1 ? 'review' : 'reviews'} since the last notes and suggests short rules for its upload check. Only the ones you approve are used, {live} of 30 now.</p>
          <button type="button" className="q-btn q-btn--main" disabled={busy} onClick={update}>{busy ? 'Claude is reading…' : "Update Claude's notes"}</button>
          <p className="soft dtrain__small">About $0.10</p>
        </section>
        <section className="dtrain__card">
          <h2 className="dtrain__h">Is it working?</h2>
          <p>Claude's findings marked right</p>
          <div className="dtrain__meter"><span style={{ width: `${stats.week ?? 0}%` }} /></div>
          <p className="soft dtrain__small">
            {stats.n ? `${stats.week ?? '–'}% this week · ${stats.before ?? '–'}% before · ${stats.n} marked` : 'Nothing marked yet.'}
          </p>
        </section>
      </div>
    </div>
  )
}

// ======================= Engine updates =======================

/** Examples whose newest review is on an older engine and have no re-check on this one. */
function recheckList(examples: Example[], reviews: Review[]) {
  const byEx = new Map<string, Review[]>()
  for (const r of reviews) byEx.set(r.example_id, [...(byEx.get(r.example_id) ?? []), r])
  const out: { e: Example; old: Review }[] = []
  for (const e of examples) {
    const rs = byEx.get(e.id) ?? []
    if (!rs.length || rs.some((r) => r.engine_version === ENGINE_VERSION)) continue
    const old = rs.filter((r) => r.verdict === 'corrected' || r.verdict === 'right' || r.verdict === 'not_fixed' || r.verdict === 'partly' || r.verdict === 'worse' || r.verdict === 'still_right' || r.verdict === 'broke' || r.verdict === 'fixed')
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]
    if (old && canDrawExample(e)) out.push({ e, old })
  }
  return out
}

interface Score {
  n: number
  route: number
  made: number
  shape: number
  shapeN: number
  misses: { name: string; want: string; got: string; why: string }[]
  changed: { name: string; was: string; now: string }[]
}

/**
 * Re-scores today's engine on every reviewed example: the route and made/bought guess against the
 * right answer (the correction, or the engine's own pick where it was right), the shape class, and
 * which drawings now come out different from the one that was reviewed.
 */
async function rescore(examples: Example[], reviews: Review[], onProgress: (d: number, t: number) => void): Promise<Score> {
  const latest = new Map<string, Review>()
  for (const r of [...reviews].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))) if (r.verdict !== 'skipped') latest.set(r.example_id, r)
  const list = examples.filter((e) => latest.has(e.id))
  const sc: Score = { n: 0, route: 0, made: 0, shape: 0, shapeN: 0, misses: [], changed: [] }
  let i = 0
  for (const e of list) {
    const r = latest.get(e.id)!
    let G = null
    try {
      G = e.geometry_path ? await loadGeometry(e.geometry_path) : null
    } catch {
      G = null
    }
    const g = guessRoute(G, e.name)
    const want = r.route ?? (r.made === 'bought' ? ['Bought'] : r.made === 'made' && e.route[0] === 'Bought' ? [] : e.route)
    if (want.length) {
      sc.n++
      if (sameList(g.route, want)) sc.route++
      else sc.misses.push({ name: e.name, want: want.join(' → '), got: g.route.join(' → '), why: g.why })
      if ((g.route[0] === 'Bought') === (want[0] === 'Bought')) sc.made++
    }
    // The shape the drawing engine uses (what the upload stored), not the route guesser's own.
    const wantCls = r.cls ?? e.cls
    const gotCls = G ? classifyPart(G, e.name).cls : null
    if (wantCls && gotCls) {
      sc.shapeN++
      if (gotCls === wantCls) sc.shape++
    }
    if (canDrawExample(e) && r.engine_meta) {
      try {
        const d = await exampleDrawing(e)
        const was = `${r.engine_meta.cls} · ${r.engine_meta.template} · ${Math.round(r.engine_meta.scale * 100) / 100}`
        const now = `${d.cls} · ${d.template} · ${Math.round(d.scale * 100) / 100}`
        if (was !== now) sc.changed.push({ name: e.name, was, now })
      } catch {
        sc.changed.push({ name: e.name, was: r.engine_meta.cls, now: "can't draw" })
      }
    }
    onProgress(++i, list.length)
    await new Promise((res) => setTimeout(res, 0))
  }
  return sc
}

const OPEN = new Set(['corrected', 'partly', 'not_fixed', 'worse', 'broke'])

function EngineTab({ examples, reviews, reload }: { examples: Example[]; reviews: Review[]; reload: () => Promise<void> }) {
  const who = useWho()
  const toast = useToast()
  const list = useMemo(() => recheckList(examples, reviews), [examples, reviews])
  const [i, setI] = useState(0)
  const cur = list[Math.min(i, list.length - 1)]
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<Drawn | null | 'error'>(null)
  const [saving, setSaving] = useState(false)
  const [score, setScore] = useState<Score | string | null>(null)

  useEffect(() => {
    if (!cur) return
    let stop = false
    setBefore(null)
    setAfter(null)
    if (cur.old.drawing_path) savedDrawing(cur.old.drawing_path).then((s) => !stop && setBefore(s)).catch(() => !stop && setBefore(''))
    else setBefore('')
    exampleDrawing(cur.e).then((d) => !stop && setAfter(d)).catch(() => !stop && setAfter('error'))
    return () => { stop = true }
  }, [cur])

  const now = reviews.filter((r) => r.engine_version === ENGINE_VERSION)
  const count = (v: Verdict) => now.filter((r) => r.verdict === v).length
  const wasRight = cur ? cur.old.verdict === 'right' || cur.old.verdict === 'still_right' || cur.old.verdict === 'fixed' : false

  // What's still open on this engine, by fix chip: the input for "look for engine updates".
  const open = useMemo(() => {
    const latest = new Map<string, Review>()
    for (const r of [...reviews].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))) latest.set(r.example_id, r)
    const m = new Map<string, number>()
    for (const r of latest.values()) if (OPEN.has(r.verdict)) for (const f of r.fixes.length ? r.fixes : [r.made || r.route || r.material || r.cls ? 'Engine pick (route, material, shape)' : 'Marks and notes']) m.set(f, (m.get(f) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [reviews])

  const verdict = useCallback(async (v: Verdict) => {
    if (!cur || saving) return
    setSaving(true)
    const err = await saveReview(cur.e, {
      example_id: cur.e.id,
      verdict: v,
      // A re-check that isn't fixed keeps the old corrections open on the new engine.
      fixes: v === 'fixed' || v === 'still_right' ? [] : cur.old.fixes,
      marks: v === 'fixed' || v === 'still_right' ? [] : cur.old.marks,
      made: cur.old.made,
      route: cur.old.route,
      material: cur.old.material,
      cls: cur.old.cls,
      claude_marks: [],
      note: v === 'fixed' || v === 'still_right' ? '' : cur.old.note,
    }, after && after !== 'error' ? after : null, who)
    setSaving(false)
    if (err) { toast(`Not saved: ${err}`); return }
    await reload()
  }, [cur, saving, after, who, toast, reload])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (inField(ev) || !cur) return
      if (ev.key === 'g' || ev.key === 'G') verdict(wasRight ? 'still_right' : 'fixed')
      else if (ev.key === 'ArrowRight') setI((x) => Math.min(x + 1, list.length - 1))
      else if (ev.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0))
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur, verdict, wasRight, list.length])

  return (
    <div className="dtrain__two">
      <div>
        <p className="soft">Engine {ENGINE_VERSION}. Each drawing reviewed on an older engine is drawn again by this one.</p>
        <div className="dtrain__score">
          <div><b className="num">{count('fixed')}</b>fixed</div>
          <div><b className="num">{count('partly')}</b>partly</div>
          <div><b className="num">{count('not_fixed')}</b>not yet</div>
          <div><b className="num">{count('worse')}</b>got worse</div>
          <div><b className="num">{count('still_right')}</b>still right</div>
          <div><b className="num">{count('broke')}</b>broke</div>
        </div>
        {!cur ? (
          <p className="empty">Nothing to re-check. After the next engine update, the drawings you reviewed show here before and after.</p>
        ) : (
          <>
            <p className="dtrain__meta"><b>{cur.e.name}</b> <span className="soft num">· {Math.min(i, list.length - 1) + 1} of {list.length} · reviewed on {cur.old.engine_version}</span></p>
            <div className="dtrain__ba">
              <figure>
                <figcaption className="soft">Before · {cur.old.engine_version}{cur.old.engine_meta ? ` · ${cur.old.engine_meta.cls} · ${cur.old.engine_meta.template}` : ''}</figcaption>
                {before === null ? <div className="paper paper--empty soft">Loading…</div> : before ? <div className="paper" dangerouslySetInnerHTML={{ __html: before }} /> : <div className="paper paper--empty soft">No saved drawing</div>}
              </figure>
              <figure>
                <figcaption className="soft">After · {ENGINE_VERSION}{after && after !== 'error' ? ` · ${after.cls} · ${after.template}` : ''}</figcaption>
                {after === null ? <div className="paper paper--empty soft">Drawing…</div> : after === 'error' ? <div className="paper paper--empty soft">The new engine couldn't draw it.</div> : <div className="paper" dangerouslySetInnerHTML={{ __html: after.svg }} />}
              </figure>
            </div>
            {!wasRight && (
              <p className="soft">
                Your fixes: {[...cur.old.fixes, ...cur.old.marks.map((m) => m.note).filter(Boolean)].join(' · ') || 'engine picks only'}
                {cur.old.route ? ` · route ${cur.old.route.join(' → ')}` : ''}{cur.old.material ? ` · ${cur.old.material}` : ''}
              </p>
            )}
            <div className="dtrain__actions">
              {wasRight ? (
                <>
                  <span className="dtrain__sp" />
                  <button type="button" className="q-btn" disabled={saving} onClick={() => verdict('broke')}>✗ Broke</button>
                  <button type="button" className="q-btn q-btn--main" disabled={saving} onClick={() => verdict('still_right')}>✓ Still right <kbd>G</kbd></button>
                </>
              ) : (
                <>
                  <span className="dtrain__sp" />
                  <button type="button" className="q-btn" disabled={saving} onClick={() => verdict('worse')}>Worse</button>
                  <button type="button" className="q-btn" disabled={saving} onClick={() => verdict('not_fixed')}>✗ Not fixed</button>
                  <button type="button" className="q-btn" disabled={saving} onClick={() => verdict('partly')}>Partly</button>
                  <button type="button" className="q-btn q-btn--main" disabled={saving} onClick={() => verdict('fixed')}>✓ Fixed <kbd>G</kbd></button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="dtrain__side">
        <section className="dtrain__card">
          <h2 className="dtrain__h">Open feedback</h2>
          {!open.length ? <p className="soft">Nothing open.</p> : open.slice(0, 12).map(([f, n]) => (
            <div key={f} className="dtrain__issue"><span>{f}</span><span className="num">{n}</span></div>
          ))}
          <p className="soft dtrain__small">Say "look for engine updates" in a Claude session to work on these (DRAWING_TRAINING.md).</p>
        </section>
        <section className="dtrain__card">
          <h2 className="dtrain__h">Re-score</h2>
          <p className="soft">Today's engine on every reviewed part: route, made/bought and shape against your answers, and which drawings now come out different.</p>
          <button type="button" className="q-btn" disabled={typeof score === 'string'} onClick={async () => setScore(await rescore(examples, reviews, (d, t) => setScore(`Scoring ${d}/${t}`)))}>
            {typeof score === 'string' ? score : 'Re-score all'}
          </button>
          {score && typeof score !== 'string' && (
            <div className="dtrain__scored">
              <div className="dtrain__issue"><span>Route right</span><span className="num">{score.n ? Math.round((100 * score.route) / score.n) : '–'}% of {score.n}</span></div>
              <div className="dtrain__issue"><span>Made / bought right</span><span className="num">{score.n ? Math.round((100 * score.made) / score.n) : '–'}%</span></div>
              <div className="dtrain__issue"><span>Shape right</span><span className="num">{score.shapeN ? Math.round((100 * score.shape) / score.shapeN) : '–'}% of {score.shapeN}</span></div>
              <div className="dtrain__issue"><span>Drawings that changed</span><span className="num">{score.changed.length}</span></div>
              {score.misses.slice(0, 15).map((m) => (
                <p key={m.name + m.got} className="soft dtrain__small"><b>{m.name}</b>: you said {m.want}, engine says {m.got} ({m.why})</p>
              ))}
              {score.changed.slice(0, 15).map((c) => (
                <p key={'c' + c.name} className="soft dtrain__small"><b>{c.name}</b>: {c.was} → {c.now}</p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
