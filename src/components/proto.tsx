import { useEffect, useRef, useState } from 'react'
import { readTyped, tidy } from '../lib/units'
import { Icon } from './Icon'
import { Select } from './Select'
import {
  clipsOf,
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
  type Clip,
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

/** Shrinking or uploading progress for a test's videos, while they run in the background. */
export function JobLine({ testId }: { testId: string }) {
  const mine = useJobs().filter((j) => j.testId === testId)
  if (!mine.length) return null
  const many = mine.length > 1
  return (
    <>
      {mine.map((job, i) => {
        const which = many ? ` ${i + 1} of ${mine.length}` : ''
        if (job.stage === 'done') return job.note ? <p key={job.key} className="soft small">{job.note}</p> : null
        if (job.stage === 'failed')
          return (
            <div key={job.key} className="pt-job pt-job--bad small" role="alert">
              <span>
                The video{which} didn't upload: {job.error}
              </span>
              <button type="button" className="q-btn q-btn--small" onClick={() => retryVideo(job.key)}>
                Try again
              </button>
            </div>
          )
        const pct = Math.round(job.progress * 100)
        // Queued clips wait at 0% behind the one being shrunk.
        return (
          <div key={job.key} className="pt-job small">
            <span>{job.stage === 'shrinking' ? `Shrinking the video${which} ${pct}%` : `Uploading the video${which}`}</span>
            <span className="mfg-bar" aria-hidden="true">
              <span style={{ width: `${job.stage === 'shrinking' ? pct : 100}%` }} />
            </span>
          </div>
        )
      })}
    </>
  )
}

/**
 * A video of a test (the first one unless `clip` says which) with its key parameters on it.
 * Fullscreen enlarges the frame and the overlay together, so the parameters never leave the
 * video. (iPhones only fullscreen the bare video.)
 */
export function TestVideo({ test, params, clip }: { test: Test; params: ParamDef[]; clip?: Clip }) {
  const frame = useRef<HTMLDivElement>(null)
  const c = clip ?? clipsOf(test)[0]
  const path = c?.path ?? null
  const link = c?.path ? null : (c?.link ?? null)
  const get = useSigned([path, c?.poster])
  const [full, setFull] = useState(false)
  const lines = keyLines(params, test.values)
  const yt = link ? youtubeId(link) : null
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

  if (path) {
    const fs = () => {
      const el = frame.current
      if (!el) return
      if (document.fullscreenElement) document.exitFullscreen()
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
      else (el.querySelector('video') as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.()
    }
    return (
      <div ref={frame} className="pt-video" data-full={full || undefined}>
        {get(path) ? (
          <video key={path} src={get(path)!} poster={get(c?.poster) ?? undefined} controls playsInline preload="none" controlsList="nofullscreen" />
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
  if (link)
    return (
      <a className="pt-link-video" href={link} target="_blank" rel="noopener noreferrer">
        <Icon name="play" size={22} />
        <span>
          Watch on {hostOf(link)} <span aria-hidden="true">↗</span>
        </span>
      </a>
    )
  return null
}

/** Wheel colors as the vendors make them, so "Green 35A" shows a green dot next to it. */
const SWATCHES: Record<string, string> = {
  green: '#3cbf3a',
  orange: '#f26b2a',
  blue: '#1d3fe0',
  black: '#111111',
  red: '#d6312b',
  maroon: '#7a1f2b',
  yellow: '#f2c230',
  purple: '#7b3fc4',
  white: '#f4f4f4',
  gray: '#8a8a8a',
  grey: '#8a8a8a',
}

/** A dot in the color an option names ("Green 35A", "Light gray 30A"), or nothing. */
export function Swatch({ option }: { option: string }) {
  const words = option.toLowerCase().split(/\s+/)
  const hit = words.slice(0, 2).find((w) => SWATCHES[w])
  if (!hit) return null
  const shade = words[0] === 'light' ? 'color-mix(in srgb, #8a8a8a 45%, white)' : words[0] === 'dark' ? '#4a4a4a' : SWATCHES[hit]
  return <span className="pt-swatch" style={{ background: shade }} aria-hidden="true" />
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
                <Swatch option={o} />
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
  // A number can be typed with another unit ("50mm" for an inch parameter): it's shown in the
  // parameter's unit underneath and turned into it on leaving the field.
  const typedNow = def.kind === 'number' && typeof value === 'string' && /[^\d.\-\s]/.test(value) ? readTyped(value, def.unit) : null
  const input = (
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
        const clean = t.replace(',', '.')
        onChange(clean.trim() === '' ? null : clean)
      }}
      onBlur={() => {
        if (typedNow?.value != null) onChange(tidy(typedNow.value))
      }}
    />
  )
  // Always the same wrapper, so the input isn't remounted (and loses focus) when a unit is typed.
  const field = (
    <span className="pt-typed">
      {input}
      {typedNow && <span className={`small ${typedNow.value == null ? 'error' : 'soft'} num`}>{typedNow.value == null ? typedNow.error : `= ${tidy(typedNow.value)} ${def.unit}`}</span>}
    </span>
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
