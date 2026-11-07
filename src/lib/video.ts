import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny'
import { MAX_SECONDS } from './proto'

// Phone video is far too big for the free Supabase plan (1 GB for everything), so every clip is
// re-encoded in the browser to 720p H.264 before upload: a 30 s clip comes out around 5 MB.
// Nothing runs on a server. When the browser can't encode (old Safari), the original goes up if
// it fits under the bucket's 50 MB limit.

const SHORT_SIDE = 720
const BITRATE = 1_400_000
const BUCKET_LIMIT = 50 * 1024 * 1024

export interface Prepared {
  video: Blob
  poster: Blob | null
  duration: number
  /** True when the clip was re-encoded. False means the original file went up as it was. */
  compressed: boolean
  /** The clip was longer than MAX_SECONDS and only its start was kept. */
  trimmed: boolean
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export async function prepareVideo(file: File, onProgress: (p: number) => void): Promise<Prepared> {
  let duration = 0
  let trimmed = false
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    duration = await input.computeDuration()
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('There is no video in this file.')
    const w = track.displayWidth
    const h = track.displayHeight
    const scale = Math.min(1, SHORT_SIDE / Math.min(w, h))
    trimmed = duration > MAX_SECONDS + 0.5
    const end = Math.min(duration, MAX_SECONDS)
    const conversion = await Conversion.init({
      input,
      output: new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() }),
      video: { width: even(w * scale), height: even(h * scale), fit: 'contain', codec: 'avc', bitrate: BITRATE, forceTranscode: true },
      // No frameRate: forcing one turned frames black after the first second (Chromium, 2026-11).
      audio: { codec: 'aac', bitrate: 96_000 },
      trim: { start: 0, end },
    })
    if (!conversion.isValid) throw new Error('cannot encode')
    conversion.onProgress = (p) => onProgress(p)
    await conversion.execute()
    const buf = (conversion.output.target as BufferTarget).buffer
    if (!buf) throw new Error('cannot encode')
    // Always the MP4, even when a tiny original is smaller: it plays on every phone, WebM doesn't.
    const video = new Blob([buf], { type: 'video/mp4' })
    return { video, poster: await posterOf(video), duration: Math.min(duration, MAX_SECONDS), compressed: true, trimmed }
  } catch (e) {
    if (e instanceof Error && e.message === 'There is no video in this file.') throw e
    console.warn('Video not shrunk, uploading the original:', e)
    if (file.size > BUCKET_LIMIT)
      throw new Error(`This browser can't shrink the video, and it's ${Math.round(file.size / 1048576)} MB (the limit is 50). Try from Chrome, or paste a YouTube or Drive link.`)
    return { video: file, poster: await posterOf(file), duration, compressed: false, trimmed: false }
  }
}

/** A JPEG of the frame at 1 s (or the middle of short clips), so lists show pictures, never video. */
export function posterOf(video: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video')
    const url = URL.createObjectURL(video)
    const done = (b: Blob | null) => {
      URL.revokeObjectURL(url)
      el.removeAttribute('src')
      resolve(b)
    }
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    el.onloadedmetadata = () => {
      el.currentTime = Math.min(1, (el.duration || 2) / 2)
    }
    el.onseeked = () => {
      const scale = Math.min(1, 640 / Math.max(el.videoWidth, el.videoHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(el.videoWidth * scale)
      c.height = Math.round(el.videoHeight * scale)
      c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height)
      c.toBlob((b) => done(b), 'image/jpeg', 0.8)
    }
    el.onerror = () => done(null)
    setTimeout(() => done(null), 15000)
    el.src = url
  })
}

/**
 * A copy of the clip with the parameters and result burned in along the bottom, for the team chat.
 * The parameters travel with the video wherever it gets forwarded.
 */
export async function burnIn(video: Blob, title: string, lines: string[], onProgress: (p: number) => void): Promise<Blob> {
  const input = new Input({ source: new BlobSource(video), formats: ALL_FORMATS })
  let canvas: OffscreenCanvas | null = null
  let ctx: OffscreenCanvasRenderingContext2D | null = null
  const conversion = await Conversion.init({
    input,
    output: new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() }),
    video: {
      codec: 'avc',
      bitrate: BITRATE,
      forceTranscode: true,
      allowTransformationMetadata: false,
      process: (sample) => {
        const w = sample.displayWidth
        const h = sample.displayHeight
        if (!canvas || canvas.width !== w || canvas.height !== h) {
          canvas = new OffscreenCanvas(w, h)
          ctx = canvas.getContext('2d')!
        }
        const g = ctx!
        sample.draw(g, 0, 0, w, h)
        drawOverlay(g, w, h, title, lines)
        return canvas
      },
    },
    audio: { codec: 'aac', bitrate: 96_000 },
  })
  if (!conversion.isValid) throw new Error("This browser can't make video files. Try Chrome.")
  conversion.onProgress = (p) => onProgress(p)
  await conversion.execute()
  const buf = (conversion.output.target as BufferTarget).buffer
  if (!buf) throw new Error('Making the video failed. Try again.')
  return new Blob([buf], { type: 'video/mp4' })
}

function drawOverlay(g: OffscreenCanvasRenderingContext2D, w: number, h: number, title: string, lines: string[]) {
  const short = Math.min(w, h)
  const size = Math.max(14, Math.round(short * 0.034))
  const pad = Math.round(size * 0.8)
  const lineH = Math.round(size * 1.35)
  g.font = `600 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  // Wrap the parameter list to the frame width.
  const rows: string[] = []
  let row = ''
  for (const part of lines) {
    const next = row ? `${row}   ${part}` : part
    if (g.measureText(next).width > w - pad * 2 && row) {
      rows.push(row)
      row = part
    } else row = next
  }
  if (row) rows.push(row)
  const boxH = pad * 2 + lineH * (rows.length + 1)
  g.fillStyle = 'rgba(12, 12, 12, 0.72)'
  g.fillRect(0, h - boxH, w, boxH)
  g.textBaseline = 'top'
  g.fillStyle = '#fe6a00'
  g.fillText(title, pad, h - boxH + pad)
  g.fillStyle = '#efefef'
  g.font = `500 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  rows.forEach((r, i) => g.fillText(r, pad, h - boxH + pad + lineH * (i + 1)))
}
