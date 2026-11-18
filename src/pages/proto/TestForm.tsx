import { readTyped } from '../../lib/units'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Poster, ValueInput } from '../../components/proto'
import { useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import {
  addLibItems,
  clipsOf,
  growChoices,
  hostOf,
  leadOf,
  libSuggestions,
  MAX_SECONDS,
  queueVideo,
  RESULT_WORD,
  RESULTS,
  saveTest,
  shown,
  useLibrary,
  usePrototype,
  useSeasons,
  type Clip,
  type Result,
  type Value,
} from '../../lib/proto'

// Logging a test, phone first: film, the values are already there from the last test, change the
// one you changed, tap how it went, save. A test takes as many videos as you like (two angles,
// a slow-mo); they shrink and upload in the background, one after another.

export default function TestForm() {
  const { id = '', testId } = useParams()
  const { proto, loading, testsLoading, tests, params, paramsLoading } = usePrototype(id)
  const { subsystemsOf } = useSeasons()
  const library = useLibrary().items
  const who = useWho()
  const toast = useToast()
  const navigate = useNavigate()
  const existing = testId ? tests.find((t) => t.id === testId) : undefined
  const last = useMemo(() => tests.slice().sort((a, b) => b.n - a.n)[0], [tests])
  const base = existing ?? last

  const [ready, setReady] = useState(false)
  const [values, setValues] = useState<Record<string, Value>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [measureName, setMeasureName] = useState('')
  const [measure, setMeasure] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [links, setLinks] = useState<string[]>([])
  /** Videos the test already has that are marked to go when it's saved. */
  const [removing, setRemoving] = useState<Clip[]>([])
  const [busy, guard] = useBusy()

  // Fill once the tests are in: the test being edited, or the last test's values for a new one.
  useEffect(() => {
    if (ready || loading || testsLoading || (testId && !existing)) return
    if (base) {
      setValues({ ...base.values })
      setMeasureName(base.measure_name)
    }
    if (existing) {
      setResult(existing.result)
      setScore(existing.score)
      setMeasure(existing.measure_value != null ? String(existing.measure_value) : '')
      setNote(existing.note)
    }
    setReady(true)
  }, [ready, loading, testsLoading, base, existing, testId])

  if (!proto) return <div className="page">{loading ? <p className="soft">Loading</p> : <p className="soft">This prototype doesn't exist anymore.</p>}</div>

  const prev = existing ? tests.filter((t) => t.n < existing.n).sort((a, b) => b.n - a.n)[0] : last
  const changed = (pid: string) => !!prev && String(prev.values[pid] ?? '') !== String(values[pid] ?? '')
  const visible = params.filter((d) => shown(d, values))

  const had = existing ? clipsOf(existing) : []
  const hasAny = files.length > 0 || had.length > removing.length
  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])]
    // Clear it, so the same file can be picked again after removing it.
    e.target.value = ''
    if (picked.length) setFiles((s) => [...s, ...picked])
  }

  const save = () => guard(saveNow)
  const saveNow = async () => {
    if (!who) return
    const addLinks = links.map((l) => l.trim()).filter(Boolean).map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`))
    if (!files.length && !addLinks.length && !existing && !result && !note.trim()) return toast('Add a video, a result or a note first')
    const clean: Record<string, Value> = {}
    // Only what's in use: Compliant color goes when the wheel type changes to Flex.
    for (const d of visible) {
      const v = values[d.id]
      if (v === undefined || v === null || v === '') continue
      if (d.kind !== 'number') clean[d.id] = v
      else {
        // "50mm" typed for an inch parameter counts in inches.
        const n = typeof v === 'number' ? v : readTyped(String(v), d.unit).value
        if (n != null && Number.isFinite(n)) clean[d.id] = n
      }
    }
    // Values of parameters that were deleted since stay as they were on an edited test.
    if (existing) for (const [k, v] of Object.entries(existing.values)) if (!params.some((d) => d.id === k)) clean[k] = v
    const m = measure.trim().replace(',', '.')
    const res = await saveTest(
      proto,
      {
        values: clean,
        result,
        score,
        measure_name: measureName.trim(),
        measure_value: m && Number.isFinite(Number(m)) ? Number(m) : null,
        note: note.trim(),
      },
      { remove: removing, addLinks },
      who,
      [leadOf(proto, subsystemsOf(proto.season)), ...tests.map((t) => t.by_id)],
      existing,
    )
    if (res.error) return toast(res.error)
    await growChoices(visible, clean, library)
    for (const f of files) queueVideo(res.data!, f)
    toast(files.length > 1 ? `Saved. The ${files.length} videos upload in the background.` : files.length ? 'Saved. The video uploads in the background.' : 'Test saved')
    navigate(`/prototypes/${proto.id}#test-${res.data!.n}`, { replace: true })
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <div>
          <h1 className="page__title">{existing ? `Test ${existing.n}` : 'New test'}</h1>
          <p className="soft sub-meta">
            <Link to={`/prototypes/${proto.id}`} dir="auto">
              {proto.name}
            </Link>
            {last && !existing ? ` · values from test ${last.n}` : ''}
          </p>
        </div>
      </div>

      <form
        className="form pt-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <section className="pt-form__video">
          {had.length > 0 && (
            <ul className="pt-clip-list">
              {had.map((c, i) => {
                const off = removing.some((r) => clipKey(r) === clipKey(c))
                return (
                  <li key={clipKey(c) || i} className="pt-clip-row" data-off={off || undefined}>
                    {c.path ? <Poster path={c.poster} className="pt-poster pt-poster--small" /> : <span className="pt-poster pt-poster--small"><Icon name="play" size={22} /></span>}
                    <span className="pt-clip-row__name small">
                      Video {i + 1}
                      <span className="soft">{c.path ? (c.duration_s ? ` · ${Math.round(c.duration_s)} s` : '') : ` · ${hostOf(c.link ?? '')}`}</span>
                      {off && <span className="soft"> · goes when you save</span>}
                    </span>
                    <button type="button" className="q-btn q-btn--small" onClick={() => setRemoving((s) => (off ? s.filter((r) => clipKey(r) !== clipKey(c)) : [...s, c]))}>
                      {off ? 'Keep' : <><Icon name="trash" size={16} /> Remove</>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {files.map((f, i) => (
            <PickedVideo key={`${f.name}-${f.size}-${f.lastModified}-${i}`} file={f} n={i + 1} onRemove={() => setFiles((s) => s.filter((x) => x !== f))} />
          ))}
          {files.length > 0 && (
            <p className="soft small">Each video is shrunk to 720p before upload; past {MAX_SECONDS} s only the start is kept.</p>
          )}
          <div className="pt-film">
            <label className="q-btn q-btn--big">
              <Icon name="camera" size={20} /> {hasAny ? 'Film another' : 'Film'}
              <input type="file" accept="video/*" capture="environment" onChange={pickFiles} />
            </label>
            <label className="q-btn q-btn--big">
              <Icon name="video" size={20} /> {hasAny ? 'Add files' : 'Choose files'}
              <input type="file" accept="video/*" multiple onChange={pickFiles} />
            </label>
          </div>
          {links.map((l, i) => (
            <div key={i} className="ctl">
              <span className="ctl__name">Video link</span>
              <div className="pt-link-row">
                <input className="field" inputMode="url" value={l} onChange={(e) => setLinks((s) => s.map((x, j) => (j === i ? e.target.value : x)))} placeholder="youtu.be/… or a Drive link" autoFocus={!l} />
                <button type="button" className="icon-btn" aria-label="Remove this link" onClick={() => setLinks((s) => s.filter((_, j) => j !== i))}>
                  <Icon name="close" size={18} />
                </button>
              </div>
              <span className="soft small">For videos over {MAX_SECONDS} s. YouTube plays here; other links open in a new tab.</span>
            </div>
          ))}
          <button type="button" className="text-btn" onClick={() => setLinks((s) => [...s, ''])}>
            {links.length || had.some((c) => c.link) ? 'Add another YouTube or Drive link' : 'Paste a YouTube or Drive link instead'}
          </button>
        </section>

        <section className="pt-form__group">
          <h2 className="pt-form__title">Parameters</h2>
          {!paramsLoading && params.length === 0 && <p className="soft small">No parameters yet. Add the ones you change between tests:</p>}
          {visible.map((d) => (
            <ValueInput key={d.id} def={d} value={values[d.id]} onChange={(v) => setValues((s) => ({ ...s, [d.id]: v }))} changed={!existing && changed(d.id)} />
          ))}
          <div className="chips">
            {!paramsLoading && libSuggestions(library, params)
              .slice(0, params.length ? 4 : 8)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip"
                  onClick={async () => {
                    const res = await addLibItems(proto, [item], params)
                    if (res.error) toast(res.error)
                  }}
                >
                  + {item.name}
                </button>
              ))}
          </div>
          {params.length > 0 && (
            <p className="soft small">
              More parameters, units and choices on the <Link to={`/prototypes/${proto.id}`}>prototype page</Link>.
            </p>
          )}
        </section>

        <section className="pt-form__group">
          <h2 className="pt-form__title">How it went</h2>
          <div className="picks picks--seg pt-result" role="radiogroup" aria-label="Result">
            {RESULTS.map((r) => (
              <button key={r} type="button" role="radio" className="pick" data-result={r} aria-checked={result === r} onClick={() => setResult(result === r ? null : r)}>
                {RESULT_WORD[r]}
              </button>
            ))}
          </div>
          <div className="ctl">
            <span className="ctl__name">Score (optional)</span>
            <div className="picks picks--seg" role="radiogroup" aria-label="Score">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" role="radio" className="pick num" aria-checked={score === s} onClick={() => setScore(score === s ? null : s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="dims">
            <label className="ctl">
              <span className="ctl__name">Measured (optional)</span>
              <input className="field" value={measureName} onChange={(e) => setMeasureName(e.target.value)} placeholder="Balls in, out of 10" />
            </label>
            <label className="ctl">
              <span className="ctl__name">Value</span>
              <input className="field num" inputMode="decimal" value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="8" />
            </label>
          </div>
          <label className="ctl">
            <span className="ctl__name">Note</span>
            <textarea className="field" dir="auto" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jammed once when the ball came in at an angle" />
          </label>
        </section>

        <button type="submit" className="q-btn q-btn--main q-btn--big q-btn--wide pt-save">
          {busy ? 'Saving' : 'Save test'}
        </button>
      </form>
    </div>
  )
}

const clipKey = (c: Clip) => c.path ?? c.link ?? ''

/** A video picked in the form, before it's saved: a player to check it, and a way to drop it. */
function PickedVideo({ file, n, onRemove }: { file: File; n: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div className="pt-picked">
      <div className="pt-video">{url && <video src={url} controls playsInline muted preload="metadata" />}</div>
      <div className="pt-clip-row">
        <span className="pt-clip-row__name small num">
          New video {n}
          <span className="soft">
            {' '}
            · {file.name}, {(file.size / 1048576).toFixed(1)} MB
          </span>
        </span>
        <button type="button" className="q-btn q-btn--small" onClick={onRemove}>
          <Icon name="trash" size={16} /> Remove
        </button>
      </div>
    </div>
  )
}
