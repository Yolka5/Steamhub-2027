import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CutSheet } from '../components/CutSheet'
import { Icon } from '../components/Icon'
import { Photo, StatusTag } from '../components/PieceCard'
import { PieceEditor } from '../components/PieceEditor'
import { ReserveSheet } from '../components/ReserveSheet'
import { Copy, useBusy, useToast } from '../components/ui'
import { markUsed, releasePiece, reservePiece, updatePiece, uploadPhoto } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { KINDS, area, sizeLabel, weight } from '../lib/stock'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Select } from '../components/Select'
import { Working } from '../components/Working'
import { StockRender } from '../components/StockRender'
import { weightWorking } from '../lib/workings'
import { partName, partNo, stockLength, type Part } from '../lib/mfg'
import { relinkAll, unlinkAll } from '../lib/stockLinks'

/** A part cut from this piece, with its subsystem for the link. */
export type PieceUser = Pick<Part, 'id' | 'part_no' | 'name' | 'size' | 'qty' | 'cls' | 'status' | 'subsystem_id'>

interface Event {
  id: number
  action: string
  by_name: string | null
  at: string
  details: Record<string, unknown> | null
}

const WORDS: Record<string, string> = {
  added: 'Added',
  reserved: 'Reserved',
  released: 'Released',
  used: 'Marked used',
  edited: 'Edited',
  cut: 'Cut',
  photo_copied: 'Photo copied from Drive',
}

export default function PiecePage() {
  const { id = '' } = useParams()
  const { byId, densities, locations, loading, upsertLocal } = useStore()
  const { userId, name } = useAuth()
  const toast = useToast()
  const piece = byId(id.toUpperCase())
  const [reserving, setReserving] = useState(false)
  const [cutting, setCutting] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, guard] = useBusy()
  const [users, setUsers] = useState<PieceUser[]>([])

  useEffect(() => {
    supabase
      .from('piece_events')
      .select('id, action, by_name, at, details')
      .eq('piece_id', id.toUpperCase())
      .order('at', { ascending: false })
      .limit(20)
      .then(({ data }) => setEvents((data as Event[]) ?? []))
  }, [id, piece?.updated_at])

  // Parts linked to it in Manufacturing that still need their cut.
  useEffect(() => {
    supabase
      .from('parts')
      .select('id, part_no, name, size, qty, cls, status, subsystem_id')
      .eq('piece_id', id.toUpperCase())
      .not('status', 'in', '(done,cancelled)')
      .order('part_no')
      .then(({ data }) => setUsers((data as PieceUser[]) ?? []))
  }, [id, piece?.updated_at, piece?.status])

  if (!piece) {
    return (
      <div className="page page--narrow">
        <p className="soft">{loading ? 'Loading' : `No piece called ${id}.`}</p>
        <Link to="/stock" className="q-btn">
          Back to stock
        </Link>
      </div>
    )
  }

  const who = userId && name ? { userId, name } : null
  const grams = weight(piece, densities)
  const gPerM = area(piece) && piece.material ? (area(piece)! * (densities.get(piece.material) ?? 0)) : null

  const run = (fn: () => Promise<{ piece?: typeof piece; error?: string }>, done: string, undo?: () => void) =>
    guard(async () => {
      const res = await fn()
      if (res.error) return toast(res.error)
      if (res.piece) upsertLocal(res.piece)
      toast(done, { undo })
    })

  /**
   * Release or mark used: parts cut from it let go, so Done never cuts a piece that left them.
   * Undo puts the reservation and the links back.
   */
  const letGo = (kind: 'release' | 'used') => {
    if (!who) return
    const before = piece
    guard(async () => {
      const res = kind === 'release' ? await releasePiece(piece.id, who) : await markUsed(piece.id, who)
      if (res.error) return toast(res.error)
      upsertLocal(res.piece!)
      const ids = await unlinkAll(piece.id, who, kind === 'release' ? 'the piece was released' : 'the piece was marked used')
      setUsers([])
      const msg = kind === 'release' ? 'Released' : 'Marked used'
      toast(ids.length ? `${msg}. ${ids.length} ${ids.length === 1 ? 'part needs' : 'parts need'} other stock now.` : msg, {
        undo: () =>
          guard(async () => {
            const back =
              kind === 'release'
                ? await reservePiece(before.id, who, before.reserved_for ?? '', before.planned_length, before.subsystem_id ?? null)
                : await updatePiece(before.id, { status: 'reserved' }, who)
            if (back.error) return toast(back.error)
            upsertLocal(back.piece!)
            ;(await relinkAll(before.id, ids, who)).forEach(upsertLocal)
            toast(`${before.id} reserved again`)
          }),
      })
    })
  }

  return (
    <div className="page page--narrow">
      <div className="piece">
        <div className="piece__info">
          <div className="card__top">
            <h1 className="piece__id num">
              <Copy value={piece.id} />
            </h1>
            <StatusTag piece={piece} />
          </div>
          <p className="piece__size num">
            {KINDS[piece.kind].label} <Copy value={sizeLabel(piece)} />
          </p>
          <p className="piece__len">
            <Copy value={piece.length}>
              <span className="card__mm">{piece.length}</span> mm
            </Copy>
          </p>
          <div className="piece__actions">
            {piece.status === 'available' && (
              <button type="button" className="q-btn q-btn--main" onClick={() => setReserving(true)}>
                Reserve
              </button>
            )}
            {piece.status === 'reserved' && who && (
              <>
                <button type="button" className="q-btn q-btn--main" disabled={busy} onClick={() => setCutting(true)}>
                  Cut
                </button>
                <button type="button" className="q-btn" disabled={busy} onClick={() => letGo('release')}>
                  Release
                </button>
                <button type="button" className="q-btn" disabled={busy} onClick={() => letGo('used')}>
                  Mark used
                </button>
              </>
            )}
            {piece.status === 'used' && who && (
              <button type="button" className="q-btn" disabled={busy} onClick={() => run(() => releasePiece(piece.id, who), 'Back in stock')}>
                Back in stock
              </button>
            )}
            {who && (
              <>
                <label className="q-btn">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      const notes = piece.notes && /reshoot|blurry|no photo/i.test(piece.notes) ? null : piece.notes
                      run(async () => {
                        const up = await uploadPhoto(piece.id, file).catch((err) => ({ url: undefined, error: err instanceof Error ? err.message : "That photo couldn't be read" }))
                        if (up.error || !up.url) return { error: up.error ?? 'Upload failed' }
                        return updatePiece(piece.id, { photo_url: up.url, notes }, who)
                      }, 'Photo saved')
                    }}
                  />
                  <Icon name="camera" size={18} /> {piece.photo_url ? 'New photo' : 'Add photo'}
                </label>
                <button type="button" className="q-btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
                  Edit details
                </button>
              </>
            )}
          </div>


          <dl className="facts num">
            <dt>Material</dt>
            <dd>{piece.material ?? 'Unknown'}</dd>
            {piece.wall != null && (
              <>
                <dt>{piece.kind === 'angle' || piece.kind === 'flat' ? 'Thickness' : 'Wall'}</dt>
                <dd>{piece.wall} mm</dd>
              </>
            )}
            <dt>Weight</dt>
            <dd>{grams ? `${Math.round(grams)} g (${Math.round(gPerM!)} g/m)` : 'Unknown material'}</dd>
            <dt>Location</dt>
            <dd>
              <Select
                className="field--inline"
                label="Location"
                value={piece.location ?? ''}
                onChange={(v) => who && run(() => updatePiece(piece.id, { location: v || null }, who), 'Location saved')}
                options={[{ value: '', label: 'Not set' }, ...locations.map((l) => ({ value: l, label: l }))]}
              />
            </dd>
            {piece.status === 'reserved' && (
              <>
                <dt>Reserved by</dt>
                <dd>{piece.reserved_by_name}</dd>
                {piece.reserved_for && (
                  <>
                    <dt>For</dt>
                    <dd>{piece.reserved_for}</dd>
                  </>
                )}
                {users.length > 0 && (
                  <>
                    <dt>{users.length === 1 ? 'Part' : 'Parts'}</dt>
                    <dd>
                      {users.map((u, i) => (
                        <span key={u.id}>
                          {i > 0 && ', '}
                          <Link to={`/manufacturing/p/${u.id}`}>
                            {partNo(u)} {partName(u)}
                          </Link>{' '}
                          <span className="soft">{stockLength(u)} mm</span>
                        </span>
                      ))}
                    </dd>
                  </>
                )}
                {piece.planned_length && (
                  <>
                    <dt>Planned length</dt>
                    <dd>{piece.planned_length} mm</dd>
                  </>
                )}
              </>
            )}
            {piece.notes && (
              <>
                <dt>Note</dt>
                <dd>{piece.notes}</dd>
              </>
            )}
          </dl>
          <Working id="piece-weight" title="How the weight is worked out" lines={weightWorking(piece, densities)} />

          {editing && who && <PieceEditor piece={piece} who={who} onDone={() => setEditing(false)} />}
        </div>
        {/* What it looks like comes after what you came to do: reserve, cut, release. */}
        <div className="piece__pics">
          <div className="piece__visual">
            <StockRender piece={piece} />
          </div>
          {/* Photos are optional: no empty "No photo yet" box when there isn't one. */}
          {piece.photo_url && <Photo piece={piece} width={1200} className="piece__photo" />}
        </div>
      </div>

      {events.length > 0 && (
        <section className="section">
          <h2 className="section__title">History</h2>
          <ul className="rows">
            {events.map((e) => (
              <li key={e.id} className="row">
                <span>{WORDS[e.action] ?? e.action}</span>
                <span className="soft">
                  {e.by_name}
                  {e.action === 'reserved' && e.details?.for ? ` for ${e.details.for}` : ''}
                  {e.action === 'cut' && e.details ? ` ${e.details.final} mm${e.details.for ? ` for ${e.details.for}` : ''}, ${e.details.leftover} mm left` : ''}
                </span>
                <span className="soft num row__end">{new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReserveSheet piece={reserving ? piece : null} plannedLength={null} onClose={() => setReserving(false)} />
      <CutSheet piece={cutting ? piece : null} users={users} onClose={() => setCutting(false)} />
    </div>
  )
}
