import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ValueInput } from '../../components/proto'
import { useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { addParam, COMMON_PARAMS, MAX_SECONDS, queueVideo, RESULT_WORD, RESULTS, saveTest, usePrototype, type Result, type Value } from '../../lib/proto'

// Logging a test, phone first: film, the values are already there from the last test, change the
// one you changed, tap how it went, save. The video shrinks and uploads in the background.

export default function TestForm() {
  const { id = '', testId } = useParams()
  const { proto, loading, testsLoading, tests, params, members } = usePrototype(id)
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
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [showLink, setShowLink] = useState(false)
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
      setLink(existing.video_link ?? '')
      setShowLink(!!existing.video_link)
    }
    setReady(true)
  }, [ready, loading, testsLoading, base, existing, testId])

  useEffect(() => {
    if (!file) return setPreview(null)
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  if (!proto) return <div className="page">{loading ? <p className="soft">Loading</p> : <p className="soft">This prototype doesn't exist anymore.</p>}</div>

  const prev = existing ? tests.filter((t) => t.n < existing.n).sort((a, b) => b.n - a.n)[0] : last
  const changed = (pid: string) => !!prev && String(prev.values[pid] ?? '') !== String(values[pid] ?? '')
  const hasSub = proto.subsystem_number != null
  const names = new Set(params.map((d) => d.name.toLowerCase()))

  const save = () => guard(saveNow)
  const saveNow = async () => {
    if (!who) return
    let videoLink: string | null = link.trim() || null
    if (videoLink && !/^https?:\/\//i.test(videoLink)) videoLink = `https://${videoLink}`
    if (!file && !videoLink && !existing && !result && !note.trim()) return toast('Add a video, a result or a note first')
    const clean: Record<string, Value> = {}
    for (const d of params) {
      const v = values[d.id]
      if (v === undefined || v === null || v === '') continue
      if (d.kind !== 'number') clean[d.id] = v
      else if (Number.isFinite(Number(v))) clean[d.id] = Number(v)
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
        video_link: file ? null : videoLink,
      },
      who,
      members,
      existing,
    )
    if (res.error) return toast(res.error)
    if (file) queueVideo(res.data!, file)
    toast(file ? 'Saved. The video uploads in the background.' : 'Test saved')
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
          {preview ? (
            <div className="pt-video">
              <video src={preview} controls playsInline muted />
            </div>
          ) : existing?.video_path && !file ? (
            <p className="soft small">This test has a video. Pick a new one to replace it.</p>
          ) : null}
          {file && (
            <p className="soft small num">
              {file.name}, {(file.size / 1048576).toFixed(1)} MB. It's shrunk to 720p before upload; past {MAX_SECONDS} s only the start is kept.
            </p>
          )}
          <div className="pt-film">
            <label className="q-btn q-btn--big">
              <Icon name="camera" size={20} /> {file ? 'Film again' : 'Film'}
              <input type="file" accept="video/*" capture="environment" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
            </label>
            <label className="q-btn q-btn--big">
              <Icon name="video" size={20} /> Choose file
              <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
            </label>
          </div>
          {!file &&
            (showLink ? (
              <label className="ctl">
                <span className="ctl__name">Video link</span>
                <input className="field" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="youtu.be/… or a Drive link" />
                <span className="soft small">For videos over {MAX_SECONDS} s. YouTube plays here; other links open in a new tab.</span>
              </label>
            ) : (
              <button type="button" className="text-btn" onClick={() => setShowLink(true)}>
                Paste a YouTube or Drive link instead
              </button>
            ))}
        </section>

        <section className="pt-form__group">
          <h2 className="pt-form__title">Parameters</h2>
          {params.length === 0 && <p className="soft small">No parameters yet. Add the ones you change between tests:</p>}
          {params.map((d) => (
            <ValueInput key={d.id} def={d} value={values[d.id]} onChange={(v) => setValues((s) => ({ ...s, [d.id]: v }))} changed={!existing && changed(d.id)} />
          ))}
          <div className="chips">
            {COMMON_PARAMS.filter((c) => !names.has(c.name.toLowerCase()))
              .slice(0, params.length ? 4 : 8)
              .map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="chip"
                  onClick={async () => {
                    const res = await addParam(
                      { season: proto.season, subsystem_number: proto.subsystem_number, prototype_id: hasSub ? null : proto.id, name: c.name, unit: c.unit, kind: c.kind, options: c.options ?? [], key: params.filter((d) => d.key).length < 3 },
                      params,
                    )
                    if (res.error) toast(res.error)
                  }}
                >
                  + {c.name}
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
