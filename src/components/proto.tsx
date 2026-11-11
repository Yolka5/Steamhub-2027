import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Select } from './Select'
import {
  hostOf,
  keyLines,
  RESULT_TAG,
  RESULT_WORD,
  retryVideo,
  STATUS_TAG,
  STATUS_WORD,
  useJobs,
  useSigned,
  youtubeId,
  type ParamDef,
  type ProtoStatus,
  type Result,
  type Test,
  type Value,
} from '../lib/proto'

// Shared parts of the Prototypes pages.

export function ProtoStatusTag({ status }: { status: ProtoStatus }) {
  return <span className={STATUS_TAG[status]}>{STATUS_WORD[status]}</span>
}

export function ResultTag({ result }: { result: Result | null }) {
  if (!result) return null
  return <span className={RESULT_TAG[result]}>{RESULT_WORD[result]}</span>
}

/** A test's poster or the prototype's cover. Lists never load video. */
export function Poster({ path, className = 'pt-poster' }: { path: string | null | undefined; className?: string }) {
  const url = useSigned([path])(path)
  return (
    <span className={className} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name="camera" size={28} />}
    </span>
  )
}

/** Shrinking or uploading progress for a test's video, while it runs in the background. */
export function JobLine({ testId }: { testId: string }) {
  const job = useJobs().find((j) => j.testId === testId)
  if (!job || job.stage === 'done') return job?.note ? <p className="soft small">{job.note}</p> : null
  if (job.stage === 'failed')
    return (
      <div className="pt-job pt-job--bad small" role="alert">
        <span>The video didn't upload: {job.error}</span>
        <button type="button" className="q-btn q-btn--small" onClick={() => retryVideo(testId)}>
          Try again
        </button>
      </div>
    )
  const pct = Math.round(job.progress * 100)
  return (
    <div className="pt-job small">
      <span>{job.stage === 'shrinking' ? `Shrinking the video ${pct}%` : 'Uploading the video'}</span>
      <span className="mfg-bar" aria-hidden="true">
        <span style={{ width: `${job.stage === 'shrinking' ? pct : 100}%` }} />
      </span>
    </div>
  )
}

/**
 * The video with its key parameters on it. Fullscreen enlarges the frame and the overlay together,
 * so the parameters never leave the video. (iPhones only fullscreen the bare video.)
 */
export function TestVideo({ test, params }: { test: Test; params: ParamDef[] }) {
  const frame = useRef<HTMLDivElement>(null)
  const get = useSigned([test.video_path, test.poster_path])
  const [full, setFull] = useState(false)
  const lines = keyLines(params, test.values)
  const yt = test.video_link ? youtubeId(test.video_link) : null
  useEffect(() => {
    const on = () => setFull(!!frame.current && document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const overlay = lines.length > 0 && (
    <div className="pt-overlay num">
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  )

  if (test.video_path) {
    const fs = () => {
      const el = frame.current
      if (!el) return
      if (document.fullscreenElement) document.exitFullscreen()
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else (el.querySelector('video') as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.()
    }
    return (
      <div ref={frame} className="pt-video" data-full={full || undefined}>
        {get(test.video_path) ? (
          <video src={get(test.video_path)!} poster={get(test.poster_path) ?? undefined} controls playsInline preload="none" controlsList="nofullscreen" />
        ) : (
          <div className="pt-video__wait" />
        )}
        {overlay}
        <button type="button" className="pt-video__fs" aria-label={full ? 'Exit fullscreen' : 'Fullscreen with parameters'} onClick={fs}>
          <Icon name={full ? 'close' : 'expand'} size={18} />
        </button>
      </div>
    )
  }
  if (yt)
    return (
      <div className="pt-video pt-video--embed">
        <iframe src={`https://www.youtube-nocookie.com/embed/${yt}`} title={`Test ${test.n}`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        {overlay}
      </div>
    )
  if (test.video_link)
    return (
      <a className="pt-link-video" href={test.video_link} target="_blank" rel="noopener noreferrer">
        <Icon name="play" size={22} />
        <span>
          Watch on {hostOf(test.video_link)} <span aria-hidden="true">↗</span>
        </span>
      </a>
    )
  return null
}

/**
 * One parameter's value, by its kind. Choices are buttons (a dropdown past 8) with Other to type
 * a new one, which joins the list when the test is saved. A number with sizes in the library
 * (wheel diameter 2, 2.25, 3) offers them as one tap, and still takes any number typed.
 */
export function ValueInput({ def, value, onChange, changed }: { def: ParamDef; value: Value | undefined; onChange: (v: Value) => void; changed?: boolean }) {
  const custom = def.kind === 'choice' && value != null && value !== '' && !def.options.includes(String(value))
  const [other, setOther] = useState(custom)
  const name = (
    <span className="ctl__name">
      {def.name}
      {def.unit && def.kind === 'number' ? <span className="soft"> ({def.unit})</span> : null}
      {changed && <span className="tag tag--reserved pt-changed">Changed</span>}
    </span>
  )
  if (def.kind === 'bool')
    return (
      <div className="ctl">
        {name}
        <div className="picks picks--seg" role="radiogroup" aria-label={def.name}>
          {[true, false].map((b) => (
            <button key={String(b)} type="button" role="radio" className="pick" aria-checked={value === b} onClick={() => onChange(value === b ? null : b)}>
              {b ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </div>
    )
  if (def.kind === 'choice') {
    const typed = other && (
      <input
        className="field"
        dir="auto"
        autoFocus={!custom}
        value={custom ? String(value) : ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Type it. It joins the list for next time."
        aria-label={`${def.name}, other`}
      />
    )
    if (def.options.length <= 8)
      return (
        <div className="ctl">
          {name}
          <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label={def.name}>
            {def.options.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                className="pick"
                aria-checked={value === o}
                onClick={() => {
                  setOther(false)
                  onChange(value === o ? null : o)
                }}
              >
                {o}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              className="pick"
              aria-checked={other}
              onClick={() => {
                if (other && custom) onChange(null)
                setOther(!other)
              }}
            >
              Other
            </button>
          </div>
          {typed}
        </div>
      )
    return (
      <label className="ctl">
        {name}
        <Select
          value={other ? '__other' : String(value ?? '')}
          onChange={(v) => {
            setOther(v === '__other')
            onChange(v && v !== '__other' ? v : null)
          }}
          options={[{ value: '', label: 'Not set' }, ...def.options.map((o) => ({ value: o, label: o })), { value: '__other', label: 'Other' }]}
        />
        {typed}
      </label>
    )
  }
  const field = (
    <input
      className="field num"
      inputMode={def.kind === 'number' ? 'decimal' : undefined}
      value={value === null || value === undefined ? '' : String(value)}
      aria-label={def.options.length ? `${def.name}, other size` : undefined}
      placeholder={def.options.length ? 'Other' : undefined}
      onChange={(e) => {
        const t = e.target.value
        if (def.kind !== 'number') return onChange(t || null)
        // Kept as typed until the test is saved (TestForm turns it into a number then).
        // Turning it into a number on every key dropped zeros: 1.05 became 15.
        const clean = t.replace(',', '.').replace(/[^\d.-]/g, '')
        onChange(clean === '' ? null : clean)
      }}
    />
  )
  if (def.kind === 'number' && def.options.length)
    return (
      <div className="ctl">
        {name}
        <div className="pt-sizes">
          <div className="picks picks--seg picks--wrap" role="radiogroup" aria-label={def.name}>
            {def.options.map((o) => {
              const on = value != null && value !== '' && Number(value) === Number(o)
              return (
                <button key={o} type="button" role="radio" className="pick num" aria-checked={on} onClick={() => onChange(on ? null : o)}>
                  {o}
                </button>
              )
            })}
          </div>
          {field}
        </div>
      </div>
    )
  return (
    <label className="ctl">
      {name}
      {field}
    </label>
  )
}
