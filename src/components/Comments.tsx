import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from './Icon'
import { useBusy, useToast } from './ui'
import { useWho } from '../lib/auth'
import { shrink } from '../lib/actions'
import {
  addComment,
  dayLabel,
  deleteComment,
  editComment,
  firstName,
  isoDay,
  mentionsIn,
  setFollow,
  uploadCommentPhoto,
  type CalComment,
  type CommentKind,
  type Follow,
} from '../lib/cal'
import type { Profile } from '../lib/mfg'
import { useSigned } from '../lib/proto'
import { applyRow, putRows, type Cal } from '../lib/useCal'

// Comments on anything in the Calendar: tasks (subtasks too), groups, lists, phases and events.
// One table, one panel. Writing one is always the person's choice: a faint chip until there is one.
// Who hears about a comment is decided in the database (comments_notify); the line under the box
// says the same thing before you send.

export const useOpenComments = () => {
  const [params, setParams] = useSearchParams()
  return useCallback(
    (kind: CommentKind | null, id?: string) => {
      const next = new URLSearchParams(params)
      if (kind && id) next.set('comments', `${kind}:${id}`)
      else next.delete('comments')
      setParams(next, { replace: !kind })
    },
    [params, setParams],
  )
}

export const commentCount = (cal: Pick<Cal, 'comments'>, kind: CommentKind, id: string) =>
  cal.comments.filter((c) => c.target_kind === kind && c.target_id === id && !c.parent_id).length

/** The chip on a row: a faint icon until there is a comment, then the count. */
export function CommentChip({ cal, kind, id, label }: { cal: Cal; kind: CommentKind; id: string; label: string }) {
  const open = useOpenComments()
  const n = commentCount(cal, kind, id)
  return (
    <button
      type="button"
      className="cal-note-chip"
      data-has={n ? true : undefined}
      aria-label={`${n} ${n === 1 ? 'comment' : 'comments'} on ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        open(kind, id)
      }}
    >
      <Icon name="note" size={16} />
      {n > 0 && <span className="num">{n}</span>}
    </button>
  )
}

interface Target {
  kind: CommentKind
  id: string
  title: string
  /** Under the title: the group, the section. */
  where?: string
  /** The group whose lead hears about it. */
  groupId: string | null
}

/** What a comment hangs on, found in the Calendar's data. Null when it's gone. */
export function targetOf(cal: Cal, kind: CommentKind, id: string): Target | null {
  const gName = (gid: string | null | undefined) => cal.groups.find((g) => g.id === gid)?.name
  if (kind === 'task') {
    const t = cal.tasks.find((x) => x.id === id)
    return t ? { kind, id, title: t.title, where: gName(t.group_id), groupId: t.group_id } : null
  }
  if (kind === 'group') {
    const g = cal.groups.find((x) => x.id === id)
    return g ? { kind, id, title: g.name, groupId: g.id } : null
  }
  if (kind === 'list') {
    const l = cal.lists.find((x) => x.id === id)
    return l ? { kind, id, title: l.name, where: gName(l.group_id), groupId: l.group_id } : null
  }
  if (kind === 'phase') {
    const p = cal.phases.find((x) => x.id === id)
    return p ? { kind, id, title: p.name, where: gName(p.group_id), groupId: p.group_id } : null
  }
  const e = cal.events.find((x) => x.id === id)
  return e ? { kind, id, title: e.title, where: gName(e.group_id) ?? 'The whole team', groupId: e.group_id } : null
}

/** The usual people for a new comment, before follows and mutes: as comments_notify does it. */
function usualOf(cal: Cal, t: Target) {
  const out: string[] = []
  if (t.kind !== 'event') {
    const lead = cal.groups.find((g) => g.id === t.groupId)?.lead_id
    if (lead) out.push(lead)
  }
  if (t.kind === 'task') for (const o of cal.owners) if (o.task_id === t.id && !out.includes(o.user_id)) out.push(o.user_id)
  return out
}

// ---------- The panel: a side panel on computers, a sheet on phones ----------

export function CommentsHost({ cal, people }: { cal: Cal; people: Profile[] }) {
  const [params] = useSearchParams()
  const open = useOpenComments()
  const raw = params.get('comments')
  // Old phase-note links: ?notes=<phase id>.
  const legacy = params.get('notes')
  const [kind, id] = raw?.includes(':') ? (raw.split(':') as [CommentKind, string]) : legacy ? (['phase', legacy] as const) : [null, null]
  const t = kind && id ? targetOf(cal, kind, id) : null
  const ref = useRef<HTMLDialogElement>(null)
  const show = !!kind && !cal.loading
  const [, setParams] = useSearchParams()
  const close = () => {
    if (legacy) {
      const next = new URLSearchParams(params)
      next.delete('notes')
      next.delete('comments')
      setParams(next, { replace: true })
    } else open(null)
  }
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (show && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!show && d.open) d.close()
  }, [show])
  return (
    <dialog
      ref={ref}
      className="cal-notes"
      aria-label={t ? `Comments on ${t.title}` : 'Comments'}
      onClose={close}
      onClick={(e) => {
        if (e.target === ref.current) close()
      }}
    >
      {show &&
        (t ? (
          <>
            <div className="cal-notes__head">
              <h2 className="cal-notes__title">
                <bdi dir="auto">{t.title}</bdi>
                {t.where && <span className="soft"> · {t.where}</span>}
              </h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
                <Icon name="close" />
              </button>
            </div>
            <CommentThread key={`${t.kind}:${t.id}`} cal={cal} people={people} target={t} autoFocus />
          </>
        ) : (
          <div className="cal-notes__head">
            <h2 className="cal-notes__title">Not found</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
              <Icon name="close" />
            </button>
            <p className="soft">This was deleted, or it belongs to another season.</p>
          </div>
        ))}
    </dialog>
  )
}

// ---------- The thread: also used inside the task and event windows ----------

const initials = (name: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso)
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 12) return `${h} h ago`
  return dayLabel(isoDay(new Date(iso)))
}

const names = (ids: string[], nameOf: (id: string) => string | null) => {
  const list = ids.map((id) => firstName(nameOf(id)) || 'someone')
  if (list.length <= 1) return list.join('')
  if (list.length > 4) return `${list.slice(0, 3).join(', ')} and ${list.length - 3} more`
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export function CommentThread({ cal, people, target, autoFocus, compact }: { cal: Cal; people: Profile[]; target: Target; autoFocus?: boolean; compact?: boolean }) {
  const who = useWho()
  const toast = useToast()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [tellAll, setTellAll] = useState(false)
  const nameOf = (id: string | null) => people.find((x) => x.id === id)?.name ?? null
  const all = cal.comments.filter((c) => c.target_kind === target.kind && c.target_id === target.id)
  const top = all.filter((n) => !n.parent_id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const repliesOf = (id: string) => all.filter((n) => n.parent_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const mine = cal.follows.find((f) => f.user_id === who?.userId && f.target_kind === target.kind && f.target_id === target.id)?.mode ?? null

  // Who hears, before mentions: the usual people minus anyone who muted it, plus followers.
  const hears = (mentions: string[]) => {
    if (tellAll) return 'Everyone on the team gets it.'
    const muted = new Set(cal.follows.filter((f) => f.target_kind === target.kind && f.target_id === target.id && f.mode === 'mute').map((f) => f.user_id))
    const followers = cal.follows.filter((f) => f.target_kind === target.kind && f.target_id === target.id && f.mode === 'follow').map((f) => f.user_id)
    const ids = [...new Set([...mentions, ...usualOf(cal, target).filter((x) => !muted.has(x)), ...followers])].filter((x) => x !== who?.userId)
    if (!ids.length) return target.kind === 'event' ? 'Nobody gets a notification unless you @mention them.' : 'Nobody else gets a notification. Type @ to mention someone.'
    return `${names(ids, nameOf)} ${ids.length === 1 ? 'gets' : 'get'} a notification.`
  }

  const send = async (text: string, photos: string[], mentions: string[], parent: string | null = null) => {
    if (!who) return false
    const res = await addComment({ target_kind: target.kind, target_id: target.id, parent_id: parent, text, photos, mentions, tell_all: parent ? false : tellAll }, who)
    if (res.error) {
      toast(res.error)
      return false
    }
    putRows('comments', [res.data!])
    setTellAll(false)
    return true
  }

  const remove = async (n: CalComment) => {
    applyRow('comments', 'delete', n)
    const res = await deleteComment(n)
    if (res.error) {
      putRows('comments', [n])
      toast(res.error)
    } else toast('Comment deleted')
  }

  const follow = async (mode: Follow['mode'] | null) => {
    if (!who) return
    const before = cal.follows.find((f) => f.user_id === who.userId && f.target_kind === target.kind && f.target_id === target.id)
    if (before) applyRow('comment_follows', 'delete', before)
    if (mode) putRows('comment_follows', [{ user_id: who.userId, target_kind: target.kind, target_id: target.id, mode }])
    const res = await setFollow(target.kind, target.id, mode, who.userId)
    if (res.error) {
      if (mode) applyRow('comment_follows', 'delete', { user_id: who.userId, target_kind: target.kind, target_id: target.id })
      if (before) putRows('comment_follows', [before])
      return toast(res.error)
    }
    toast(mode === 'follow' ? 'You hear about every comment here' : mode === 'mute' ? 'Muted. You hear only when someone mentions you.' : 'Back to the usual')
  }

  const one = (n: CalComment, reply: boolean) => {
    const own = n.author_id === who?.userId
    return (
      <li key={n.id} className="cal-note" data-reply={reply || undefined}>
        <span className="avatar avatar--soft cal-av" aria-hidden="true">
          {initials(nameOf(n.author_id))}
        </span>
        <div className="cal-note__body">
          <div className="cal-note__who small">
            <span className="strong">{firstName(nameOf(n.author_id)) || 'Someone'}</span>
            <span className="soft">
              {' '}
              · {ago(n.created_at)}
              {Date.parse(n.updated_at) - Date.parse(n.created_at) > 60_000 ? ' · edited' : ''}
              {n.tell_all ? ' · to everyone' : ''}
            </span>
          </div>
          {editing === n.id ? (
            <Writer
              targetId={target.id}
              people={people}
              placeholder="Edit the comment"
              initial={n.text}
              photosAllowed={false}
              autoFocus
              cta="Save"
              onCancel={() => setEditing(null)}
              send={async (text, _ph, mentions) => {
                if (!text && !n.photos.length) return false
                const res = await editComment(n.id, { text, mentions })
                if (res.error) {
                  toast(res.error)
                  return false
                }
                putRows('comments', [res.data!])
                setEditing(null)
                return true
              }}
            />
          ) : (
            <>
              {n.text && <NoteText text={n.text} />}
              <Photos paths={n.photos} />
            </>
          )}
          {editing !== n.id && (
            <div className="cal-note__acts">
              {!reply && (
                <button type="button" className="text-btn small" onClick={() => setReplyTo(replyTo === n.id ? null : n.id)}>
                  Reply
                </button>
              )}
              {own && (
                <>
                  <button type="button" className="text-btn small" onClick={() => setEditing(n.id)}>
                    Edit
                  </button>
                  <button type="button" className="text-btn small" onClick={() => remove(n)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
          {!reply && (repliesOf(n.id).length > 0 || replyTo === n.id) && (
            <ol className="cal-note__replies">
              {repliesOf(n.id).map((r) => one(r, true))}
              {replyTo === n.id && (
                <li>
                  <Writer
                    targetId={target.id}
                    people={people}
                    placeholder={`Reply to ${firstName(nameOf(n.author_id)) || 'this'}`}
                    autoFocus
                    cta="Reply"
                    hint={n.author_id && n.author_id !== who?.userId ? `${firstName(nameOf(n.author_id))} gets a notification.` : undefined}
                    onCancel={() => setReplyTo(null)}
                    send={async (text, photos, mentions) => {
                      const ok = await send(text, photos, mentions, n.id)
                      if (ok) setReplyTo(null)
                      return ok
                    }}
                  />
                </li>
              )}
            </ol>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className={`cal-thread${compact ? ' cal-thread--compact' : ''}`}>
      <Writer
        targetId={target.id}
        people={people}
        placeholder={target.kind === 'phase' ? 'Small update: what works, what broke' : 'Write a comment'}
        autoFocus={autoFocus}
        hearsLine={hears}
        extra={
          <label className="check small cal-write__all">
            <input type="checkbox" checked={tellAll} onChange={(e) => setTellAll(e.target.checked)} />
            Tell everyone
          </label>
        }
        send={(t, ph, m) => send(t, ph, m)}
      />
      <div className="cal-thread__follow">
        <span className="soft small">You hear about it</span>
        <div className="picks picks--seg picks--small" role="radiogroup" aria-label="Notifications for you">
          {(
            [
              [null, 'Usual'],
              ['follow', 'Every comment'],
              ['mute', 'Only mentions'],
            ] as const
          ).map(([m, label]) => (
            <button key={label} type="button" role="radio" className="pick" aria-checked={mine === m} onClick={() => mine !== m && follow(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {top.length ? (
        <ol className="cal-notes__list">{top.map((n) => one(n, false))}</ol>
      ) : (
        !compact && <p className="soft cal-notes__empty">No comments yet.</p>
      )}
    </div>
  )
}

/** "@Noa" stands out; the rest as typed. */
function NoteText({ text }: { text: string }) {
  const parts = text.split(/(@[\p{L}][\p{L}\d_-]*)/u)
  return (
    <p className="cal-note__text" dir="auto">
      {parts.map((s, i) =>
        s.startsWith('@') ? (
          <span key={i} className="cal-note__at">
            {s}
          </span>
        ) : (
          s
        ),
      )}
    </p>
  )
}

function Photos({ paths }: { paths: string[] }) {
  const url = useSigned(paths)
  if (!paths.length) return null
  return (
    <div className="cal-note__photos">
      {paths.map((p) => {
        const u = url(p)
        return u ? (
          <a key={p} href={u} target="_blank" rel="noreferrer" className="cal-note__photo">
            <img src={u} alt="Photo on the comment" loading="lazy" />
          </a>
        ) : (
          <span key={p} className="cal-note__photo cal-note__photo--wait" />
        )
      })}
    </div>
  )
}

/** A text box that suggests people after @, and can take photos. */
function Writer({
  targetId,
  people,
  placeholder,
  send,
  autoFocus,
  initial = '',
  photosAllowed = true,
  hint,
  hearsLine,
  extra,
  onCancel,
  cta = 'Send',
}: {
  targetId: string
  people: Profile[]
  placeholder: string
  send: (text: string, photos: string[], mentions: string[]) => Promise<boolean>
  autoFocus?: boolean
  initial?: string
  photosAllowed?: boolean
  hint?: ReactNode
  /** Says who hears about it, from the people mentioned so far. */
  hearsLine?: (mentions: string[]) => string
  extra?: ReactNode
  onCancel?: () => void
  cta?: string
}) {
  const toast = useToast()
  const [text, setText] = useState(initial)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(0)
  const [busy, run] = useBusy()
  const [caret, setCaret] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const active = useMemo(() => people.filter((p) => !p.banned && !p.shared), [people])
  const typing = /@([\p{L}][\p{L}\d_-]*)?$/u.exec(text.slice(0, caret))
  const hits = typing ? active.filter((p) => p.name.toLowerCase().includes((typing[1] ?? '').toLowerCase())).slice(0, 5) : []
  const mentioned = mentionsIn(text, active)
  const url = useSigned(photos)

  const pick = (p: Profile) => {
    const before = text.slice(0, caret).replace(/@([\p{L}][\p{L}\d_-]*)?$/u, `@${firstName(p.name)} `)
    const next = before + text.slice(caret)
    setText(next)
    setCaret(before.length)
    window.setTimeout(() => {
      ta.current?.focus()
      ta.current?.setSelectionRange(before.length, before.length)
    }, 0)
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    for (const f of [...files]) {
      setUploading((n) => n + 1)
      try {
        const res = await uploadCommentPhoto(targetId, await shrink(f, 1600))
        if (res.error) toast(res.error)
        else setPhotos((ps) => [...ps, res.path!])
      } catch {
        toast("That photo couldn't be read")
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  const go = () =>
    run(async () => {
      const t = text.trim()
      if (!t && !photos.length) return ta.current?.focus()
      if (uploading) return toast('Wait for the photo to finish uploading')
      if (await send(t, photos, mentioned)) {
        setText('')
        setPhotos([])
      }
    })

  const line = hearsLine
    ? hearsLine(mentioned)
    : mentioned.length
      ? `${mentioned.map((id) => firstName(active.find((p) => p.id === id)?.name)).join(', ')} will get a notification.`
      : hint

  return (
    <div className="cal-write">
      <textarea
        ref={ta}
        className="cal-write__text"
        rows={2}
        value={text}
        placeholder={placeholder}
        data-autofocus={autoFocus || undefined}
        autoFocus={autoFocus}
        dir="auto"
        aria-label={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            go()
          }
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      {hits.length > 0 && (
        <div className="cal-write__people" role="listbox" aria-label="Mention someone">
          {hits.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span className="avatar avatar--soft cal-av">{initials(p.name)}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {(photos.length > 0 || uploading > 0) && (
        <div className="cal-note__photos">
          {photos.map((p) => (
            <span key={p} className="cal-note__photo">
              {url(p) && <img src={url(p)!} alt="" />}
              <button type="button" className="cal-note__unphoto" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}>
                <Icon name="close" size={14} />
              </button>
            </span>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <span key={`u${i}`} className="cal-note__photo cal-note__photo--wait" />
          ))}
        </div>
      )}
      <div className="cal-write__bar">
        {photosAllowed && (
          <label className="icon-btn cal-write__cam" aria-label="Add a photo">
            <Icon name="camera" size={18} />
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files).then(() => (e.target.value = ''))} />
          </label>
        )}
        <span className="soft small cal-write__hint">{line}</span>
        {extra}
        {onCancel && (
          <button type="button" className="q-btn q-btn--small" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="q-btn q-btn--small q-btn--main" onClick={go}>
          {busy ? 'Sending' : cta}
        </button>
      </div>
    </div>
  )
}
