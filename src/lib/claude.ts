// Steamhub's side of the Claude features (ONSHAPE.md phase 4). Every request goes through the
// `claude` edge function, which holds the key and the prompts. The browser sends a feature name
// with ids, a question, or a picture of a drawing.
import { useCallback, useEffect, useState } from 'react'
import { canDraw, partDrawing, type Ctx } from './drawing'
import type { Part } from './mfg'
import { supabase } from './supabase'

type Res<T> = { data?: T; error?: string }

async function ai<T>(body: Record<string, unknown>): Promise<Res<T>> {
  const { data, error } = await supabase.functions.invoke('claude', { body })
  if (error) return { error: navigator.onLine ? "Couldn't reach Claude. Try again." : 'No connection.' }
  if (data && typeof data === 'object' && 'error' in data) return { error: String((data as { error: unknown }).error) }
  return { data: data as T }
}

// ---------- Ask (SteamLab) ----------

export interface Answer {
  answer: string
  numbers: { label: string; value: string }[]
}
export const askClaude = (question: string) => ai<Answer>({ feature: 'ask', question })

// ---------- Part review ----------

export interface Finding {
  kind: 'drawing' | 'route' | 'bought'
  text: string
}
export interface PartReview {
  part_id: string
  sig: string | null
  findings: Finding[]
  /** The text of each finding someone dismissed. A dismissed finding stays gone. */
  dismissed: string[]
}

/** What's still worth a look on this part: its review is for this geometry, and not dismissed. */
export const openFindings = (p: Pick<Part, 'sig'>, r: PartReview | undefined) => (r && r.sig === p.sig ? r.findings.filter((f) => !r.dismissed.includes(f.text)) : [])

/** Claude's reviews of one subsystem's parts, by part id. */
export function usePartReviews(subsystemId: string) {
  const [reviews, setReviews] = useState<Map<string, PartReview>>(new Map())
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('part_reviews').select('part_id, sig, findings, dismissed, parts!inner(subsystem_id)').eq('parts.subsystem_id', subsystemId)
    if (!error) setReviews(new Map(((data ?? []) as unknown as PartReview[]).map((r) => [r.part_id, r])))
  }, [subsystemId])
  useEffect(() => {
    reload()
  }, [reload])
  const dismiss = async (r: PartReview, text: string) => {
    const dismissed = [...new Set([...r.dismissed, text])]
    setReviews((m) => new Map(m).set(r.part_id, { ...r, dismissed }))
    await supabase.from('part_reviews').update({ dismissed }).eq('part_id', r.part_id)
  }
  return { reviews, reload, dismiss }
}

/** The drawing as a picture Claude can read: white paper, 1400 px wide. */
export async function svgToPng(svg: string): Promise<string> {
  const withNs = /<svg[^>]*xmlns=/.test(svg) ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  const url = URL.createObjectURL(new Blob([withNs], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok()
      img.onerror = () => fail(new Error('The drawing could not be turned into a picture'))
      img.src = url
    })
    const box = /viewBox="[\d.\-e]+[ ,]+[\d.\-e]+[ ,]+([\d.e]+)[ ,]+([\d.e]+)"/.exec(withNs)
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : box ? Number(box[2]) / Number(box[1]) : 0.707
    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = Math.round(1400 * ratio)
    const g = canvas.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Made parts still in design whose current geometry Claude hasn't looked at. */
export const needsReview = (parts: Part[], reviews: Map<string, PartReview>) =>
  parts.filter((p) => p.status !== 'cancelled' && !p.released_at && canDraw(p) && !p.bad && reviews.get(p.id)?.sig !== p.sig)

/**
 * Claude looks at each new or changed part's drawing and route. Three at a time; a part that
 * fails is skipped, and the next upload or a press of the button tries it again.
 */
export async function reviewParts(parts: Part[], ctx: Ctx, onProgress: (done: number, total: number) => void): Promise<{ checked: number; error?: string }> {
  const todo = parts.slice(0, 120)
  let done = 0
  let checked = 0
  let stop: string | undefined
  onProgress(0, todo.length)
  const next = async () => {
    for (;;) {
      const p = todo.shift()
      if (!p || stop) return
      try {
        const d = await partDrawing(p, ctx)
        const res = await ai<{ findings: Finding[] }>({ feature: 'part_review', part_id: p.id, image: await svgToPng(d.svg) })
        // A limit or a missing key ends the run; one odd part doesn't.
        if (res.error && /limit|Sign in|reach Claude|No connection/.test(res.error)) stop = res.error
        else if (!res.error) checked += 1
      } catch {
        // No geometry or an unreadable drawing: nothing for Claude to look at.
      }
      done += 1
      onProgress(done, done + todo.length)
    }
  }
  await Promise.all([next(), next(), next()])
  return { checked, error: stop }
}

// ---------- Reject reports ----------

export interface RejectItem {
  part_id: string
  part_no: number
  name: string
  note: string
  by: string
  why: string
  fix: string
  stock: string
}
export interface RejectReport {
  id: number
  headline: string
  items: RejectItem[]
  created_at: string
}

/** Open reports on parts the workshop sent back, newest first. */
export function useRejectReports(subsystemId: string) {
  const [reports, setReports] = useState<RejectReport[]>([])
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('reject_reports').select('id, headline, items, created_at').eq('subsystem_id', subsystemId).is('closed_at', null).order('created_at', { ascending: false }).limit(5)
    if (!error) setReports((data as RejectReport[]) ?? [])
  }, [subsystemId])
  useEffect(() => {
    reload()
  }, [reload])
  const close = async (id: number, by: string | null) => {
    setReports((l) => l.filter((r) => r.id !== id))
    await supabase.from('reject_reports').update({ closed_at: new Date().toISOString(), closed_by: by }).eq('id', id)
  }
  return { reports, close }
}

// ---------- Drawing training (DRAWING_TRAINING.md) ----------

/** Claude's upload check on a training example. Findings are stored on the example. */
export const checkExample = (example_id: string, image: string) => ai<{ findings: Finding[] }>({ feature: 'part_review', example_id, image })

/** Claude reads the corrections since the last notes and proposes new rules. */
export const writeDrawingNotes = () => ai<{ added: number }>({ feature: 'drawing_notes' })
