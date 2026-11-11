import { useState, type DragEvent, type ReactNode } from 'react'
import { PartThumb } from '../../components/PartThumb'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { PartStatusTag, UrgentTag } from '../../components/mfg'
import { PrintSheet } from '../../components/PrintSheet'
import { LoadError, useBusy, useToast } from '../../components/ui'
import { useWho } from '../../lib/auth'
import { countParts, subStatus } from '../../lib/counts'
import {
  ago,
  guessMaterial,
  logPart,
  MACHINES,
  MATERIALS,
  partName,
  partNo,
  releaseParts,
  setStatus,
  sizeText,
  updatePart,
  updateParts,
  type Machine,
  type Part,
  type PartStatus,
  type UploadSummary,
} from '../../lib/mfg'
import { weight } from '../../lib/stock'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { uploadStep } from '../../lib/upload'
import { useParts, usePeople, useSubsystem } from '../../lib/useMfg'
import { Combo, Select } from '../../components/Select'
import { SubsystemPrototypes } from '../proto/SubsystemPrototypes'

// Where CAD works: drop the STEP, check machine and material, release parts to the workshop.

export default function SubsystemPage() {
  const { id = '' } = useParams()
  const { sub, robot, uploads, loading, error, reload, setSub } = useSubsystem(id)
  const { parts, put, reload: reloadParts, error: partsError } = useParts({ subsystemId: id })
  const { people } = usePeople()
  const who = useWho()
  const toast = useToast()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [busy, run] = useBusy()
  const { pieces, densities } = useStore()

  if (!sub || !robot)
    return (
      <div className="page">
        {error ? <LoadError onRetry={reload} /> : loading ? <p className="soft">Loading</p> : <p className="soft">This subsystem doesn't exist anymore.</p>}
      </div>
    )

  const live = parts.filter((p) => p.status !== 'cancelled')
  const design = live.filter((p) => p.machine !== 'Bought' && !p.released_at)
  const released = live.filter((p) => p.machine !== 'Bought' && p.released_at)
  const bought = live.filter((p) => p.machine === 'Bought')
  const cancelled = parts.filter((p) => p.status === 'cancelled')
  const pickedParts = parts.filter((p) => picked.has(p.id))
  const c = countParts(parts)
  const status = subStatus(c, sub.assembled)
  // Raw stock reserved for this subsystem: picked from the list, or typed with the same name.
  const label = `${sub.number} ${sub.name}`.toLowerCase()
  const stock = pieces.filter((p) => p.status !== 'available' && (p.subsystem_id === sub.id || p.reserved_for?.trim().toLowerCase() === label))
  const grams = stock.reduce((s, p) => s + (weight({ ...p, length: p.planned_length && p.planned_length <= p.length ? p.planned_length : p.length }, densities) ?? 0), 0)

  const setAssembled = async (assembled: boolean) => {
    const { error } = await supabase.from('subsystems').update({ assembled }).eq('id', sub.id)
    if (error) return toast(error.message)
    setSub({ ...sub, assembled })
    toast(assembled ? 'Marked assembled' : 'No longer assembled')
  }

  const toggle = (pid: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(pid)) n.delete(pid)
      else n.add(pid)
      return n
    })

  const release = (list: Part[]) =>
    run(async () => {
      if (!who) return
      const todo = list.filter((p) => !p.released_at && p.machine !== 'Bought')
      if (!todo.length) return toast('Those are already released')
      const res = await releaseParts(todo, who)
      if (res.error) return toast(res.error)
      put(res.data!)
      setPicked(new Set())
      toast(`${todo.length} released to the workshop`)
    })

  const setUrgent = (urgent: boolean) =>
    run(async () => {
      const ids = [...picked]
      const res = await updateParts(ids, { urgent })
      if (res.error) return toast(res.error)
      put(res.data!)
      setPicked(new Set())
      if (who) await logPart(ids, urgent ? 'urgent' : 'not_urgent', who)
      toast(urgent ? 'Marked urgent' : 'No longer urgent')
    })

  const rename = (name: string) =>
    run(async () => {
      const { data, error } = await supabase.from('subsystems').update({ name }).eq('id', sub.id).select().single()
      if (error) return toast(error.message)
      setSub(data as typeof sub)
      setRenaming(false)
      toast('Saved. New drawings use the new name.')
    })

  const setLead = async (leadId: string) => {
    const { error } = await supabase.from('subsystems').update({ lead_id: leadId || null }).eq('id', sub.id)
    if (error) return toast(error.message)
    setSub({ ...sub, lead_id: leadId || null })
    toast('Lead saved')
  }

  const last = uploads[0]
  const analyzed = uploads.some((u) => u.analysis_path)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">
            <span className="num">{sub.number}</span> {sub.name}
          </h1>
          {renaming && <Rename name={sub.name} label="Subsystem name" busy={busy} onSave={rename} onCancel={() => setRenaming(false)} />}
          <p className="soft sub-meta">
            <Link to={`/manufacturing/r/${robot.id}`}>{robot.name}</Link> · {status}
            {c.made ? ` · ${c.done} of ${c.made} made` : ''}
            {c.bought ? ` · ${c.got} of ${c.bought} bought parts collected` : ''}
            {stock.length ? ` · ${(grams / 1000).toFixed(2)} kg of stock reserved` : ''}
            {!renaming && (
              <>
                {' · '}
                <button type="button" className="text-btn" onClick={() => setRenaming(true)}>
                  Rename
                </button>
              </>
            )}
            {(status === 'Ready for assembly' || sub.assembled) && (
              <>
                {' · '}
                <button type="button" className="text-btn" onClick={() => setAssembled(!sub.assembled)}>
                  {sub.assembled ? 'Not assembled yet' : 'Mark assembled'}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="sub-side">
          {analyzed && (
            <div className="page__actions">
              <Link to={`/manufacturing/s/${sub.id}/bolts`} className="q-btn">
                <Icon name="screw" size={18} /> Bolts
              </Link>
              <Link to={`/manufacturing/s/${sub.id}/guide`} className="q-btn">
                <Icon name="book" size={18} /> Assembly guide
              </Link>
            </div>
          )}
        <label className="ctl sub-lead">
          <span className="ctl__name">Lead</span>
          <Select className="field--inline" value={sub.lead_id ?? ''} onChange={setLead} options={[{ value: '', label: 'No lead' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        </label>
        </div>
      </div>

      <SubsystemPrototypes season={robot.season} number={sub.number} name={sub.name} />

      <Drop
        onFile={async (files, progress) => {
          if (!who) {
            toast('Sign in first')
            return null
          }
          const res = await uploadStep(files, sub, parts, who, progress)
          await Promise.all([reload(), reloadParts()])
          if (res.error) toast(res.error)
          return res.summary ?? null
        }}
        last={last ? `Last upload: ${last.filename}, ${last.uploaded_by_name ?? 'someone'}, ${ago(last.uploaded_at)}` : null}
      />

      {partsError && !parts.length ? (
        <LoadError onRetry={reloadParts} />
      ) : parts.length === 0 ? (
        <div className="mfg-help">
          <h2 className="section__title">Getting the STEP from Onshape</h2>
          <ol>
            <li>Open the subsystem's Assembly tab, not a Part Studio.</li>
            <li>Right-click the tab, choose Export, pick STEP and millimeters, one file.</li>
            <li>Drop the file above. Every part gets a number from {sub.number}001, a machine, a material and a drawing.</li>
          </ol>
          <p className="soft">Nothing reaches the workshop until you release it.</p>
        </div>
      ) : (
        <>
          <PartList
            title="In design"
            hint="Not on the workshop list yet. Check machine and material, then release."
            parts={design}
            picked={picked}
            toggle={toggle}
            put={put}
            action={
              design.length > 0 && (
                <button type="button" className="q-btn q-btn--small" disabled={busy} onClick={() => release(design)}>
                  Release all {design.length}
                </button>
              )
            }
          />
          <PartList
            title="Released"
            hint="On the workshop list."
            parts={released}
            picked={picked}
            toggle={toggle}
            put={put}
            action={
              released.length > 0 && (
                <button type="button" className="q-btn q-btn--small" onClick={() => setPrinting(true)}>
                  <Icon name="print" size={18} /> Drawings
                </button>
              )
            }
          />
          <PartList title="Bought" hint="Collected from the shelves, never on the workshop list." parts={bought} picked={picked} toggle={toggle} put={put} />
          {cancelled.length > 0 && (
            <details className="more mfg-archived">
              <summary>Cancelled ({cancelled.length})</summary>
              <ul className="rows">
                {cancelled.map((p) => (
                  <li key={p.id}>
                    <Link to={`/manufacturing/p/${p.id}`} className="row">
                      <span className="num strong">{partNo(p)}</span>
                      <span className="soft">{partName(p)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {/* In the body: the page's entrance animation leaves a transform that would pin a fixed bar to the page. */}
      {picked.size > 0 &&
        createPortal(
            <div className="mfg-actionbar" role="toolbar" aria-label="Picked parts">
              <span className="num">{picked.size} picked</span>
              {pickedParts.some((p) => !p.released_at && p.machine !== 'Bought') && (
                <button type="button" className="q-btn q-btn--main" disabled={busy} onClick={() => release(pickedParts)}>
                  Release
                </button>
              )}
              {pickedParts.some((p) => !p.urgent) ? (
                <button type="button" className="q-btn" disabled={busy} onClick={() => setUrgent(true)}>
                  <Icon name="flag" size={18} /> Urgent
                </button>
              ) : (
                <button type="button" className="q-btn" disabled={busy} onClick={() => setUrgent(false)}>
                  Not urgent
                </button>
              )}
              <button type="button" className="q-btn" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>,
          document.body,
        )}

      <PrintSheet open={printing} parts={released} ctx={{ robot, sub }} onClose={() => setPrinting(false)} />
    </div>
  )
}

/**
 * A typo in a subsystem name prints on every drawing, so it can be fixed in place. Only the name:
 * the number is in every part number and links the prototypes, so it stays.
 */
export function Rename({ name, label, busy, onSave, onCancel }: { name: string; label: string; busy: boolean; onSave: (name: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(name)
  return (
    <form
      className="rename"
      onSubmit={(e) => {
        e.preventDefault()
        if (t.trim()) onSave(t.trim())
      }}
    >
      <input className="field" aria-label={label} autoFocus value={t} onChange={(e) => setT(e.target.value)} />
      <button type="submit" className="q-btn" disabled={busy || !t.trim()}>
        Save
      </button>
      <button type="button" className="q-btn" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

/** Files from a drop, walking into dropped folders. */
async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...dt.files]
  const out: File[] = []
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)))
    else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader()
      // readEntries hands out at most ~100 at a time, so keep asking until it's empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const c of batch) await walk(c)
      }
    }
  }
  for (const e of entries) await walk(e)
  return out
}

function Drop({ onFile, last }: { onFile: (f: File[], progress: (t: string) => void) => Promise<UploadSummary | null>; last: string | null }) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [summary, setSummary] = useState<UploadSummary | null>(null)

  const take = async (files: File[]) => {
    if (!files.length || busy) return
    setSummary(null)
    setBusy('Starting')
    const s = await onFile(files, setBusy)
    setBusy(null)
    setSummary(s)
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(await droppedFiles(e.dataTransfer))
  }

  return (
    <div className="mfg-drop-wrap">
      <label
        className="mfg-drop"
        data-over={over || undefined}
        data-busy={busy ? true : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".step,.stp,.STEP,.STP" multiple hidden onChange={(e) => take([...(e.target.files ?? [])])} />
        <Icon name="upload" size={22} />
        <span className="mfg-drop__text">
          {busy ? (
            <span className="num">{busy}</span>
          ) : (
            <>
              <strong>Drop the assembly STEP here</strong> or choose the file
            </>
          )}
        </span>
        {!busy && last && <span className="soft small">{last}</span>}
      </label>
      {summary && (
        <p className="mfg-note num">
          {[
            summary.added && `${summary.added} new`,
            summary.changed && `${summary.changed} changed`,
            summary.gone && `${summary.gone} gone (cancelled)`,
            summary.same && `${summary.same} unchanged`,
          ]
            .filter(Boolean)
            .join(', ')}
          .{summary.bad ? ` ${summary.bad} couldn't be read; they're marked.` : ''}
          {summary.skipped ? ` ${summary.skipped} ${summary.skipped === 1 ? "file wasn't" : "files weren't"} STEP and got skipped.` : ''}
        </p>
      )}
    </div>
  )
}

function PartList({
  title,
  hint,
  parts,
  picked,
  toggle,
  put,
  action,
}: {
  title: string
  hint: string
  parts: Part[]
  picked: Set<string>
  toggle: (id: string) => void
  put: (p: Part) => void
  action?: ReactNode
}) {
  if (!parts.length) return null
  return (
    <section className="section">
      <div className="mfg-bar-head">
        <h2 className="section__title">
          {title} <span className="soft num">{parts.length}</span>
        </h2>
        {action}
      </div>
      <p className="soft small sp-hint">{hint}</p>
      <ul className="sp-list">
        {parts.map((p) => (
          <SubPartRow key={p.id} part={p} picked={picked.has(p.id)} toggle={() => toggle(p.id)} put={put} />
        ))}
      </ul>
    </section>
  )
}

function SubPartRow({ part, picked, toggle, put }: { part: Part; picked: boolean; toggle: () => void; put: (p: Part) => void }) {
  const toast = useToast()
  const who = useWho()
  const save = async (patch: Partial<Part>) => {
    const res = await updatePart(part.id, patch)
    if (res.error) return toast(res.error)
    put(res.data!)
  }
  const link = `/manufacturing/p/${part.id}`
  return (
    <li className="sp-row" data-picked={picked || undefined}>
      <input type="checkbox" className="sp-row__pick" checked={picked} onChange={toggle} aria-label={`Pick ${partNo(part)}`} />
      <Link to={link} className="sp-row__thumb" tabIndex={-1} aria-hidden="true">
        <PartThumb part={part} />
      </Link>
      <Link to={link} className="sp-row__no num">
        {partNo(part)}
      </Link>
      <Link to={link} className="sp-row__name">
        <span>{partName(part)}</span>
        <span className="soft small num">
          {sizeText(part.size)} mm · ×{part.qty}
        </span>
      </Link>
      <Select
        className="field--inline sp-row__machine"
        value={part.machine}
        label="Machine"
        options={MACHINES.map((m) => ({ value: m, label: m }))}
        onChange={(v) => {
          const machine = v as Machine
          const patch: Partial<Part> = { machine }
          if (machine === 'Bought') patch.material = ''
          else if (!part.material || part.machine === 'Bought' || machine === '3D print' || part.machine === '3D print') patch.material = guessMaterial(machine, part.cls, part.size, part.name)
          save(patch)
        }}
      />
      {part.machine === 'Bought' ? (
        <Select
          className="field--inline sp-row__mat"
          value={part.status === 'done' || part.status === 'missing' ? part.status : 'todo'}
          label="Collected"
          options={[
            { value: 'todo', label: 'Needed' },
            { value: 'done', label: 'Got it' },
            { value: 'missing', label: 'Missing' },
          ]}
          onChange={async (v) => {
            if (!who) return
            const res = await setStatus(part, v as PartStatus, who)
            if (res.error) return toast(res.error)
            put(res.data!)
            if (v === 'missing') toast('Added to the wishlist')
          }}
        />
      ) : (
        <Combo className="field--inline sp-row__mat" label="Material" value={part.material} options={MATERIALS} onCommit={(v) => save({ material: v })} />
      )}
      <span className="sp-row__tags">
        {part.bad && <span className="tag tag--bad">Unreadable</span>}
        {part.changed && <span className="tag tag--reserved">Changed</span>}
        {part.urgent && part.status !== 'done' && <UrgentTag />}
        {/* The In design section says it already. */}
        {(part.released_at || part.machine === 'Bought') && <PartStatusTag part={part} />}
      </span>
    </li>
  )
}
